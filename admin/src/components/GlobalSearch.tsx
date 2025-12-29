'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Loader, Calendar, MapPin, Users, Briefcase, Globe } from 'lucide-react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://pptr.davidblaesing.com';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'your-secure-api-key-here';

export function GlobalSearch() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const router = useRouter();
    const containerRef = useRef<HTMLDivElement>(null);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (query.length < 2) {
                setResults(null);
                return;
            }

            setLoading(true);
            try {
                const res = await fetch(`${API_URL}/db/search?q=${encodeURIComponent(query)}`, {
                    headers: {
                        'x-api-key': API_KEY,
                    }
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
    }, [query]);

    // Click outside to close
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
        // Navigate based on type
        setShowResults(false);
        setQuery('');

        switch (type) {
            case 'event':
                router.push(`/events/${item.id}`);
                break;
            case 'venue':
                router.push(`/venues/${item.id}`);
                break;
            case 'artist':
                router.push(`/artists/${item.id}`);
                break;
            case 'organizer':
                router.push(`/organizers/${item.id}`);
                break;
            case 'city':
                router.push(`/cities/${item.id}`);
                break;
        }
    };

    const hasResults = results && (
        results.events?.length > 0 ||
        results.venues?.length > 0 ||
        results.artists?.length > 0 ||
        results.organizers?.length > 0 ||
        results.cities?.length > 0
    );

    return (
        <div className="relative w-full max-w-xl group" ref={containerRef}>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-primary-500 transition-colors" />
                <input
                    type="text"
                    placeholder="Search everything... (Events, Venues, Artists)"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => { if (query.length >= 2) setShowResults(true); }}
                    className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border-none rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-primary-500/50 focus:bg-white dark:focus:bg-gray-900 transition-all"
                />
                {loading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader className="w-4 h-4 animate-spin text-primary-500" />
                    </div>
                )}
            </div>

            {/* Results Dropdown */}
            {showResults && hasResults && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden max-h-[80vh] overflow-y-auto z-50">

                    {/* Events */}
                    {results.events?.length > 0 && (
                        <div className="p-2">
                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-gray-800/50 rounded-lg mb-1">
                                Events
                            </div>
                            {results.events.map((item: any) => (
                                <button
                                    key={item.id}
                                    onClick={() => handleSelect(item, 'event')}
                                    className="w-full text-left px-3 py-2 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg flex items-center gap-3 group transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                                        <Calendar className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-primary-400">
                                            {item.name}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate">
                                            {new Date(item.date).toLocaleDateString()} • {item.venue_name || 'No Venue'}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Venues */}
                    {results.venues?.length > 0 && (
                        <div className="p-2 border-t border-gray-100 dark:border-gray-800">
                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-gray-800/50 rounded-lg mb-1">
                                Venues
                            </div>
                            {results.venues.map((item: any) => (
                                <button
                                    key={item.id}
                                    onClick={() => handleSelect(item, 'venue')}
                                    className="w-full text-left px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg flex items-center gap-3 group transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                                        <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                                            {item.name}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate">
                                            {item.city}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Artists */}
                    {results.artists?.length > 0 && (
                        <div className="p-2 border-t border-gray-100 dark:border-gray-800">
                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-gray-800/50 rounded-lg mb-1">
                                Artists
                            </div>
                            {results.artists.map((item: any) => (
                                <button
                                    key={item.id}
                                    onClick={() => handleSelect(item, 'artist')}
                                    className="w-full text-left px-3 py-2 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg flex items-center gap-3 group transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                                        <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-purple-600 dark:group-hover:text-purple-400">
                                            {item.name}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Organizers */}
                    {results.organizers?.length > 0 && (
                        <div className="p-2 border-t border-gray-100 dark:border-gray-800">
                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-gray-800/50 rounded-lg mb-1">
                                Organizers
                            </div>
                            {results.organizers.map((item: any) => (
                                <button
                                    key={item.id}
                                    onClick={() => handleSelect(item, 'organizer')}
                                    className="w-full text-left px-3 py-2 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg flex items-center gap-3 group transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                                        <Briefcase className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-orange-600 dark:group-hover:text-orange-400">
                                            {item.name}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Cities */}
                    {results.cities?.length > 0 && (
                        <div className="p-2 border-t border-gray-100 dark:border-gray-800">
                            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-gray-800/50 rounded-lg mb-1">
                                Cities
                            </div>
                            {results.cities.map((item: any) => (
                                <button
                                    key={item.id}
                                    onClick={() => handleSelect(item, 'city')}
                                    className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg flex items-center gap-3 group transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                                        <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                            {item.name}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate">{item.country}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                </div>
            )}
        </div>
    );
}
