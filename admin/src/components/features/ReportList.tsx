import React from 'react';
import { Shield, AlertTriangle } from 'lucide-react';
import { SelectableListItem } from '@/components/ui/SelectableListItem';

interface ReportListProps {
    reports: any[];
    isLoading: boolean;
    selectedIds: Set<string>;
    onSelect: (id: string) => void;
    onSelectAll: () => void;
    onEdit: (report: any) => void;
    focusedId?: string | null;
}

export function ReportList({
    reports,
    isLoading,
    selectedIds,
    onSelect,
    onSelectAll,
    onEdit,
    focusedId
}: ReportListProps) {
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    if (reports.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
                <Shield className="w-12 h-12 mb-4 opacity-20" />
                <p>No reports found</p>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-800">
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
                {reports.map((report) => (
                    <SelectableListItem
                        key={report.id}
                        id={String(report.id)}
                        title={`Report #${String(report.id).substring(0, 8)}`}
                        subtitle={
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <span className="truncate">{report.reason}</span>
                                <span className="px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-[10px] font-medium uppercase text-gray-500">
                                    {report.status}
                                </span>
                            </div>
                        }
                        isActiveView={focusedId === String(report.id)}
                        imageFallback={<AlertTriangle className="w-6 h-6 text-amber-500 opacity-80" />}
                        isChecked={selectedIds.has(String(report.id))}
                        onToggleSelection={() => onSelect(String(report.id))}
                        onClick={() => onEdit(report)}
                        metaRight={
                            <div className="text-xs text-gray-400">
                                {new Date(report.created_at).toLocaleDateString()}
                            </div>
                        }
                    />
                ))}
            </div>
        </div>
    );
}
