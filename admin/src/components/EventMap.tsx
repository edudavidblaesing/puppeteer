'use client';

import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import L from 'leaflet';
import clsx from 'clsx';
import 'leaflet.markercluster';
import { Event, City } from '@/types';

// Extend Leaflet types
declare module 'leaflet' {
  function markerClusterGroup(options?: any): any;
}

// Default city coordinates (fallback)
const DEFAULT_CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Berlin: { lat: 52.52, lng: 13.405 },
  Hamburg: { lat: 53.5511, lng: 9.9937 },
  London: { lat: 51.5074, lng: -0.1278 },
  Paris: { lat: 48.8566, lng: 2.3522 },
  Amsterdam: { lat: 52.3676, lng: 4.9041 },
  Barcelona: { lat: 41.3851, lng: 2.1734 },
};

// Venue coordinates (approximate - for demo)
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
  'Säule': [52.5112, 13.4428],
  'Übel & Gefährlich': [53.5511, 9.9629],
  'PAL': [53.5506, 9.9485],
  'Hafenklang': [53.5461, 9.9587],
  'Fundbureau': [53.5623, 9.9622],
  'Moloch': [53.5540, 9.9730],
  'Golden Pudel': [53.5461, 9.9543],
};

const EUROPE_VIEW = { coords: [50.5, 10.0] as [number, number], zoom: 5 };
const CITY_ZOOM = 12;

interface EventMapProps {
  events: Event[];
  cities: City[];
  onEventClick?: (event: Event) => void;
  onCityChange?: (city: string) => void;
  selectedCity?: string;
  selectedEventId?: string;
}

export default function EventMap({ 
  events, 
  cities,
  onEventClick, 
  onCityChange,
  selectedCity,
  selectedEventId 
}: EventMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const venueLayerRef = useRef<L.LayerGroup | null>(null);
  const cityLayerRef = useRef<L.LayerGroup | null>(null);
  const [currentZoom, setCurrentZoom] = useState(EUROPE_VIEW.zoom);

  // Build city config from dynamic cities
  const cityConfig = useMemo(() => {
    const config: Record<string, { coords: [number, number]; eventCount: number; venueCount: number }> = {};
    
    cities.forEach((city) => {
      const lat = city.latitude ? Number(city.latitude) : DEFAULT_CITY_COORDS[city.name]?.lat;
      const lng = city.longitude ? Number(city.longitude) : DEFAULT_CITY_COORDS[city.name]?.lng;
      
      if (lat && lng) {
        config[city.name] = {
          coords: [lat, lng],
          eventCount: Number(city.event_count) || 0,
          venueCount: Number(city.venue_count) || 0,
        };
      }
    });
    
    return config;
  }, [cities]);

  // Group events by venue
  const venueData = useMemo(() => {
    const venues: Record<string, { 
      name: string;
      events: Event[]; 
      coords: [number, number] | null;
      publishedCount: number;
    }> = {};
    
    events.forEach((event) => {
      const venueName = event.venue_name || 'Unknown Venue';
      
      if (!venues[venueName]) {
        let coords: [number, number] | null = null;
        
        // Try to find coordinates from known venues
        for (const [name, venueCoords] of Object.entries(VENUE_COORDS)) {
          if (venueName.toLowerCase().includes(name.toLowerCase())) {
            coords = venueCoords;
            break;
          }
        }
        
        // Fallback to city center with offset
        if (!coords && event.venue_city) {
          const cityCoords = cityConfig[event.venue_city]?.coords;
          if (cityCoords) {
            const offset = () => (Math.random() - 0.5) * 0.015;
            coords = [cityCoords[0] + offset(), cityCoords[1] + offset()];
          }
        }
        
        venues[venueName] = {
          name: venueName,
          events: [],
          coords,
          publishedCount: 0,
        };
      }
      
      venues[venueName].events.push(event);
      if (event.is_published) venues[venueName].publishedCount++;
    });
    
    return venues;
  }, [events, cityConfig]);

  // Get city coordinates
  const getCityCoords = useCallback((cityName: string): [number, number] | null => {
    return cityConfig[cityName]?.coords || null;
  }, [cityConfig]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialCoords = selectedCity && cityConfig[selectedCity]
      ? cityConfig[selectedCity].coords
      : EUROPE_VIEW.coords;
    const initialZoom = selectedCity ? CITY_ZOOM : EUROPE_VIEW.zoom;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
    }).setView(initialCoords, initialZoom);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OSM © CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    venueLayerRef.current = L.layerGroup().addTo(map);
    cityLayerRef.current = L.layerGroup().addTo(map);

    // Track zoom changes
    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    // Detect city on pan/zoom
    map.on('moveend', () => {
      const zoom = map.getZoom();
      const center = map.getCenter();

      if (zoom >= 10 && onCityChange) {
        let closestCity = '';
        let minDist = Infinity;
        
        for (const [city, config] of Object.entries(cityConfig)) {
          const dist = Math.sqrt(
            Math.pow(center.lat - config.coords[0], 2) + 
            Math.pow(center.lng - config.coords[1], 2)
          );
          if (dist < minDist && dist < 0.5) {
            minDist = dist;
            closestCity = city;
          }
        }

        if (closestCity && closestCity !== selectedCity) {
          onCityChange(closestCity);
        }
      }
    });

    setCurrentZoom(initialZoom);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [cityConfig, onCityChange, selectedCity]);

  // Update markers based on zoom level
  useEffect(() => {
    if (!mapRef.current || !venueLayerRef.current || !cityLayerRef.current) return;

    venueLayerRef.current.clearLayers();
    cityLayerRef.current.clearLayers();

    const isZoomedToCity = currentZoom >= 10;

    if (isZoomedToCity) {
      // CITY VIEW: Show individual venue markers (no clustering)
      Object.entries(venueData).forEach(([venueName, data]) => {
        if (!data.coords) return;

        const eventCount = data.events.length;
        const publishedCount = data.publishedCount;
        const ratio = publishedCount / eventCount;
        
        let bgColor = 'bg-gray-500';
        let borderColor = 'border-gray-400';
        if (ratio === 1) {
          bgColor = 'bg-emerald-500';
          borderColor = 'border-emerald-600';
        } else if (ratio > 0) {
          bgColor = 'bg-amber-500';
          borderColor = 'border-amber-600';
        }

        const icon = L.divIcon({
          className: 'venue-marker',
          html: `
            <div class="relative group cursor-pointer">
              <div class="w-10 h-10 ${bgColor} rounded-lg shadow-lg border-2 ${borderColor} flex items-center justify-center text-white font-bold text-sm hover:scale-110 transition-transform">
                ${eventCount}
              </div>
              <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                ${venueName}
              </div>
            </div>
          `,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });

        const marker = L.marker(data.coords, { icon });

        // Popup with venue events
        const popupContent = `
          <div class="p-3 min-w-[250px] max-w-[300px]">
            <h3 class="font-bold text-sm mb-2">${venueName}</h3>
            <p class="text-xs text-gray-500 mb-2">${eventCount} event${eventCount !== 1 ? 's' : ''} • ${publishedCount} published</p>
            <div class="max-h-[200px] overflow-y-auto space-y-2">
              ${data.events.slice(0, 5).map(event => `
                <div class="p-2 bg-gray-50 rounded text-xs">
                  <div class="font-medium line-clamp-1">${event.title}</div>
                  <div class="text-gray-500">${event.date ? new Date(event.date).toLocaleDateString() : 'No date'}</div>
                </div>
              `).join('')}
              ${eventCount > 5 ? `<p class="text-xs text-gray-500 text-center">+${eventCount - 5} more events</p>` : ''}
            </div>
          </div>
        `;

        marker.bindPopup(popupContent, { maxWidth: 320 });

        marker.on('click', () => {
          if (onEventClick && data.events.length === 1) {
            onEventClick(data.events[0]);
          }
        });

        venueLayerRef.current?.addLayer(marker);
      });
    } else {
      // OVERVIEW: Show city markers
      Object.entries(cityConfig).forEach(([cityName, config]) => {
        const cityEvents = events.filter(e => e.venue_city === cityName);
        const eventCount = cityEvents.length;
        if (eventCount === 0) return;

        const publishedCount = cityEvents.filter(e => e.is_published).length;
        const ratio = publishedCount / eventCount;
        
        let borderColor = 'border-gray-400';
        if (ratio === 1) borderColor = 'border-emerald-500';
        else if (ratio > 0) borderColor = 'border-amber-500';

        const icon = L.divIcon({
          className: 'city-marker',
          html: `
            <div class="w-16 h-16 bg-white rounded-full shadow-xl border-4 ${borderColor} flex flex-col items-center justify-center cursor-pointer hover:scale-110 transition-transform">
              <span class="text-lg font-bold text-gray-800">${eventCount}</span>
              <span class="text-xs text-gray-500 leading-tight">${cityName}</span>
            </div>
          `,
          iconSize: [64, 64],
          iconAnchor: [32, 32],
        });

        const marker = L.marker(config.coords, { icon });

        marker.on('click', () => {
          mapRef.current?.setView(config.coords, CITY_ZOOM, { animate: true });
          if (onCityChange) onCityChange(cityName);
        });

        cityLayerRef.current?.addLayer(marker);
      });
    }
  }, [events, venueData, cityConfig, currentZoom, onEventClick, onCityChange]);

  // Handle city selection changes
  useEffect(() => {
    if (!mapRef.current) return;
    
    if (selectedCity && cityConfig[selectedCity]) {
      mapRef.current.setView(cityConfig[selectedCity].coords, CITY_ZOOM, { animate: true });
    } else if (!selectedCity && Object.keys(cityConfig).length > 1) {
      mapRef.current.setView(EUROPE_VIEW.coords, EUROPE_VIEW.zoom, { animate: true });
    }
  }, [selectedCity, cityConfig]);

  // Handle selected event
  useEffect(() => {
    if (!selectedEventId || !mapRef.current) return;
    
    const event = events.find(e => e.id === selectedEventId);
    if (event && event.venue_name) {
      const venue = venueData[event.venue_name];
      if (venue?.coords) {
        mapRef.current.setView(venue.coords, 16, { animate: true });
      }
    }
  }, [selectedEventId, events, venueData]);

  // Available cities from data
  const availableCities = useMemo(() => {
    return Object.entries(cityConfig)
      .filter(([cityName]) => events.some(e => e.venue_city === cityName))
      .map(([cityName, config]) => ({
        name: cityName,
        eventCount: events.filter(e => e.venue_city === cityName).length,
      }))
      .sort((a, b) => b.eventCount - a.eventCount);
  }, [cityConfig, events]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg">
      <div ref={mapContainerRef} className="h-full w-full" style={{ zIndex: 1 }} />
      
      {/* City Quick Select */}
      <div className="absolute top-3 left-3 flex flex-wrap gap-1 max-w-[60%]" style={{ zIndex: 1000 }}>
        {availableCities.map(({ name, eventCount }) => (
          <button
            key={name}
            onClick={() => {
              const coords = getCityCoords(name);
              if (coords && mapRef.current) {
                mapRef.current.setView(coords, CITY_ZOOM, { animate: true });
                if (onCityChange) onCityChange(name);
              }
            }}
            className={clsx(
              'px-2 py-1 text-xs font-medium rounded-full shadow transition-all',
              selectedCity === name
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            )}
          >
            {name} ({eventCount})
          </button>
        ))}
        {availableCities.length > 1 && (
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
            <div className="w-3 h-3 rounded bg-emerald-500 mr-2"></div>
            <span className="text-xs text-gray-600">All published</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded bg-amber-500 mr-2"></div>
            <span className="text-xs text-gray-600">Some published</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded bg-gray-500 mr-2"></div>
            <span className="text-xs text-gray-600">All draft</span>
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
          {currentZoom >= 10 && (
            <>
              <span className="mx-1">•</span>
              <span className="font-semibold text-indigo-600">
                {Object.keys(venueData).length}
              </span>{' '}
              venues
            </>
          )}
        </div>
      </div>

      {/* Zoom indicator */}
      {currentZoom >= 10 && selectedCity && (
        <div className="absolute bottom-3 right-16 bg-indigo-600 text-white rounded-lg shadow-lg px-3 py-1.5" style={{ zIndex: 1000 }}>
          <span className="text-xs font-medium">📍 {selectedCity} - Venue View</span>
        </div>
      )}
    </div>
  );
}
