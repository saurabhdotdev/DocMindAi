import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { MainLayout } from '../components/MainLayout';
import {
  Sparkles, Bot, User, Send, RefreshCw, Upload,
  FileText, Search, Plus, CheckCircle2, AlertCircle, FileCheck, Clock
} from 'lucide-react';

interface Source {
  docId: string;
  docName: string;
  text: string;
  page: number;
}

interface Message {
  role: 'user' | 'assistant' | 'leo' | 'sarah' | 'mike';
  content: string;
  sources?: Source[];
}

export const AskAi: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Chat Session states
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // PDF Preview states
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState<number>(1);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [previewTab, setPreviewTab] = useState<'pdf' | 'layout'>('pdf');
  const [highlightedText, setHighlightedText] = useState<string | null>(null);

  // Agent Debate state
  const [isDebateMode, setIsDebateMode] = useState(false);

  // Multimedia Timeline ref
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);

  // Comparisons state
  const [comparisons, setComparisons] = useState<any[] | null>(null);
  const [isCompareLoading, setIsCompareLoading] = useState(false);
  
  // Upload states
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  
  // Chat states
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatLoading]);

  // Fetch list of documents
  const { data: documents = [], isLoading: isDocsLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const res = await api.get('/v1/documents?page=1&limit=50');
      return res.data.data.documents;
    },
    refetchInterval: (query) => {
      const docs = query.state.data as any;
      if (docs && Array.isArray(docs) && docs.some((doc: any) => doc.status === 'PENDING' || doc.status === 'PROCESSING')) {
        return 3000; // Poll every 3 seconds if active jobs are running
      }
      return false;
    }
  });

  // Fetch past chat sessions
  const { data: chatSessions = [], isLoading: isSessionsLoading } = useQuery({
    queryKey: ['chatSessions'],
    queryFn: async () => {
      const res = await api.get('/v1/chats');
      return res.data.data;
    }
  });

  // Fetch history of active chat session
  const { data: activeSessionHistory } = useQuery({
    queryKey: ['chatHistory', activeSessionId],
    queryFn: async () => {
      if (!activeSessionId) return null;
      const res = await api.get(`/v1/chats/${activeSessionId}/messages`);
      return res.data.data;
    },
    enabled: !!activeSessionId,
  });

  // Sync active session message history to message state
  useEffect(() => {
    if (activeSessionHistory) {
      setChatMessages(activeSessionHistory.map((m: any) => ({
        role: m.role.toLowerCase() as any,
        content: m.content,
        sources: m.citations || [],
      })));
    }
  }, [activeSessionHistory]);

  // Fetch details of previewed document
  const { data: previewDoc } = useQuery({
    queryKey: ['document', previewDocId],
    queryFn: async () => {
      if (!previewDocId) return null;
      const res = await api.get(`/v1/documents/${previewDocId}`);
      return res.data.data;
    },
    enabled: !!previewDocId,
  });

  // Create new persistent chat session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (docId: string) => {
      const res = await api.post('/v1/chats', { documentId: docId });
      return res.data.data;
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ['chatSessions'] });
      setActiveSessionId(session.id);
    }
  });

  // Document upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/v1/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onSuccess: (data) => {
      setUploadSuccess(true);
      setUploadFile(null);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      // Automatically select and start session for the new document
      if (data?.data?.document?.id) {
        const newId = data.data.document.id;
        setSelectedDocIds([newId]);
        createSessionMutation.mutate(newId);
      }
      setTimeout(() => setUploadSuccess(false), 3000);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'File upload failed.';
      setUploadError(msg);
      setTimeout(() => setUploadError(null), 5000);
    },
  });

  // Handle document selection change
  const handleSelectDoc = (id: string) => {
    setSelectedDocIds((prev) => {
      const exists = prev.includes(id);
      let next: string[];
      if (exists) {
        next = prev.filter((d) => d !== id);
      } else {
        next = [...prev, id];
      }

      // Sync persistent session logic when exactly one document is active
      if (next.length === 1) {
        const match = chatSessions.find((s: any) => s.documentId === next[0]);
        if (match) {
          setActiveSessionId(match.id);
        } else {
          createSessionMutation.mutate(next[0]);
        }
      } else {
        setActiveSessionId(null);
        if (next.length > 1) {
          setChatMessages([
            { role: 'assistant', content: `👋 Hi! I can answer questions across your ${next.length} selected documents simultaneously using vector search.` }
          ]);
        } else {
          setChatMessages([]);
        }
      }
      return next;
    });
  };

  // Upload file submission
  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadFile) {
      uploadMutation.mutate(uploadFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0]);
    }
  };

  // Compare selected documents side-by-side
  const handleCompareDocuments = async () => {
    if (selectedDocIds.length === 0) return;
    setIsCompareLoading(true);
    try {
      const res = await api.post('/v1/documents/compare', {
        docIds: selectedDocIds,
      });
      if (res.data.success) {
        setComparisons(res.data.data);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Comparison failed.');
    } finally {
      setIsCompareLoading(false);
    }
  };

  // Send message to AI Q&A endpoint
  const sendChat = async (textToSend?: string) => {
    const messageText = textToSend || chatInput;
    if (!messageText.trim() || isChatLoading || selectedDocIds.length === 0) return;

    if (!textToSend) setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: messageText }]);
    setIsChatLoading(true);

    try {
      let res;
      if (selectedDocIds.length === 1 && isDebateMode) {
        // Multi-Agent Debate mode API route
        res = await api.post(`/v1/documents/${selectedDocIds[0]}/debate`, {
          question: messageText,
        });
        if (res.data.success) {
          const debateDialog = res.data.data;
          const mappedLines: Message[] = debateDialog.map((d: any) => {
            let role: 'leo' | 'sarah' | 'mike' = 'leo';
            if (d.agent.includes('HR')) role = 'sarah';
            if (d.agent.includes('Analyst')) role = 'mike';
            return {
              role,
              content: d.message,
            };
          });
          setChatMessages((prev) => [...prev, ...mappedLines]);
        }
      } else if (selectedDocIds.length === 1 && activeSessionId) {
        // Send to persistent session endpoint
        res = await api.post(`/v1/chats/${activeSessionId}/messages`, {
          question: messageText,
        });
        if (res.data.success) {
          const { answer, sources } = res.data.data;
          setChatMessages((prev) => [
            ...prev,
            { role: 'assistant', content: answer, sources },
          ]);
          queryClient.invalidateQueries({ queryKey: ['chatHistory', activeSessionId] });
          queryClient.invalidateQueries({ queryKey: ['chatSessions'] });
        }
      } else {
        // Multi-document direct workspace chat route (stateless or cross-doc)
        res = await api.post(`/v1/documents/chat`, {
          docIds: selectedDocIds,
          question: messageText,
        });
        if (res.data.success) {
          const answer = res.data.answer || 'No response from AI.';
          const sources = res.data.sources || [];
          setChatMessages((prev) => [
            ...prev,
            { role: 'assistant', content: answer, sources },
          ]);
        }
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'An error occurred.';
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${errMsg}`,
        },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Filter documents based on search
  const filteredDocs = documents.filter((doc: any) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Preset suggestions helper
  const suggestions = [
    "Summarise key points",
    "Find email and contact details",
    "Analyze candidate technical stack",
    "List key achievements"
  ];

  // Detect if preview file is audio or video
  const isPreviewMedia = previewDoc?.mimeType?.startsWith('audio/') || 
                         previewDoc?.mimeType?.startsWith('video/') ||
                         previewDoc?.name?.endsWith('.mp3') ||
                         previewDoc?.name?.endsWith('.wav') ||
                         previewDoc?.name?.endsWith('.mp4') ||
                         previewDoc?.name?.endsWith('.m4a');

  return (
    <MainLayout>
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 bg-brand-dark overflow-hidden">
        
        {/* Left Side: Document Panel & Uploader */}
        <aside className="w-full lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-white/5 flex flex-col p-6 overflow-y-auto max-h-[350px] lg:max-h-none lg:h-full">
          <div className="space-y-6">
            
            {/* Header */}
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-primary" />
                Ask AI Workspace
              </h1>
              <p className="text-[11px] text-brand-textMuted mt-1 leading-normal">
                Upload or select multiple documents to query their contents simultaneously.
              </p>
            </div>

            {/* Upload Zone */}
            <form onSubmit={handleUploadSubmit} className="space-y-3">
              <div className="border border-dashed border-brand-border hover:border-brand-primary/50 rounded-xl p-4 flex flex-col items-center justify-center bg-brand-dark/20 text-center relative transition-colors cursor-pointer group">
                <input
                  type="file"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={handleFileChange}
                />
                <div className="w-9 h-9 rounded-lg bg-brand-primary/10 flex items-center justify-center mb-2 group-hover:bg-brand-primary/20 transition-colors">
                  <Upload className="w-4.5 h-4.5 text-brand-primary" />
                </div>
                <span className="text-[11px] text-brand-text font-semibold block truncate max-w-full px-2">
                  {uploadFile ? uploadFile.name : 'Select / Drop any file'}
                </span>
                <span className="text-[9px] text-brand-textMuted mt-0.5 block">
                  PDF, DOCX, CSV, Images, Audio, Video
                </span>
              </div>

              {uploadError && (
                <p className="text-[10px] text-brand-error text-center">{uploadError}</p>
              )}
              {uploadSuccess && (
                <p className="text-[10px] text-brand-success text-center">Uploaded successfully!</p>
              )}

              {uploadFile && (
                <button
                  type="submit"
                  disabled={uploadMutation.isPending}
                  className="glass-button-primary w-full text-xs py-2 flex items-center justify-center gap-2"
                >
                  {uploadMutation.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>Upload & Chat</span>
                </button>
              )}
            </form>

            <hr className="border-white/5" />

            {/* Document Selector */}
            <div className="space-y-3">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted">
                Select Documents to Chat
              </h2>
              
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-brand-textMuted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search files..."
                  className="glass-input pl-9 pr-4 py-1.5 text-xs w-full"
                />
              </div>

              {/* List */}
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {isDocsLoading ? (
                  <div className="flex justify-center py-4">
                    <RefreshCw className="w-5 h-5 text-brand-primary animate-spin" />
                  </div>
                ) : filteredDocs.length === 0 ? (
                  <p className="text-[11px] text-brand-textMuted text-center py-4">No documents found.</p>
                ) : (
                  filteredDocs.map((doc: any) => {
                    const isSelected = selectedDocIds.includes(doc.id);
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => handleSelectDoc(doc.id)}
                        className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-brand-primary/10 border-brand-primary/40 text-white shadow-sm ring-1 ring-brand-primary/30'
                            : 'bg-brand-dark/30 border-white/5 text-brand-textMuted hover:border-white/10 hover:text-brand-text'
                        }`}
                      >
                        <div className="overflow-hidden flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="w-3.5 h-3.5 rounded border-white/10 bg-brand-dark/50 text-brand-primary focus:ring-brand-primary shrink-0 accent-brand-primary cursor-pointer pointer-events-none"
                          />
                          <FileText className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-brand-primary' : 'text-brand-textMuted'}`} />
                          <span className="truncate block font-medium">{doc.name}</span>
                        </div>
                        {doc.status === 'COMPLETED' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-brand-success shrink-0" />
                        ) : doc.status === 'FAILED' ? (
                          <AlertCircle className="w-3.5 h-3.5 text-brand-error shrink-0" />
                        ) : (
                          <RefreshCw className="w-3 h-3 text-brand-primary animate-spin shrink-0" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <hr className="border-white/5" />

            {/* Chat History Selector */}
            <div className="space-y-3">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-brand-primary shrink-0" />
                Recent Chat Threads
              </h2>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {isSessionsLoading ? (
                  <div className="flex justify-center py-2">
                    <RefreshCw className="w-4 h-4 text-brand-primary animate-spin" />
                  </div>
                ) : chatSessions.length === 0 ? (
                  <p className="text-[10px] text-brand-textMuted text-center py-2">No past chats.</p>
                ) : (
                  chatSessions.map((session: any) => {
                    const isActive = session.id === activeSessionId;
                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => {
                          setSelectedDocIds([session.documentId]);
                          setActiveSessionId(session.id);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg border text-[11px] transition-all flex items-center gap-2 ${
                          isActive
                            ? 'bg-brand-primary/10 border-brand-primary/30 text-white font-medium shadow-sm'
                            : 'bg-brand-dark/20 border-white/5 text-brand-textMuted hover:border-white/10 hover:text-brand-text'
                        }`}
                      >
                        <Bot className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-brand-primary' : 'text-brand-textMuted'}`} />
                        <span className="truncate block flex-1">{session.title}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        </aside>

        {/* Right Side: Split-Screen Chat & PDF Viewer Workspace */}
        <section className="flex-1 flex flex-col min-w-0 h-[500px] lg:h-full overflow-hidden relative">
          
          {selectedDocIds.length === 0 ? (
            /* Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-brand-dark/20">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-primary/10 to-brand-secondary/10 flex items-center justify-center mb-4 border border-brand-primary/10 animate-pulse">
                <Bot className="w-8 h-8 text-brand-primary" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">Semantic AI Workspace Chat</h2>
              <p className="text-xs text-brand-textMuted max-w-sm leading-relaxed">
                Select one or more documents from the left sidebar to start chatting, asking questions, and comparing files instantly.
              </p>
            </div>
          ) : (
            /* Active Workspace (Split layout support) */
            <div className="flex-1 flex min-h-0 overflow-hidden">
              
              {/* Left Side: Active Chat Box */}
              <div className="flex-1 flex flex-col min-h-0 border-r border-white/5">
                
                {/* Active Documents Header */}
                <div className="px-6 py-4 border-b border-white/5 bg-white/[0.01] flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-3 overflow-hidden flex-1">
                    <div className="w-8 h-8 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center shrink-0">
                      <FileCheck className="w-4 h-4 text-brand-primary" />
                    </div>
                    <div className="overflow-hidden flex-1 pr-4">
                      <span className="text-xs font-bold text-white block truncate">
                        {selectedDocIds.length === 1 
                          ? documents.find((d: any) => d.id === selectedDocIds[0])?.name || 'Document'
                          : `Workspace Chat (${selectedDocIds.length} Files Selected)`
                        }
                      </span>
                      <span className="text-[10px] text-brand-textMuted block truncate">
                        {selectedDocIds.length === 1
                          ? 'Active document ready for semantic RAG queries'
                          : documents.filter((d: any) => selectedDocIds.includes(d.id)).map((d: any) => d.name).join(', ')
                        }
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Agent Debate Mode switch */}
                      {selectedDocIds.length === 1 && (
                        <button
                          type="button"
                          onClick={() => setIsDebateMode(!isDebateMode)}
                          className={`px-3 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition-all font-semibold ${
                            isDebateMode
                              ? 'bg-brand-primary/20 border-brand-primary text-white shadow-sm ring-1 ring-brand-primary/30'
                              : 'bg-white/5 border-white/5 text-brand-textMuted hover:text-white'
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5 text-brand-primary" />
                          <span>Debate Panel Mode</span>
                        </button>
                      )}

                      {/* Comparative matrices action button */}
                      {selectedDocIds.length > 1 && (
                        <button
                          onClick={handleCompareDocuments}
                          disabled={isCompareLoading}
                          className="glass-button-primary px-3 py-1.5 text-xs flex items-center gap-1.5"
                        >
                          {isCompareLoading ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          <span>Compare Metrics</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Chat Message List */}
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex flex-col space-y-2`}>
                      <div className={`flex gap-3.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${
                          msg.role === 'user' 
                            ? 'bg-brand-primary/10 border-brand-primary/20' 
                            : msg.role === 'leo'
                            ? 'bg-brand-primary/10 border-brand-primary/20'
                            : msg.role === 'sarah'
                            ? 'bg-brand-secondary/10 border-brand-secondary/20'
                            : msg.role === 'mike'
                            ? 'bg-brand-success/10 border-brand-success/20'
                            : 'bg-white/5 border-white/5'
                        }`}>
                          {msg.role === 'user' ? (
                            <User className="w-3.5 h-3.5 text-brand-primary" />
                          ) : msg.role === 'leo' ? (
                            <span className="text-xs">👨‍💻</span>
                          ) : msg.role === 'sarah' ? (
                            <span className="text-xs">👩‍💼</span>
                          ) : msg.role === 'mike' ? (
                            <span className="text-xs">📊</span>
                          ) : (
                            <Bot className="w-3.5 h-3.5 text-brand-textMuted" />
                          )}
                        </div>
                        <div className={`max-w-[80%] px-4 py-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap shadow-sm ${
                          msg.role === 'user'
                            ? 'bg-brand-primary/20 text-white rounded-tr-sm'
                            : msg.role === 'leo'
                            ? 'bg-brand-primary/10 border border-brand-primary/20 text-brand-text rounded-tl-sm'
                            : msg.role === 'sarah'
                            ? 'bg-brand-secondary/10 border border-brand-secondary/20 text-brand-text rounded-tl-sm'
                            : msg.role === 'mike'
                            ? 'bg-brand-success/10 border border-brand-success/20 text-brand-text rounded-tl-sm'
                            : 'bg-white/5 text-brand-text rounded-tl-sm border border-white/[0.02]'
                        }`}>
                          {(msg.role === 'leo' || msg.role === 'sarah' || msg.role === 'mike') && (
                            <span className="font-extrabold block text-[10px] uppercase tracking-wider mb-1 text-brand-primary">
                              {msg.role === 'leo' ? 'Leo (Tech Lead)' : msg.role === 'sarah' ? 'Sarah (HR Director)' : 'Mike (Business Analyst)'}
                            </span>
                          )}
                          {msg.content}
                          
                          {/* Citation links below AI bubbles */}
                          {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                            <div className="mt-3 pt-2.5 border-t border-white/5 flex flex-wrap gap-1.5">
                              {msg.sources.map((src, sIdx) => (
                                <button
                                  key={sIdx}
                                  onClick={() => {
                                    setPreviewDocId(src.docId);
                                    setPreviewPage(src.page);
                                    setHighlightedText(src.text); // Hold clicked citation context
                                    setIsPreviewOpen(true);
                                  }}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 hover:border-brand-primary/40 hover:bg-brand-primary/5 text-[9px] text-brand-textMuted hover:text-white transition-all max-w-[200px]"
                                  title={`Click to preview page ${src.page} of ${src.docName}`}
                                >
                                  <FileText className="w-3 h-3 text-brand-primary shrink-0" />
                                  <span className="truncate">{src.docName}</span>
                                  <span className="shrink-0 font-bold text-brand-primary">(p. {src.page})</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {isChatLoading && (
                    <div className="flex gap-3.5">
                      <div className="w-8 h-8 rounded-full bg-white/5 border border-white/5 flex items-center justify-center shrink-0">
                        <Bot className="w-3.5 h-3.5 text-brand-textMuted" />
                      </div>
                      <div className="px-4 py-3 rounded-2xl bg-white/5 rounded-tl-sm flex items-center justify-center">
                        <RefreshCw className="w-3.5 h-3.5 text-brand-primary animate-spin" />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Suggestions */}
                {chatMessages.length <= 1 && (
                  <div className="px-6 py-2 flex flex-wrap gap-2 shrink-0">
                    {suggestions.map((sug, i) => (
                      <button
                        key={i}
                        onClick={() => sendChat(sug)}
                        className="px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.01] hover:border-brand-primary/30 hover:text-white text-[10px] text-brand-textMuted transition-all"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}

                {/* Chat Input Bar */}
                <div className="px-6 py-4 border-t border-white/5 bg-white/[0.01] shrink-0">
                  <div className="flex gap-3">
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChat()}
                      placeholder={isDebateMode ? "Ask Leo, Sarah, and Mike to debate a topic..." : "Ask AI a question about your selected documents..."}
                      className="glass-input flex-1 text-xs"
                      disabled={isChatLoading}
                    />
                    <button
                      onClick={() => sendChat()}
                      disabled={!chatInput.trim() || isChatLoading}
                      className="glass-button-primary px-4 py-2 flex items-center gap-2 disabled:opacity-40"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

              </div>

              {/* Right Side: Split PDF / Media Workspace Preview Pane */}
              {isPreviewOpen && (
                <div className="w-full lg:w-[450px] xl:w-[600px] shrink-0 flex flex-col h-full bg-brand-dark/40 border-l border-white/5 animate-in slide-in-from-right duration-300">
                  
                  {/* Preview pane header */}
                  <div className="px-4 py-3 border-b border-white/5 flex justify-between items-center bg-white/[0.01] shrink-0">
                    <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
                      <FileCheck className="w-3.5 h-3.5 text-brand-primary shrink-0" />
                      <span className="text-xs font-bold text-white truncate" title={previewDoc?.name}>
                        {previewDoc?.name || 'Loading...'}
                      </span>
                    </div>

                    {/* Preview mode tabs (only for non-media text/PDF files) */}
                    {!isPreviewMedia && previewDoc && (
                      <div className="flex border border-white/5 rounded-lg overflow-hidden mr-3 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPreviewTab('pdf')}
                          className={`px-2.5 py-1 text-[10px] font-medium transition-all ${
                            previewTab === 'pdf' ? 'bg-brand-primary/20 text-brand-primary' : 'text-brand-textMuted hover:text-white'
                          }`}
                        >
                          PDF Original
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewTab('layout')}
                          className={`px-2.5 py-1 text-[10px] font-medium transition-all ${
                            previewTab === 'layout' ? 'bg-brand-primary/20 text-brand-primary' : 'text-brand-textMuted hover:text-white'
                          }`}
                        >
                          Visual Layout
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => {
                        setIsPreviewOpen(false);
                        setHighlightedText(null);
                      }}
                      className="text-[10px] font-bold text-brand-textMuted hover:text-white px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-lg transition-colors shrink-0"
                    >
                      Close [X]
                    </button>
                  </div>

                  <div className="flex-1 bg-[#1e1e24] relative flex flex-col min-h-0 overflow-y-auto">
                    {previewDoc?.downloadUrl ? (
                      isPreviewMedia ? (
                        /* Multimedia Video/Audio Player & Transcription Timeline */
                        <div className="flex-1 flex flex-col p-4 min-h-0">
                          {/* HTML5 Player */}
                          <div className="w-full bg-brand-dark/50 border border-white/5 rounded-xl overflow-hidden shadow-md shrink-0">
                            {previewDoc.mimeType?.startsWith('video/') || previewDoc.name.endsWith('.mp4') ? (
                              <video
                                ref={mediaRef as React.RefObject<HTMLVideoElement>}
                                src={previewDoc.downloadUrl}
                                controls
                                className="w-full max-h-[220px] bg-black"
                              />
                            ) : (
                              <div className="p-4 flex flex-col items-center">
                                <span className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider mb-2">Media Audio Playback</span>
                                <audio
                                  ref={mediaRef as React.RefObject<HTMLAudioElement>}
                                  src={previewDoc.downloadUrl}
                                  controls
                                  className="w-full"
                                />
                              </div>
                            )}
                          </div>

                          {/* Scrollable Timestamped Transcription segments */}
                          <div className="flex-1 overflow-y-auto mt-4 space-y-2 pr-1">
                            <span className="text-[9px] font-bold text-brand-textMuted uppercase tracking-wider block mb-2">
                              Interactive Transcription Timelines
                            </span>
                            {previewDoc.ocrResult?.layout?.blocks && previewDoc.ocrResult.layout.blocks.length > 0 ? (
                              previewDoc.ocrResult.layout.blocks.map((block: any, idx: number) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    const sec = block.seconds || 0;
                                    if (mediaRef.current) {
                                      mediaRef.current.currentTime = sec;
                                      mediaRef.current.play().catch(() => {});
                                    }
                                  }}
                                  className="w-full text-left p-3 rounded-xl border border-white/5 bg-brand-dark/20 hover:border-brand-primary/40 hover:bg-brand-primary/5 transition-all flex gap-3 items-start text-xs group"
                                >
                                  <span className="px-2 py-0.5 rounded bg-brand-primary/20 text-brand-primary font-mono text-[9px] font-bold shrink-0 group-hover:bg-brand-primary group-hover:text-white transition-all">
                                    {block.timestamp || '00:00'}
                                  </span>
                                  <span className="text-brand-text leading-relaxed font-medium">{block.text}</span>
                                </button>
                              ))
                            ) : (
                              <div className="text-center text-brand-textMuted text-xs py-8">
                                No transcription blocks found.
                              </div>
                            )}
                          </div>
                        </div>
                      ) : previewTab === 'pdf' ? (
                        /* Standard original PDF Iframe view */
                        <iframe
                          src={`${previewDoc.downloadUrl}#page=${previewPage}`}
                          className="w-full h-full border-none"
                          title="PDF Document Preview"
                        />
                      ) : (
                        /* Semantic Layout coordinates highlighting map */
                        <div className="flex-1 p-4 flex flex-col min-h-0 overflow-y-auto">
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-[10px] font-bold text-brand-textMuted uppercase tracking-wider">
                              Semantic Citation Highlighting Canvas
                            </span>
                            <span className="text-[9px] text-brand-textMuted">Glowing blocks show citation match</span>
                          </div>

                          <div className="relative w-[340px] md:w-[480px] h-[550px] bg-brand-dark/40 border border-white/5 rounded-xl overflow-hidden mx-auto bg-gradient-to-b from-brand-dark/20 to-brand-dark/50 shrink-0">
                            {previewDoc.ocrResult?.layout?.blocks?.map((block: any, idx: number) => {
                              const [rawX, rawY, rawW, rawH] = block.boundingBox || [50, 50 + idx * 30, 300, 20];
                              const scaleX = 480 / 600;
                              const scaleY = 550 / 800;
                              const x = Math.round(rawX * scaleX);
                              const y = Math.round(rawY * scaleY);
                              const w = Math.round(rawW * scaleX);
                              const h = Math.round(rawH * scaleY);

                              // Semantic match to citation text snippet
                              const isHighlighted = highlightedText && block.text.toLowerCase().includes(highlightedText.toLowerCase());

                              return (
                                <div
                                  key={idx}
                                  style={{
                                    position: 'absolute',
                                    left: `${x}px`,
                                    top: `${y}px`,
                                    width: `${Math.max(20, w)}px`,
                                    height: `${Math.max(10, h)}px`,
                                  }}
                                  className={`border rounded transition-all flex items-center justify-center ${
                                    isHighlighted
                                      ? 'bg-yellow-500/25 border-yellow-400 ring-2 ring-yellow-400/50 shadow-lg shadow-yellow-400/20 z-20 scale-[1.01]'
                                      : 'bg-brand-primary/5 border-white/5'
                                  }`}
                                  title={block.text}
                                >
                                  {isHighlighted && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-ping" />
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Highlighted text preview block below */}
                          {highlightedText && (
                            <div className="bg-yellow-500/10 border border-yellow-400/30 rounded-xl p-3.5 mt-3.5">
                              <span className="text-[9px] font-bold text-yellow-400 uppercase tracking-wider block mb-1">
                                Cited Source Text Highlighted
                              </span>
                              <p className="text-xs text-brand-text leading-relaxed italic">
                                "{highlightedText}"
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full gap-2.5 text-brand-textMuted text-xs">
                        <RefreshCw className="w-5 h-5 text-brand-primary animate-spin" />
                        <span>Generating secure preview link...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}

        </section>

      </div>

      {/* Comparisons Modal Overlay */}
      {comparisons && (
        <div className="fixed inset-0 bg-brand-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
          <div className="bg-brand-dark/95 border border-white/10 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-brand-primary" />
                <h2 className="text-sm font-extrabold text-white">Cross-Document Comparison Matrix</h2>
              </div>
              <button
                onClick={() => setComparisons(null)}
                className="text-xs font-bold text-brand-textMuted hover:text-white px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
              >
                Close [X]
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Comparison Table */}
              <div className="border border-white/5 rounded-xl overflow-hidden bg-brand-dark/20">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/5 text-brand-textMuted font-bold uppercase tracking-wider text-[9px]">
                      <th className="p-3">File Name</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">File Size</th>
                      <th className="p-3 text-center">ATS Score</th>
                      <th className="p-3 text-center">Skills</th>
                      <th className="p-3 text-center">Experience</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-brand-text">
                    {comparisons.map((c: any) => (
                      <tr key={c.id} className="hover:bg-white/[0.01] transition-colors">
                        <td className="p-3 font-semibold text-white truncate max-w-[200px]" title={c.name}>{c.name}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-[10px]">
                            {c.category}
                          </span>
                        </td>
                        <td className="p-3">{(c.size / 1024).toFixed(1)} KB</td>
                        <td className="p-3 text-center font-bold text-brand-success">{c.atsScore > 0 ? `${c.atsScore}%` : 'N/A'}</td>
                        <td className="p-3 text-center">{c.skillsCount}</td>
                        <td className="p-3 text-center">{c.experienceCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Comparison Bar Charts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* ATS Scores Bar Chart */}
                <div className="bg-brand-dark/40 border border-white/5 rounded-xl p-4">
                  <span className="text-[10px] font-bold text-brand-textMuted uppercase tracking-wider block mb-3">ATS Compatibility Comparison</span>
                  <div className="space-y-3">
                    {comparisons.map((c: any) => (
                      <div key={c.id} className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-white truncate max-w-[70%]" title={c.name}>{c.name}</span>
                          <span className="text-brand-primary font-bold">{c.atsScore > 0 ? `${c.atsScore}%` : 'N/A'}</span>
                        </div>
                        {c.atsScore > 0 && (
                          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="bg-brand-primary h-full rounded-full transition-all duration-500"
                              style={{ width: `${c.atsScore}%` }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Skills Count Bar Chart */}
                <div className="bg-brand-dark/40 border border-white/5 rounded-xl p-4">
                  <span className="text-[10px] font-bold text-brand-textMuted uppercase tracking-wider block mb-3">Detected Skills Volume</span>
                  <div className="space-y-3">
                    {comparisons.map((c: any) => (
                      <div key={c.id} className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-white truncate max-w-[70%]" title={c.name}>{c.name}</span>
                          <span className="text-brand-secondary font-bold">{c.skillsCount} skills</span>
                        </div>
                        {c.skillsCount > 0 && (
                          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="bg-brand-secondary h-full rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, (c.skillsCount / 20) * 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

              </div>

            </div>

          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default AskAi;
