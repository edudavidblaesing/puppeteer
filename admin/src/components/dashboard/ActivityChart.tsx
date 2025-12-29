import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface ActivityData {
  date: string;
  fetched: number;
  new: number;
  updated: number;
  approved?: number;
  venues_new?: number;
  venues_updated?: number;
  artists_new?: number;
  artists_updated?: number;
  organizers_new?: number;
  organizers_updated?: number;
}

interface ActivityChartProps {
  data: ActivityData[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    // payload[0].payload holds the full data object for that index
    // Note: The displayed values in tooltips come from the Bar's dataKey. 
    // If we want to show generic "New" / "Updated" label in tooltip regardless of filter, we can rely on `payload` items.

    return (
      <div className="bg-gray-800 border border-gray-700 p-3 rounded-lg shadow-lg text-white text-xs">
        <p className="font-semibold mb-2 text-gray-300">{label}</p>
        <div className="space-y-1">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
              <span className="text-gray-400 capitalize">{entry.name}:</span>
              <span className="font-mono">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export function ActivityChart({ data }: ActivityChartProps) {
  const [days, setDays] = useState(30);
  const [entityFilter, setEntityFilter] = useState<'all' | 'events' | 'venues' | 'artists' | 'organizers'>('events');

  // Ensure data is an array
  const safeData = Array.isArray(data) ? data : [];

  // Filter keys based on entity type
  const processedData = useMemo(() => {
    return safeData.map(item => {
      let fetched = 0;
      let pNew = 0;
      let updated = 0;

      switch (entityFilter) {
        case 'events':
          fetched = item.fetched;
          pNew = item.new;
          updated = item.updated;
          break;
        case 'venues':
          pNew = item.venues_new || 0;
          updated = item.venues_updated || 0;
          break;
        case 'artists':
          pNew = item.artists_new || 0;
          updated = item.artists_updated || 0;
          break;
        case 'organizers':
          pNew = item.organizers_new || 0;
          updated = item.organizers_updated || 0;
          break;
        case 'all': // Sum everything
          fetched = item.fetched;
          pNew = (item.new || 0) + (item.venues_new || 0) + (item.artists_new || 0) + (item.organizers_new || 0);
          updated = (item.updated || 0) + (item.venues_updated || 0) + (item.artists_updated || 0) + (item.organizers_updated || 0);
          break;
      }

      return {
        ...item,
        displayFetched: fetched,
        displayNew: pNew,
        displayUpdated: updated,
        displayApproved: item.approved || 0 // Only applies to events essentially, but keep it
      };
    });
  }, [safeData, entityFilter]);

  // Filter data based on selected range (assuming data is sorted Oldest -> Newest)
  const displayData = days === 7 ? processedData.slice(-7) : processedData;

  return (
    <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 shrink-0 flex-wrap gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Analytics History</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Daily processing activity</p>
        </div>
        <div className="flex gap-2">
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value as any)}
            className="bg-gray-50 dark:bg-gray-800 border-none text-sm rounded-lg px-3 py-1 text-gray-600 dark:text-gray-300 focus:ring-1 focus:ring-primary-500 outline-none capitalize"
          >
            <option value="all">All Entities</option>
            <option value="events">Events</option>
            <option value="venues">Venues</option>
            <option value="artists">Artists</option>
            <option value="organizers">Organizations</option>
          </select>

          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-gray-50 dark:bg-gray-800 border-none text-sm rounded-lg px-3 py-1 text-gray-600 dark:text-gray-300 focus:ring-1 focus:ring-primary-500 outline-none"
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
            {/* Conditional Bars based on selection? No, we mapped them to displayX keys */}
            {['all', 'events'].includes(entityFilter) && (
              <Bar dataKey="displayFetched" name="Fetched" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
            )}
            <Bar dataKey="displayNew" name="New" fill="#F97316" radius={[4, 4, 0, 0]} />
            <Bar dataKey="displayUpdated" name="Updated" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            {['all', 'events'].includes(entityFilter) && (
              <Bar dataKey="displayApproved" name="Approved" fill="#10B981" radius={[4, 4, 0, 0]} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
