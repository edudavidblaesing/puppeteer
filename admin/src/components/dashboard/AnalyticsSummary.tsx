import React from 'react';
import { TrendingUp, Clock, CheckCircle, AlertCircle, RefreshCw, Calendar, Database, Plus } from 'lucide-react';
import clsx from 'clsx';
import { Stats } from '@/types';

interface AnalyticsSummaryProps {
    stats: Stats['events'];
    scrapeStats?: Stats['scraping'];
    history?: any[];
    onQuickFilter?: (type: 'approved' | 'updated' | 'pending' | 'live') => void;
}

export function AnalyticsSummary({ stats, scrapeStats, history = [], onQuickFilter }: AnalyticsSummaryProps) {
    // Helper to normalize data for mini-charts (last 7 days)
    const getLast7DaysData = (key: string) => {
        if (!history || history.length === 0) return [20, 40, 30, 50, 40, 60, 50]; // Fallback

        // Get last 7 entries
        const last7 = history.slice(-7);
        // Map to values
        const values = last7.map(h => Number(h[key] || 0));

        // Normalize to 0-100 range for CSS height
        const max = Math.max(...values, 1);
        return values.map(v => Math.round((v / max) * 80) + 10); // Min 10% height
    };

    const newEventsData = getLast7DaysData('new');
    const updatedEventsData = getLast7DaysData('updated');
    const scrapedData = getLast7DaysData('fetched');

    // Calculate updated in last 7 days from history
    const updated7d = history?.slice(-7).reduce((acc, curr) => acc + (Number(curr.updated) || 0), 0) || 0;

    return (
        <>
            {/* 1. Approved Card (Primary) */}
            <div
                onClick={() => onQuickFilter?.('approved')}
                className="bg-gray-900 rounded-2xl p-6 border border-gray-800 relative overflow-hidden group flex flex-col justify-between cursor-pointer hover:border-green-500/50 transition-colors"
            >
                <div>
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-gray-400 font-medium">Approved Events</span>
                        <div className="p-2 rounded-lg bg-gray-800 text-green-500 group-hover:bg-green-500/20 transition-colors">
                            <CheckCircle className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="mb-2">
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-bold text-white">{stats.approved}</span>
                            <span className="text-gray-500">Active</span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                            {stats.total} total synced events
                        </p>
                    </div>
                </div>
                {/* Progress Bar */}
                <div className="w-full h-2 bg-gray-800 rounded-full mt-auto mb-2 overflow-hidden">
                    <div
                        className="h-full bg-green-500 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${(stats.approved / (stats.total || 1)) * 100}%` }}
                    />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                    <span>{Math.round((stats.approved / (stats.total || 1)) * 100)}% Global Coverage</span>
                </div>
            </div>

            {/* 2. Updated Card */}
            <div
                onClick={() => onQuickFilter?.('updated')}
                className="bg-gray-900 rounded-2xl p-6 border border-gray-800 relative overflow-hidden group flex flex-col justify-between cursor-pointer hover:border-blue-500/50 transition-colors"
            >
                <div>
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-gray-400 font-medium">Recently Updated</span>
                        <div className="p-2 rounded-lg bg-gray-800 text-blue-500 group-hover:bg-blue-500/20 transition-colors">
                            <RefreshCw className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="mb-2">
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-bold text-white">{stats.updated_24h}</span>
                            <span className="text-gray-500">Last 24h</span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                            {updated7d} in last 7 days
                        </p>
                    </div>
                </div>
                {/* Mini chart for Updated Events */}
                <div className="flex items-end gap-1 h-8 mt-4">
                    {updatedEventsData.map((h, i) => (
                        <div key={`u-${i}`} className="flex-1 bg-blue-500/20 rounded-sm hover:bg-blue-500/40 transition-colors" style={{ height: `${h}%` }} />
                    ))}
                </div>
            </div>

            {/* 3. Approval Rate (Relative for Approved) */}
            <div
                onClick={() => onQuickFilter?.('pending')}
                className="bg-gray-900 rounded-2xl p-6 border border-gray-800 relative overflow-hidden group flex flex-col justify-between cursor-pointer hover:border-purple-500/50 transition-colors"
            >
                <div>
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-gray-400 font-medium">Approval Efficiency</span>
                        <div className="p-2 rounded-lg bg-gray-800 text-purple-500 group-hover:bg-purple-500/20 transition-colors">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="mb-2">
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-bold text-white">
                                {Math.round((stats.approved / (stats.total || 1)) * 100)}%
                            </span>
                            <span className="text-gray-500">Rate</span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                            {stats.pending} events pending review
                        </p>
                    </div>
                </div>
                {/* Visual indicator of "Health" */}
                <div className="flex items-center gap-2 mt-4">
                    <div className={clsx("h-3 w-3 rounded-full animate-pulse", stats.pending > 50 ? "bg-amber-500" : "bg-green-500")}></div>
                    <span className="text-xs text-gray-400">{stats.pending > 50 ? "Backlog building up" : "Healthy pipeline"}</span>
                </div>
            </div>

            {/* 4. Live/Upcoming (Relative for Live) */}
            <div
                onClick={() => onQuickFilter?.('live')}
                className="bg-gray-900 rounded-2xl p-6 border border-gray-800 relative overflow-hidden group flex flex-col justify-between cursor-pointer hover:border-orange-500/50 transition-colors"
            >
                <div>
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-gray-400 font-medium">Live & Upcoming</span>
                        <div className="p-2 rounded-lg bg-gray-800 text-orange-500">
                            <Clock className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="mb-2">
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-bold text-white">{stats.active}</span>
                            <span className="text-gray-500">Active</span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                            Events live or upcoming
                        </p>
                    </div>
                </div>
                {/* Visualizing upcoming volume - reusing newEventsData as a proxy for activity if needed, or just a static decoration */}
                <div className="flex items-end gap-1 h-8 mt-4 opacity-60">
                    {/* Pseudo-visualization of upcoming load based on day of week logic or similar if available */}
                    {newEventsData.map((h, i) => (
                        <div key={`l-${i}`} className="flex-1 bg-orange-500/20 rounded-sm hover:bg-orange-500/40 transition-colors" style={{ height: `${h}%` }} />
                    ))}
                </div>
            </div>
        </>
    );
}
