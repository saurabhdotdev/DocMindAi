import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { MainLayout } from '../components/MainLayout';
import {
  ArrowLeft, FileText, RefreshCw, Tag,
  Brain, Search, Download, AlertCircle, MessageSquare,
  Hash, Mail, Phone, Building2, Clock, Send, User, Bot, Volume2, Play, Pause, GitBranch, UploadCloud
} from 'lucide-react';

// ─── Tabs ───────────────────────────────────────────────────
type Tab = 'overview' | 'ocr' | 'entities' | 'podcast' | 'versions';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <FileText className="w-4 h-4" /> },
  { id: 'ocr', label: 'Extracted Text & Layout', icon: <Brain className="w-4 h-4" /> },
  { id: 'entities', label: 'Entities', icon: <Search className="w-4 h-4" /> },
  { id: 'podcast', label: 'AI Podcast Summary', icon: <Volume2 className="w-4 h-4" /> },
  { id: 'versions', label: 'Versions', icon: <GitBranch className="w-4 h-4" /> },
];

// ─── Entity badge colours ─────────────────────────────────
const ENTITY_COLORS: Record<string, string> = {
  EMAIL: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  PHONE: 'bg-green-500/20 text-green-300 border-green-500/30',
  DATE: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  ORG: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  PERSON: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  MONEY: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  DEFAULT: 'bg-white/10 text-white/70 border-white/20',
};

const entityColor = (cat: string) => ENTITY_COLORS[cat] || ENTITY_COLORS.DEFAULT;
const entityIcon = (cat: string) => {
  switch (cat) {
    case 'EMAIL': return <Mail className="w-3 h-3" />;
    case 'PHONE': return <Phone className="w-3 h-3" />;
    case 'DATE': return <Clock className="w-3 h-3" />;
    case 'ORG': return <Building2 className="w-3 h-3" />;
    default: return <Hash className="w-3 h-3" />;
  }
};

interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  storageKey: string;
  size: number;
  mimeType: string;
  uploadedBy: string;
  createdAt: string;
  downloadUrl: string;
}

// ─── Chat message type ───────────────────────────────────
interface ChatMsg { role: 'user' | 'assistant'; content: string }

// ─── Main Component ──────────────────────────────────────
export const DocumentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([
    { role: 'assistant', content: "👋 Hi! Ask me anything about this document — I'll extract information, summarise sections, or answer specific questions." }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  
  // OCR Bounding Box states
  const [hoveredBlockIdx, setHoveredBlockIdx] = useState<number | null>(null);

  // Document Versioning states
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [isUploadingVersion, setIsUploadingVersion] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);

  // Fetch document versions
  const { data: versions = [], refetch: refetchVersions } = useQuery<DocumentVersion[]>({
    queryKey: ['versions', id],
    queryFn: async () => {
      const res = await api.get(`/v1/documents/${id}/versions`);
      return res.data.data;
    },
  });

  // Inline Canvas Editor states
  const [isEditingBlock, setIsEditingBlock] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isOcrSaving, setIsOcrSaving] = useState(false);

  // Translation states
  const [targetLang, setTargetLang] = useState('');
  const [translatedBlocks, setTranslatedBlocks] = useState<any[] | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  // AI Podcast summary states
  const [podcastData, setPodcastData] = useState<any | null>(null);
  const [isPodcastLoading, setIsPodcastLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentDialogueIdx, setCurrentDialogueIdx] = useState(0);
  const [playTime, setPlayTime] = useState(0);

  // Collaborative layout annotations states
  const [activeCommentBlockIdx, setActiveCommentBlockIdx] = useState<number | null>(null);
  const [commentInput, setCommentInput] = useState('');

  // Fetch block annotations list
  const { data: annotations = [], refetch: refetchAnnotations } = useQuery({
    queryKey: ['annotations', id],
    queryFn: async () => {
      const res = await api.get(`/v1/documents/${id}/annotations`);
      return res.data.data;
    }
  });

  // Create block annotation mutation
  const createAnnotationMutation = useMutation({
    mutationFn: async ({ blockIndex, text }: { blockIndex: number; text: string }) => {
      const res = await api.post(`/v1/documents/${id}/annotations`, { blockIndex, text });
      return res.data.data;
    },
    onSuccess: () => {
      refetchAnnotations();
      setCommentInput('');
    }
  });

  // Podcast synchronized play simulation timer
  React.useEffect(() => {
    let timer: any;
    if (isPlaying && podcastData?.dialogue) {
      timer = setInterval(() => {
        setPlayTime((prev) => {
          const nextTime = prev + 1;
          const nextIdx = Math.floor(nextTime / 5);
          if (nextIdx < podcastData.dialogue.length) {
            setCurrentDialogueIdx(nextIdx);
          } else {
            setIsPlaying(false);
            clearInterval(timer);
          }
          return nextTime;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isPlaying, podcastData]);

  const handleGeneratePodcast = async () => {
    setIsPodcastLoading(true);
    try {
      const res = await api.post(`/v1/documents/${id}/podcast`);
      if (res.data.success) {
        setPodcastData(res.data.data);
        setPlayTime(0);
        setCurrentDialogueIdx(0);
        setIsPlaying(true);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Podcast generation failed.');
    } finally {
      setIsPodcastLoading(false);
    }
  };

  // Fetch full document details (includes OCR + entities)
  const { data: doc, isLoading, refetch } = useQuery({
    queryKey: ['document', id],
    queryFn: async () => {
      const res = await api.get(`/v1/documents/${id}`);
      return res.data.data;
    },
    refetchInterval: (query) => {
      const d = query.state.data as any;
      if (d?.status === 'PENDING' || d?.status === 'PROCESSING') return 3000;
      return false;
    },
  });

  // Download handler
  const handleDownload = () => {
    if (doc?.downloadUrl) window.open(doc.downloadUrl, '_blank');
  };

  // Translate document layout blocks
  const handleTranslate = async (lang: string) => {
    setTargetLang(lang);
    if (!lang) {
      setTranslatedBlocks(null);
      return;
    }
    setIsTranslating(true);
    try {
      const res = await api.post(`/v1/documents/${id}/translate`, {
        targetLang: lang,
      });
      if (res.data.success) {
        setTranslatedBlocks(res.data.data);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Translation failed.');
    } finally {
      setIsTranslating(false);
    }
  };

  // Save edited OCR block text
  const handleSaveBlockText = async (idx: number) => {
    if (!doc.ocrResult?.layout?.blocks) return;
    setIsOcrSaving(true);
    try {
      const updatedBlocks = [...doc.ocrResult.layout.blocks];
      updatedBlocks[idx] = {
        ...updatedBlocks[idx],
        text: editingText,
      };

      const res = await api.put(`/v1/documents/${id}/ocr`, {
        blocks: updatedBlocks,
      });

      if (res.data.success) {
        setIsEditingBlock(null);
        refetch(); // Reload document data
      }
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Saving failed.');
    } finally {
      setIsOcrSaving(false);
    }
  };

  const handleUploadVersion = async () => {
    if (!versionFile) return;
    setIsUploadingVersion(true);
    setVersionError(null);

    const formData = new FormData();
    formData.append('file', versionFile);

    try {
      const res = await api.post(`/v1/documents/${id}/versions`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.success) {
        setVersionFile(null);
        refetchVersions();
        refetch(); // Document goes to PENDING, triggers auto-refresh loop
      }
    } catch (err: any) {
      setVersionError(err.response?.data?.message || 'Version upload failed.');
    } finally {
      setIsUploadingVersion(false);
    }
  };

  // Real AI chat querying the backend /v1/documents/:id/chat
  const sendChat = async () => {
    if (!chatInput.trim()) return;
    const question = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: question }]);
    setIsChatLoading(true);

    try {
      const res = await api.post(`/v1/documents/${id}/chat`, { question });
      const answer = res.data.answer;
      setChatMessages(prev => [...prev, { role: 'assistant', content: answer }]);
    } catch (err: any) {
      console.error(err);
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex-1 flex items-center justify-center bg-brand-dark">
          <RefreshCw className="w-8 h-8 text-brand-primary animate-spin" />
        </div>
      </MainLayout>
    );
  }

  if (!doc) {
    return (
      <MainLayout>
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-brand-dark text-center">
          <AlertCircle className="w-12 h-12 text-brand-error mb-3 animate-pulse" />
          <h2 className="text-lg font-bold text-white mb-1">Document Not Found</h2>
          <p className="text-xs text-brand-textMuted">The requested document does not exist or has been deleted.</p>
        </div>
      </MainLayout>
    );
  }

  const entities = doc.entities || [];
  const entityGroups = entities.reduce((acc: Record<string, any[]>, item: any) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const isProcessing = doc.status === 'PENDING' || doc.status === 'PROCESSING';

  // Toggle layout display translation support
  const activeLayoutBlocks = translatedBlocks || doc.ocrResult?.layout?.blocks || [];

  return (
    <MainLayout>
      {/* Navigation subheader bar */}
      <header className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.01] shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 border border-brand-border hover:bg-white/5 rounded-lg text-brand-textMuted hover:text-white transition-all"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-extrabold text-white">{doc.name}</h1>
            <p className="text-[10px] text-brand-textMuted mt-0.5 uppercase tracking-wider font-semibold">
              Category: {doc.classification?.label || 'Unclassified'} • Status: {doc.status}
            </p>
          </div>
        </div>

        <button
          onClick={handleDownload}
          className="glass-button-primary text-xs py-2 flex items-center gap-1.5"
          title="Download Original file"
        >
          <Download className="w-4 h-4" />
          <span>Download</span>
        </button>
      </header>

      {/* Main Split Layout */}
      <main className="flex-1 flex flex-col lg:flex-row gap-6 p-6 md:p-8 w-full max-w-7xl mx-auto overflow-y-auto lg:overflow-hidden h-auto lg:h-[calc(100vh-100px)]">
        
        {/* Left Column: Tabs Navigation and Content */}
        <div className="flex-1 flex flex-col gap-6 lg:overflow-y-auto lg:h-full pb-4">
          
          {/* Tab Navigation */}
          <div className="border-b border-white/5 pb-2">
            <div className="flex gap-1">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-brand-primary/15 text-brand-primary border border-brand-primary/30'
                      : 'text-brand-textMuted hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab.icon}{tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content Area */}
          <div className="flex-1">
            {/* ── OVERVIEW TAB ── */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Resume ATS analysis dashboard */}
                {doc.resumeAnalysis ? (
                  <div className="space-y-6">
                    {/* Score and Suggestions Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="glass-panel rounded-2xl p-6 border border-brand-primary/20 flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted mb-3">ATS Compatibility</span>
                        <div className="relative flex items-center justify-center">
                          <div className="w-24 h-24 rounded-full border-4 border-brand-primary/10 flex items-center justify-center text-2xl font-black text-white relative shadow-lg">
                            {doc.resumeAnalysis.atsScore}%
                            <div className="absolute inset-0 rounded-full border-4 border-brand-primary border-t-transparent animate-spin-slow pointer-events-none" />
                          </div>
                        </div>
                        <span className="text-[10px] text-brand-success font-semibold mt-3">Profile Match Score</span>
                      </div>

                      <div className="md:col-span-2 glass-panel rounded-2xl p-6 border border-white/5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted block mb-3">ATS Optimization Suggestions</span>
                        <ul className="space-y-2 max-h-32 overflow-y-auto pr-1">
                          {Array.isArray(doc.resumeAnalysis.suggestions) && doc.resumeAnalysis.suggestions.map((sug: string, idx: number) => (
                            <li key={idx} className="flex gap-2 text-xs text-brand-text items-start">
                              <span className="text-brand-primary mt-0.5">•</span>
                              <span>{sug}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Technical Skills */}
                    <div className="glass-panel rounded-2xl p-6 border border-white/5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted block mb-3">Extracted Skills Inventory</span>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.isArray(doc.resumeAnalysis.skills) && doc.resumeAnalysis.skills.map((skill: string, idx: number) => (
                          <span key={idx} className="px-2.5 py-1 bg-brand-primary/10 border border-brand-primary/20 text-brand-primary rounded-lg text-xs font-semibold">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Timeline & Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Education Timeline */}
                      <div className="glass-panel rounded-2xl p-6 border border-white/5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted block mb-3">Education History</span>
                        <div className="space-y-3">
                          {Array.isArray(doc.resumeAnalysis.education) && doc.resumeAnalysis.education.map((edu: any, idx: number) => (
                            <div key={idx} className="border-l-2 border-brand-primary/30 pl-3.5 py-1">
                              <span className="text-xs font-bold text-white block">{edu.degree || 'Degree'}</span>
                              <span className="text-[10px] text-brand-textMuted block mt-0.5">{edu.institution || 'Institution'}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Professional History */}
                      <div className="glass-panel rounded-2xl p-6 border border-white/5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted block mb-3">Professional Experience</span>
                        <div className="space-y-3">
                          {Array.isArray(doc.resumeAnalysis.workExperience) && doc.resumeAnalysis.workExperience.map((work: any, idx: number) => (
                            <div key={idx} className="border-l-2 border-brand-secondary/30 pl-3.5 py-1">
                              <span className="text-xs font-bold text-white block">{work.role || 'Job Role'}</span>
                              <span className="text-[10px] text-brand-textMuted block mt-0.5">{work.company || 'Company'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Standard document overview details */
                  <div className="space-y-6">
                    <div className="glass-panel rounded-2xl p-6 border border-white/5 space-y-4">
                      <h3 className="text-sm font-extrabold text-white">General Document Statistics</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-brand-dark/20 p-4 border border-white/5 rounded-xl">
                          <span className="text-[10px] font-bold uppercase text-brand-textMuted tracking-wider block">File size</span>
                          <span className="text-sm font-semibold text-white mt-1 block">{(doc.size / 1024).toFixed(1)} KB</span>
                        </div>
                        <div className="bg-brand-dark/20 p-4 border border-white/5 rounded-xl">
                          <span className="text-[10px] font-bold uppercase text-brand-textMuted tracking-wider block">Mimetype</span>
                          <span className="text-sm font-semibold text-white mt-1 block truncate" title={doc.mimeType}>{doc.mimeType}</span>
                        </div>
                      </div>
                    </div>

                    {/* Entities Summary */}
                    {entities.length > 0 && (
                      <div className="glass-panel rounded-2xl p-6 border border-white/5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted block mb-3">Entity Highlights Quick View</span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {Object.entries(entityGroups).slice(0, 6).map(([cat, ents]) => (
                            <div key={cat} className="p-3 bg-brand-dark/25 border border-white/5 rounded-xl">
                              <span className="text-[9px] font-bold text-brand-textMuted uppercase block mb-1">{cat}</span>
                              <span className="text-sm font-semibold text-white truncate block">
                                {(ents as any[])[0]?.value || 'N/A'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── OCR TEXT & LAYOUT TAB ── */}
            {activeTab === 'ocr' && (
              <div className="glass-panel rounded-2xl p-6 border border-white/5 flex flex-col lg:flex-row gap-6">
                
                {/* Left Visual Visualizer */}
                <div className="flex-1 flex flex-col">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-brand-textMuted">Interactive Layout Bounding Box</span>
                      {/* Language translation selector */}
                      <select
                        value={targetLang}
                        onChange={(e) => handleTranslate(e.target.value)}
                        className="bg-brand-dark border border-brand-border rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-brand-primary"
                      >
                        <option value="">Translate...</option>
                        <option value="Spanish">Spanish 🇪🇸</option>
                        <option value="French">French 🇫🇷</option>
                        <option value="German">German 🇩🇪</option>
                        <option value="Hindi">Hindi 🇮🇳</option>
                        <option value="Japanese">Japanese 🇯🇵</option>
                      </select>
                      {isTranslating && <RefreshCw className="w-3 h-3 text-brand-primary animate-spin" />}
                    </div>
                    <span className="text-[9px] text-brand-textMuted">Click blocks to select & comment</span>
                  </div>
                  
                  {activeLayoutBlocks.length > 0 ? (
                    <div className="relative w-[340px] md:w-[480px] h-[550px] bg-brand-dark/40 border border-white/5 rounded-xl overflow-hidden mx-auto shadow-inner bg-gradient-to-b from-brand-dark/20 to-brand-dark/50">
                      {activeLayoutBlocks.map((block: any, idx: number) => {
                        const [rawX, rawY, rawW, rawH] = block.boundingBox || [50, 50 + idx * 30, 300, 20];
                        // Scale coordinates to fit inside visual canvas box
                        const scaleX = 480 / 600;
                        const scaleY = 550 / 800;
                        const x = Math.round(rawX * scaleX);
                        const y = Math.round(rawY * scaleY);
                        const w = Math.round(rawW * scaleX);
                        const h = Math.round(rawH * scaleY);

                        const isSelectedComment = activeCommentBlockIdx === idx;

                        return (
                          <div
                            key={idx}
                            onMouseEnter={() => setHoveredBlockIdx(idx)}
                            onMouseLeave={() => setHoveredBlockIdx(null)}
                            onClick={() => {
                              setActiveCommentBlockIdx(idx);
                              setCommentInput('');
                            }}
                            style={{
                              position: 'absolute',
                              left: `${x}px`,
                              top: `${y}px`,
                              width: `${Math.max(20, w)}px`,
                              height: `${Math.max(10, h)}px`,
                            }}
                            className={`border rounded transition-all cursor-pointer ${
                              isSelectedComment
                                ? 'bg-brand-secondary/25 border-brand-secondary ring-2 ring-brand-secondary/50 shadow-lg shadow-brand-secondary/20 z-20 scale-[1.01]'
                                : hoveredBlockIdx === idx
                                ? 'bg-brand-primary/25 border-brand-primary ring-1 ring-brand-primary shadow-md z-10 scale-[1.01]'
                                : 'bg-brand-primary/5 border-brand-primary/10 hover:border-brand-primary/40'
                            }`}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[550px] border border-dashed border-white/5 rounded-xl text-brand-textMuted text-xs">
                      No layout metadata blocks detected.
                    </div>
                  )}
                </div>

                {/* Right Scrollable Text & Comments */}
                <div className="flex-1 flex flex-col">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-textMuted">Extracted Content details</span>
                  </div>
                  {doc.ocrResult?.text ? (
                    <div className="flex flex-col h-[550px] justify-between">
                      <div className="space-y-3 overflow-y-auto pr-1 flex-1">
                        {/* hovered block snippet preview or inline layout editor */}
                        {hoveredBlockIdx !== null && activeLayoutBlocks[hoveredBlockIdx] ? (
                          <div className="bg-brand-primary/10 border border-brand-primary/30 rounded-xl p-4 animate-in fade-in duration-200">
                            <span className="text-[9px] font-bold text-brand-primary uppercase tracking-wider block mb-1">
                              Block #{hoveredBlockIdx + 1} ({activeLayoutBlocks[hoveredBlockIdx].type || 'paragraph'})
                            </span>
                            
                            {isEditingBlock === hoveredBlockIdx ? (
                              <div className="space-y-2 mt-2">
                                <textarea
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                  className="glass-input w-full text-xs p-2 h-20 bg-brand-dark"
                                />
                                <div className="flex gap-2 justify-end">
                                  <button
                                    type="button"
                                    onClick={() => setIsEditingBlock(null)}
                                    className="px-2 py-1 text-[10px] bg-white/5 hover:bg-white/10 text-brand-textMuted rounded"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveBlockText(hoveredBlockIdx)}
                                    disabled={isOcrSaving}
                                    className="px-2.5 py-1 text-[10px] bg-brand-primary text-white rounded font-bold"
                                  >
                                    {isOcrSaving ? 'Saving...' : 'Save Changes'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex justify-between items-start gap-2.5">
                                <p className="text-xs text-white leading-relaxed italic">
                                  "{activeLayoutBlocks[hoveredBlockIdx].text}"
                                </p>
                                {/* Enable editing only in original text mode */}
                                {!translatedBlocks && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsEditingBlock(hoveredBlockIdx);
                                      setEditingText(activeLayoutBlocks[hoveredBlockIdx].text);
                                    }}
                                    className="px-2 py-1 bg-brand-primary/20 text-brand-primary hover:bg-brand-primary/30 text-[9px] font-bold rounded transition-colors shrink-0"
                                  >
                                    Edit Block
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="bg-white/[0.01] border border-white/5 rounded-xl p-4 text-xs text-brand-textMuted leading-normal">
                            💡 Hover over layout bounding boxes on the left page visualizer to read specific sections. Click to comment.
                          </div>
                        )}
                      </div>

                      {/* Collaborative Block Annotations (Sticky comments) */}
                      <div className="bg-brand-dark/25 border border-white/5 rounded-xl p-4 mt-3 flex flex-col shrink-0">
                        <div className="flex justify-between items-center mb-2.5">
                          <span className="text-[10px] font-bold text-brand-textMuted uppercase tracking-wider flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-brand-secondary animate-pulse" />
                            Block Comments {activeCommentBlockIdx !== null ? `#${activeCommentBlockIdx + 1}` : ''}
                          </span>
                          {activeCommentBlockIdx !== null && (
                            <button
                              onClick={() => setActiveCommentBlockIdx(null)}
                              className="text-[9px] text-brand-textMuted hover:text-white bg-white/5 px-2 py-0.5 rounded transition-all"
                            >
                              Clear Selected
                            </button>
                          )}
                        </div>

                        {activeCommentBlockIdx === null ? (
                          <p className="text-[10px] text-brand-textMuted leading-normal text-center py-4">
                            Click any coordinate block on the left canvas visualizer to inspect or post collaborative annotation sticky notes.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {/* Annotations List */}
                            <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                              {annotations.filter((a: any) => a.blockIndex === activeCommentBlockIdx).length === 0 ? (
                                <p className="text-[10px] text-brand-textMuted text-center py-2">No comments posted yet.</p>
                              ) : (
                                annotations
                                  .filter((a: any) => a.blockIndex === activeCommentBlockIdx)
                                  .map((a: any) => (
                                    <div key={a.id} className="bg-white/5 border border-white/5 rounded-lg p-2.5 text-[10px] leading-relaxed">
                                      <div className="flex justify-between text-[8px] text-brand-textMuted font-bold mb-1">
                                        <span>{a.user.firstName} {a.user.lastName || ''}</span>
                                        <span>{new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                      </div>
                                      <p className="text-white font-medium">{a.text}</p>
                                    </div>
                                  ))
                              )}
                            </div>

                            {/* Submit Input */}
                            <div className="flex gap-2 border-t border-white/5 pt-2.5">
                              <input
                                type="text"
                                value={commentInput}
                                onChange={(e) => setCommentInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && commentInput.trim() && createAnnotationMutation.mutate({ blockIndex: activeCommentBlockIdx, text: commentInput.trim() })}
                                placeholder="Add sticky note..."
                                className="glass-input text-[11px] py-1.5 flex-1"
                              />
                              <button
                                onClick={() => commentInput.trim() && createAnnotationMutation.mutate({ blockIndex: activeCommentBlockIdx, text: commentInput.trim() })}
                                disabled={!commentInput.trim() || createAnnotationMutation.isPending}
                                className="glass-button-primary px-3 text-[11px] font-semibold"
                              >
                                Post
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[550px] border border-dashed border-white/5 rounded-xl text-brand-textMuted text-xs">
                      OCR Text not extracted.
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* ── ENTITIES TAB ── */}
            {activeTab === 'entities' && (
              <div className="space-y-4">
                {entities.length === 0 ? (
                  <div className="glass-panel rounded-2xl p-6 border border-white/5 flex flex-col items-center py-16">
                    <Tag className="w-10 h-10 text-brand-border mb-3" />
                    <p className="text-sm text-brand-textMuted">
                      {isProcessing ? 'Extracting entities...' : 'No entities found in this document.'}
                    </p>
                    {isProcessing && <RefreshCw className="w-4 h-4 text-brand-warning animate-spin mt-3" />}
                  </div>
                ) : (
                  Object.entries(entityGroups).map(([category, ents]) => (
                    <div key={category} className="glass-panel rounded-2xl p-6 border border-white/5">
                      <div className="flex items-center gap-2 mb-4">
                        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${entityColor(category)}`}>
                          {entityIcon(category)}{category}
                        </span>
                        <span className="text-xs text-brand-textMuted">{(ents as any[]).length} found</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(ents as any[]).map((e: any, i: number) => (
                          <span key={i} className="px-3 py-1.5 bg-brand-dark/40 border border-white/10 rounded-lg text-xs text-brand-text hover:border-brand-primary/30 transition-all cursor-default">
                            {e.value}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── AI PODCAST SUMMARY TAB ── */}
            {activeTab === 'podcast' && (
              <div className="space-y-6">
                {!podcastData ? (
                  <div className="glass-panel border border-white/5 rounded-2xl p-12 text-center flex flex-col items-center">
                    <Volume2 className="w-12 h-12 text-brand-primary mb-4 animate-pulse" />
                    <h3 className="text-sm font-extrabold text-white">NPR-Style Tech Podcast summaries</h3>
                    <p className="text-xs text-brand-textMuted mt-2 max-w-sm leading-relaxed">
                      Generate a synthesized dynamic conversation dialogue script between two tech news hosts (Alex & Brian) discussing the key insights and parameters of this document.
                    </p>
                    <button
                      onClick={handleGeneratePodcast}
                      disabled={isPodcastLoading}
                      className="glass-button-primary mt-6 text-xs px-5 py-2.5 flex items-center gap-2"
                    >
                      {isPodcastLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Generating Dialogue Script...</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-4 h-4" />
                          <span>Synthesize Podcast Brief</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Glassmorphic Media Player Dashboard */}
                    <div className="glass-panel border border-white/5 rounded-2xl p-6 bg-gradient-to-r from-brand-primary/10 to-brand-secondary/15 flex flex-col md:flex-row items-center gap-6 shadow-xl">
                      
                      {/* Play/Pause Button */}
                      <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="w-16 h-16 rounded-full bg-brand-primary hover:bg-brand-primary/90 text-white flex items-center justify-center shadow-lg active:scale-95 transition-all shrink-0"
                      >
                        {isPlaying ? (
                          <Pause className="w-6 h-6 fill-white" />
                        ) : (
                          <Play className="w-6 h-6 fill-white ml-1" />
                        )}
                      </button>

                      {/* Title & Glowing Waveform */}
                      <div className="flex-1 space-y-3 w-full">
                        <div>
                          <span className="text-[10px] font-bold text-brand-primary uppercase tracking-wider block">Currently Playing</span>
                          <span className="text-sm font-bold text-white block">{podcastData.title}</span>
                        </div>

                        {/* Progress Bar & Timer */}
                        <div className="space-y-1.5">
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden relative">
                            <div
                              className="absolute top-0 left-0 h-full bg-brand-primary transition-all duration-300"
                              style={{ width: `${Math.min(100, (playTime / (podcastData.dialogue.length * 5)) * 100)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[9px] font-bold text-brand-textMuted font-mono">
                            <span>{Math.floor(playTime / 60)}:{(playTime % 60).toString().padStart(2, '0')}</span>
                            <span>{Math.floor((podcastData.dialogue.length * 5) / 60)}:{((podcastData.dialogue.length * 5) % 60).toString().padStart(2, '0')}</span>
                          </div>
                        </div>

                        {/* Glowing audio waveform visualizer */}
                        <div className="flex gap-1 h-5 items-center justify-center md:justify-start">
                          {[...Array(20)].map((_, idx) => {
                            const activeHeight = isPlaying ? Math.floor(Math.random() * 20) + 4 : 4;
                            return (
                              <div
                                key={idx}
                                style={{ height: `${activeHeight}px` }}
                                className={`w-1 rounded-full transition-all duration-200 ${
                                  isPlaying ? 'bg-brand-primary animate-pulse' : 'bg-white/10'
                                }`}
                              />
                            );
                          })}
                        </div>
                      </div>

                    </div>

                    {/* Conversational Script Dialogue Bubbles */}
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                      <span className="text-[10px] font-bold text-brand-textMuted uppercase tracking-wider block mb-2">Show Transcript Script</span>
                      {podcastData.dialogue.map((line: any, idx: number) => {
                        const isActive = idx === currentDialogueIdx;
                        const isAlex = line.host === 'Alex';
                        return (
                          <div
                            key={idx}
                            className={`p-4 rounded-2xl border text-xs leading-relaxed transition-all flex gap-3 items-start ${
                              isActive
                                ? 'bg-brand-primary/10 border-brand-primary/30 ring-1 ring-brand-primary/20 scale-[1.01] shadow-md shadow-brand-primary/5'
                                : 'bg-brand-dark/20 border-white/5 opacity-55'
                            }`}
                          >
                            <span className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 font-bold text-xs ${
                              isAlex ? 'bg-brand-primary/15 border-brand-primary/25 text-brand-primary' : 'bg-brand-secondary/15 border-brand-secondary/25 text-brand-secondary'
                            }`}>
                              {isAlex ? '🎙️' : '🎧'}
                            </span>
                            <div>
                              <span className={`font-bold block text-[10px] uppercase tracking-wider mb-0.5 ${
                                isAlex ? 'text-brand-primary' : 'text-brand-secondary'
                              }`}>
                                {line.host} (NPR Host)
                              </span>
                              <p className="text-brand-text">{line.text}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                )}
              </div>
            )}

            {/* ── VERSIONS TAB ── */}
            {activeTab === 'versions' && (
              <div className="space-y-6">
                {/* Upload version panel */}
                <div className="glass-panel border border-white/5 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <UploadCloud className="w-5 h-5 text-brand-primary" />
                    <h3 className="text-sm font-bold text-white">Upload New Version</h3>
                  </div>
                  <p className="text-xs text-brand-textMuted leading-relaxed">
                    Uploading a new file will automatically run the AI pipeline (OCR extraction, entity tagging, podcast synthesis) over the new content while preserving version history.
                  </p>

                  <div className="flex gap-3">
                    <input
                      type="file"
                      id="version-file-input"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && setVersionFile(e.target.files[0])}
                    />
                    <button
                      onClick={() => document.getElementById('version-file-input')?.click()}
                      className="flex-1 py-2 px-3 border border-white/10 hover:border-white/20 rounded-lg text-xs font-semibold text-brand-textMuted hover:text-white transition-all text-center truncate"
                    >
                      {versionFile ? versionFile.name : 'Choose File...'}
                    </button>
                    <button
                      onClick={handleUploadVersion}
                      disabled={!versionFile || isUploadingVersion}
                      className="glass-button-primary px-5 text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      {isUploadingVersion && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      {isUploadingVersion ? 'Uploading...' : 'Upload'}
                    </button>
                  </div>
                  {versionError && (
                    <p className="text-xs text-brand-error">{versionError}</p>
                  )}
                </div>

                {/* Versions list */}
                <div className="glass-panel border border-white/5 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/5">
                    <h3 className="text-sm font-bold text-white">Version History</h3>
                  </div>
                  <div className="divide-y divide-white/[0.03]">
                    {versions.length === 0 ? (
                      <div className="p-8 text-center text-xs text-brand-textMuted">
                        No previous versions uploaded.
                      </div>
                    ) : (
                      versions.map((ver) => {
                        const isLatest = ver.versionNumber === Math.max(...versions.map((v) => v.versionNumber));
                        return (
                          <div key={ver.id} className="p-4 flex items-center justify-between hover:bg-white/[0.01] transition-all">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-white">Version {ver.versionNumber}</span>
                                {isLatest && (
                                  <span className="px-1.5 py-0.5 rounded bg-brand-success/15 border border-brand-success/30 text-[9px] text-brand-success font-bold">
                                    Current Active
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-brand-textMuted block">
                                Uploaded {new Date(ver.createdAt).toLocaleString()} · {(ver.size / 1024).toFixed(1)} KB
                              </span>
                            </div>
                            <button
                              onClick={() => window.open(ver.downloadUrl, '_blank')}
                              className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 border border-white/10 rounded-lg text-brand-textMuted hover:text-white hover:bg-white/5 transition-all font-semibold"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: AI Chat Sidebar */}
        <div className="w-full lg:w-96 shrink-0 glass-panel rounded-2xl border border-white/5 flex flex-col lg:h-full h-[580px] overflow-hidden">
          {/* Chat header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-white/[0.01]">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-primary to-brand-secondary flex items-center justify-center">
              <Bot className="w-4 h-4 text-white animate-pulse" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">DocMind AI Assistant</span>
              <span className="text-[9px] text-brand-textMuted block">Ground truth semantic querying</span>
            </div>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border text-[11px] ${
                  msg.role === 'user' ? 'bg-brand-primary/10 border-brand-primary/20' : 'bg-white/5 border-white/5'
                }`}>
                  {msg.role === 'user' ? <User className="w-3.5 h-3.5 text-brand-primary" /> : <Bot className="w-3.5 h-3.5 text-brand-textMuted" />}
                </div>
                <div className={`max-w-[80%] px-3.5 py-2.5 rounded-xl text-xs leading-normal whitespace-pre-wrap ${
                  msg.role === 'user' ? 'bg-brand-primary/20 text-white rounded-tr-none' : 'bg-white/5 text-brand-text rounded-tl-none border border-white/[0.02]'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isChatLoading && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-brand-textMuted" />
                </div>
                <div className="px-3.5 py-2 rounded-xl bg-white/5 rounded-tl-none flex items-center justify-center">
                  <RefreshCw className="w-3.5 h-3.5 text-brand-primary animate-spin" />
                </div>
              </div>
            )}
          </div>

          {/* Input form */}
          <div className="px-6 py-4 border-t border-white/5 bg-white/[0.01]">
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                placeholder="Ask details..."
                className="glass-input flex-1 text-xs"
                disabled={isChatLoading}
              />
              <button
                onClick={sendChat}
                disabled={!chatInput.trim() || isChatLoading}
                className="glass-button-primary px-3 py-2 flex items-center justify-center disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

      </main>
    </MainLayout>
  );
};

export default DocumentDetail;
