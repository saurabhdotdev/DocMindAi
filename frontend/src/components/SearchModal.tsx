import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Search, FileText, X, Sparkles, RefreshCw, BrainCircuit } from 'lucide-react';

interface SearchResult {
  documentId: string;
  documentName: string;
  snippet: string;
  score: number;
}

export const SearchModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(timer);
  }, [query]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setDebouncedQuery('');
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const { data, isLoading } = useQuery<SearchResult[]>({
    queryKey: ['search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery.trim() || debouncedQuery.length < 2) return [];
      const res = await api.get(`/v1/search?q=${encodeURIComponent(debouncedQuery)}`);
      return res.data.data;
    },
    enabled: debouncedQuery.length >= 2,
  });

  const results = data || [];

  const handleSelect = (docId: string) => {
    navigate(`/documents/${docId}`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-brand-dark/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl animate-in zoom-in-95 fade-in duration-150">
        <div className="glass-panel rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
          {/* Search Input Row */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
            {isLoading ? (
              <RefreshCw className="w-5 h-5 text-brand-primary animate-spin shrink-0" />
            ) : (
              <Search className="w-5 h-5 text-brand-textMuted shrink-0" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search across all your documents..."
              className="flex-1 bg-transparent text-white placeholder:text-brand-textMuted text-sm outline-none border-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-brand-textMuted hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
            <kbd className="text-[10px] text-brand-border border border-white/10 rounded px-1.5 py-0.5 font-mono shrink-0">ESC</kbd>
          </div>

          {/* Results */}
          <div className="max-h-[55vh] overflow-y-auto">
            {debouncedQuery.length < 2 ? (
              <div className="flex flex-col items-center py-12 gap-3 text-brand-textMuted">
                <BrainCircuit className="w-10 h-10 opacity-30" />
                <span className="text-sm">Type at least 2 characters to search</span>
              </div>
            ) : results.length === 0 && !isLoading ? (
              <div className="flex flex-col items-center py-12 gap-3 text-brand-textMuted">
                <Search className="w-10 h-10 opacity-30" />
                <span className="text-sm">No results for "{debouncedQuery}"</span>
              </div>
            ) : (
              <div className="py-2">
                <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-brand-textMuted">
                  {results.length} Result{results.length !== 1 ? 's' : ''}
                </div>
                {results.map((result, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelect(result.documentId)}
                    className="w-full flex items-start gap-4 px-5 py-3.5 hover:bg-white/5 transition-all text-left group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="w-4 h-4 text-brand-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-white truncate">{result.documentName}</span>
                        <span className="text-[10px] text-brand-textMuted ml-2 shrink-0">
                          {Math.round(result.score * 100)}% match
                        </span>
                      </div>
                      <p className="text-[11px] text-brand-textMuted leading-relaxed line-clamp-2">{result.snippet}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="px-5 py-2.5 border-t border-white/5 flex gap-4 text-[10px] text-brand-border">
            <span><kbd className="bg-white/5 px-1.5 py-0.5 rounded font-mono mr-1">↵</kbd> Open</span>
            <span><kbd className="bg-white/5 px-1.5 py-0.5 rounded font-mono mr-1">ESC</kbd> Close</span>
            <span className="ml-auto flex items-center gap-1"><Sparkles className="w-3 h-3 text-brand-primary" /> Semantic AI Search</span>
          </div>
        </div>
      </div>
    </div>
  );
};
