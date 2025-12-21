'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface ActivityData {
  date: string;
  fetched: number;
  new: number;
  updated: number;
  approved?: number;
}

interface ActivityChartProps {
  data: ActivityData[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    // payload[0].payload holds the full data object for that index
    const data = payload[0].payload;
    return (
      <div className="bg-gray-800 border border-gray-700 p-3 rounded-lg shadow-lg text-white text-xs">
        <p className="font-semibold mb-2 text-gray-300">{label}</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-500"></div>
            <span className="text-gray-400">Fetched:</span>
            <span className="font-mono">{data.fetched}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
            <span className="text-gray-400">New:</span>
            <span className="font-mono">{data.new}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-gray-400">Updated:</span>
            <span className="font-mono">{data.updated}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-gray-400">Approved:</span>
            <span className="font-mono">{data.approved || 0}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export function ActivityChart({ data }: ActivityChartProps) {
  const [days, setDays] = React.useState(30);

  // Ensure data is an array
  const safeData = Array.isArray(data) ? data : [];

  // Filter data based on selected range (assuming data is sorted Oldest -> Newest)
  const displayData = days === 7 ? safeData.slice(-7) : safeData;

  return (
    <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Analytics History</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Daily event processing activity</p>
        </div>
        <div className="flex gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-gray-50 dark:bg-gray-800 border-none text-sm rounded-lg px-3 py-1 text-gray-600 dark:text-gray-300 focus:ring-1 focus:ring-indigo-500 outline-none"
          >
            <option value={30}>Last 30 Days</option>
            <option value={7}>Last 7 Days</option>
          </select>
        </div>
      </div>

      {/* Flexible height container */}
      <div className="w-full flex-1 relative min-h-[300px]">
        {displayData.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 z-10">
            <p>No activity recorded yet</p>
            <p className="text-xs mt-1">Run a scrape to see data</p>
          </div>
        ) : null}
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={displayData} barSize={12} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" strokeOpacity={0.3} />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9CA3AF', fontSize: 12 }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9CA3AF', fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.1)' }} />
            <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
            <Bar dataKey="fetched" name="Fetched" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="new" name="New" fill="#F97316" radius={[4, 4, 0, 0]} />
            <Bar dataKey="updated" name="Updated" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="approved" name="Approved" fill="#10B981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
