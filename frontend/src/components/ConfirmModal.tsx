import React, { useEffect } from 'react';
import { AlertTriangle, Info, AlertCircle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'info' | 'warning';
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'danger',
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'info':
        return <Info className="w-5 h-5 text-brand-primary" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-brand-warning" />;
      case 'danger':
      default:
        return <AlertTriangle className="w-5 h-5 text-brand-error" />;
    }
  };

  const getIconBg = () => {
    switch (type) {
      case 'info':
        return 'bg-brand-primary/10 border-brand-primary/20';
      case 'warning':
        return 'bg-brand-warning/10 border-brand-warning/20';
      case 'danger':
      default:
        return 'bg-brand-error/10 border-brand-error/20';
    }
  };

  const getConfirmButtonStyles = () => {
    switch (type) {
      case 'info':
        return 'bg-gradient-to-r from-brand-primary to-brand-secondary hover:from-brand-primary/90 hover:to-brand-secondary/90 text-white shadow-brand-primary/10';
      case 'warning':
        return 'bg-brand-warning hover:bg-brand-warning/90 text-brand-dark';
      case 'danger':
      default:
        return 'bg-brand-error hover:bg-brand-error/90 text-white shadow-brand-error/20';
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-brand-dark/80 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal Box */}
      <div className="relative w-full max-w-md bg-brand-dark/95 border border-white/10 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200 space-y-4">
        {/* Close Button */}
        <button 
          onClick={onCancel}
          className="absolute top-4 right-4 text-brand-textMuted hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Content Row */}
        <div className="flex gap-4 items-start">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${getIconBg()}`}>
            {getIcon()}
          </div>
          <div className="space-y-1.5 flex-1 pr-6">
            <h3 className="text-sm font-extrabold text-white tracking-wide">{title}</h3>
            <p className="text-xs text-brand-textMuted leading-relaxed">{message}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2.5 justify-end pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold text-brand-textMuted hover:text-white transition-all active:scale-[0.98]"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
            }}
            className={`px-4 py-2 rounded-lg text-xs font-semibold shadow-lg active:scale-[0.98] transition-all ${getConfirmButtonStyles()}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
