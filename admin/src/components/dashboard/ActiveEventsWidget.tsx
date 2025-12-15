import React from 'react';
import { LucideIcon, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ActiveEventsWidgetProps {
    activeCount: number;
    upcomingCounts: number[]; // Array of counts for next 5-7 days
    totalUpcoming: number;
    icon: LucideIcon;
}

export function ActiveEventsWidget({ activeCount, upcomingCounts, totalUpcoming, icon: Icon }: ActiveEventsWidgetProps) {
    // Find max for scaling
    const maxCount = Math.max(...upcomingCounts, 1);

    return (
        <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-6 shadow-sm border border-gray-100 dark:border-gray-800 h-full flex flex-col">
            <div className="flex justify-between mb-4">
                <h3 className="font-bold text-gray-900 dark:text-white">Active Events</h3>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border border-gray-100 dark:border-gray-800"><Icon className="w-4 h-4 text-gray-400" /></Button>
            </div>

            <div className="mb-4">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-green-50 text-green-600 mb-2">
                    <TrendingUp className="w-3 h-3 mr-1" /> Live
                </span>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">{activeCount} <span className="text-sm font-normal text-gray-400">Happening Now</span></div>
                <p className="text-xs text-gray-400 mt-1">{totalUpcoming} Upcoming this week</p>
            </div>

            <div className="flex items-end gap-2 h-24 mt-auto">
                {upcomingCounts.map((count, i) => {
                    // Calculate height percentage, ensuring at least some height for 0
                    const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                    const displayHeight = Math.max(heightPct, 4); // Min 4% height

                    return (
                        <div key={i} className="flex-1 flex flex-col justify-end h-full gap-1 group relative">
                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                {count} events
                            </div>
                            <div
                                style={{ height: `${displayHeight}%` }}
                                className={`w-full rounded-t-sm relative transition-all duration-500 ${i === 0
                                        ? 'bg-[#FF6A1F]'
                                        : 'bg-orange-100 dark:bg-orange-900/40 group-hover:bg-orange-200 dark:group-hover:bg-orange-800/60'
                                    }`}
                            />
                            <div className="text-[10px] text-gray-400 text-center mt-1">
                                {i === 0 ? 'Today' : `+${i}d`}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
