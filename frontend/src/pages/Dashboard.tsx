import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { MainLayout } from '../components/MainLayout';
import { 
  FileText, Upload, Trash2, Plus, 
  Calendar, Sparkles, RefreshCw, Download, Play, ExternalLink
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  
  // Track selected format per document ID
  const [selectedFormats, setSelectedFormats] = useState<Record<string, string>>({});

  // Collaborative Folders state
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareFolderId, setShareFolderId] = useState<string | null>(null);

  // Multi-document selection & merge states
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergedName, setMergedName] = useState('');
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  // Helper to map formats
  const getValidTargetFormats = (type: string): string[] => {
    const cleanType = type.toUpperCase();
    const CONVERSION_MAP: Record<string, string[]> = {
      PDF: ['DOCX', 'PNG', 'PDF', 'TXT', 'XML', 'KML', 'JSON'],
      DOCX: ['PDF', 'DOCX', 'TXT', 'XML', 'KML', 'JSON'],
      PPTX: ['PDF', 'TXT'],
      PPT: ['PDF', 'TXT'],
      XLSX: ['CSV', 'JSON', 'XML'],
      CSV: ['XLSX', 'JSON', 'XML'],
      PNG: ['JPG', 'PNG'],
      WEBP: ['JPG', 'PNG'],
      GIF: ['JPG', 'PNG'],
      BMP: ['JPG', 'PNG'],
      HEIC: ['JPG', 'PNG'],
      JPEG: ['JPG', 'PNG'],
      JPG: ['JPG', 'PNG'],
      MOV: ['MP4'],
      AVI: ['MP4'],
      MP4: ['MP3'],
      MP3: ['WAV'],
    };
    return CONVERSION_MAP[cleanType] || [];
  };

  // Fetch folders list
  const { data: folders = [], refetch: refetchFolders } = useQuery({
    queryKey: ['folders'],
    queryFn: async () => {
      const res = await api.get('/v1/folders');
      return res.data.data;
    }
  });

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post('/v1/folders', { name });
      return res.data.data;
    },
    onSuccess: () => {
      refetchFolders();
      setNewFolderName('');
      setIsCreateFolderOpen(false);
    }
  });

  // Share folder mutation
  const shareFolderMutation = useMutation({
    mutationFn: async ({ folderId, email }: { folderId: string; email: string }) => {
      const res = await api.put(`/v1/folders/${folderId}/share`, { email });
      return res.data.data;
    },
    onSuccess: () => {
      refetchFolders();
      setShareEmail('');
      setShareFolderId(null);
      alert('Folder shared successfully!');
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Share folder failed.');
    }
  });

  // Assign document to folder mutation
  const assignFolderMutation = useMutation({
    mutationFn: async ({ docId, folderId }: { docId: string; folderId: string | null }) => {
      const res = await api.put(`/v1/documents/${docId}/folder`, { folderId });
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      refetchFolders();
    }
  });

  // Conversion trigger mutation
  const convertMutation = useMutation({
    mutationFn: async ({ docId, targetFormat }: { docId: string; targetFormat: string }) => {
      const res = await api.post(`/v1/documents/${docId}/convert`, { targetFormat });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Failed to start conversion job');
    }
  });

  // Fetch document listing with smart polling
  const { data: documentsData, isLoading: isDocsLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const res = await api.get('/v1/documents?page=1&limit=20');
      return res.data.data.documents;
    },
    refetchInterval: (query) => {
      const docs = query.state.data as any;
      if (docs && Array.isArray(docs) && docs.some((doc: any) => {
        const activeJobs = doc.jobLogs || [];
        const runningJob = activeJobs.some((j: any) => j.status === 'PENDING' || j.status === 'PROCESSING');
        return doc.status === 'PENDING' || doc.status === 'PROCESSING' || runningJob;
      })) {
        return 3000; // Poll every 3 seconds if active jobs are running
      }
      return false;
    }
  });

  // Document upload query mutation
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
      // If a folder is currently selected, auto-assign the uploaded file to it
      if (selectedFolderId && data?.data?.document?.id) {
        assignFolderMutation.mutate({ docId: data.data.document.id, folderId: selectedFolderId });
      }
      setTimeout(() => setUploadSuccess(false), 3000);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'File upload failed.';
      setUploadError(msg);
      setTimeout(() => setUploadError(null), 5000);
    },
  });

  const handleMergeDocuments = async () => {
    if (selectedDocIds.length < 2 || !mergedName.trim()) return;
    setIsMerging(true);
    setMergeError(null);
    try {
      const res = await api.post('/v1/documents/merge', {
        documentIds: selectedDocIds,
        name: mergedName.trim(),
      });
      if (res.data.success) {
        setIsMergeModalOpen(false);
        setSelectedDocIds([]);
        setMergedName('');
        queryClient.invalidateQueries({ queryKey: ['documents'] });
      }
    } catch (err: any) {
      setMergeError(err.response?.data?.message || 'Merge failed. Please ensure all documents are PDFs.');
    } finally {
      setIsMerging(false);
    }
  };

  // Document delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      const res = await api.delete(`/v1/documents/${docId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      refetchFolders();
    },
  });

  // Download pre-signed URL handler
  const handleDownload = async (docId: string) => {
    try {
      const res = await api.get(`/v1/documents/${docId}`);
      const downloadUrl = res.data.data.downloadUrl;
      window.open(downloadUrl, '_blank');
    } catch (err: any) {
      alert(`Error fetching download URL: ${err.message}`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0]);
    }
  };

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadFile) {
      uploadMutation.mutate(uploadFile);
    }
  };

  // Filter documents based on folder filter
  const displayedDocuments = documentsData
    ? documentsData.filter((doc: any) => !selectedFolderId || doc.folderId === selectedFolderId)
    : [];

  return (
    <MainLayout>
      {/* Main Workspace content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-white">Your Workspace</h1>
            <p className="text-xs text-brand-textMuted">Upload, organize, and query document entities with AI</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Upload & Folder Sidebar */}
          <div className="col-span-1 lg:col-span-1 space-y-6">
            
            {/* Upload Zone */}
            <div className="glass-panel rounded-2xl p-6 border border-white/5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-brand-textMuted mb-4">Upload File</h2>
              
              <form onSubmit={handleUploadSubmit} className="space-y-4">
                <div className="border border-dashed border-brand-border hover:border-brand-primary/50 rounded-xl p-6 flex flex-col items-center justify-center bg-brand-dark/20 text-center relative transition-colors cursor-pointer group">
                  <input
                    type="file"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={handleFileChange}
                  />
                  <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center mb-3 group-hover:bg-brand-primary/20 transition-colors">
                    <Upload className="w-6 h-6 text-brand-primary" />
                  </div>
                  <span className="text-xs text-brand-text font-semibold block">
                    {uploadFile ? uploadFile.name : 'Select or Drop file'}
                  </span>
                  <span className="text-[10px] text-brand-textMuted mt-1 block">
                    Supports PDFs, Office, Media files up to 50MB
                  </span>
                </div>

                {uploadError && (
                  <p className="text-xs text-brand-error text-center">{uploadError}</p>
                )}

                {uploadSuccess && (
                  <p className="text-xs text-brand-success text-center">Document uploaded successfully!</p>
                )}

                <button
                  type="submit"
                  disabled={!uploadFile || uploadMutation.isPending}
                  className="glass-button-primary w-full flex items-center justify-center gap-2"
                >
                  {uploadMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Uploading to S3...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Upload Document</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Folders List Panel */}
            <div className="glass-panel rounded-2xl p-6 border border-white/5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-brand-textMuted">Folders Workspace</h2>
                <button
                  type="button"
                  onClick={() => setIsCreateFolderOpen(true)}
                  className="p-1 hover:bg-white/5 rounded text-brand-primary"
                  title="New Folder"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => setSelectedFolderId(null)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all flex items-center justify-between ${
                    selectedFolderId === null
                      ? 'bg-brand-primary/10 border border-brand-primary/20 text-white font-medium shadow-sm'
                      : 'text-brand-textMuted hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2">📂 All Documents</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5">{documentsData?.length || 0}</span>
                </button>

                {folders.map((folder: any) => {
                  const isActive = selectedFolderId === folder.id;
                  return (
                    <div key={folder.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => setSelectedFolderId(folder.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all flex items-center justify-between ${
                          isActive
                            ? 'bg-brand-primary/10 border border-brand-primary/20 text-white font-medium shadow-sm'
                            : 'text-brand-textMuted hover:text-white'
                        }`}
                      >
                        <span className="truncate pr-16">📁 {folder.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5">{folder.documents?.length || 0}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShareFolderId(folder.id)}
                        className="absolute right-10 top-2 opacity-0 group-hover:opacity-100 text-[9px] bg-brand-primary/20 hover:bg-brand-primary/30 border border-brand-primary/30 text-white px-2 py-0.5 rounded transition-all shadow-sm"
                      >
                        Share
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Right Column: Ingested Documents List */}
          <div className="col-span-1 lg:col-span-2 space-y-6">
            <div className="glass-panel rounded-2xl p-6 border border-white/5 min-h-[400px]">
              <h2 className="text-sm font-bold uppercase tracking-wider text-brand-textMuted mb-4">
                {selectedFolderId 
                  ? `Ingested Documents: ${folders.find((f: any) => f.id === selectedFolderId)?.name || 'Folder'}` 
                  : 'Ingested Documents'
                }
              </h2>

              {isDocsLoading ? (
                <div className="flex justify-center items-center py-20">
                  <RefreshCw className="w-6 h-6 text-brand-primary animate-spin" />
                </div>
              ) : displayedDocuments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <FileText className="w-12 h-12 text-brand-border mb-3" />
                  <span className="text-sm font-semibold text-brand-text">No documents in this workspace</span>
                  <span className="text-xs text-brand-textMuted mt-1">Upload a file or drag elements to organize them.</span>
                </div>
              ) : (
                <div className="divide-y divide-brand-border">
                  {displayedDocuments.map((doc: any) => {
                    const validFormats = getValidTargetFormats(doc.type);
                    const selectedFormat = selectedFormats[doc.id] || validFormats[0] || '';
                    
                    const activeJobs = doc.jobLogs || [];
                    const runningJob = activeJobs.find((j: any) => j.status === 'PENDING' || j.status === 'PROCESSING');
                    const completedConversions = activeJobs.filter((j: any) => j.jobType === 'CONVERSION' && j.status === 'COMPLETED');

                    return (
                      <div key={doc.id} className="py-5 first:pt-0 last:pb-0 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 overflow-hidden pr-4">
                            <input
                              type="checkbox"
                              checked={selectedDocIds.includes(doc.id)}
                              onChange={() => {
                                setSelectedDocIds(prev =>
                                  prev.includes(doc.id) ? prev.filter(id => id !== doc.id) : [...prev, doc.id]
                                );
                              }}
                              className="w-3.5 h-3.5 rounded border-white/10 bg-white/5 text-brand-primary focus:ring-brand-primary shrink-0 accent-brand-primary cursor-pointer"
                            />
                            <div 
                              onClick={() => navigate(`/documents/${doc.id}`)}
                              className="w-10 h-10 rounded-lg bg-brand-primary/10 border border-brand-primary/10 flex items-center justify-center shrink-0 cursor-pointer hover:bg-brand-primary/20 transition-all"
                            >
                              <FileText className="w-5 h-5 text-brand-primary" />
                            </div>
                            <div className="overflow-hidden">
                              <span className="text-sm font-medium text-white block truncate hover:text-brand-primary cursor-pointer transition-colors" onClick={() => navigate(`/documents/${doc.id}`)}>
                                {doc.name}
                              </span>
                              <div className="flex items-center gap-3 text-[10px] text-brand-textMuted mt-0.5">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {new Date(doc.createdAt).toLocaleDateString()}
                                </span>
                                <span>•</span>
                                <span>{(doc.size / 1024).toFixed(1)} KB</span>
                                <span>•</span>
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                                  doc.status === 'COMPLETED' ? 'bg-brand-success/15 text-brand-success' :
                                  doc.status === 'FAILED' ? 'bg-brand-error/15 text-brand-error' :
                                  'bg-brand-warning/15 text-brand-warning animate-pulse'
                                }`}>
                                  {doc.status}
                                </span>
                                {doc.classification && (
                                  <>
                                    <span>•</span>
                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-brand-primary/20 text-brand-primary border border-brand-primary/30 uppercase tracking-wider">
                                      {doc.classification.label} ({Math.round(doc.classification.confidence * 100)}%)
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5">
                            {/* Folder Selector Dropdown */}
                            <select
                              value={doc.folderId || ''}
                              onChange={(e) => assignFolderMutation.mutate({ docId: doc.id, folderId: e.target.value || null })}
                              className="bg-brand-dark border border-white/5 rounded px-2.5 py-1.5 text-[10px] text-white focus:outline-none focus:border-brand-primary transition-all hover:border-white/10"
                            >
                              <option value="">No Folder</option>
                              {folders.map((f: any) => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                              ))}
                            </select>

                            <button 
                              onClick={() => navigate(`/documents/${doc.id}`)}
                              className="px-3 py-2 border border-brand-primary/30 bg-brand-primary/10 hover:bg-brand-primary/20 rounded-lg text-brand-primary hover:text-white transition-all flex items-center gap-1.5 text-xs font-semibold shadow-sm"
                              title="Ask AI & View Details"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Ask AI</span>
                            </button>
                            <button 
                              onClick={() => handleDownload(doc.id)}
                              className="p-2 border border-brand-border hover:bg-white/5 rounded-lg text-brand-textMuted hover:text-white transition-all"
                              title="Download Original"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => {
                                if (confirm('Delete this document and all associated data?')) {
                                  deleteMutation.mutate(doc.id);
                                }
                              }}
                              className="p-2 border border-brand-border hover:bg-brand-error/10 rounded-lg text-brand-textMuted hover:text-brand-error transition-all"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Conversion Controls & Active Job Status */}
                        <div className="pl-13 flex flex-wrap items-center gap-3 bg-brand-dark/25 border border-brand-border/40 p-3 rounded-lg ml-13">
                          {runningJob ? (
                            <div className="flex items-center gap-2 w-full justify-between">
                              <div className="flex items-center gap-2 text-xs text-brand-warning">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Job {runningJob.jobType} is {runningJob.status.toLowerCase()}...</span>
                              </div>
                              <button
                                onClick={() => queryClient.invalidateQueries({ queryKey: ['documents'] })}
                                className="p-1 text-brand-textMuted hover:text-white hover:bg-white/5 rounded transition-all"
                                title="Refresh status"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : validFormats.length > 0 ? (
                            <div className="flex items-center gap-2 w-full justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-brand-textMuted">Convert to:</span>
                                <select
                                  value={selectedFormat}
                                  onChange={(e) => setSelectedFormats({ ...selectedFormats, [doc.id]: e.target.value })}
                                  className="bg-brand-dark border border-brand-border rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-brand-primary"
                                >
                                  {validFormats.map((fmt) => (
                                    <option key={fmt} value={fmt}>{fmt}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => convertMutation.mutate({ docId: doc.id, targetFormat: selectedFormat })}
                                  disabled={convertMutation.isPending}
                                  className="flex items-center gap-1.5 px-3 py-1 bg-brand-primary hover:bg-brand-primary/95 text-white text-xs font-semibold rounded active:scale-[0.97] transition-all disabled:opacity-50"
                                >
                                  <Play className="w-3 h-3" />
                                  <span>Convert</span>
                                </button>
                              </div>

                              <button
                                onClick={() => queryClient.invalidateQueries({ queryKey: ['documents'] })}
                                className="p-1 text-brand-textMuted hover:text-white hover:bg-white/5 rounded transition-all"
                                title="Refresh status"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-brand-textMuted">No conversions available for this type</span>
                          )}

                          {completedConversions.length > 0 && (
                            <div className="w-full border-t border-brand-border/40 pt-2 mt-1 space-y-1.5">
                              <span className="text-[10px] uppercase font-bold text-brand-textMuted tracking-wider block">Converted Outputs:</span>
                              {completedConversions.map((job: any) => {
                                const targetFormat = job.resultKey ? job.resultKey.split('.').pop()?.toUpperCase() : 'Output';
                                return (
                                  <div key={job.id} className="flex items-center justify-between text-xs bg-white/5 px-2 py-1.5 rounded">
                                    <span className="text-brand-text font-medium">{targetFormat} Format</span>
                                    {job.resultUrl ? (
                                      <a
                                        href={job.resultUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-1 text-brand-primary hover:underline"
                                      >
                                        <span>Download</span>
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    ) : (
                                      <span className="text-[10px] text-brand-textMuted">Processing complete</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      </main>

      {/* Create Folder Modal */}
      {isCreateFolderOpen && (
        <div className="fixed inset-0 bg-brand-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-brand-dark/95 border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-sm font-extrabold text-white">Create New Folder</h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name..."
              className="glass-input text-xs w-full"
            />
            <div className="flex gap-2.5 justify-end">
              <button
                type="button"
                onClick={() => setIsCreateFolderOpen(false)}
                className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-brand-textMuted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newFolderName.trim() || createFolderMutation.isPending}
                onClick={() => createFolderMutation.mutate(newFolderName)}
                className="glass-button-primary px-3.5 py-1.5 text-xs"
              >
                Create Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Folder Modal */}
      {shareFolderId && (
        <div className="fixed inset-0 bg-brand-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-brand-dark/95 border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-sm font-extrabold text-white">Share Folder Workspace</h3>
            <p className="text-[10px] text-brand-textMuted">Enter other user's email address to grant read access to this folder collection.</p>
            <input
              type="email"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              placeholder="User email (e.g. coworker@docmind.ai)..."
              className="glass-input text-xs w-full"
            />
            <div className="flex gap-2.5 justify-end">
              <button
                type="button"
                onClick={() => setShareFolderId(null)}
                className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-brand-textMuted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!shareEmail.trim() || shareFolderMutation.isPending}
                onClick={() => shareFolderMutation.mutate({ folderId: shareFolderId, email: shareEmail })}
                className="glass-button-primary px-3.5 py-1.5 text-xs"
              >
                Share Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Bar for Selected Documents */}
      {selectedDocIds.length >= 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-brand-dark/95 border border-brand-primary/30 rounded-2xl px-6 py-4 shadow-2xl backdrop-blur-md flex items-center gap-6 animate-in slide-in-from-bottom-5 duration-200">
          <span className="text-xs font-bold text-white">
            📂 {selectedDocIds.length} document{selectedDocIds.length !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMergedName('merged_document.pdf');
                setIsMergeModalOpen(true);
                setMergeError(null);
              }}
              className="glass-button-primary px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5"
            >
              Merge Documents
            </button>
            <button
              type="button"
              onClick={() => setSelectedDocIds([])}
              className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold text-brand-textMuted hover:text-white transition-all"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Merge Documents Modal */}
      {isMergeModalOpen && (
        <div className="fixed inset-0 bg-brand-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-brand-dark/95 border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-sm font-extrabold text-white">Merge Selected Documents</h3>
            <p className="text-[10px] text-brand-textMuted">
              This will merge the selected PDF documents page-by-page into a single document.
            </p>
            <div className="space-y-3">
              <label className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted block">
                New Document Name
              </label>
              <input
                type="text"
                value={mergedName}
                onChange={(e) => setMergedName(e.target.value)}
                placeholder="merged_document.pdf"
                className="glass-input text-xs w-full"
              />
            </div>
            {mergeError && (
              <p className="text-xs text-brand-error">{mergeError}</p>
            )}
            <div className="flex gap-2.5 justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsMergeModalOpen(false)}
                className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-brand-textMuted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!mergedName.trim() || isMerging}
                onClick={handleMergeDocuments}
                className="glass-button-primary px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
              >
                {isMerging && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                {isMerging ? 'Merging...' : 'Merge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default Dashboard;
