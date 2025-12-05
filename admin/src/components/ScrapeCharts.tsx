'use client';

import { useMemo } from 'react';

interface DataPoint {
  timestamp: string;
  events_fetched?: number;
  events_inserted?: number;
  venues_created?: number;
  artists_created?: number;
  [key: string]: any;
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
    const reversed = [...data].reverse().slice(-14); // Last 14 periods
    const maxValue = Math.max(...reversed.map(d => Number(d[dataKey]) || 0), 1);
    return { data: reversed, maxValue };
  }, [data, dataKey]);

  if (chartData.data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-xs">
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
                opacity: value > 0 ? 1 : 0.2,
              }}
            >
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                <div className="bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                  {value.toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {showLabels && chartData.data.length > 0 && (
        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>{new Date(chartData.data[0]?.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          <span>{new Date(chartData.data[chartData.data.length - 1]?.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </div>
      )}
    </div>
  );
}

interface AreaChartProps {
  data: DataPoint[];
  lines: { dataKey: string; color: string; label: string }[];
  height?: number;
}

export function MiniAreaChart({ data, lines, height = 100 }: AreaChartProps) {
  const chartData = useMemo(() => {
    const reversed = [...data].reverse().slice(-30); // Last 30 periods
    const allValues = reversed.flatMap(d => lines.map(l => Number(d[l.dataKey]) || 0));
    const maxValue = Math.max(...allValues, 1);
    return { data: reversed, maxValue };
  }, [data, lines]);

  if (chartData.data.length === 0) {
    return (
      <div className="flex items-center justify-center text-gray-400 text-xs" style={{ height }}>
        No data yet
      </div>
    );
  }

  const width = 100;
  const padding = 2;

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
        {lines.map((line, lineIndex) => {
          const points = chartData.data.map((d, i) => {
            const x = padding + (i / (chartData.data.length - 1 || 1)) * (width - padding * 2);
            const value = Number(d[line.dataKey]) || 0;
            const y = height - padding - (value / chartData.maxValue) * (height - padding * 2);
            return `${x},${y}`;
          });

          const areaPath = `M ${padding},${height - padding} L ${points.join(' L ')} L ${width - padding},${height - padding} Z`;
          const linePath = `M ${points.join(' L ')}`;

          return (
            <g key={line.dataKey}>
              <path
                d={areaPath}
                fill={line.color}
                fillOpacity={0.15}
              />
              <path
                d={linePath}
                fill="none"
                stroke={line.color}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          );
        })}
      </svg>
      {/* Legend */}
      <div className="flex gap-3 mt-1 text-xs">
        {lines.map(line => (
          <div key={line.dataKey} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: line.color }} />
            <span className="text-gray-500">{line.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: number | string;
  subValue?: string;
  color: string;
  icon?: React.ReactNode;
  trend?: { value: number; label: string };
  chartData?: DataPoint[];
  chartKey?: string;
}

export function StatCard({ title, value, subValue, color, icon, trend, chartData, chartKey }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-1">{title}</p>
          <p className="text-2xl font-bold" style={{ color }}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
          {subValue && <p className="text-xs text-gray-400 mt-0.5">{subValue}</p>}
          {trend && (
            <p className={`text-xs mt-1 ${trend.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)} {trend.label}
            </p>
          )}
        </div>
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>
      {chartData && chartKey && (
        <div className="mt-3">
          <MiniBarChart data={chartData} dataKey={chartKey} color={color} height={40} />
        </div>
      )}
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
    error?: string;
  }[];
}

export function RecentActivity({ activities }: RecentActivityProps) {
  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No recent scrape activity
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-64 overflow-auto">
      {activities.map((activity) => (
        <div
          key={activity.id}
          className={`flex items-center justify-between p-2 rounded-lg text-sm ${activity.error ? 'bg-red-50' : 'bg-gray-50'
            }`}
        >
          <div className="flex items-center gap-2">
            {activity.source_code === 'ra' ? (
              <img src="/ra-logo.jpg" alt="RA" className="h-4 w-auto rounded-sm" title="Resident Advisor" />
            ) : activity.source_code === 'ticketmaster' ? (
              <img src="/ticketmaster-logo.png" alt="TM" className="h-4 w-auto rounded-sm" title="Ticketmaster" />
            ) : (
              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                {activity.source_code?.toUpperCase()}
              </span>
            )}
            <span className="font-medium capitalize">{activity.city}</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {activity.error ? (
              <span className="text-red-600">Error</span>
            ) : (
              <>
                <span className="text-gray-500">{activity.events_fetched} fetched</span>
                <span className="text-green-600">+{activity.events_inserted} new</span>
              </>
            )}
            <span className="text-gray-400">
              {new Date(activity.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
