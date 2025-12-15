'use client';

import React from 'react';

interface StatusRatioChartProps {
  approved: number;
  pending: number;
  rejected: number;
}

export function StatusRatioChart({ approved, pending, rejected }: StatusRatioChartProps) {
  const total = approved + pending + rejected;
  
  // Calculate percentages
  const approvedPct = total > 0 ? (approved / total) * 100 : 0;
  const pendingPct = total > 0 ? (pending / total) * 100 : 0;
  const rejectedPct = total > 0 ? (rejected / total) * 100 : 0;

  return (
    <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm h-full">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Status Ratio</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Event publication status</p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-gray-900 dark:text-white">{total}</span>
          <p className="text-xs text-gray-500">Total Events</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Progress Bar */}
        <div className="h-4 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex">
          <div 
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${approvedPct}%` }}
          />
          <div 
            className="h-full bg-amber-400 transition-all duration-500 relative"
            style={{ width: `${pendingPct}%` }}
          >
            {/* Striped pattern for pending */}
            <div className="absolute inset-0 w-full h-full" 
                 style={{ 
                   backgroundImage: 'linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent)', 
                   backgroundSize: '1rem 1rem' 
                 }} 
            />
          </div>
          <div 
            className="h-full bg-gray-300 dark:bg-gray-700 transition-all duration-500"
            style={{ width: `${rejectedPct}%` }}
          />
        </div>

        {/* Legend / Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-gray-500 font-medium">Approved</span>
            </div>
            <span className="text-lg font-semibold text-gray-900 dark:text-white">{approved}</span>
            <span className="text-xs text-gray-400">{approvedPct.toFixed(1)}%</span>
          </div>
          
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-xs text-gray-500 font-medium">Pending</span>
            </div>
            <span className="text-lg font-semibold text-gray-900 dark:text-white">{pending}</span>
            <span className="text-xs text-gray-400">{pendingPct.toFixed(1)}%</span>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-700" />
              <span className="text-xs text-gray-500 font-medium">Rejected</span>
            </div>
            <span className="text-lg font-semibold text-gray-900 dark:text-white">{rejected}</span>
            <span className="text-xs text-gray-400">{rejectedPct.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
