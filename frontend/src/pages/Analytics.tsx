import React from 'react';
import { MainLayout } from '../components/MainLayout';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { BarChart3, FileText, MessageSquare, Sparkles, TrendingUp, Zap } from 'lucide-react';

interface OverviewData {
  totalDocs: number;
  totalChats: number;
  totalEntities: number;
  docsByStatus: { status: string; count: number }[];
  docsByClassification: { label: string; count: number }[];
}

interface TimelinePoint { date: string; count: number; }
interface EntityCategory { category: string; count: number; }

const ENTITY_COLORS = [
  '#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6',
];

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: '#10b981',
  PROCESSING: '#6366f1',
  PENDING: '#f59e0b',
  FAILED: '#ef4444',
};

function AnimatedCount({ value }: { value: number }) {
  const [display, setDisplay] = React.useState(0);
  React.useEffect(() => {
    if (!value) return;
    let start = 0;
    const step = Math.ceil(value / 40);
    const timer = setInterval(() => {
      start += step;
      if (start >= value) { setDisplay(value); clearInterval(timer); }
      else setDisplay(start);
    }, 20);
    return () => clearInterval(timer);
  }, [value]);
  return <span>{display.toLocaleString()}</span>;
}

export const Analytics: React.FC = () => {
  const { data: overview, isLoading: overviewLoading } = useQuery<OverviewData>({
    queryKey: ['analytics-overview'],
    queryFn: async () => (await api.get('/v1/analytics/overview')).data.data,
  });

  const { data: timeline, isLoading: timelineLoading } = useQuery<TimelinePoint[]>({
    queryKey: ['analytics-timeline'],
    queryFn: async () => (await api.get('/v1/analytics/timeline')).data.data,
  });

  const { data: entities, isLoading: entitiesLoading } = useQuery<EntityCategory[]>({
    queryKey: ['analytics-entities'],
    queryFn: async () => (await api.get('/v1/analytics/entities')).data.data,
  });

  // Build SVG path for timeline
  const buildPath = (points: TimelinePoint[]) => {
    if (!points?.length) return { line: '', area: '', coords: [] as { x: number; y: number }[] };
    const max = Math.max(...points.map(p => p.count), 1);
    const W = 700; const H = 120;
    const coords = points.map((p, i) => ({
      x: (i / (points.length - 1)) * W,
      y: H - (p.count / max) * H,
    }));
    const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
    const area = `${line} L ${W} ${H} L 0 ${H} Z`;
    return { line, area, coords };
  };

  const timelinePaths = timeline ? buildPath(timeline) : { line: '', area: '', coords: [] as { x: number; y: number }[] };
  const maxEntity = Math.max(...(entities?.map(e => e.count) ?? [1]), 1);

  const stats = [
    { label: 'Total Documents', value: overview?.totalDocs ?? 0, icon: FileText, color: '#6366f1' },
    { label: 'AI Chat Sessions', value: overview?.totalChats ?? 0, icon: MessageSquare, color: '#8b5cf6' },
    { label: 'Entities Extracted', value: overview?.totalEntities ?? 0, icon: Sparkles, color: '#06b6d4' },
    { label: 'Processing Jobs', value: overview?.docsByStatus?.find(s => s.status === 'PROCESSING')?.count ?? 0, icon: Zap, color: '#f59e0b' },
  ];

  return (
    <MainLayout>
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Analytics</h1>
            <p className="text-xs text-brand-textMuted">Your document intelligence insights</p>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="glass-panel rounded-2xl p-5 border border-white/5 hover:border-white/10 transition-all group">
              <div className="flex items-start justify-between mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}22` }}>
                  <Icon className="w-4.5 h-4.5" style={{ color }} />
                </div>
                <TrendingUp className="w-3.5 h-3.5 text-brand-success opacity-60" />
              </div>
              {overviewLoading ? (
                <div className="h-8 w-16 bg-white/5 rounded-lg animate-pulse" />
              ) : (
                <div className="text-2xl font-bold text-white mb-1">
                  <AnimatedCount value={value} />
                </div>
              )}
              <span className="text-[11px] text-brand-textMuted">{label}</span>
            </div>
          ))}
        </div>

        {/* Timeline Chart */}
        <div className="glass-panel rounded-2xl p-6 border border-white/5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-bold text-white">Documents Processed — Last 30 Days</h2>
            <span className="text-[10px] text-brand-textMuted px-2 py-1 bg-white/5 rounded-full">Daily</span>
          </div>
          {timelineLoading ? (
            <div className="h-32 bg-white/5 rounded-xl animate-pulse" />
          ) : !timeline?.length || timeline.every(p => p.count === 0) ? (
            <div className="flex items-center justify-center h-32 text-brand-textMuted text-xs">No data yet. Upload documents to see activity.</div>
          ) : (
            <div className="relative">
              <svg viewBox="0 0 700 130" className="w-full" preserveAspectRatio="none" style={{ height: 130 }}>
                <defs>
                  <linearGradient id="timelineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map(p => (
                  <line key={p} x1="0" y1={p * 120} x2="700" y2={p * 120} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                ))}
                {/* Area fill */}
                <path d={timelinePaths.area} fill="url(#timelineGrad)" />
                {/* Line */}
                <path d={timelinePaths.line} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {/* Dots */}
                {timelinePaths.coords.filter((_: any, i: number) => i % 5 === 0).map((c: { x: number; y: number }, i: number) => (
                  <circle key={i} cx={c.x} cy={c.y} r="3" fill="#6366f1" />
                ))}
              </svg>
              {/* X-axis labels */}
              <div className="flex justify-between mt-2">
                {timeline?.filter((_: any, i: number) => i % 7 === 0).map((p: TimelinePoint) => (
                  <span key={p.date} className="text-[9px] text-brand-border">
                    {new Date(p.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Entity Breakdown */}
          <div className="glass-panel rounded-2xl p-6 border border-white/5">
            <h2 className="text-sm font-bold text-white mb-5">Entity Categories</h2>
            {entitiesLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <div key={i} className="h-6 bg-white/5 rounded animate-pulse" />)}
              </div>
            ) : !entities?.length ? (
              <div className="text-center text-xs text-brand-textMuted py-8">No entities extracted yet</div>
            ) : (
              <div className="space-y-3">
                {entities.slice(0, 8).map((e, i) => (
                  <div key={e.category} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-brand-textMuted font-medium">{e.category}</span>
                      <span className="text-white font-bold">{e.count}</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${(e.count / maxEntity) * 100}%`, background: ENTITY_COLORS[i % ENTITY_COLORS.length] }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Document Status Breakdown */}
          <div className="glass-panel rounded-2xl p-6 border border-white/5">
            <h2 className="text-sm font-bold text-white mb-5">Document Status</h2>
            {overviewLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-white/5 rounded-xl animate-pulse" />)}
              </div>
            ) : !overview?.docsByStatus?.length ? (
              <div className="text-center text-xs text-brand-textMuted py-8">No documents yet</div>
            ) : (
              <div className="space-y-3">
                {overview.docsByStatus.map(s => (
                  <div key={s.status} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATUS_COLORS[s.status] || '#6366f1' }} />
                    <span className="text-xs text-brand-textMuted flex-1 capitalize">{s.status.toLowerCase()}</span>
                    <span className="text-xs font-bold text-white">{s.count}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Classification Grid */}
            {overview?.docsByClassification && overview.docsByClassification.length > 0 && (
              <>
                <h3 className="text-xs font-bold text-white mt-5 mb-3">By Classification</h3>
                <div className="grid grid-cols-2 gap-2">
                  {overview.docsByClassification.slice(0, 6).map(c => (
                    <div key={c.label} className="p-2.5 rounded-lg bg-brand-primary/5 border border-brand-primary/10 text-center">
                      <span className="text-[10px] text-brand-textMuted block truncate">{c.label}</span>
                      <span className="text-sm font-bold text-white">{c.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Analytics;
