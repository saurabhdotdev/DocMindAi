import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { MainLayout } from '../components/MainLayout';
import {
  Plus, Trash2, RefreshCw, Bot, Sparkles
} from 'lucide-react';

export const Agents: React.FC = () => {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [avatar, setAvatar] = useState('🤖');
  const [isOptimizing, setIsOptimizing] = useState(false);

  const handleOptimizePrompt = async () => {
    if (!systemPrompt.trim()) {
      alert('Please enter a brief description of what you want the agent to do first in the prompt box!');
      return;
    }
    setIsOptimizing(true);
    try {
      const res = await api.post('/v1/agents/optimize-prompt', {
        description: systemPrompt,
      });
      if (res.data.success && res.data.optimizedPrompt) {
        setSystemPrompt(res.data.optimizedPrompt);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to optimize prompt. Please try again.');
    } finally {
      setIsOptimizing(false);
    }
  };

  // Fetch custom agent profiles list
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const res = await api.get('/v1/agents');
      return res.data.data;
    }
  });

  // Create custom agent mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/v1/agents', {
        name,
        systemPrompt,
        avatar,
      });
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setIsCreateOpen(false);
      setName('');
      setSystemPrompt('');
      setAvatar('🤖');
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Failed to create Agent Profile.');
    }
  });

  // Delete custom agent mutation
  const deleteMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const res = await api.delete(`/v1/agents/${agentId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    }
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && systemPrompt.trim()) {
      createMutation.mutate();
    }
  };

  const avatarsList = ['🤖', '🕵️', '🧙‍♂️', '🧑‍🔬', '👨‍💼', '👩‍⚕️', '🎨', '🦁'];

  return (
    <MainLayout>
      <main className="flex-1 p-8 overflow-y-auto max-w-5xl mx-auto w-full">
        
        {/* Header */}
        <header className="flex justify-between items-center mb-8 shrink-0">
          <div>
            <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
              <Bot className="w-6 h-6 text-brand-primary animate-pulse" />
              Custom Agent Hub
            </h1>
            <p className="text-xs text-brand-textMuted mt-1">
              Define custom agent personas with custom instructions to query your documents in Ask AI.
            </p>
          </div>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="glass-button-primary text-xs py-2 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create Agent</span>
          </button>
        </header>

        {/* Agents Listing */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {isLoading ? (
            <div className="col-span-full flex justify-center py-20">
              <RefreshCw className="w-6 h-6 text-brand-primary animate-spin" />
            </div>
          ) : agents.length === 0 ? (
            <div className="col-span-full glass-panel border border-white/5 rounded-2xl p-12 text-center flex flex-col items-center">
              <Bot className="w-12 h-12 text-brand-border mb-3 animate-pulse" />
              <span className="text-sm font-semibold text-white">No custom agent profiles</span>
              <p className="text-xs text-brand-textMuted mt-1 max-w-sm">
                Create custom agents (e.g. 'Legal auditor' or 'CV Evaluator') with custom system prompt templates to specialize your Ask AI answers.
              </p>
            </div>
          ) : (
            agents.map((agent: any) => (
              <div key={agent.id} className="glass-panel border border-white/5 rounded-2xl p-5 flex flex-col justify-between gap-4 hover:border-white/10 transition-colors">
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-2xl shrink-0">
                    {agent.avatar}
                  </div>
                  <div className="overflow-hidden">
                    <span className="text-sm font-bold text-white block">{agent.name}</span>
                    <span className="text-[10px] text-brand-textMuted font-mono">ID: {agent.id.slice(0, 8)}</span>
                    <p className="text-xs text-brand-text mt-2 line-clamp-3 leading-relaxed font-medium">
                      "{agent.systemPrompt}"
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-white/5">
                  <button
                    onClick={() => {
                      if (confirm('Delete this custom agent profile?')) {
                        deleteMutation.mutate(agent.id);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-white/5 hover:border-brand-error/20 hover:bg-brand-error/15 rounded-lg text-brand-textMuted hover:text-brand-error text-xs font-semibold transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Persona</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Create Agent Modal */}
        {isCreateOpen && (
          <div className="fixed inset-0 bg-brand-dark/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <form onSubmit={handleCreateSubmit} className="bg-brand-dark/95 border border-white/10 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
              <h3 className="text-sm font-extrabold text-white">Create Custom Agent Persona</h3>

              {/* Avatar select */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted block">Choose Avatar</label>
                <div className="flex gap-2.5 flex-wrap">
                  {avatarsList.map((av) => (
                    <button
                      key={av}
                      type="button"
                      onClick={() => setAvatar(av)}
                      className={`w-9 h-9 rounded-lg border text-lg flex items-center justify-center transition-all ${
                        avatar === av
                          ? 'bg-brand-primary/20 border-brand-primary text-white scale-105'
                          : 'bg-white/5 border-white/5 hover:bg-white/10 text-white'
                      }`}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              </div>

              {/* Agent Name */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted">Agent Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Legal Contract Auditor"
                  className="glass-input text-xs w-full"
                />
              </div>

              {/* System prompt */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted">
                    System Instruction Prompt
                  </label>
                  <button
                    type="button"
                    disabled={isOptimizing || !systemPrompt.trim()}
                    onClick={handleOptimizePrompt}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-brand-primary/30 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary hover:text-white text-[10px] font-extrabold uppercase tracking-wider transition-all disabled:opacity-40"
                    title="Optimize this description into a professional system prompt using AI"
                  >
                    {isOptimizing ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3 text-brand-primary animate-pulse" />
                    )}
                    <span>{isOptimizing ? 'Optimizing...' : 'AI Optimize Prompt'}</span>
                  </button>
                </div>
                <textarea
                  required
                  rows={5}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Type a brief idea of what you want the agent to do, then click 'AI Optimize Prompt' to expand it into professional instructions!"
                  className="glass-input text-xs w-full resize-none leading-relaxed"
                />
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
                  disabled={!name.trim() || !systemPrompt.trim() || createMutation.isPending}
                  className="glass-button-primary px-4 py-2 text-xs"
                >
                  Save Persona
                </button>
              </div>
            </form>
          </div>
        )}

      </main>
    </MainLayout>
  );
};

export default Agents;
