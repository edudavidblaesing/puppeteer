'use client';

import { useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import clsx from 'clsx';
import 'leaflet.markercluster';
import { Event } from '@/types';

// Extend Leaflet types for MarkerClusterGroup
declare module 'leaflet' {
  function markerClusterGroup(options?: any): any;
}

// City coordinates with zoom levels
const CITY_CONFIG: Record<string, { coords: [number, number]; zoom: number }> = {
  Berlin: { coords: [52.52, 13.405], zoom: 12 },
  Hamburg: { coords: [53.5511, 9.9937], zoom: 12 },
  London: { coords: [51.5074, -0.1278], zoom: 11 },
  Paris: { coords: [48.8566, 2.3522], zoom: 12 },
  Amsterdam: { coords: [52.3676, 4.9041], zoom: 12 },
  Barcelona: { coords: [41.3851, 2.1734], zoom: 12 },
};

// Europe overview for multi-city view
const EUROPE_VIEW = { coords: [50.5, 10.0] as [number, number], zoom: 5 };

// Venue coordinates (approximate)
const VENUE_COORDS: Record<string, [number, number]> = {
  'Tresor': [52.5103, 13.4198],
  'Berghain': [52.5112, 13.4428],
  'Watergate': [52.5013, 13.4432],
  'Sisyphos': [52.4931, 13.4893],
  'Kater Blau': [52.5127, 13.4281],
  'RSO.Berlin': [52.4890, 13.4412],
  'about blank': [52.5063, 13.4588],
  'Haus der Visionäre': [52.4957, 13.4532],
  'Ritter Butzke': [52.5018, 13.4108],
  'Wilde Renate': [52.5067, 13.4577],
  'OHM': [52.5103, 13.4198],
  'Suicide Circus': [52.5097, 13.4568],
  'Arena Club': [52.4972, 13.4543],
  'Lark': [52.5127, 13.4214],
  'Renate': [52.5067, 13.4577],
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
  onCityChange?: (city: string) => void;
  selectedCity?: string;
  selectedEventId?: string;
}

export default function EventMap({ 
  events, 
  onEventClick, 
  onCityChange,
  selectedCity,
  selectedEventId 
}: EventMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<any>(null);
  const cityMarkersRef = useRef<L.LayerGroup | null>(null);

  // Group events by city
  const eventsByCity = useMemo(() => {
    const grouped: Record<string, Event[]> = {};
    events.forEach((event) => {
      const city = event.venue_city || 'Unknown';
      if (!grouped[city]) grouped[city] = [];
      grouped[city].push(event);
    });
    return grouped;
  }, [events]);

  // Get coordinates for an event
  const getEventCoords = useCallback((event: Event): [number, number] => {
    const venueName = event.venue_name || '';
    
    for (const [name, coords] of Object.entries(VENUE_COORDS)) {
      if (venueName.toLowerCase().includes(name.toLowerCase())) {
        return coords;
      }
    }

    const city = event.venue_city || '';
    const cityConfig = CITY_CONFIG[city];
    if (cityConfig) {
      const offset = () => (Math.random() - 0.5) * 0.01;
      return [cityConfig.coords[0] + offset(), cityConfig.coords[1] + offset()];
    }

    return [52.52, 13.405];
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialView = selectedCity && CITY_CONFIG[selectedCity] 
      ? CITY_CONFIG[selectedCity] 
      : EUROPE_VIEW;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
    }).setView(initialView.coords, initialView.zoom);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OSM © CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    cityMarkersRef.current = L.layerGroup().addTo(map);

    markersRef.current = L.markerClusterGroup({
      chunkedLoading: true,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      maxClusterRadius: 40,
      disableClusteringAtZoom: 15,
      iconCreateFunction: (cluster: any) => {
        const childCount = cluster.getChildCount();
        const markers = cluster.getAllChildMarkers();
        const publishedCount = markers.filter((m: any) => m.options.isPublished).length;
        
        let sizeClass = 'w-10 h-10 text-sm';
        if (childCount >= 30) sizeClass = 'w-14 h-14 text-base';
        else if (childCount >= 10) sizeClass = 'w-12 h-12 text-sm';

        const ratio = publishedCount / childCount;
        let bgColor = 'bg-gray-500';
        if (ratio === 1) bgColor = 'bg-emerald-500';
        else if (ratio > 0) bgColor = 'bg-amber-500';

        return L.divIcon({
          html: `<div class="${sizeClass} ${bgColor} rounded-full flex items-center justify-center text-white font-bold shadow-lg border-2 border-white">${childCount}</div>`,
          className: 'custom-cluster-icon',
          iconSize: L.point(40, 40),
        });
      },
    });

    map.addLayer(markersRef.current);

    map.on('zoomend moveend', () => {
      const zoom = map.getZoom();
      const center = map.getCenter();

      if (zoom >= 10 && onCityChange) {
        let closestCity = '';
        let minDist = Infinity;
        
        for (const [city, config] of Object.entries(CITY_CONFIG)) {
          const dist = Math.sqrt(
            Math.pow(center.lat - config.coords[0], 2) + 
            Math.pow(center.lng - config.coords[1], 2)
          );
          if (dist < minDist && dist < 0.5) {
            minDist = dist;
            closestCity = city;
          }
        }

        if (closestCity) {
          onCityChange(closestCity);
        }
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [onCityChange, selectedCity]);

  // Update markers
  useEffect(() => {
    if (!markersRef.current || !cityMarkersRef.current || !mapRef.current) return;

    markersRef.current.clearLayers();
    cityMarkersRef.current.clearLayers();

    const zoom = mapRef.current.getZoom();

    if (zoom < 8) {
      Object.entries(eventsByCity).forEach(([city, cityEvents]) => {
        const config = CITY_CONFIG[city];
        if (!config) return;

        const publishedCount = cityEvents.filter(e => e.is_published).length;
        const totalCount = cityEvents.length;
        const borderColor = publishedCount === totalCount ? 'border-emerald-500' : 
          publishedCount > 0 ? 'border-amber-500' : 'border-gray-400';

        const marker = L.marker(config.coords, {
          icon: L.divIcon({
            html: `
              <div class="w-16 h-16 bg-white rounded-full shadow-xl border-4 ${borderColor} flex flex-col items-center justify-center cursor-pointer hover:scale-110 transition-transform">
                <span class="text-lg font-bold text-gray-800">${totalCount}</span>
                <span class="text-xs text-gray-500">${city}</span>
              </div>
            `,
            className: 'city-marker',
            iconSize: [64, 64],
            iconAnchor: [32, 32],
          }),
        });

        marker.on('click', () => {
          mapRef.current?.setView(config.coords, config.zoom, { animate: true });
          if (onCityChange) onCityChange(city);
        });

        cityMarkersRef.current?.addLayer(marker);
      });
    } else {
      events.forEach((event) => {
        const coords = getEventCoords(event);
        const isPublished = event.is_published || false;

        const icon = L.divIcon({
          className: 'custom-marker',
          html: `
            <div class="w-8 h-8 ${isPublished ? 'bg-emerald-500' : 'bg-gray-400'} rounded-full flex items-center justify-center shadow-lg border-2 border-white cursor-pointer hover:scale-110 transition-transform">
              <span class="text-white text-xs">${isPublished ? '✓' : '○'}</span>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.marker(coords, { icon, isPublished } as any);

        const popupContent = `
          <div class="p-2 min-w-[200px]">
            <h3 class="font-semibold text-sm mb-1">${event.title}</h3>
            ${event.venue_name ? `<p class="text-xs text-gray-600 mb-1">📍 ${event.venue_name}</p>` : ''}
            ${event.date ? `<p class="text-xs text-gray-600 mb-1">📅 ${new Date(event.date).toLocaleDateString()}</p>` : ''}
            ${event.artists ? `<p class="text-xs text-gray-600 mb-2">🎵 ${event.artists.substring(0, 50)}${event.artists.length > 50 ? '...' : ''}</p>` : ''}
            <div class="flex items-center justify-between pt-1 border-t">
              <span class="px-2 py-0.5 rounded text-xs font-medium ${
                isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'
              }">
                ${isPublished ? 'Published' : 'Draft'}
              </span>
            </div>
          </div>
        `;

        marker.bindPopup(popupContent, { className: 'event-popup', maxWidth: 280 });
        marker.on('click', () => { if (onEventClick) onEventClick(event); });
        markersRef.current?.addLayer(marker);
      });
    }
  }, [events, eventsByCity, getEventCoords, onEventClick, onCityChange]);

  useEffect(() => {
    if (!selectedCity || !mapRef.current) return;
    const config = CITY_CONFIG[selectedCity];
    if (config) {
      mapRef.current.setView(config.coords, config.zoom, { animate: true });
    }
  }, [selectedCity]);

  useEffect(() => {
    if (!selectedEventId || !mapRef.current) return;
    const event = events.find(e => e.id === selectedEventId);
    if (event) {
      const coords = getEventCoords(event);
      mapRef.current.setView(coords, 16, { animate: true });
    }
  }, [selectedEventId, events, getEventCoords]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg">
      <div ref={mapContainerRef} className="h-full w-full" style={{ zIndex: 1 }} />
      
      {/* City Quick Select */}
      <div className="absolute top-3 left-3 flex flex-wrap gap-1" style={{ zIndex: 1000 }}>
        {Object.entries(eventsByCity).slice(0, 6).map(([city, cityEvents]) => (
          <button
            key={city}
            onClick={() => {
              const config = CITY_CONFIG[city];
              if (config && mapRef.current) {
                mapRef.current.setView(config.coords, config.zoom, { animate: true });
                if (onCityChange) onCityChange(city);
              }
            }}
            className={clsx(
              'px-2 py-1 text-xs font-medium rounded-full shadow transition-all',
              selectedCity === city
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            )}
          >
            {city} ({cityEvents.length})
          </button>
        ))}
        {Object.keys(eventsByCity).length > 1 && (
          <button
            onClick={() => {
              if (mapRef.current) {
                mapRef.current.setView(EUROPE_VIEW.coords, EUROPE_VIEW.zoom, { animate: true });
                if (onCityChange) onCityChange('');
              }
            }}
            className={clsx(
              'px-2 py-1 text-xs font-medium rounded-full shadow transition-all',
              !selectedCity ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
            )}
          >
            All
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-16 left-3 bg-white rounded-lg shadow-lg p-2" style={{ zIndex: 1000 }}>
        <div className="space-y-1">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-emerald-500 mr-2"></div>
            <span className="text-xs text-gray-600">Published</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-gray-400 mr-2"></div>
            <span className="text-xs text-gray-600">Draft</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="absolute top-3 right-3 bg-white rounded-lg shadow-lg px-3 py-2" style={{ zIndex: 1000 }}>
        <div className="text-xs text-gray-600">
          <span className="font-semibold text-gray-900">{events.length}</span> events
          <span className="mx-1">•</span>
          <span className="font-semibold text-emerald-600">
            {events.filter(e => e.is_published).length}
          </span>{' '}
          published
        </div>
      </div>
    </div>
  );
}
