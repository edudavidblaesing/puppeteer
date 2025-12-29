
import React from 'react';
import { Venue } from '@/types';
import { MapPin, Building2, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface RelatedVenuesListProps {
    venues?: Venue[];
    title?: string;
    emptyMessage?: string;
}

export function RelatedVenuesList({
    venues = [],
    title = "Associated Venues",
    emptyMessage = "No associated venues found."
}: RelatedVenuesListProps) {

    if (!venues || venues.length === 0) {
        return (
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-6 text-center border border-gray-100 dark:border-gray-800">
                <p className="text-gray-500 dark:text-gray-400 text-sm">{emptyMessage}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Building2 className="w-4 h-4" /> {title} ({venues.length})
            </h3>

            <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                    {venues.map((venue) => (
                        <div
                            key={venue.id}
                            className="p-3 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors flex items-center justify-between group"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="mb-1">
                                    <Link
                                        href={`/venues?search=${encodeURIComponent(venue.name)}`}
                                        className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate hover:text-primary-600 dark:hover:text-primary-400 block"
                                    >
                                        {venue.name}
                                    </Link>
                                </div>

                                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                                    {(venue.city || venue.country) && (
                                        <div className="flex items-center gap-1">
                                            <MapPin className="w-3 h-3" />
                                            <span>
                                                {venue.city}{venue.city && venue.country ? ', ' : ''}{venue.country}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <Link
                                href={`/venues?search=${encodeURIComponent(venue.name)}`}
                                className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-primary-600 transition-all"
                                title="View Venue"
                            >
                                <ExternalLink className="w-4 h-4" />
                            </Link>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
