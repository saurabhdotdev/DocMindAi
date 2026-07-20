import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { MainLayout } from '../components/MainLayout';
import { ConfirmModal } from '../components/ConfirmModal';
import {
  Shield, Plus, Trash2, RefreshCw, ToggleLeft, ToggleRight
} from 'lucide-react';

export const Workflows: React.FC = () => {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  
  // Condition state
  const [field, setField] = useState('category');
  const [operator, setOperator] = useState('equals');
  const [value, setValue] = useState('');

  // Action state
  const [targetFolderId, setTargetFolderId] = useState('');
  const [deletingWorkflowId, setDeletingWorkflowId] = useState<string | null>(null);

  // Fetch folders list for action configuration
  const { data: folders = [] } = useQuery({
    queryKey: ['folders'],
    queryFn: async () => {
      const res = await api.get('/v1/folders');
      return res.data.data;
    }
  });

  // Fetch user workflows list
  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => {
      const res = await api.get('/v1/workflows');
      return res.data.data;
    }
  });

  // Create workflow mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/v1/workflows', {
        name,
        trigger: 'DOCUMENT_PROCESSED',
        conditions: { field, operator, value },
        actions: { action: 'MOVE_TO_FOLDER', folderId: targetFolderId },
      });
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      setIsCreateOpen(false);
      setName('');
      setValue('');
      setTargetFolderId('');
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Workflow creation failed.');
    }
  });

  // Toggle active status mutation
  const toggleMutation = useMutation({
    mutationFn: async (wfId: string) => {
      const res = await api.put(`/v1/workflows/${wfId}/toggle`);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    }
  });

  // Delete workflow mutation
  const deleteMutation = useMutation({
    mutationFn: async (wfId: string) => {
      const res = await api.delete(`/v1/workflows/${wfId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    }
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && targetFolderId) {
      createMutation.mutate();
    }
  };

  return (
    <MainLayout>
      <main className="flex-1 p-8 overflow-y-auto max-w-5xl mx-auto w-full">
        
        {/* Header */}
        <header className="flex justify-between items-center mb-8 shrink-0">
          <div>
            <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
              <Shield className="w-6 h-6 text-brand-primary" />
              Automated AI Workflows
            </h1>
            <p className="text-xs text-brand-textMuted mt-1">
              Create rules to automatically sort, label, or route incoming documents using metadata.
            </p>
          </div>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="glass-button-primary text-xs py-2 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>New Rule</span>
          </button>
        </header>

        {/* Workflows list */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <RefreshCw className="w-6 h-6 text-brand-primary animate-spin" />
            </div>
          ) : workflows.length === 0 ? (
            <div className="glass-panel border border-white/5 rounded-2xl p-12 text-center flex flex-col items-center">
              <Shield className="w-12 h-12 text-brand-border mb-3" />
              <span className="text-sm font-semibold text-white">No active workflows</span>
              <p className="text-xs text-brand-textMuted mt-1 max-w-sm">
                Create a workflow to automate document sorting, like moving candidate resumes containing specific skills into designated project folders.
              </p>
            </div>
          ) : (
            workflows.map((wf: any) => {
              const cond = wf.conditions || {};
              const act = wf.actions || {};
              const targetFolder = folders.find((f: any) => f.id === act.folderId)?.name || 'Folder';
              
              return (
                <div key={wf.id} className="glass-panel border border-white/5 rounded-2xl p-5 flex items-center justify-between gap-6 hover:border-white/10 transition-colors">
                  <div className="space-y-1">
                    <span className="text-sm font-bold text-white block">{wf.name}</span>
                    <div className="flex flex-wrap gap-2 text-[10px] items-center text-brand-textMuted mt-1">
                      <span className="bg-white/5 border border-white/5 px-2 py-0.5 rounded text-white font-medium uppercase">
                        When Processed
                      </span>
                      <span>if</span>
                      <span className="bg-brand-primary/10 border border-brand-primary/20 text-brand-primary px-2 py-0.5 rounded font-semibold">
                        {cond.field} {cond.operator.replace('_', ' ')} "{cond.value}"
                      </span>
                      <span>then</span>
                      <span className="bg-brand-secondary/10 border border-brand-secondary/20 text-brand-secondary px-2 py-0.5 rounded font-semibold">
                        Move to {targetFolder}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleMutation.mutate(wf.id)}
                      className={`text-brand-textMuted transition-colors`}
                      title={wf.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {wf.isActive ? (
                        <ToggleRight className="w-8 h-8 text-brand-success cursor-pointer" />
                      ) : (
                        <ToggleLeft className="w-8 h-8 text-brand-textMuted cursor-pointer" />
                      )}
                    </button>
                    <button
                      onClick={() => setDeletingWorkflowId(wf.id)}
                      className="p-2 border border-white/5 hover:border-brand-error/20 hover:bg-brand-error/15 rounded-lg text-brand-textMuted hover:text-brand-error transition-all"
                      title="Delete Rule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Create Workflow Modal */}
        {isCreateOpen && (
          <div className="fixed inset-0 bg-brand-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <form onSubmit={handleCreateSubmit} className="bg-brand-dark/95 border border-white/10 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
              <h3 className="text-sm font-extrabold text-white">Create Automated Workflow</h3>

              {/* Workflow Name */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted">Workflow Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Move Invoices to Cost Center"
                  className="glass-input text-xs w-full"
                />
              </div>

              {/* Trigger */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted">Event Trigger</label>
                <select className="glass-input text-xs w-full bg-brand-dark" disabled>
                  <option>On Document Processed</option>
                </select>
              </div>

              {/* Condition grid */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted">Rule Conditions (IF)</label>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={field}
                    onChange={(e) => setField(e.target.value)}
                    className="glass-input text-xs bg-brand-dark"
                  >
                    <option value="category">Category</option>
                    <option value="size">File Size (KB)</option>
                    <option value="skills">Resume Skills</option>
                  </select>
                  <select
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                    className="glass-input text-xs bg-brand-dark"
                  >
                    {field === 'size' ? (
                      <option value="greater_than">Greater than</option>
                    ) : field === 'skills' ? (
                      <option value="contains">Contains</option>
                    ) : (
                      <option value="equals">Equals</option>
                    )}
                  </select>
                  <input
                    type="text"
                    required
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={field === 'size' ? 'Size in KB' : 'Condition value'}
                    className="glass-input text-xs"
                  />
                </div>
              </div>

              {/* Action */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted">Rule Action (THEN)</label>
                <div className="grid grid-cols-2 gap-3">
                  <select className="glass-input text-xs bg-brand-dark" disabled>
                    <option>Move to Folder</option>
                  </select>
                  <select
                    required
                    value={targetFolderId}
                    onChange={(e) => setTargetFolderId(e.target.value)}
                    className="glass-input text-xs bg-brand-dark border-brand-primary"
                  >
                    <option value="">Select Target Folder...</option>
                    {folders.map((f: any) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-2.5 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-brand-textMuted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || !targetFolderId || createMutation.isPending}
                  className="glass-button-primary px-4 py-2 text-xs"
                >
                  Save Rule
                </button>
              </div>
            </form>
          </div>
        )}

      </main>

      {/* Delete Workflow Confirmation Modal */}
      <ConfirmModal
        isOpen={deletingWorkflowId !== null}
        title="Delete Workflow Rule"
        message="Are you sure you want to delete this automated workflow rule? This action cannot be undone."
        confirmText="Delete Rule"
        cancelText="Cancel"
        onConfirm={() => {
          if (deletingWorkflowId) {
            deleteMutation.mutate(deletingWorkflowId);
            setDeletingWorkflowId(null);
          }
        }}
        onCancel={() => setDeletingWorkflowId(null)}
        type="danger"
      />
    </MainLayout>
  );
};

export default Workflows;
