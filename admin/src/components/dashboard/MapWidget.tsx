'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Event, City } from '@/types';
import { MapPin } from 'lucide-react';

// Dynamic import for Leaflet map to avoid SSR issues
const EventMap = dynamic(() => import('@/components/EventMap'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-400">
            Loading Map...
        </div>
    )
});

interface MapWidgetProps {
    events?: Event[];
    cities?: City[];
}

export function MapWidget({ events = [], cities = [] }: MapWidgetProps) {
    return (
        <div className="bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden relative h-full flex flex-col">
            <div className="absolute top-4 left-4 z-10 bg-white/90 dark:bg-gray-800/90 backdrop-blur px-3 py-1 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 pointer-events-none">
                <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Live Event Map</span>
                </div>
            </div>
            <div className="flex-1 w-full h-full min-h-[300px]">
                <EventMap events={events} cities={cities} />
            </div>
        </div>
    );
}
