import React from 'react';
import { motion } from 'framer-motion';
import { BrainCircuit } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, title, subtitle }) => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-brand-dark">
      {/* Decorative Gradient Background Orbs */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-brand-primary/10 rounded-full blur-[80px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-brand-secondary/10 rounded-full blur-[80px] translate-x-1/2 translate-y-1/2 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        {/* Logo and Header */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-primary to-brand-secondary flex items-center justify-center shadow-lg shadow-brand-primary/20 mb-4 border border-white/10">
            <BrainCircuit className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            DocMind AI
          </h1>
          <p className="text-brand-textMuted mt-2 text-sm">{subtitle}</p>
        </div>

        {/* Auth Content Card */}
        <div className="glass-panel rounded-2xl p-8 border border-white/[0.06] shadow-2xl relative">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white">{title}</h2>
          </div>
          {children}
        </div>
      </motion.div>
    </div>
  );
};
export default AuthLayout;
