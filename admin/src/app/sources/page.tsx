'use client';

import React, { useState, useEffect } from 'react';
import { fetchSources, updateSource } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Check, X, RefreshCw, Calendar, MapPin, Users, Music } from 'lucide-react';
import { SourceIcon } from '@/components/ui/SourceIcon';

type Scope = 'event' | 'venue' | 'organizer' | 'artist';

const SCOPES: { id: Scope; label: string; icon: any }[] = [
    { id: 'event', label: 'Events', icon: Calendar },
    { id: 'venue', label: 'Venues', icon: MapPin },
    { id: 'organizer', label: 'Organizers', icon: Users },
    { id: 'artist', label: 'Artists', icon: Music },
];

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

    const handleToggleActive = async (id: number, current: boolean) => {
        try {
            await updateSource(id, { is_active: !current });
            setSources(prev => prev.map(s => s.id === id ? { ...s, is_active: !current } : s));
        } catch (e) {
            alert('Failed to toggle source');
        }
    };

    const handleScopeChange = async (source: any, scope: Scope, checked: boolean) => {
        try {
            // Default to entity_type logic if enabled_scopes missing
            let currentScopes = source.enabled_scopes;
            if (!currentScopes) {
                if (source.entity_type === 'event') currentScopes = ['event', 'venue', 'organizer'];
                else if (source.entity_type === 'artist') currentScopes = ['artist'];
                else currentScopes = [];
            }

            let newScopes = [...currentScopes];
            if (checked) {
                if (!newScopes.includes(scope)) newScopes.push(scope);
            } else {
                newScopes = newScopes.filter((s: string) => s !== scope);
            }

            // Update in UI immediately for responsiveness
            setSources(prev => prev.map(s => s.id === source.id ? { ...s, enabled_scopes: newScopes } : s));

            // Persist
            await updateSource(source.id, { enabled_scopes: newScopes });
        } catch (e) {
            console.error(e);
            alert('Failed to update scope');
            loadSources(); // Revert on error
        }
    };

    const isScopeSupported = (source: any, scope: Scope) => {
        if (source.scopes) return source.scopes.includes(scope);
        // Fallback logic for legacy/during migration
        if (['ra', 'tm', 'tickettailor', 'dice', 'eventbrite'].includes(source.code)) {
            return true; // Assume all supported for major scrapers
        }
        if (source.code === 'musicbrainz' || source.code === 'spotify') {
            return scope === 'artist';
        }
        if (source.entity_type === 'event') return ['event', 'venue', 'organizer'].includes(scope);
        if (source.entity_type === 'artist') return scope === 'artist';
        return false;
    };

    const isScopeEnabled = (source: any, scope: Scope) => {
        if (source.enabled_scopes) return source.enabled_scopes.includes(scope);
        // Fallback defaults
        if (isScopeSupported(source, scope)) return true;
        return false;
    };

    if (loading) return <div className="p-8">Loading...</div>;

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Scrape Sources Configuration</h1>
                    <p className="text-gray-500">Configure which entities are scraped from each source globally.</p>
                </div>
                <Button onClick={loadSources} variant="outline" size="sm">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                </Button>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-200 dark:border-gray-800 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-64">Source</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active Scopes</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                        {sources
                            .filter(s => s.code !== 'original' && s.code !== 'manual')
                            .map((source) => (
                                <tr key={source.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <button
                                            onClick={() => handleToggleActive(source.id, source.is_active)}
                                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-transform active:scale-95 ${source.is_active
                                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                                }`}
                                        >
                                            {source.is_active ? 'Active' : 'Disabled'}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                                                <SourceIcon sourceCode={source.code} className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="font-medium text-gray-900 dark:text-white">{source.name}</div>
                                                <a href={source.base_url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-indigo-500 font-mono">
                                                    {source.code}
                                                </a>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-4">
                                            {SCOPES.map(scope => {
                                                const supported = isScopeSupported(source, scope.id);
                                                const enabled = isScopeEnabled(source, scope.id);
                                                const Icon = scope.icon;

                                                if (!supported) return null;

                                                return (
                                                    <label key={scope.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${!source.is_active ? 'opacity-50 cursor-not-allowed' :
                                                        enabled
                                                            ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-800'
                                                            : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                                                        }`}>
                                                        <input
                                                            type="checkbox"
                                                            checked={enabled}
                                                            onChange={(e) => handleScopeChange(source, scope.id, e.target.checked)}
                                                            disabled={!source.is_active}
                                                            className="rounded text-indigo-600 focus:ring-indigo-500"
                                                        />
                                                        <Icon className={`w-3.5 h-3.5 ${enabled ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
                                                        <span className={`text-sm ${enabled ? 'text-indigo-900 dark:text-indigo-100 font-medium' : 'text-gray-500'}`}>
                                                            {scope.label}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={source.is_active}
                                                onChange={() => handleToggleActive(source.id, source.is_active)}
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                                        </label>
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
