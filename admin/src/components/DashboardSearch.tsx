'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Loader, Calendar, MapPin, Users, Briefcase, Globe, Filter, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://pptr.davidblaesing.com';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'your-secure-api-key-here';

interface DashboardSearchProps {
    activeTab: string; // 'overview' | 'events' | 'venues' etc.
    localSearchTerm: string;
    onLocalSearch: (term: string) => void;
    className?: string;
}

export function DashboardSearch({ activeTab, localSearchTerm, onLocalSearch, className }: DashboardSearchProps) {
    const router = useRouter();
    const containerRef = useRef<HTMLDivElement>(null);

    // Mode Logic
    const hasLocalContext = activeTab !== 'overview';

    // If we are in overview, we are always global.
    // If in entity list, default to local, but allow toggle.
    // We track the INTENDED scope.
    const [scope, setScope] = useState<'global' | 'local'>(hasLocalContext ? 'local' : 'global');

    // Sync scope when tab changes
    useEffect(() => {
        setScope(activeTab === 'overview' ? 'global' : 'local');
    }, [activeTab]);

    // Global Search State
    const [globalQuery, setGlobalQuery] = useState('');
    const [results, setResults] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [showResults, setShowResults] = useState(false);

    // Determines the effective query value and change handler
    const isLocal = scope === 'local';
    const query = isLocal ? localSearchTerm : globalQuery;

    const handleSearchChange = (val: string) => {
        if (isLocal) {
            onLocalSearch(val);
        } else {
            setGlobalQuery(val);
        }
    };

    // Global Search Effect
    useEffect(() => {
        if (scope === 'local') return; // Don't run global search logic if local

        const timer = setTimeout(async () => {
            if (globalQuery.length < 2) {
                setResults(null);
                return;
            }

            setLoading(true);
            try {
                const res = await fetch(`${API_URL}/db/search?q=${encodeURIComponent(globalQuery)}`, {
                    headers: { 'x-api-key': API_KEY }
                });
                if (res.ok) {
                    const data = await res.json();
                    setResults(data);
                    setShowResults(true);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [globalQuery, scope]);

    // Click outside handler
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleSelect = (item: any, type: string) => {
        setShowResults(false);
        setGlobalQuery('');

        // Navigate
        switch (type) {
            case 'event': router.push(`/events/${item.id}`); break;
            case 'venue': router.push(`/venues/${item.id}`); break;
            case 'artist': router.push(`/artists/${item.id}`); break;
            case 'organizer': router.push(`/organizers/${item.id}`); break;
            case 'city': router.push(`/cities/${item.id}`); break;
        }
    };

    const hasResults = results && (
        results.events?.length > 0 ||
        results.venues?.length > 0 ||
        results.artists?.length > 0 ||
        results.organizers?.length > 0 ||
        results.cities?.length > 0
    );

    const getPlaceholder = () => {
        if (scope === 'global') return 'Search everything... (Events, Venues, Artists)';
        switch (activeTab) {
            case 'events': return 'Filter events by name...';
            case 'venues': return 'Filter venues by name or city...';
            case 'artists': return 'Filter artists by name...';
            case 'organizers': return 'Filter organizers...';
            case 'cities': return 'Filter cities...';
            default: return 'Filter list...';
        }
    };

    return (
        <div className={clsx("relative w-full max-w-xl group", className)} ref={containerRef}>
            <div className="relative flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl transition-all focus-within:ring-2 focus-within:ring-primary-500/50 focus-within:bg-white dark:focus-within:bg-gray-900">

                {/* Scope Switcher (Only if local context exists) */}
                {hasLocalContext && (
                    <div className="flex items-center pl-2 pr-1 border-r border-gray-200 dark:border-gray-700">
                        <button
                            onClick={() => {
                                const newScope = scope === 'local' ? 'global' : 'local';
                                setScope(newScope);
                                // Clear the OTHER query when switching? Maybe not.
                                if (newScope === 'global' && globalQuery.length >= 2) setShowResults(true);
                            }}
                            className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        >
                            {scope === 'local' ? (
                                <>
                                    <Filter className="w-3.5 h-3.5" />
                                    <span className="capitalize">{activeTab}</span>
                                </>
                            ) : (
                                <>
                                    <Globe className="w-3.5 h-3.5" />
                                    <span>Global</span>
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* Search Icon (if no scope switcher) */}
                {!hasLocalContext && (
                    <div className="pl-3 pr-2">
                        <Search className="w-4 h-4 text-gray-400" />
                    </div>
                )}

                {/* Input */}
                <input
                    type="text"
                    placeholder={getPlaceholder()}
                    value={query}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onFocus={() => { if (scope === 'global' && globalQuery.length >= 2) setShowResults(true); }}
                    className="flex-1 w-full px-3 py-2 bg-transparent border-none text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-0"
                />

                {/* Loading / Clear */}
                <div className="pr-3 flex items-center">
                    {loading && scope === 'global' ? (
                        <Loader className="w-4 h-4 animate-spin text-primary-500" />
                    ) : query.length > 0 ? (
                        <button
                            onClick={() => handleSearchChange('')}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    ) : null}
                </div>
            </div>

            {/* Global Results Dropdown */}
            {scope === 'global' && showResults && (hasResults ? (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden max-h-[80vh] overflow-y-auto z-50 animate-in fade-in zoom-in-95 duration-100">
                    {/* Events */}
                    {results.events?.length > 0 && (
                        <div className="p-2">
                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-gray-800/50 rounded-lg mb-1">Events</div>
                            {results.events.map((item: any) => (
                                <button key={item.id} onClick={() => handleSelect(item, 'event')} className="w-full text-left px-3 py-2 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg flex items-center gap-3 group transition-colors">
                                    <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                                        <Calendar className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400">{item.name}</p>
                                        <p className="text-xs text-gray-500 truncate">{new Date(item.date).toLocaleDateString()} • {item.venue_name || 'No Venue'}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Venues */}
                    {results.venues?.length > 0 && (
                        <div className="p-2 border-t border-gray-100 dark:border-gray-800">
                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-gray-800/50 rounded-lg mb-1">Venues</div>
                            {results.venues.map((item: any) => (
                                <button key={item.id} onClick={() => handleSelect(item, 'venue')} className="w-full text-left px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg flex items-center gap-3 group transition-colors">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                                        <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400">{item.name}</p>
                                        <p className="text-xs text-gray-500 truncate">{item.city} • {item.address}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Artists */}
                    {results.artists?.length > 0 && (
                        <div className="p-2 border-t border-gray-100 dark:border-gray-800">
                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-gray-800/50 rounded-lg mb-1">Artists</div>
                            {results.artists.map((item: any) => (
                                <button key={item.id} onClick={() => handleSelect(item, 'artist')} className="w-full text-left px-3 py-2 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg flex items-center gap-3 group transition-colors">
                                    <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                                        <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-purple-600 dark:group-hover:text-purple-400">{item.name}</p>
                                        <p className="text-xs text-gray-500 truncate">{item.genres?.join(', ')}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Organizers */}
                    {results.organizers?.length > 0 && (
                        <div className="p-2 border-t border-gray-100 dark:border-gray-800">
                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-gray-800/50 rounded-lg mb-1">Organizers</div>
                            {results.organizers.map((item: any) => (
                                <button key={item.id} onClick={() => handleSelect(item, 'organizer')} className="w-full text-left px-3 py-2 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg flex items-center gap-3 group transition-colors">
                                    <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                                        <Briefcase className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-orange-600 dark:group-hover:text-orange-400">{item.name}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Cities */}
                    {results.cities?.length > 0 && (
                        <div className="p-2 border-t border-gray-100 dark:border-gray-800">
                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-gray-800/50 rounded-lg mb-1">Cities</div>
                            {results.cities.map((item: any) => (
                                <button key={item.id} onClick={() => handleSelect(item, 'city')} className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg flex items-center gap-3 group transition-colors">
                                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                                        <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">{item.name}</p>
                                        <p className="text-xs text-gray-500 truncate">{item.country}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                query.length >= 2 && !loading && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 p-4 text-center z-50">
                        <p className="text-sm text-gray-500">No results found.</p>
                    </div>
                )
            ))}
        </div>
    );
}
