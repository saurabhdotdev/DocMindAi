import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { api, logoutUser } from '../lib/api';
import {
  FolderOpen, HardDrive, Shield, Sparkles, LogOut, RefreshCw, User as UserIcon
} from 'lucide-react';

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Fetch logged-in user profile details
  const { data: userProfile, isLoading: isUserLoading } = useQuery({
    queryKey: ['userProfile'],
    queryFn: async () => {
      const res = await api.get('/v1/auth/me');
      return res.data.data.user;
    },
  });

  const handleSignOut = () => {
    logoutUser();
    navigate('/login');
  };

  if (isUserLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-dark">
        <RefreshCw className="w-8 h-8 text-brand-primary animate-spin" />
      </div>
    );
  }

  const isDocumentsPage = location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/documents');

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-brand-dark text-brand-text">
      
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 shrink-0 glass-panel border-b md:border-b-0 md:border-r border-white/5 flex flex-col justify-between p-6">
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8 cursor-pointer" onClick={() => navigate('/dashboard')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-primary to-brand-secondary flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg text-white block">DocMind AI</span>
              <span className="text-[10px] text-brand-textMuted uppercase tracking-wider">Enterprise Suite</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            <button
              onClick={() => navigate('/dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium text-sm transition-all text-left ${
                isDocumentsPage
                  ? 'bg-white/5 text-white'
                  : 'text-brand-textMuted hover:bg-white/5 hover:text-white'
              }`}
            >
              <FolderOpen className={`w-4 h-4 ${isDocumentsPage ? 'text-brand-primary' : ''}`} />
              <span>Documents</span>
            </button>
            <button
              onClick={() => navigate('/ask-ai')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium text-sm transition-all text-left ${
                location.pathname.startsWith('/ask-ai')
                  ? 'bg-white/5 text-white'
                  : 'text-brand-textMuted hover:bg-white/5 hover:text-white'
              }`}
            >
              <Sparkles className={`w-4 h-4 ${location.pathname.startsWith('/ask-ai') ? 'text-brand-primary' : ''}`} />
              <span>Ask AI</span>
            </button>
            <button
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-brand-textMuted hover:bg-white/5 hover:text-white font-medium text-sm transition-all text-left opacity-70 cursor-not-allowed"
              title="Coming Soon"
            >
              <HardDrive className="w-4 h-4" />
              <span>Storage System</span>
            </button>
            <button
              onClick={() => navigate('/workflows')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium text-sm transition-all text-left ${
                location.pathname.startsWith('/workflows')
                  ? 'bg-white/5 text-white'
                  : 'text-brand-textMuted hover:bg-white/5 hover:text-white'
              }`}
            >
              <Shield className={`w-4 h-4 ${location.pathname.startsWith('/workflows') ? 'text-brand-primary' : ''}`} />
              <span>Workflows</span>
            </button>
          </nav>
        </div>

        {/* User Card Info & LogOut */}
        <div className="border-t border-brand-border pt-4 mt-6 md:mt-0">
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
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 justify-center px-4 py-2 border border-brand-border hover:bg-brand-error/10 hover:text-brand-error rounded-lg text-brand-textMuted text-xs font-medium transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace content wrapper */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
};

export default MainLayout;
