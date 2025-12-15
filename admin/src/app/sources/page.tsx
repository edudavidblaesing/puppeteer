'use client';

import React, { useState, useEffect } from 'react';
import { fetchSources, toggleSource } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Check, X, Shield, RefreshCw } from 'lucide-react';
import { SourceIcon } from '@/components/ui/SourceIcon';

export default function SourcesPage() {
    const [sources, setSources] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSources();
    }, []);

    const loadSources = async () => {
        try {
            setLoading(true);
            const data = await fetchSources();
            setSources(data);
        } catch (e) {
            console.error(e);
            alert('Failed to load sources');
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async (id: number, current: boolean) => {
        try {
            await toggleSource(id, !current);
            loadSources();
        } catch (e) {
            alert('Failed to toggle source');
        }
    };

    if (loading) return <div className="p-8">Loading...</div>;

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Scrape Sources</h1>
                    <p className="text-gray-500">Manage external event sources and their active status globally.</p>
                </div>
                <Button onClick={loadSources} variant="outline" size="sm">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                </Button>
            </div>

            <div className="space-y-8">
                {/* Event Sources */}
                <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Event Sources</h2>
                    <div className="bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-200 dark:border-gray-800 overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base URL</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                {sources
                                    .filter(s => s.code !== 'original' && s.code !== 'manual' && (s.entity_type === 'event' || !s.entity_type))
                                    .map((source) => (
                                        <tr key={source.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${source.is_active
                                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                                    }`}>
                                                    {source.is_active ? 'Active' : 'Disabled'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white">
                                                {source.name}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 font-mono text-sm">
                                                {source.code}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400">
                                                <a href={source.base_url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-500">
                                                    {source.base_url}
                                                </a>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <Button
                                                    size="sm"
                                                    variant={source.is_active ? "outline" : "primary"}
                                                    onClick={() => handleToggle(source.id, source.is_active)}
                                                    className={source.is_active ? "text-red-600 hover:text-red-700" : "bg-green-600 hover:bg-green-700"}
                                                >
                                                    {source.is_active ? (
                                                        <>
                                                            <X className="w-3 h-3 mr-1" /> Disable
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Check className="w-3 h-3 mr-1" /> Enable
                                                        </>
                                                    )}
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Artist Sources */}
                <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Artist Sources</h2>
                    <div className="bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-200 dark:border-gray-800 overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base URL</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                {sources
                                    .filter(s => s.entity_type === 'artist')
                                    .map((source) => (
                                        <tr key={source.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${source.is_active
                                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                                    }`}>
                                                    {source.is_active ? 'Active' : 'Disabled'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white">
                                                {source.name}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 font-mono text-sm">
                                                {source.code}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400">
                                                <a href={source.base_url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-500">
                                                    {source.base_url}
                                                </a>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <Button
                                                    size="sm"
                                                    variant={source.is_active ? "outline" : "primary"}
                                                    onClick={() => handleToggle(source.id, source.is_active)}
                                                    className={source.is_active ? "text-red-600 hover:text-red-700" : "bg-green-600 hover:bg-green-700"}
                                                >
                                                    {source.is_active ? (
                                                        <>
                                                            <X className="w-3 h-3 mr-1" /> Disable
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Check className="w-3 h-3 mr-1" /> Enable
                                                        </>
                                                    )}
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
