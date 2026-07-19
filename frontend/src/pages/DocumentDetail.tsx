import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { MainLayout } from '../components/MainLayout';
import {
  ArrowLeft, FileText, RefreshCw, Sparkles, Tag, Calendar, HardDrive,
  Brain, Search, Download, AlertCircle,
  Hash, Mail, Phone, Building2, Clock, Send, User, Bot
} from 'lucide-react';

// ─── Tabs ───────────────────────────────────────────────────
type Tab = 'overview' | 'ocr' | 'entities';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <FileText className="w-4 h-4" /> },
  { id: 'ocr', label: 'Extracted Text', icon: <Brain className="w-4 h-4" /> },
  { id: 'entities', label: 'Entities', icon: <Search className="w-4 h-4" /> },
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
      const errMsg = err.response?.data?.message || err.message || "An error occurred while calling the AI. Please try again.";
      setChatMessages(prev => [...prev, { role: 'assistant', content: `❌ **Error**: ${errMsg}` }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-dark">
        <RefreshCw className="w-8 h-8 text-brand-primary animate-spin" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-dark flex-col gap-4">
        <AlertCircle className="w-12 h-12 text-brand-error" />
        <p className="text-brand-text">Document not found.</p>
        <button onClick={() => navigate('/dashboard')} className="glass-button-primary">Back to Dashboard</button>
      </div>
    );
  }

  const isProcessing = doc.status === 'PENDING' || doc.status === 'PROCESSING';
  const entities: any[] = doc.entities || [];
  const entityGroups = entities.reduce((acc: Record<string, any[]>, e: any) => {
    acc[e.category] = acc[e.category] || [];
    acc[e.category].push(e);
    return acc;
  }, {});

  return (
    <MainLayout>
      {/* Top Bar */}
      <header className="glass-panel border-b border-white/5 px-8 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 hover:bg-white/5 rounded-lg text-brand-textMuted hover:text-white transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center">
                <FileText className="w-4 h-4 text-brand-primary" />
              </div>
              <h1 className="text-base font-bold text-white truncate max-w-md">{doc.name}</h1>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-brand-textMuted mt-0.5 ml-10">
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(doc.createdAt).toLocaleDateString()}</span>
              <span>•</span>
              <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" />{(doc.size / 1024).toFixed(1)} KB</span>
              <span>•</span>
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                doc.status === 'COMPLETED' ? 'bg-brand-success/15 text-brand-success' :
                doc.status === 'FAILED' ? 'bg-brand-error/15 text-brand-error' :
                'bg-brand-warning/15 text-brand-warning animate-pulse'
              }`}>{doc.status}</span>
              {doc.classification && (
                <>
                  <span>•</span>
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-brand-primary/20 text-brand-primary border border-brand-primary/30 uppercase">
                    {doc.classification.label} ({Math.round(doc.classification.confidence * 100)}%)
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isProcessing && <span className="flex items-center gap-1.5 text-xs text-brand-warning"><RefreshCw className="w-3.5 h-3.5 animate-spin" />Processing...</span>}
          <button onClick={() => refetch()} className="p-2 hover:bg-white/5 rounded-lg text-brand-textMuted hover:text-white transition-all" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={handleDownload} className="glass-button-primary flex items-center gap-2 text-sm px-4 py-2">
            <Download className="w-4 h-4" />Download
          </button>
        </div>
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
                {/* Classification card */}
                {doc.classification ? (
                  <div className="glass-panel rounded-2xl p-6 border border-brand-primary/20">
                    <div className="flex items-center gap-3 mb-4">
                      <Sparkles className="w-5 h-5 text-brand-primary" />
                      <h2 className="text-sm font-bold uppercase tracking-wider text-brand-textMuted">AI Classification</h2>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <span className="text-2xl font-extrabold text-white">{doc.classification.label}</span>
                        <p className="text-xs text-brand-textMuted mt-1">Identified document category</p>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-black text-brand-primary">{Math.round(doc.classification.confidence * 100)}%</div>
                        <p className="text-xs text-brand-textMuted">confidence</p>
                      </div>
                    </div>
                    <div className="mt-4 bg-brand-dark/40 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-brand-primary to-brand-secondary h-2 rounded-full transition-all"
                        style={{ width: `${Math.round(doc.classification.confidence * 100)}%` }}
                      />
                    </div>
                  </div>
                ) : isProcessing ? (
                  <div className="glass-panel rounded-2xl p-6 border border-white/5 flex items-center gap-3">
                    <RefreshCw className="w-5 h-5 text-brand-warning animate-spin" />
                    <span className="text-sm text-brand-textMuted">AI classification in progress...</span>
                  </div>
                ) : null}

                {/* Entities summary */}
                {entities.length > 0 && (
                  <div className="glass-panel rounded-2xl p-6 border border-white/5">
                    <div className="flex items-center gap-3 mb-4">
                      <Tag className="w-5 h-5 text-brand-primary" />
                      <h2 className="text-sm font-bold uppercase tracking-wider text-brand-textMuted">Extracted Metadata</h2>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {Object.entries(entityGroups).slice(0, 4).map(([category, ents]) => (
                        <div key={category} className="bg-brand-dark/30 border border-white/5 rounded-xl p-4">
                          <span className="text-[10px] uppercase tracking-wider text-brand-textMuted block mb-1">{category}</span>
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

            {/* ── OCR TEXT TAB ── */}
            {activeTab === 'ocr' && (
              <div className="glass-panel rounded-2xl p-6 border border-white/5">
                <div className="flex items-center gap-3 mb-4">
                  <Brain className="w-5 h-5 text-brand-primary" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-brand-textMuted">Extracted Text</h2>
                </div>
                {doc.ocrResult?.text ? (
                  <pre className="whitespace-pre-wrap text-xs text-brand-text bg-brand-dark/40 rounded-xl p-4 border border-white/5 max-h-[500px] overflow-y-auto leading-relaxed font-mono">
                    {doc.ocrResult.text}
                  </pre>
                ) : isProcessing ? (
                  <div className="flex items-center gap-3 py-12 justify-center">
                    <RefreshCw className="w-5 h-5 text-brand-warning animate-spin" />
                    <span className="text-sm text-brand-textMuted">Extracting text from document...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-16 text-center">
                    <Brain className="w-10 h-10 text-brand-border mb-3" />
                    <p className="text-sm text-brand-textMuted">No text extracted yet.</p>
                    <p className="text-xs text-brand-textMuted mt-1">Text extraction runs automatically after upload.</p>
                  </div>
                )}
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
          </div>
        </div>

        {/* Right Column: AI Chat Sidebar */}
        <div className="w-full lg:w-96 shrink-0 glass-panel rounded-2xl border border-white/5 flex flex-col lg:h-full h-[580px] overflow-hidden">
          {/* Chat header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-white/[0.01]">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-primary to-brand-secondary flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-sm font-bold text-white">Ask AI Sidebar</span>
              <p className="text-[10px] text-brand-textMuted">Powered by document context</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === 'user' ? 'bg-brand-primary/20' : 'bg-white/10'
                }`}>
                  {msg.role === 'user' ? <User className="w-3.5 h-3.5 text-brand-primary" /> : <Bot className="w-3.5 h-3.5 text-brand-textMuted" />}
                </div>
                <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-brand-primary/20 text-white rounded-tr-sm'
                    : 'bg-white/5 text-brand-text rounded-tl-sm'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isChatLoading && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-brand-textMuted" />
                </div>
                <div className="px-4 py-3 rounded-2xl bg-white/5 rounded-tl-sm">
                  <RefreshCw className="w-4 h-4 text-brand-primary animate-spin" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-6 py-4 border-t border-white/5 bg-white/[0.01]">
            <div className="flex gap-3">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                placeholder="Ask something about this doc..."
                className="glass-input flex-1 text-xs"
              />
              <button
                onClick={sendChat}
                disabled={!chatInput.trim() || isChatLoading}
                className="glass-button-primary px-3 py-2 flex items-center gap-2 disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[9px] text-brand-textMuted mt-2 text-center">e.g. "Summarise key points", "Who is the owner?"</p>
          </div>
        </div>
      </main>
    </MainLayout>
  );
};

export default DocumentDetail;
