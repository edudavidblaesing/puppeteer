'use client';

import { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { Event } from '@/types';

// Extend Leaflet types for MarkerClusterGroup
declare module 'leaflet' {
  function markerClusterGroup(options?: any): any;
}

// Berlin coordinates for demo
const CITY_COORDS: Record<string, [number, number]> = {
  Berlin: [52.52, 13.405],
  Hamburg: [53.5511, 9.9937],
  default: [52.52, 13.405],
};

// Venue coordinates (approximate for demo - in production, geocode actual addresses)
const VENUE_COORDS: Record<string, [number, number]> = {
  // Berlin venues
  'Tresor': [52.5103, 13.4198],
  'Berghain': [52.5112, 13.4428],
  'Watergate': [52.5013, 13.4432],
  'Sisyphos': [52.4931, 13.4893],
  'Kater Blau': [52.5127, 13.4281],
  'Griessmuehle': [52.4789, 13.4512],
  'RSO.Berlin': [52.4890, 13.4412],
  'about blank': [52.5063, 13.4588],
  'Haus der Visionäre': [52.4957, 13.4532],
  'Ritter Butzke': [52.5018, 13.4108],
  'Wilde Renate': [52.5067, 13.4577],
  'Salon zur Wilden Renate': [52.5067, 13.4577],
  'OHM': [52.5103, 13.4198],
  'Suicide Circus': [52.5097, 13.4568],
  'Arena Club': [52.4972, 13.4543],
  // Hamburg venues
  'Übel & Gefährlich': [53.5511, 9.9629],
  'PAL': [53.5506, 9.9485],
  'Hafenklang': [53.5461, 9.9587],
  'Fundbureau': [53.5623, 9.9622],
  'Moloch': [53.5540, 9.9730],
  'Golden Pudel': [53.5461, 9.9543],
};

interface EventMapProps {
  events: Event[];
  onEventClick?: (event: Event) => void;
  selectedEventId?: string;
}

export default function EventMap({ events, onEventClick, selectedEventId }: EventMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<any>(null);

  // Group events by venue and get coordinates
  const eventLocations = useMemo(() => {
    const locations: {
      event: Event;
      coords: [number, number];
      isPublished: boolean;
    }[] = [];

    events.forEach((event) => {
      // Try to get coordinates from venue name
      const venueName = event.venue_name || '';
      let coords: [number, number] | null = null;

      // Check known venues
      for (const [name, venueCoords] of Object.entries(VENUE_COORDS)) {
        if (venueName.toLowerCase().includes(name.toLowerCase())) {
          coords = venueCoords;
          break;
        }
      }

      // Fallback to city center with random offset
      if (!coords) {
        const cityCoords = CITY_COORDS[event.venue_city || ''] || CITY_COORDS.default;
        const offset = () => (Math.random() - 0.5) * 0.02;
        coords = [cityCoords[0] + offset(), cityCoords[1] + offset()];
      }

      locations.push({
        event,
        coords,
        isPublished: event.is_published || false,
      });
    });

    return locations;
  }, [events]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Initialize map
    const map = L.map(mapContainerRef.current).setView([52.52, 13.405], 11);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // Create marker cluster group
    markersRef.current = L.markerClusterGroup({
      chunkedLoading: true,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      maxClusterRadius: 50,
      iconCreateFunction: (cluster: any) => {
        const childCount = cluster.getChildCount();
        const publishedCount = cluster.getAllChildMarkers().filter((m: any) => m.options.isPublished).length;
        
        let className = 'marker-cluster marker-cluster-';
        if (childCount < 10) {
          className += 'small';
        } else if (childCount < 30) {
          className += 'medium';
        } else {
          className += 'large';
        }

        // Add published indicator
        if (publishedCount === childCount) {
          className += ' all-published';
        } else if (publishedCount > 0) {
          className += ' some-published';
        }

        return L.divIcon({
          html: `<div><span>${childCount}</span></div>`,
          className,
          iconSize: L.point(40, 40),
        });
      },
    });

    map.addLayer(markersRef.current);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers when events change
  useEffect(() => {
    if (!markersRef.current) return;

    markersRef.current.clearLayers();

    eventLocations.forEach(({ event, coords, isPublished }) => {
      const icon = L.divIcon({
        className: `custom-marker ${isPublished ? 'published' : 'scraped'}`,
        html: `
          <div class="w-8 h-8 rounded-full flex items-center justify-center shadow-lg transform -translate-x-1/2 -translate-y-1/2 ${
            isPublished
              ? 'bg-primary-500 border-2 border-white'
              : 'bg-gray-400 border-2 border-gray-300'
          }">
            <span class="text-white text-xs font-bold">${isPublished ? '✓' : '○'}</span>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });

      const marker = L.marker(coords, {
        icon,
        isPublished,
      } as any);

      const popupContent = `
        <div class="p-3">
          <h3 class="font-semibold text-sm mb-1 line-clamp-2">${event.title}</h3>
          ${event.venue_name ? `<p class="text-xs text-gray-600 mb-1">📍 ${event.venue_name}</p>` : ''}
          ${event.date ? `<p class="text-xs text-gray-600 mb-1">📅 ${new Date(event.date).toLocaleDateString()}</p>` : ''}
          ${event.artists ? `<p class="text-xs text-gray-600 mb-2">🎵 ${event.artists}</p>` : ''}
          <div class="flex items-center justify-between">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              isPublished ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }">
              ${isPublished ? 'Published' : 'Draft'}
            </span>
            ${
              event.content_url
                ? `<a href="${event.content_url}" target="_blank" class="text-xs text-primary-600 hover:underline">View →</a>`
                : ''
            }
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, {
        className: 'event-popup',
        maxWidth: 300,
      });

      marker.on('click', () => {
        if (onEventClick) {
          onEventClick(event);
        }
      });

      markersRef.current?.addLayer(marker);
    });

    // Fit bounds if we have events
    if (eventLocations.length > 0 && mapRef.current) {
      const bounds = L.latLngBounds(eventLocations.map((l) => l.coords));
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [eventLocations, onEventClick]);

  // Highlight selected event
  useEffect(() => {
    if (!selectedEventId || !mapRef.current) return;

    const selected = eventLocations.find((l) => l.event.id === selectedEventId);
    if (selected) {
      mapRef.current.setView(selected.coords, 15, { animate: true });
    }
  }, [selectedEventId, eventLocations]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full rounded-lg" />
      
      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 z-[1000]">
        <h4 className="text-xs font-semibold text-gray-700 mb-2">Legend</h4>
        <div className="space-y-1.5">
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-primary-500 border-2 border-white shadow mr-2"></div>
            <span className="text-xs text-gray-600">Published</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-gray-400 border-2 border-gray-300 shadow mr-2"></div>
            <span className="text-xs text-gray-600">Scraped (Draft)</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-3 z-[1000]">
        <div className="text-xs text-gray-600">
          <span className="font-semibold text-gray-900">{events.length}</span> events
          <span className="mx-1">•</span>
          <span className="font-semibold text-green-600">
            {events.filter((e) => e.is_published).length}
          </span>{' '}
          published
        </div>
      </div>
    </div>
  );
}
