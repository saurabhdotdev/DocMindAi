import React, { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Bell, FileText, MessageSquare, CheckCheck, RefreshCw, Zap } from 'lucide-react';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  data?: any;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  CONVERSION_COMPLETE: <FileText className="w-3.5 h-3.5 text-brand-success" />,
  OCR_FINISHED: <FileText className="w-3.5 h-3.5 text-brand-primary" />,
  NEW_ANNOTATION: <MessageSquare className="w-3.5 h-3.5 text-brand-secondary" />,
  WORKFLOW_TRIGGERED: <Zap className="w-3.5 h-3.5 text-yellow-400" />,
};

export const NotificationDropdown: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<{ notifications: Notification[]; unreadCount: number }>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await api.get('/v1/notifications');
      return res.data.data;
    },
    refetchInterval: 15000,
  });

  const markAllMutation = useMutation({
    mutationFn: () => api.put('/v1/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markOneMutation = useMutation({
    mutationFn: (id: string) => api.put(`/v1/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const notifications = data?.notifications || [];

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 w-80 glass-panel border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in slide-in-from-top-2 fade-in duration-150"
    >
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-white/5">
        <span className="text-xs font-bold text-white">Notifications</span>
        {(data?.unreadCount ?? 0) > 0 && (
          <button
            onClick={() => markAllMutation.mutate()}
            className="text-[10px] text-brand-primary hover:text-brand-secondary flex items-center gap-1 transition-colors"
          >
            <CheckCheck className="w-3 h-3" />
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <div className="max-h-80 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <RefreshCw className="w-5 h-5 text-brand-primary animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center py-8 gap-2 text-brand-textMuted">
            <Bell className="w-8 h-8 opacity-30" />
            <span className="text-xs">No notifications yet</span>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => {
                if (!n.isRead) markOneMutation.mutate(n.id);
                if (n.data?.documentId) {
                  navigate(`/documents/${n.data.documentId}`);
                  onClose();
                }
              }}
              className={`flex gap-3 px-4 py-3 border-b border-white/[0.03] cursor-pointer hover:bg-white/[0.03] transition-all ${
                !n.isRead ? 'bg-brand-primary/[0.03]' : ''
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${
                !n.isRead ? 'bg-brand-primary/10 border-brand-primary/20' : 'bg-white/5 border-white/5'
              }`}>
                {TYPE_ICON[n.type] || <Bell className="w-3.5 h-3.5 text-brand-textMuted" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-xs font-semibold text-white leading-tight">{n.title}</span>
                  {!n.isRead && (
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-primary shrink-0 mt-1" />
                  )}
                </div>
                <p className="text-[11px] text-brand-textMuted mt-0.5 leading-relaxed line-clamp-2">{n.message}</p>
                <span className="text-[10px] text-brand-border mt-0.5 block">{timeAgo(n.createdAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Bell button with unread badge
export const NotificationBell: React.FC = () => {
  const [isOpen, setIsOpen] = React.useState(false);

  const { data } = useQuery<{ notifications: any[]; unreadCount: number }>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await api.get('/v1/notifications');
      return res.data.data;
    },
    refetchInterval: 15000,
  });

  const unread = data?.unreadCount ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="relative w-8 h-8 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 flex items-center justify-center transition-all"
      >
        <Bell className="w-4 h-4 text-brand-textMuted" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-brand-primary text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {isOpen && <NotificationDropdown onClose={() => setIsOpen(false)} />}
    </div>
  );
};
