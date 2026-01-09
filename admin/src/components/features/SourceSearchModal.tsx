import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Loader2, Search, Link as LinkIcon, AlertTriangle } from 'lucide-react';
import { SourceIcon } from '@/components/ui/SourceIcon';
import * as api from '@/lib/api';

interface SourceSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    eventId: string;
    onLinkParams: (params: any) => Promise<void>;
}

export function SourceSearchModal({ isOpen, onClose, eventId, onLinkParams }: SourceSearchModalProps) {
    const [query, setQuery] = useState('');
    const [source, setSource] = useState('tm'); // Default
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSearch = async () => {
        if (!query.trim()) return;
        setLoading(true);
        setError(null);
        try {
            // We will call a new API endpoint for searching
            const data = await api.searchSourceEvents(source, query);
            setResults(data);
        } catch (err) {
            setError('Failed to search source');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleLink = async (sourceEventId: string, sourceCode: string) => {
        try {
            await onLinkParams({ sourceCode, sourceEventId });
            onClose();
        } catch (err) {
            setError('Failed to link source');
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Link Additional Source"
            size="lg"
        >
            <div className="space-y-4">
                <div className="flex gap-2">
                    <select
                        className="border rounded px-2 py-1 bg-white dark:bg-gray-800 dark:border-gray-700"
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                    >
                        <option value="tm">Ticketmaster</option>
                        <option value="ra">Resident Advisor</option>
                    </select>
                    <div className="flex-1 flex gap-2">
                        <div className="flex-1 relative">
                            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                            <Input
                                placeholder="Search by name or ID..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                className="pl-9"
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            />
                        </div>
                        <Button onClick={handleSearch} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : 'Search'}</Button>
                    </div>
                </div>

                {error && <div className="text-red-500 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</div>}

                <div className="max-h-[300px] overflow-y-auto space-y-2">
                    {results.map((item) => (
                        <div key={item.id} className="border border-gray-200 dark:border-gray-700 p-3 rounded flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 bg-white dark:bg-gray-800">
                            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-900 rounded flex-shrink-0 overflow-hidden relative">
                                {item.image ? (
                                    <img src={item.image} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-gray-400">
                                        <SourceIcon sourceCode={source} className="w-6 h-6 opacity-20" />
                                    </div>
                                )}
                                <div className="absolute top-0 right-0 p-1 bg-black/50 rounded-bl">
                                    <SourceIcon sourceCode={source} className="w-3 h-3 text-white" />
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-medium truncate text-gray-900 dark:text-gray-100">{item.title}</h4>
                                <p className="text-xs text-gray-500">{item.date} • {item.venue}</p>
                                <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:text-blue-400 hover:underline truncate block">{item.url}</a>
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => handleLink(item.id, source)}>
                                <LinkIcon className="w-4 h-4 mr-1" /> Link
                            </Button>
                        </div>
                    ))}
                    {results.length === 0 && !loading && query && (
                        <div className="text-center text-gray-500 py-8">No results found</div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
