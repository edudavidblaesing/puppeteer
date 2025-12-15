import React from 'react';
import { LucideIcon, TrendingUp, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface UpdatedEventsWidgetProps {
    updatedCount: number;
    totalEvents: number;
    icon: LucideIcon;
    onReview?: () => void;
}

export function UpdatedEventsWidget({ updatedCount, totalEvents, icon: Icon, onReview }: UpdatedEventsWidgetProps) {
    const percentage = totalEvents > 0 ? Math.round((updatedCount / totalEvents) * 100) : 0;

    return (
        <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-6 shadow-sm border border-gray-100 dark:border-gray-800 h-full flex flex-col">
            <div className="flex justify-between mb-4">
                <h3 className="font-bold text-gray-900 dark:text-white">Updated Events</h3>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border border-gray-100 dark:border-gray-800"><Icon className="w-4 h-4 text-gray-400" /></Button>
            </div>

            <div className="flex items-center justify-between mt-auto">
                <div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-600 mb-2">
                        <RefreshCw className="w-3 h-3 mr-1" /> {updatedCount}
                    </span>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{updatedCount} <span className="text-sm font-normal text-gray-400">/ {totalEvents}</span></div>
                    <p className="text-xs text-gray-400 mt-1 mb-3">Updates in last 24h</p>
                    {updatedCount > 0 && onReview && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onReview}>
                            Review Changes
                        </Button>
                    )}
                </div>
                <div className="relative w-16 h-16 shrink-0">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-gray-100 dark:text-gray-800" />
                        <circle
                            cx="32" cy="32" r="28"
                            stroke="#FF6A1F" strokeWidth="6" fill="transparent"
                            strokeDasharray="175.9"
                            strokeDashoffset={175.9 - (175.9 * percentage) / 100}
                            className="text-[#FF6A1F] transition-all duration-1000 ease-out"
                        />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-400">{percentage}%</span>
                </div>
            </div>
        </div>
    );
}
