import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, MapPin, Music, User } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { useDebounce } from '@/hooks/useDebounce';
import { searchExternal } from '@/lib/api';
import { SourceIcon } from '@/components/ui/SourceIcon';
import clsx from 'clsx';
import { useFloating, autoUpdate, offset, flip, shift, useDismiss, useInteractions, FloatingPortal, FloatingFocusManager, useRole } from '@floating-ui/react';

interface AutoFillResult {
    source: string;
    id: string;
    name: string;
    image_url?: string;
    city?: string;
    country?: string;
    lat?: number;
    lon?: number;
    genres?: string[];
    raw?: any;
}

interface AutoFillSearchProps {
    type: 'venue' | 'artist' | 'organizer' | 'city';
    onSelect: (result: AutoFillResult) => void;
    placeholder?: string;
    className?: string;
    filter?: (result: AutoFillResult) => boolean;
}

export function AutoFillSearch({ type, onSelect, placeholder, className, filter }: AutoFillSearchProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<AutoFillResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const debouncedQuery = useDebounce(query, 500);

    const { refs, floatingStyles, context } = useFloating({
        open: isOpen,
        onOpenChange: setIsOpen,
        middleware: [offset(4), flip(), shift()],
        whileElementsMounted: autoUpdate,
        placement: 'bottom-start'
    });

    const dismiss = useDismiss(context);
    const role = useRole(context, { role: 'listbox' });

    const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
        dismiss,
        role
    ]);


    useEffect(() => {
        const fetchResults = async () => {
            if (!debouncedQuery || debouncedQuery.length < 2) {
                setResults([]);
                setIsOpen(false);
                return;
            }

            setIsLoading(true);
            try {
                const data = await searchExternal(type, debouncedQuery);
                console.log('[AutoFill] Received data:', data);

                let filteredData = data;
                if (filter) {
                    filteredData = data.filter(filter);
                }

                setResults(filteredData);
                if (filteredData.length > 0) {
                    setIsOpen(true);
                } else {
                    setIsOpen(false);
                }
            } catch (error) {
                console.error('Auto-fill search error:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchResults();
    }, [debouncedQuery, type]);

    const handleSelect = (result: AutoFillResult) => {
        onSelect(result);
        setQuery('');
        setIsOpen(false);
    };

    return (
        <>
            <div className="relative" ref={refs.setReference} {...getReferenceProps()}>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            // Close if clearing
                            if (e.target.value.length < 2) setIsOpen(false);
                        }}
                        placeholder={placeholder || `Search ${type} to auto-fill...`}
                        className={clsx("pl-9 bg-purple-50/50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-800 focus:ring-purple-500", className)}
                    />
                    {isLoading && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
                        </div>
                    )}
                </div>
            </div>

            <FloatingPortal>
                {isOpen && results.length > 0 && (
                    <FloatingFocusManager context={context} modal={false} initialFocus={-1}>
                        <div
                            ref={refs.setFloating}
                            style={floatingStyles}
                            {...getFloatingProps()}
                            className="z-[9999] w-[var(--radix-popper-anchor-width)] min-w-[300px] bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 max-h-60 overflow-auto outline-none"
                        >
                            {results.map((result, idx) => (
                                <button
                                    type="button"
                                    key={`${result.source}-${result.id}-${idx}`}
                                    onClick={() => handleSelect(result)}
                                    // {...getItemProps()} // Optional: for advanced keyboard nav
                                    className="w-full text-left px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors border-b last:border-0 border-gray-100 dark:border-gray-700/50 focus:bg-gray-50 dark:focus:bg-gray-700 outline-none"
                                >
                                    <div className="flex-shrink-0">
                                        {result.image_url ? (
                                            <img src={result.image_url} alt={result.name} className="w-8 h-8 rounded-full object-cover" />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400">
                                                {type === 'artist' ? <Music className="w-4 h-4" /> : type === 'organizer' ? <User className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{result.name}</div>
                                        <div className="text-xs text-gray-500 truncate flex items-center gap-1">
                                            <SourceIcon sourceCode={result.source} className="w-3 h-3" />
                                            <span>{result.source.toUpperCase()}</span>
                                            {result.city && <span>• {result.city}, {result.country}</span>}
                                            {result.genres && result.genres.length > 0 && <span>• {result.genres[0]}</span>}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </FloatingFocusManager>
                )}
            </FloatingPortal>
        </>
    );
}
