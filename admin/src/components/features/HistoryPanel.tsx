import React, { useEffect, useState } from 'react';
import { fetchEntityHistory } from '@/lib/api';
import { format } from 'date-fns';
import { Loader2, User, Globe, Activity } from 'lucide-react';
import clsx from 'clsx';

interface HistoryItem {
    id: number;
    action: string;
    changes: Record<string, { old: any; new: any }>;
    performed_by: string;
    created_at: string;
    type: 'content' | 'status';
}

interface HistoryPanelProps {
    entityId: string;
    entityType: 'event' | 'artist' | 'venue' | 'organizer' | 'city';
}

export default function HistoryPanel({ entityId, entityType }: HistoryPanelProps) {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadHistory();
    }, [entityId, entityType]);

    const loadHistory = async () => {
        try {
            setLoading(true);
            const data = await fetchEntityHistory(entityType, entityId);
            // Handle if data is wrapped or direct array
            const historyList = Array.isArray(data) ? data : (data as any).data || [];
            setHistory(historyList);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg">
                Error loading history: {error}
            </div>
        );
    }

    if (history.length === 0) {
        return (
            <div className="text-center p-8 text-gray-500 dark:text-gray-400">
                No history available for this event.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {history.map((item) => (
                <div key={`${item.type}-${item.id}`} className="relative pl-6 pb-6 last:pb-0 border-l border-gray-200 dark:border-gray-700">
                    {/* Timeline dot */}
                    <div className={clsx(
                        "absolute -left-2.5 top-0 w-5 h-5 rounded-full border-2 flex items-center justify-center bg-white dark:bg-gray-800",
                        item.type === 'status' ? "border-blue-500 text-blue-500" : "border-emerald-500 text-emerald-500"
                    )}>
                        <div className={clsx("w-2 h-2 rounded-full", item.type === 'status' ? "bg-blue-500" : "bg-emerald-500")} />
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className={clsx(
                                    "text-xs font-semibold px-2 py-0.5 rounded uppercase tracking-wide",
                                    item.type === 'status' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                                )}>
                                    {item.action === 'STATUS_CHANGE' ? 'Status Change' : item.action}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {format(new Date(item.created_at), 'MMM d, yyyy h:mm a')}
                                </span>
                            </div>

                            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                                {item.performed_by === 'system' || item.performed_by === 'scraper' ? <Globe className="w-3 h-3" /> : <User className="w-3 h-3" />}
                                <span>{item.performed_by === '1' ? 'Admin' : item.performed_by}</span>
                            </div>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-sm">
                            {/* Render Changes */}
                            {Object.entries(item.changes).length > 0 ? (
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                            <th className="py-1 font-medium w-1/4">Field</th>
                                            <th className="py-1 font-medium w-1/3">From</th>
                                            <th className="py-1 font-medium w-1/3">To</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(item.changes).map(([field, delta]: [string, any]) => {
                                            let oldValue = '-';
                                            let newValue = '-';

                                            if (item.action === 'CREATE') {
                                                newValue = typeof delta === 'object' ? JSON.stringify(delta) : String(delta);
                                            } else if (delta && typeof delta === 'object' && ('old' in delta || 'new' in delta)) {
                                                oldValue = typeof delta.old === 'object' ? JSON.stringify(delta.old) : (delta.old === undefined || delta.old === null ? '-' : String(delta.old));
                                                newValue = typeof delta.new === 'object' ? JSON.stringify(delta.new) : (delta.new === undefined || delta.new === null ? '-' : String(delta.new));
                                            } else {
                                                // Fallback for simple key-value (assumed new value)
                                                newValue = typeof delta === 'object' ? JSON.stringify(delta) : String(delta);
                                            }

                                            return (
                                                <tr key={field} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                                                    <td className="py-2 text-gray-600 dark:text-gray-400 font-medium">{field}</td>
                                                    <td className="py-2 text-red-600 dark:text-red-400 text-xs break-all pr-2">
                                                        {oldValue !== '-' ? <span className="line-through">{oldValue}</span> : '-'}
                                                    </td>
                                                    <td className="py-2 text-emerald-600 dark:text-emerald-400 text-xs break-all">
                                                        {newValue}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            ) : (
                                <span className="text-gray-500 italic">No content changes recorded.</span>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
