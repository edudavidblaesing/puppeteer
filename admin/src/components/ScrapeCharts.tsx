'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface DataPoint {
  timestamp: string;
  events_fetched?: number;
  events_inserted?: number;
  events_updated?: number;
  venues_created?: number;
  artists_created?: number;
  [key: string]: any;
}

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  showDots?: boolean;
  fillOpacity?: number;
}

// Minimal sparkline chart
export function Sparkline({ data, color = '#6366f1', height = 32, showDots = false, fillOpacity = 0.1 }: SparklineProps) {
  if (data.length < 2) return null;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const width = 100;
  const padding = 2;

  const points = data.map((value, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return { x, y, value };
  });

  const linePath = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
  const areaPath = `${linePath} L ${points[points.length - 1].x},${height - padding} L ${padding},${height - padding} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={fillOpacity * 2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#gradient-${color.replace('#', '')})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {showDots && points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2} fill={color} />
      ))}
    </svg>
  );
}

interface MiniChartProps {
  data: DataPoint[];
  dataKey: string;
  color: string;
  height?: number;
  showLabels?: boolean;
}

export function MiniBarChart({ data, dataKey, color, height = 60, showLabels = false }: MiniChartProps) {
  const chartData = useMemo(() => {
    const reversed = [...data].reverse().slice(-14);
    const maxValue = Math.max(...reversed.map(d => Number(d[dataKey]) || 0), 1);
    return { data: reversed, maxValue };
  }, [data, dataKey]);

  if (chartData.data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-xs">
        No data yet
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex items-end gap-0.5" style={{ height }}>
        {chartData.data.map((d, i) => {
          const value = Number(d[dataKey]) || 0;
          const heightPercent = (value / chartData.maxValue) * 100;
          return (
            <div
              key={i}
              className="flex-1 rounded-t transition-all hover:opacity-80 group relative"
              style={{
                backgroundColor: color,
                height: `${Math.max(heightPercent, 2)}%`,
                minHeight: value > 0 ? '4px' : '2px',
                opacity: value > 0 ? 0.7 : 0.2,
              }}
            >
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                <div className="bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                  {value.toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {showLabels && chartData.data.length > 0 && (
        <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 mt-1">
          <span>{new Date(chartData.data[0]?.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          <span>{new Date(chartData.data[chartData.data.length - 1]?.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </div>
      )}
    </div>
  );
}

interface MultiLineChartProps {
  data: DataPoint[];
  lines: { dataKey: string; color: string; label: string }[];
  height?: number;
  showLegend?: boolean;
}

export function MultiLineChart({ data, lines, height = 120, showLegend = true }: MultiLineChartProps) {
  const chartData = useMemo(() => {
    const reversed = [...data].reverse().slice(-30);
    const allValues = reversed.flatMap(d => lines.map(l => Number(d[l.dataKey]) || 0));
    const maxValue = Math.max(...allValues, 1);
    return { data: reversed, maxValue };
  }, [data, lines]);

  if (chartData.data.length === 0) {
    return (
      <div className="flex items-center justify-center text-gray-400 dark:text-gray-500 text-xs" style={{ height }}>
        No data yet
      </div>
    );
  }

  const width = 100;
  const padding = 4;
  const chartHeight = height - (showLegend ? 24 : 0);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${chartHeight}`} className="w-full" style={{ height: chartHeight }} preserveAspectRatio="none">
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(ratio => (
          <line
            key={ratio}
            x1={padding}
            y1={chartHeight - padding - ratio * (chartHeight - padding * 2)}
            x2={width - padding}
            y2={chartHeight - padding - ratio * (chartHeight - padding * 2)}
            stroke="currentColor"
            strokeOpacity={0.1}
            strokeDasharray="2,2"
          />
        ))}
        
        {lines.map((line) => {
          const points = chartData.data.map((d, i) => {
            const x = padding + (i / (chartData.data.length - 1 || 1)) * (width - padding * 2);
            const value = Number(d[line.dataKey]) || 0;
            const y = chartHeight - padding - (value / chartData.maxValue) * (chartHeight - padding * 2);
            return { x, y };
          });

          const linePath = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
          const areaPath = `${linePath} L ${points[points.length - 1].x},${chartHeight - padding} L ${padding},${chartHeight - padding} Z`;

          return (
            <g key={line.dataKey}>
              <defs>
                <linearGradient id={`area-${line.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={line.color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={line.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <path d={areaPath} fill={`url(#area-${line.dataKey})`} />
              <path d={linePath} fill="none" stroke={line.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
      </svg>
      
      {showLegend && (
        <div className="flex gap-4 mt-2 text-xs">
          {lines.map(line => (
            <div key={line.dataKey} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: line.color }} />
              <span className="text-gray-500 dark:text-gray-400">{line.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Alias for backward compatibility
export const MiniAreaChart = MultiLineChart;

interface StatCardProps {
  label: string;
  value: number | string;
  subtext?: string;
  trend?: number;
  trendLabel?: string;
  sparkData?: number[];
  sparkColor?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'highlight' | 'success' | 'warning';
}

export function StatCard({ 
  label, 
  value, 
  subtext, 
  trend, 
  trendLabel,
  sparkData, 
  sparkColor = '#6366f1',
  icon,
  variant = 'default'
}: StatCardProps) {
  const variantStyles = {
    default: 'bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50',
    highlight: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700/50',
    success: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/50',
    warning: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/50',
  };

  return (
    <div className={`rounded-lg border p-4 ${variantStyles[variant]}`}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
        {icon && <span className="text-gray-400 dark:text-gray-500">{icon}</span>}
      </div>
      
      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
          {subtext && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtext}</p>}
          {trend !== undefined && (
            <div className={`flex items-center gap-1 mt-1 text-xs ${trend > 0 ? 'text-emerald-600 dark:text-emerald-400' : trend < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
              {trend > 0 ? <TrendingUp className="w-3 h-3" /> : trend < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              <span>{Math.abs(trend)}{trendLabel && ` ${trendLabel}`}</span>
            </div>
          )}
        </div>
        
        {sparkData && sparkData.length > 1 && (
          <div className="w-20 h-8">
            <Sparkline data={sparkData} color={sparkColor} height={32} />
          </div>
        )}
      </div>
    </div>
  );
}

interface EntityStatsProps {
  title: string;
  total: number;
  newCount?: number;
  updatedCount?: number;
  icon?: React.ReactNode;
  historyData?: DataPoint[];
  newKey?: string;
  updatedKey?: string;
}

export function EntityStats({ 
  title, 
  total, 
  newCount = 0, 
  updatedCount = 0, 
  icon,
  historyData = [],
  newKey = 'events_inserted',
  updatedKey = 'events_updated'
}: EntityStatsProps) {
  const sparkNew = useMemo(() => 
    historyData.slice(-14).reverse().map(d => Number(d[newKey]) || 0), 
    [historyData, newKey]
  );
  const sparkUpdated = useMemo(() => 
    historyData.slice(-14).reverse().map(d => Number(d[updatedKey]) || 0), 
    [historyData, updatedKey]
  );

  return (
    <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-gray-400 dark:text-gray-500">{icon}</span>}
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{title}</span>
      </div>
      
      <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">
        {total.toLocaleString()}
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">New</span>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">+{newCount}</span>
          </div>
          {sparkNew.length > 1 && (
            <Sparkline data={sparkNew} color="#10b981" height={24} fillOpacity={0.15} />
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Updated</span>
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{updatedCount}</span>
          </div>
          {sparkUpdated.length > 1 && (
            <Sparkline data={sparkUpdated} color="#f59e0b" height={24} fillOpacity={0.15} />
          )}
        </div>
      </div>
    </div>
  );
}

interface RecentActivityProps {
  activities: {
    id: number;
    created_at: string;
    city: string;
    source_code: string;
    events_fetched: number;
    events_inserted: number;
    events_updated?: number;
    error?: string;
    scrape_type?: string;
  }[];
}

export function RecentActivity({ activities }: RecentActivityProps) {
  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
        No recent scrape activity
      </div>
    );
  }

  return (
    <div className="space-y-1 max-h-64 overflow-auto">
      {activities.map((activity) => (
        <div
          key={activity.id}
          className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
            activity.error 
              ? 'bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20' 
              : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
          }`}
        >
          <div className="flex items-center gap-2">
            {activity.source_code === 'ra' ? (
              <img src="/ra-logo.jpg" alt="RA" className="h-4 w-auto rounded-sm" title="Resident Advisor" />
            ) : activity.source_code === 'ticketmaster' ? (
              <img src="/ticketmaster-logo.png" alt="TM" className="h-4 w-auto rounded-sm" title="Ticketmaster" />
            ) : (
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {activity.source_code?.toUpperCase()}
              </span>
            )}
            <span className="font-medium capitalize text-gray-900 dark:text-gray-100">{activity.city}</span>
            {activity.scrape_type === 'scheduled' && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700">
                AUTO
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs">
            {activity.error ? (
              <span className="text-red-600 dark:text-red-400">Error</span>
            ) : (
              <>
                <span className="text-gray-500 dark:text-gray-400">{activity.events_fetched} fetched</span>
                <span className="text-emerald-600 dark:text-emerald-400">+{activity.events_inserted}</span>
                {activity.events_updated && activity.events_updated > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">↻{activity.events_updated}</span>
                )}
              </>
            )}
            <span className="text-gray-400 dark:text-gray-500">
              {new Date(activity.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

interface ActivityTimelineProps {
  data: DataPoint[];
  height?: number;
}

export function ActivityTimeline({ data, height = 160 }: ActivityTimelineProps) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 text-sm" style={{ height }}>
        <div className="text-center">
          <p className="font-medium mb-1">No scrape activity yet</p>
          <p className="text-xs">Run a sync to see activity data here</p>
        </div>
      </div>
    );
  }

  // Check if there's any meaningful data
  const hasData = data.some(d => 
    (Number(d.events_fetched) || 0) > 0 || 
    (Number(d.events_inserted) || 0) > 0 || 
    (Number(d.events_updated) || 0) > 0
  );

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 text-sm" style={{ height }}>
        <div className="text-center">
          <p className="font-medium mb-1">No activity in selected period</p>
          <p className="text-xs">Data entries exist but show no activity</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <MultiLineChart
        data={data}
        lines={[
          { dataKey: 'events_fetched', color: '#818cf8', label: 'Fetched' },
          { dataKey: 'events_inserted', color: '#34d399', label: 'New' },
          { dataKey: 'events_updated', color: '#fbbf24', label: 'Updated' },
        ]}
        height={height}
        showLegend={true}
      />
      
      {/* Date range labels */}
      <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 mt-1 px-1">
        {data.length > 0 && (
          <>
            <span>{new Date([...data].reverse()[0]?.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            <span>{new Date(data[0]?.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </>
        )}
      </div>
    </div>
  );
}
