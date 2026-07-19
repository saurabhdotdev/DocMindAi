import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { MainLayout } from '../components/MainLayout';
import {
  Sparkles, Bot, User, Send, RefreshCw, Upload,
  FileText, Search, Plus, CheckCircle2, AlertCircle, FileCheck
} from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const AskAi: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
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

  // Fetch details of selected document
  const { data: selectedDoc, isLoading: isDocDetailLoading } = useQuery({
    queryKey: ['document', selectedDocId],
    queryFn: async () => {
      if (!selectedDocId) return null;
      const res = await api.get(`/v1/documents/${selectedDocId}`);
      return res.data.data;
    },
    enabled: !!selectedDocId,
    // Poll if document is still processing
    refetchInterval: (query) => {
      const doc = query.state.data as any;
      if (doc && (doc.status === 'PENDING' || doc.status === 'PROCESSING')) {
        return 2000;
      }
      return false;
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
      // Automatically select the newly uploaded document for chat
      if (data?.data?.document?.id) {
        setSelectedDocId(data.data.document.id);
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
    setSelectedDocId(id);
    setChatMessages([
      { role: 'assistant', content: `👋 Hi! Ask me anything about "${name}". I can extract information, summarise sections, or answer specific questions.` }
    ]);
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
    if (!messageText.trim() || isChatLoading || !selectedDocId) return;

    if (!textToSend) setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: messageText }]);
    setIsChatLoading(true);

    try {
      const res = await api.post(`/v1/documents/${selectedDocId}/chat`, {
        question: messageText,
      });
      if (res.data.success) {
        setChatMessages((prev) => [
          ...prev,
          { role: 'assistant', content: res.data.data.answer },
        ]);
      }
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${err.response?.data?.message || err.message}`,
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

  const isDocProcessing = selectedDoc?.status === 'PENDING' || selectedDoc?.status === 'PROCESSING';

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
        <aside className="w-full lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-white/5 flex flex-col p-6 overflow-y-auto max-h-[400px] lg:max-h-none lg:h-full">
          <div className="space-y-6">
            
            {/* Header */}
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-primary" />
                Ask AI Workspace
              </h1>
              <p className="text-[11px] text-brand-textMuted mt-1 leading-normal">
                Upload or select any document to query its contents instantly.
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
                Select Existing Document
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
                    const isSelected = doc.id === selectedDocId;
                    return (
                      <button
                        key={doc.id}
                        onClick={() => handleSelectDoc(doc.id, doc.name)}
                        className={`w-full text-left p-3 rounded-xl border text-xs transition-all flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-brand-primary/10 border-brand-primary/30 text-white shadow-sm'
                            : 'bg-brand-dark/30 border-white/5 text-brand-textMuted hover:border-white/10 hover:text-brand-text'
                        }`}
                      >
                        <div className="overflow-hidden flex items-center gap-2.5">
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

        {/* Right Side: Main Chat Workspace */}
        <section className="flex-1 flex flex-col min-w-0 h-[500px] lg:h-full overflow-hidden relative">
          
          {!selectedDocId ? (
            /* Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-brand-dark/20">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-primary/10 to-brand-secondary/10 flex items-center justify-center mb-4 border border-brand-primary/10 animate-pulse">
                <Bot className="w-8 h-8 text-brand-primary" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">Semantic AI Chat Panel</h2>
              <p className="text-xs text-brand-textMuted max-w-sm leading-relaxed">
                Choose any uploaded document from the left list or upload a new one to immediately start extracting facts, summaries, and answering queries.
              </p>
            </div>
          ) : isDocProcessing ? (
            /* Processing State Overlay */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-brand-dark/20">
              <div className="w-14 h-14 rounded-full bg-brand-primary/10 flex items-center justify-center mb-4 animate-spin">
                <RefreshCw className="w-6 h-6 text-brand-primary" />
              </div>
              <h2 className="text-base font-bold text-white mb-2">Extracting Document Layout & Entities...</h2>
              <p className="text-xs text-brand-textMuted max-w-xs leading-normal">
                Our backend is running OCR, classifications, and text segmentation models on this file. This will complete in a few moments...
              </p>
            </div>
          ) : (
            /* Active Chat Interface */
            <div className="flex-1 flex flex-col min-h-0">
              
              {/* Active Document Header */}
              <div className="px-6 py-4 border-b border-white/5 bg-white/[0.01] flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-8 h-8 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center shrink-0">
                    <FileCheck className="w-4 h-4 text-brand-primary" />
                  </div>
                  <div className="overflow-hidden">
                    <span className="text-xs font-bold text-white block truncate">{selectedDoc?.name}</span>
                    <span className="text-[10px] text-brand-textMuted block">
                      Type: {selectedDoc?.type?.toUpperCase()} | Size: {(selectedDoc?.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                </div>
              </div>

              {/* Chat Message List */}
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex gap-3.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
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
                    placeholder={`Ask AI about ${selectedDoc?.name || 'this document'}...`}
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
          )}

        </section>

      </div>
    </MainLayout>
  );
};

export default AskAi;
