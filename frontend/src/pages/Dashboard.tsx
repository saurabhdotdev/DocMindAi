import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, logoutUser } from '../lib/api';
import { 
  FileText, Upload, Trash2, LogOut, User as UserIcon, Plus, 
  FolderOpen, Calendar, HardDrive, Shield, Sparkles, RefreshCw, Download, Play, ExternalLink
} from 'lucide-react';


export const Dashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  
  // Track selected format per document ID
  const [selectedFormats, setSelectedFormats] = useState<Record<string, string>>({});

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

  // Fetch logged in profile details
  const { data: userProfile, isLoading: isUserLoading } = useQuery({
    queryKey: ['userProfile'],
    queryFn: async () => {
      const res = await api.get('/v1/auth/me');
      return res.data.data.user;
    },
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
    onSuccess: () => {
      setUploadSuccess(true);
      setUploadFile(null);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setTimeout(() => setUploadSuccess(false), 3000);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'File upload failed.';
      setUploadError(msg);
      setTimeout(() => setUploadError(null), 5000);
    },
  });

  // Document delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      const res = await api.delete(`/v1/documents/${docId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
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

  if (isUserLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-dark">
        <RefreshCw className="w-8 h-8 text-brand-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-brand-dark text-brand-text">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 glass-panel border-r border-white/5 flex flex-col justify-between p-6">
        <div>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-primary to-brand-secondary flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg text-white block">DocMind AI</span>
              <span className="text-[10px] text-brand-textMuted uppercase tracking-wider">Enterprise Suite</span>
            </div>
          </div>

          <nav className="space-y-1.5">
            <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg bg-white/5 text-white font-medium text-sm transition-colors text-left">
              <FolderOpen className="w-4 h-4 text-brand-primary" />
              <span>Documents</span>
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-brand-textMuted hover:bg-white/5 hover:text-white font-medium text-sm transition-all text-left">
              <HardDrive className="w-4 h-4" />
              <span>Storage System</span>
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-brand-textMuted hover:bg-white/5 hover:text-white font-medium text-sm transition-all text-left">
              <Shield className="w-4 h-4" />
              <span>Admin Center</span>
            </button>
          </nav>
        </div>

        {/* User Card Info & LogOut */}
        <div className="border-t border-brand-border pt-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-full bg-brand-primary/20 flex items-center justify-center text-brand-primary text-sm font-semibold border border-brand-primary/20">
              {userProfile?.firstName?.charAt(0) || <UserIcon className="w-4 h-4" />}
            </div>
            <div className="overflow-hidden">
              <span className="text-xs font-semibold text-white block truncate">
                {userProfile?.firstName ? `${userProfile.firstName} ${userProfile.lastName || ''}` : 'Active User'}
              </span>
              <span className="text-[10px] text-brand-textMuted block truncate">{userProfile?.email}</span>
            </div>
          </div>

          <button 
            onClick={logoutUser}
            className="w-full flex items-center gap-2.5 justify-center px-4 py-2 border border-brand-border hover:bg-brand-error/10 hover:text-brand-error rounded-lg text-brand-textMuted text-xs font-medium transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-white">Your Workspace</h1>
            <p className="text-xs text-brand-textMuted">Upload, organize, and query document entities with AI</p>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-8">
          
          {/* Document Upload Section */}
          <div className="col-span-1 space-y-6">
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
                    Supports PDFs, Office, Images up to 50MB
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
          </div>

          {/* Document list details */}
          <div className="col-span-2 space-y-6">
            <div className="glass-panel rounded-2xl p-6 border border-white/5 min-h-[400px]">
              <h2 className="text-sm font-bold uppercase tracking-wider text-brand-textMuted mb-4">Ingested Documents</h2>

              {isDocsLoading ? (
                <div className="flex justify-center items-center py-20">
                  <RefreshCw className="w-6 h-6 text-brand-primary animate-spin" />
                </div>
              ) : !documentsData || documentsData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <FileText className="w-12 h-12 text-brand-border mb-3" />
                  <span className="text-sm font-semibold text-brand-text">No documents yet</span>
                  <span className="text-xs text-brand-textMuted mt-1">Upload a PDF or image in the left panel to begin</span>
                </div>
              ) : (
                <div className="divide-y divide-brand-border">
                  {documentsData.map((doc: any) => {
                    const validFormats = getValidTargetFormats(doc.type);
                    const selectedFormat = selectedFormats[doc.id] || validFormats[0] || '';
                    
                    // Check if there are active running or completed jobs for this doc
                    const activeJobs = doc.jobLogs || [];
                    const runningJob = activeJobs.find((j: any) => j.status === 'PENDING' || j.status === 'PROCESSING');
                    const completedConversions = activeJobs.filter((j: any) => j.jobType === 'CONVERSION' && j.status === 'COMPLETED');

                    return (
                      <div key={doc.id} className="py-5 first:pt-0 last:pb-0 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3.5 overflow-hidden pr-4">
                            <div className="w-10 h-10 rounded-lg bg-brand-primary/10 border border-brand-primary/10 flex items-center justify-center shrink-0">
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

                          <div className="flex items-center gap-2">
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

                          {/* List completed conversion downloads */}
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

    </div>
  );
};
export default Dashboard;
