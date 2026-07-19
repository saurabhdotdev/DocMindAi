import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { MainLayout } from '../components/MainLayout';
import {
  Sparkles, Bot, User, Send, RefreshCw, Upload,
  FileText, Search, Plus, CheckCircle2, AlertCircle, FileCheck
} from 'lucide-react';

interface Source {
  docId: string;
  docName: string;
  text: string;
  page: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
}

export const AskAi: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // PDF Preview states
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState<number>(1);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  
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
      // Automatically select the newly uploaded document
      if (data?.data?.document?.id) {
        const newId = data.data.document.id;
        setSelectedDocIds((prev) => [...prev.filter(id => id !== newId), newId]);
        setChatMessages([
          { role: 'assistant', content: `👋 Hi! I'm ready to answer any questions about "${data.data.document.name}". Please wait a moment while I extract the text...` }
        ]);
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
  const handleSelectDoc = (id: string, name: string) => {
    setSelectedDocIds((prev) => {
      const exists = prev.includes(id);
      let next: string[];
      if (exists) {
        next = prev.filter((d) => d !== id);
      } else {
        next = [...prev, id];
      }

      // Initialize chat message with summary helper
      if (next.length === 1 && !exists) {
        setChatMessages([
          { role: 'assistant', content: `👋 Hi! I can answer questions across your selected document: "${name}". You can select more documents in the sidebar to chat with multiple files at once!` }
        ]);
      } else if (next.length > 1) {
        setChatMessages([
          { role: 'assistant', content: `👋 Hi! I can answer questions across your ${next.length} selected documents simultaneously using vector search.` }
        ]);
      } else if (next.length === 0) {
        setChatMessages([]);
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

  // Send message to AI Q&A endpoint
  const sendChat = async (textToSend?: string) => {
    const messageText = textToSend || chatInput;
    if (!messageText.trim() || isChatLoading || selectedDocIds.length === 0) return;

    if (!textToSend) setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: messageText }]);
    setIsChatLoading(true);

    try {
      let res;
      if (selectedDocIds.length === 1) {
        // Single document chat route
        res = await api.post(`/v1/documents/${selectedDocIds[0]}/chat`, {
          question: messageText,
        });
      } else {
        // Multi-document chat route
        res = await api.post(`/v1/documents/chat`, {
          docIds: selectedDocIds,
          question: messageText,
        });
      }

      if (res.data.success) {
        const answer = res.data.answer || 'No response from AI.';
        const sources = res.data.sources || [];
        setChatMessages((prev) => [
          ...prev,
          { role: 'assistant', content: answer, sources },
        ]);
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
              <div className="space-y-1.5 max-h-48 lg:max-h-[300px] overflow-y-auto pr-1">
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
                        onClick={() => handleSelectDoc(doc.id, doc.name)}
                        className={`w-full text-left p-3 rounded-xl border text-xs transition-all flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-brand-primary/10 border-brand-primary/40 text-white shadow-sm ring-1 ring-brand-primary/30'
                            : 'bg-brand-dark/30 border-white/5 text-brand-textMuted hover:border-white/10 hover:text-brand-text'
                        }`}
                      >
                        <div className="overflow-hidden flex items-center gap-2.5">
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
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-8 h-8 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center shrink-0">
                      <FileCheck className="w-4 h-4 text-brand-primary" />
                    </div>
                    <div className="overflow-hidden">
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
                            : 'bg-white/5 border-white/5'
                        }`}>
                          {msg.role === 'user' ? (
                            <User className="w-3.5 h-3.5 text-brand-primary" />
                          ) : (
                            <Bot className="w-3.5 h-3.5 text-brand-textMuted" />
                          )}
                        </div>
                        <div className={`max-w-[80%] px-4 py-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap shadow-sm ${
                          msg.role === 'user'
                            ? 'bg-brand-primary/20 text-white rounded-tr-sm'
                            : 'bg-white/5 text-brand-text rounded-tl-sm border border-white/[0.02]'
                        }`}>
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
                      placeholder="Ask AI a question about your selected documents..."
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

              {/* Right Side: Split PDF Preview Pane */}
              {isPreviewOpen && (
                <div className="w-full lg:w-[450px] xl:w-[600px] shrink-0 flex flex-col h-full bg-brand-dark/40 border-l border-white/5 animate-in slide-in-from-right duration-300">
                  <div className="px-4 py-3.5 border-b border-white/5 flex justify-between items-center bg-white/[0.01] shrink-0">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileCheck className="w-3.5 h-3.5 text-brand-primary shrink-0" />
                      <span className="text-xs font-bold text-white truncate max-w-[250px]" title={previewDoc?.name}>
                        Preview: {previewDoc?.name || 'Loading...'}
                      </span>
                      <span className="text-[10px] text-brand-textMuted shrink-0">
                        (Page {previewPage})
                      </span>
                    </div>
                    <button
                      onClick={() => setIsPreviewOpen(false)}
                      className="text-[10px] font-bold text-brand-textMuted hover:text-white px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                    >
                      Close [X]
                    </button>
                  </div>
                  <div className="flex-1 bg-[#1e1e24] relative">
                    {previewDoc?.downloadUrl ? (
                      <iframe
                        src={`${previewDoc.downloadUrl}#page=${previewPage}`}
                        className="w-full h-full border-none"
                        title="PDF Document Preview"
                      />
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
    </MainLayout>
  );
};

export default AskAi;
