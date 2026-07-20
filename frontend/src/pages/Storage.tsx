import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { MainLayout } from '../components/MainLayout';
import { ConfirmModal } from '../components/ConfirmModal';
import {
  HardDrive, Cloud, AlertCircle, Trash2, Download, RefreshCw,
  CheckCircle2, Sparkles, Database, FileText, ArrowRight, ShieldCheck
} from 'lucide-react';

interface StorageStats {
  totalSizeBytes: number;
  totalFiles: number;
  limitBytes: number;
  planName: string;
  breakdown: Array<{
    type: string;
    sizeBytes: number;
    count: number;
  }>;
  config: {
    provider: string;
    bucket: string;
    region: string;
    status: string;
  };
}

export const Storage: React.FC = () => {
  const queryClient = useQueryClient();
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);

  // Fetch Storage Stats
  const { data: stats, isLoading: isStatsLoading, refetch: refetchStats } = useQuery<StorageStats>({
    queryKey: ['storageStats'],
    queryFn: async () => {
      const res = await api.get('/v1/analytics/storage');
      return res.data.data;
    }
  });

  // Fetch Document List
  const { data: documents = [], isLoading: isDocsLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const res = await api.get('/v1/documents?page=1&limit=50');
      return res.data.data.documents;
    }
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      await api.delete(`/v1/documents/${docId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['storageStats'] });
    }
  });

  // Upgrade Plan Mutation (Mock API trigger)
  const upgradeMutation = useMutation({
    mutationFn: async (plan: string) => {
      // Mock API delay
      await new Promise((resolve) => setTimeout(resolve, 800));
      // In a real application, we would call put('/v1/subscription/upgrade', { plan })
      return { plan };
    },
    onSuccess: (data) => {
      setUpgradeSuccess(true);
      setSelectedPlan(data.plan);
      queryClient.invalidateQueries({ queryKey: ['storageStats'] });
      setTimeout(() => {
        setIsUpgradeOpen(false);
        setUpgradeSuccess(false);
        setSelectedPlan(null);
        refetchStats();
      }, 2000);
    }
  });

  // Format Helper: Bytes to Human Readable
  const formatBytes = (bytes: number, decimals = 1) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const handleDownload = async (docId: string) => {
    try {
      const res = await api.get(`/v1/documents/${docId}`);
      const downloadUrl = res.data.data.downloadUrl;
      window.open(downloadUrl, '_blank');
    } catch (err: any) {
      alert(`Error fetching download URL: ${err.message}`);
    }
  };

  const isLoading = isStatsLoading || isDocsLoading;

  // Plan Meta Limits
  const planLimits: Record<string, string> = {
    FREE: '50 MB',
    PRO: '2 GB',
    ENTERPRISE: '50 GB'
  };

  const totalUsed = stats?.totalSizeBytes || 0;
  const maxLimit = stats?.limitBytes || 52428800; // default 50MB
  const percentUsed = Math.min(100, Math.round((totalUsed / maxLimit) * 100));

  return (
    <MainLayout>
      <main className="flex-1 p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <HardDrive className="w-6 h-6 text-brand-primary" />
              <span>Storage System</span>
            </h1>
            <p className="text-xs text-brand-textMuted mt-1 font-medium">
              View your cloud storage limits, analyze formats, and manage your file inventory.
            </p>
          </div>
          <button
            onClick={() => refetchStats()}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-white/5 hover:border-white/10 hover:bg-white/5 rounded-lg text-xs font-semibold text-brand-textMuted hover:text-white transition-all self-start md:self-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync Stats</span>
          </button>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <RefreshCw className="w-8 h-8 text-brand-primary animate-spin" />
            <span className="text-xs text-brand-textMuted">Loading storage details...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* LEFT / CENTER COLUMN - 2 SPANS */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Storage Capacity Gauge Card */}
              <div className="glass-panel border border-white/5 rounded-2xl p-6 space-y-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-brand-primary uppercase tracking-wider block">Storage Capacity</span>
                    <h2 className="text-white text-lg font-black">{formatBytes(totalUsed)} <span className="text-brand-textMuted font-normal text-sm">used of {planLimits[stats?.planName || 'FREE']} limit</span></h2>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border ${
                    stats?.planName === 'ENTERPRISE' ? 'bg-brand-secondary/15 text-brand-secondary border-brand-secondary/30' :
                    stats?.planName === 'PRO' ? 'bg-brand-primary/15 text-brand-primary border-brand-primary/30' :
                    'bg-white/5 text-brand-textMuted border-white/10'
                  }`}>
                    {stats?.planName} PLAN
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="w-full h-3 bg-brand-dark/60 rounded-full border border-white/5 overflow-hidden p-[1px]">
                    <div 
                      className="h-full bg-gradient-to-r from-brand-primary to-brand-secondary rounded-full shadow-lg shadow-brand-primary/30 transition-all duration-500"
                      style={{ width: `${percentUsed}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-brand-textMuted font-bold">
                    <span>{percentUsed}% Used</span>
                    <span>{formatBytes(maxLimit - totalUsed)} Remaining</span>
                  </div>
                </div>

                {/* Info and CTA row */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-white/5">
                  <div className="flex items-center gap-2 text-[10px] text-brand-textMuted font-medium">
                    <AlertCircle className="w-3.5 h-3.5 text-brand-primary shrink-0" />
                    <span>Free accounts are restricted to 50 MB. Upgrade to Pro for 2 GB.</span>
                  </div>
                  {stats?.planName !== 'ENTERPRISE' && (
                    <button
                      onClick={() => setIsUpgradeOpen(true)}
                      className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-brand-primary to-brand-secondary hover:from-brand-primary/90 hover:to-brand-secondary/90 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-brand-primary/15 active:scale-[0.98] transition-all"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Upgrade Limit</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Document Files Catalog List */}
              <div className="glass-panel border border-white/5 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">Files Inventory</h3>
                  <span className="text-[10px] text-brand-textMuted font-bold">{documents.length} Total Files</span>
                </div>

                <div className="overflow-x-auto">
                  {documents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-brand-textMuted">
                      <FileText className="w-10 h-10 opacity-30" />
                      <span className="text-xs">No files uploaded yet</span>
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="text-brand-textMuted border-b border-white/5 font-extrabold text-[10px] uppercase">
                          <th className="py-3 pr-4">File Name</th>
                          <th className="py-3 px-4">Format</th>
                          <th className="py-3 px-4">Size</th>
                          <th className="py-3 pl-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {documents.map((doc: any) => (
                          <tr key={doc.id} className="hover:bg-white/[0.01] transition-all group">
                            <td className="py-3 pr-4 font-bold text-white max-w-[200px] sm:max-w-[300px] truncate">
                              {doc.name}
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded text-[9px] font-extrabold bg-brand-primary/10 border border-brand-primary/20 text-brand-primary uppercase">
                                {doc.type}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-brand-textMuted font-mono">
                              {formatBytes(doc.size)}
                            </td>
                            <td className="py-3 pl-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleDownload(doc.id)}
                                  className="p-1.5 border border-white/5 bg-white/[0.02] hover:bg-white/10 hover:text-white rounded text-brand-textMuted transition-all"
                                  title="Download File"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeletingDocId(doc.id)}
                                  className="p-1.5 border border-white/5 bg-white/[0.02] hover:bg-brand-error/10 hover:border-brand-error/20 hover:text-brand-error rounded text-brand-textMuted transition-all"
                                  title="Delete File"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN - 1 SPAN */}
            <div className="space-y-6">
              
              {/* File Breakdown Chart Card */}
              <div className="glass-panel border border-white/5 rounded-2xl p-6 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">Format Distribution</h3>
                <div className="space-y-3.5">
                  {stats?.breakdown && stats.breakdown.length > 0 ? (
                    stats.breakdown.map((item, idx) => {
                      const itemPercentage = totalUsed > 0 ? Math.round((item.sizeBytes / totalUsed) * 100) : 0;
                      return (
                        <div key={idx} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-brand-primary" />
                              <span className="text-white uppercase font-bold">{item.type}</span>
                              <span className="text-brand-textMuted text-[10px]">({item.count} file{item.count !== 1 ? 's' : ''})</span>
                            </div>
                            <span className="text-brand-textMuted font-mono text-[10px]">{formatBytes(item.sizeBytes)} ({itemPercentage}%)</span>
                          </div>
                          {/* Mini Progress bar */}
                          <div className="w-full h-1.5 bg-brand-dark/50 rounded-full border border-white/5 overflow-hidden">
                            <div 
                              className="h-full bg-brand-primary rounded-full" 
                              style={{ width: `${itemPercentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex flex-col items-center py-6 text-brand-textMuted gap-2">
                      <Cloud className="w-8 h-8 opacity-30" />
                      <span className="text-xs">No distribution data</span>
                    </div>
                  )}
                </div>
              </div>

              {/* S3 Storage Integration Status */}
              <div className="glass-panel border border-white/5 rounded-2xl p-6 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">Integration Status</h3>
                
                <div className="flex items-center gap-3 bg-brand-dark/30 border border-white/5 p-3.5 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-brand-success/15 border border-brand-success/20 flex items-center justify-center shrink-0">
                    <Database className="w-4 h-4 text-brand-success" />
                  </div>
                  <div>
                    <span className="text-[10px] text-brand-textMuted uppercase tracking-wider font-bold block">S3 Connection</span>
                    <span className="text-xs text-brand-success font-black flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 fill-brand-success/10" />
                      {stats?.config?.status || 'Online'}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 pt-2 text-xs font-semibold">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-brand-textMuted">Provider</span>
                    <span className="text-white">{stats?.config?.provider || 'AWS S3'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-brand-textMuted">S3 Bucket</span>
                    <span className="text-white font-mono text-[10px] select-all">{stats?.config?.bucket || 'docmind-uploads'}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-brand-textMuted">AWS Region</span>
                    <span className="text-white font-mono text-[10px]">{stats?.config?.region || 'us-east-1'}</span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}
      </main>

      {/* Upgrade Limit Dialog / Drawer Modal */}
      {isUpgradeOpen && (
        <div className="fixed inset-0 bg-brand-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-brand-dark/95 border border-white/10 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-200 relative">
            
            {/* Close Button */}
            <button
              onClick={() => setIsUpgradeOpen(false)}
              className="absolute top-4 right-4 text-brand-textMuted hover:text-white transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
            </button>

            {upgradeSuccess ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-brand-success/15 border border-brand-success/30 flex items-center justify-center animate-bounce">
                  <CheckCircle2 className="w-8 h-8 text-brand-success" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-md font-extrabold text-white">Upgrade Active!</h3>
                  <p className="text-xs text-brand-textMuted">You successfully updated your plan to {selectedPlan}!</p>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-brand-primary uppercase tracking-widest block">Premium Upgrades</span>
                  <h3 className="text-md font-extrabold text-white">Scale your Document Storage</h3>
                  <p className="text-xs text-brand-textMuted">Upgrade your subscription plan to unlock higher limits and faster processing speeds.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Pro Plan Box */}
                  <div 
                    onClick={() => upgradeMutation.mutate('PRO')}
                    className="border border-white/5 bg-white/[0.01] hover:border-brand-primary/40 hover:bg-brand-primary/[0.02] p-4 rounded-xl cursor-pointer transition-all flex flex-col justify-between h-40 group relative overflow-hidden"
                  >
                    <div className="space-y-1">
                      <span className="text-[10px] font-extrabold text-brand-primary uppercase">PRO PACKAGE</span>
                      <h4 className="text-lg font-black text-white">$19<span className="text-[10px] font-normal text-brand-textMuted"> /mo</span></h4>
                      <p className="text-[10px] text-brand-textMuted">Perfect for small teams and professional analysts.</p>
                    </div>
                    <div className="flex justify-between items-center text-xs font-bold pt-2 border-t border-white/5">
                      <span className="text-white">2 GB Storage Limit</span>
                      <ArrowRight className="w-3.5 h-3.5 text-brand-primary group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>

                  {/* Enterprise Plan Box */}
                  <div 
                    onClick={() => upgradeMutation.mutate('ENTERPRISE')}
                    className="border border-brand-secondary/20 bg-brand-secondary/[0.01] hover:border-brand-secondary/40 hover:bg-brand-secondary/[0.02] p-4 rounded-xl cursor-pointer transition-all flex flex-col justify-between h-40 group relative overflow-hidden"
                  >
                    <div className="space-y-1">
                      <span className="text-[10px] font-extrabold text-brand-secondary uppercase">ENTERPRISE</span>
                      <h4 className="text-lg font-black text-white">$49<span className="text-[10px] font-normal text-brand-textMuted"> /mo</span></h4>
                      <p className="text-[10px] text-brand-textMuted">Fully featured pipeline for big file uploads.</p>
                    </div>
                    <div className="flex justify-between items-center text-xs font-bold pt-2 border-t border-white/5">
                      <span className="text-white">50 GB Storage Limit</span>
                      <ArrowRight className="w-3.5 h-3.5 text-brand-secondary group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 justify-center bg-brand-dark border border-white/5 p-3 rounded-lg text-[10px] text-brand-textMuted font-bold">
                  <ShieldCheck className="w-4 h-4 text-brand-primary" />
                  <span>Secure checkout. Upgrade anytime. Limits applied immediately.</span>
                </div>
              </>
            )}

          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deletingDocId !== null}
        title="Delete Document"
        message="Are you sure you want to delete this document from your storage inventory? This action cannot be undone."
        confirmText="Delete File"
        cancelText="Cancel"
        onConfirm={() => {
          if (deletingDocId) {
            deleteMutation.mutate(deletingDocId);
            setDeletingDocId(null);
          }
        }}
        onCancel={() => setDeletingDocId(null)}
        type="danger"
      />
    </MainLayout>
  );
};
export default Storage;
