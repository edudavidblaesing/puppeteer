import React from 'react';
import { LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@/components/ui/Button';

interface StatusProgressWidgetProps {
    approvedCount: number;
    pendingCount: number;
    totalCount: number;
    icon: LucideIcon;
}

export function StatusProgressWidget({ approvedCount, pendingCount, totalCount, icon: Icon }: StatusProgressWidgetProps) {
    // Percentage approved from total processed (Approved + Rejected) / (Approved + Rejected + Pending)
    // Or users asked for "percentage approved from open pendings" which is confusing. 
    // Let's assume "Processed % of Workload". 
    // Workload = Pending + Approved + Rejected. 
    // Processed = Approved + Rejected.
    // If user means "Approval Rate", it would be Approved / (Approved + Rejected).
    // Given "0% Published" label, it likely implies Approved / Total Potential.
    // Let's use Approved / (Approved + Pending + Rejected) * 100.
    const workload = approvedCount + pendingCount + (totalCount - approvedCount - pendingCount); // approximating total if rejected not passed explicitly, but props have totalCount
    // totalCount passed from parent is events.length.
    const percentage = totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0;

    // User specifically asked: "percentage approved from open pendings, not all events"
    // This likely means denominator shouldn't be ALL events history, but maybe just the current batch?
    // But we don't know "batch". 
    // If we assume "open pendings" allows the denominator to be (Approved + Pending), excluding Rejected? 
    // "Approved from Open Pendings" -> Approved / (Approved + Pending). 
    // Let's try that.
    const addressableSet = approvedCount + pendingCount;
    const approvalRate = addressableSet > 0 ? Math.round((approvedCount / addressableSet) * 100) : 0;

    return (
        <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-6 shadow-sm border border-gray-100 dark:border-gray-800 relative overflow-hidden h-full flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
                <h3 className="font-bold text-gray-900 dark:text-white">Publication Status</h3>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border border-gray-100 dark:border-gray-800">
                    <Icon className="w-4 h-4 text-gray-400" />
                </Button>
            </div>

            <div className="mb-4">
                <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-3xl font-bold text-[#FF6A1F]">{approvalRate}%</span>
                    <span className="text-gray-500 text-sm">Published</span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-800 h-16 rounded-xl relative overflow-hidden pattern-diagonal-lines-sm border border-gray-200 dark:border-gray-700">
                    <div
                        className="absolute top-0 left-0 h-full bg-[#FF6A1F] rounded-xl flex items-center justify-center text-white font-medium text-sm transition-all duration-1000 ease-out"
                        style={{ width: `${approvalRate}%` }}
                    >
                        {approvalRate > 20 && 'Live'}
                    </div>
                </div>
            </div>

            <div className="flex justify-between text-xs text-gray-400 font-medium mt-auto">
                <div>
                    <p className="mb-1">Pending</p>
                    <p className="text-gray-900 dark:text-white text-lg">{pendingCount}</p>
                </div>
                <div className="text-right">
                    <p className="mb-1">Approved</p>
                    <p className="text-gray-900 dark:text-white text-lg">{approvedCount}</p>
                </div>
            </div>
        </div>
    );
}
