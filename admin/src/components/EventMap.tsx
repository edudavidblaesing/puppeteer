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
  cities?: City[];
  onEventClick?: (event: Event) => void;
  onCityChange?: (city: string) => void;
  selectedCity?: string;
  selectedEventId?: string;
  center?: [number, number];
  zoom?: number;
  minimal?: boolean; // New prop for static view
}

export default function EventMap({
  events,
  cities = [],
  onEventClick,
  onCityChange,
  selectedCity,
  selectedEventId,
  center,
  zoom,
  minimal = false
}: EventMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const venueLayerRef = useRef<L.LayerGroup | null>(null);
  const cityLayerRef = useRef<L.LayerGroup | null>(null);
  const isProgrammaticMove = useRef(false);
  const [currentZoom, setCurrentZoom] = useState(EUROPE_VIEW.zoom);
  const prevEventsRef = useRef<string>('');
  const onEventClickRef = useRef(onEventClick);
  const onCityChangeRef = useRef(onCityChange);

  // Keep callback refs updated without triggering re-renders
  useEffect(() => {
    onEventClickRef.current = onEventClick;
    onCityChangeRef.current = onCityChange;
  }, [onEventClick, onCityChange]);

  // Build city config from dynamic cities (truncated logic... keep existing)
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

  // Group events by venue ... (keep existing)
  const venueData = useMemo(() => {
    // ... no change needed mostly, but minimal will affect markers if we want? No, keep logic
    const venues: Record<string, {
      name: string;
      events: Event[];
      coords: [number, number] | null;
      statusCounts: {
        draft: number;
        needsDetails: number;
        ready: number;
        published: number;
        canceled: number;
        rejected: number;
        other: number;
      };
      hasLive: boolean;
    }> = {};

    const filteredEvents = selectedCity
      ? events.filter(e => e.venue_city === selectedCity)
      : events;

    filteredEvents.forEach((event) => {
      const venueName = event.venue_name || 'Unknown Venue';

      if (!venues[venueName]) {
        let coords: [number, number] | null = null;

        if ((event as any).venue_latitude && (event as any).venue_longitude) {
          coords = [(event as any).venue_latitude, (event as any).venue_longitude];
        }

        if (!coords && event.latitude && event.longitude) {
          coords = [event.latitude, event.longitude];
        }

        if (!coords) {
          for (const [name, venueCoords] of Object.entries(VENUE_COORDS)) {
            if (venueName.toLowerCase().includes(name.toLowerCase())) {
              coords = venueCoords;
              break;
            }
          }
        }

        venues[venueName] = {
          name: venueName,
          events: [],
          coords,
          statusCounts: {
            draft: 0,
            needsDetails: 0,
            ready: 0,
            published: 0,
            canceled: 0,
            rejected: 0,
            other: 0
          },
          hasLive: false
        };
      } else if (!venues[venueName].coords) {
        if ((event as any).venue_latitude && (event as any).venue_longitude) {
          venues[venueName].coords = [(event as any).venue_latitude, (event as any).venue_longitude];
        } else if (event.latitude && event.longitude) {
          venues[venueName].coords = [event.latitude, event.longitude];
        }
      }

      venues[venueName].events.push(event);

      // Track statuses
      const s = event.status;
      if (s === 'SCRAPED_DRAFT' || s === 'MANUAL_DRAFT') venues[venueName].statusCounts.draft++;
      else if (s === 'APPROVED_PENDING_DETAILS') venues[venueName].statusCounts.needsDetails++;
      else if (s === 'READY_TO_PUBLISH') venues[venueName].statusCounts.ready++;
      else if (s === 'PUBLISHED') venues[venueName].statusCounts.published++;
      else if (s === 'CANCELED') venues[venueName].statusCounts.canceled++;
      else if (s === 'REJECTED') venues[venueName].statusCounts.rejected++;
      else venues[venueName].statusCounts.other++;

      // Check Live
      if (s === 'PUBLISHED' && event.date && event.start_time) {
        // Simplified live check during aggregation
        const now = new Date();
        const eventDate = new Date(event.date);

        if (eventDate.toDateString() === now.toDateString()) {
          // It's today. Check times.
          // Parsing logic same as before (simplified here for brevity of thought, but needed in code)
          const startTimeStr = event.start_time.includes('T') ? event.start_time.split('T')[1] : event.start_time;
          const startH = parseInt(startTimeStr.split(':')[0] || '0');
          const startM = parseInt(startTimeStr.split(':')[1] || '0');

          const start = new Date(eventDate);
          start.setHours(startH, startM, 0);

          // Default duration 4h if no end time or calculation
          const end = new Date(start);
          if (event.end_time) {
            const endTimeStr = event.end_time.includes('T') ? event.end_time.split('T')[1] : event.end_time;
            const endH = parseInt(endTimeStr.split(':')[0] || '0');
            const endM = parseInt(endTimeStr.split(':')[1] || '0');
            end.setHours(endH, endM, 0);
            if (end < start) end.setDate(end.getDate() + 1); // Ends next day
          } else {
            end.setHours(start.getHours() + 4);
          }

          if (now >= start && now <= end) {
            venues[venueName].hasLive = true;
          }
        }
      }
    });

    return venues;
  }, [events, cityConfig, selectedCity]);

  // Get city coords ... (keep)
  const getCityCoords = useCallback((cityName: string): [number, number] | null => {
    return cityConfig[cityName]?.coords || null;
  }, [cityConfig]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialCoords = selectedCity && cityConfig[selectedCity]
      ? cityConfig[selectedCity].coords
      : center || EUROPE_VIEW.coords;
    const initialZoom = zoom || (selectedCity ? CITY_ZOOM : EUROPE_VIEW.zoom);

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      dragging: !minimal,
      touchZoom: !minimal,
      scrollWheelZoom: false,
      doubleClickZoom: !minimal,
      boxZoom: !minimal,
      keyboard: !minimal,
      attributionControl: !minimal
    }).setView(initialCoords, initialZoom);



    // Detect dark mode...
    const isDarkMode = document.documentElement.classList.contains('dark') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches;

    const tileUrl = isDarkMode
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

    L.tileLayer(tileUrl, {
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

    // Detect city on pan/zoom - clear city filter when zoomed out
    map.on('moveend', () => {
      // Skip if this was a programmatic move
      if (isProgrammaticMove.current) {
        isProgrammaticMove.current = false;
        return;
      }

      const zoom = map.getZoom();
      const center = map.getCenter();

      // When user manually zooms out, clear city selection to show all cities
      if (zoom < 9 && selectedCity && onCityChangeRef.current) {
        onCityChangeRef.current('');
        return;
      }

      if (zoom >= 10 && onCityChangeRef.current) {
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
          onCityChangeRef.current(closestCity);
        }
      }
    });

    // Handle map click to set coordinates (when in edit mode with single event)
    map.on('click', (e: L.LeafletMouseEvent) => {
      // Only trigger if we have a single event (edit mode)
      if (events.length === 1 && onEventClickRef.current) {
        // Create a temporary event object with the clicked coordinates
        const clickedEvent = {
          ...events[0],
          latitude: e.latlng.lat,
          longitude: e.latlng.lng
        };
        onEventClickRef.current(clickedEvent);
      }
    });

    setCurrentZoom(initialZoom);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [cityConfig, selectedCity, events.length]);

  // Update map view when center or zoom props change
  useEffect(() => {
    if (!mapRef.current || !center) return;

    isProgrammaticMove.current = true;
    mapRef.current.setView(center, zoom || 15);
  }, [center, zoom]);

  // Create a stable key for events to detect actual changes
  const eventsKey = useMemo(() => {
    return events.map(e => `${e.id}:${e.publish_status}`).sort().join(',');
  }, [events]);

  // Update markers based on zoom level - only when events actually change
  useEffect(() => {
    if (!mapRef.current || !venueLayerRef.current || !cityLayerRef.current) return;

    // Skip if events haven't actually changed
    if (prevEventsRef.current === eventsKey && venueLayerRef.current.getLayers().length > 0) {
      return;
    }
    prevEventsRef.current = eventsKey;

    venueLayerRef.current.clearLayers();
    cityLayerRef.current.clearLayers();

    const isZoomedToCity = currentZoom >= 10;

    if (isZoomedToCity) {
      // CITY VIEW: Show individual venue markers (no clustering)
      Object.entries(venueData).forEach(([venueName, data]) => {
        if (!data.coords) return;

        const eventCount = data.events.length;
        const { statusCounts, hasLive } = data;

        // Determine marker styling based on status priority
        // Priority: Live > Needs Details > Draft > Ready > Published > Canceled > Rejected
        let bgColor = 'bg-white dark:bg-gray-900';
        let borderColor = 'border-gray-300 dark:border-gray-700';
        let extraClass = '';

        if (hasLive) {
          extraClass = 'live-marker-pulse';
          borderColor = 'border-rose-500'; // Live is Rose/Red pulse
          bgColor = 'bg-rose-50 dark:bg-rose-900/30';
        } else if (statusCounts.needsDetails > 0) {
          bgColor = 'bg-amber-100 dark:bg-amber-900/40';
          borderColor = 'border-amber-500';
        } else if (statusCounts.draft > 0) {
          bgColor = 'bg-gray-100 dark:bg-gray-800'; // Drafts gray
          borderColor = 'border-gray-400';
        } else if (statusCounts.ready > 0) {
          bgColor = 'bg-blue-100 dark:bg-blue-900/40';
          borderColor = 'border-blue-500';
        } else if (statusCounts.published > 0) {
          bgColor = 'bg-emerald-100 dark:bg-emerald-900/40';
          borderColor = 'border-emerald-500';
        } else if (statusCounts.canceled > 0) {
          bgColor = 'bg-red-100 dark:bg-red-900/40';
          borderColor = 'border-red-500';
        } else if (statusCounts.rejected > 0) {
          bgColor = 'bg-gray-200 dark:bg-gray-800';
          borderColor = 'border-gray-500';
        }

        const icon = L.divIcon({
          className: 'venue-marker',
          html: `
            <div class="relative group cursor-pointer">
              <div class="w-8 h-8 ${bgColor} ${extraClass} rounded-lg shadow-lg border-2 ${borderColor} flex items-center justify-center text-white font-bold text-xs hover:scale-110 transition-transform">
                ${eventCount}
              </div>
              <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                ${venueName}
              </div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.marker(data.coords, { icon });

        // For single event, click opens edit directly
        if (data.events.length === 1) {
          marker.on('click', () => {
            if (onEventClickRef.current) {
              onEventClickRef.current(data.events[0]);
            }
          });

          // Simple tooltip for single event
          marker.bindTooltip(`
            <div class="px-2 py-1">
              <div class="font-medium text-sm">${data.events[0].title}</div>
              <div class="text-xs text-gray-500">${data.events[0].date ? new Date(data.events[0].date).toLocaleDateString() : ''}</div>
            </div>
          `, { direction: 'top', offset: [0, -20] });
        } else {
          // Multiple events: show popup with clickable event list
          const popupContent = document.createElement('div');
          popupContent.className = 'p-3 min-w-[250px] max-w-[300px]';
          popupContent.innerHTML = `
            <h3 class="font-bold text-sm mb-2">${venueName}</h3>
            <p class="text-xs text-gray-500 mb-2">${eventCount} events</p>
            <div class="max-h-[200px] overflow-y-auto space-y-1">
              ${data.events.map((event, idx) => {
            let statusColor = 'bg-gray-50 border-gray-200';
            const s = event.status;
            if (s === 'PUBLISHED') statusColor = 'bg-emerald-50 border-emerald-200 text-emerald-700';
            else if (s === 'READY_TO_PUBLISH') statusColor = 'bg-blue-50 border-blue-200 text-blue-700';
            else if (s === 'APPROVED_PENDING_DETAILS') statusColor = 'bg-amber-50 border-amber-200 text-amber-900';
            else if (s === 'SCRAPED_DRAFT' || s === 'MANUAL_DRAFT') statusColor = 'bg-gray-100 border-gray-200 text-gray-600';
            else if (s === 'CANCELED') statusColor = 'bg-red-50 border-red-200 text-red-700';
            else if (s === 'REJECTED') statusColor = 'bg-gray-100 border-gray-300 text-gray-400 line-through';
            return `
                <button 
                  data-event-idx="${idx}" 
                  class="w-full p-2 ${statusColor} hover:bg-primary-50 rounded text-xs text-left transition-colors cursor-pointer border hover:border-primary-200"
                >
                  <div class="font-medium line-clamp-1">${event.title}</div>
                  <div class="text-gray-500 flex justify-between">
                    <span>${event.date ? new Date(event.date).toLocaleDateString() : 'No date'}</span>
                    <span class="text-primary-600">Edit →</span>
                  </div>
                </button>
              `}).join('')}
            </div>
          `;

          // Store events reference on the element for click handler
          (popupContent as any)._venueEvents = data.events;

          marker.bindPopup(popupContent, { maxWidth: 320 });

          marker.on('popupopen', () => {
            const popup = marker.getPopup();
            if (popup) {
              const container = popup.getElement();
              if (container) {
                const buttons = container.querySelectorAll('button[data-event-idx]');
                buttons.forEach((btn) => {
                  btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt((btn as HTMLElement).dataset.eventIdx || '0');
                    const event = data.events[idx];
                    if (event && onEventClickRef.current) {
                      marker.closePopup();
                      onEventClickRef.current(event);
                    }
                  });
                });
              }
            }
          });
        }

        venueLayerRef.current?.addLayer(marker);
      });
    } else {
      // OVERVIEW: Show city markers
      Object.entries(cityConfig).forEach(([cityName, config]) => {
        const cityEvents = events.filter(e => e.venue_city === cityName);
        const eventCount = cityEvents.length;
        if (eventCount === 0) return;

        const approvedCount = cityEvents.filter(e => e.publish_status === 'approved').length;
        const pendingCount = cityEvents.filter(e => e.publish_status === 'pending').length;

        // Border color based on status: all approved = green, any pending = yellow, else gray
        let borderColor = 'border-gray-300';
        if (approvedCount === eventCount) borderColor = 'border-emerald-500';
        else if (pendingCount > 0) borderColor = 'border-amber-400';
        else if (approvedCount > 0) borderColor = 'border-emerald-500';

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
          if (onCityChangeRef.current) onCityChangeRef.current(cityName);
        });

        cityLayerRef.current?.addLayer(marker);
      });
    }
  }, [eventsKey, venueData, cityConfig, currentZoom, events]);

  // Handle city selection changes
  useEffect(() => {
    if (!mapRef.current || !mapRef.current.getContainer()) return;

    try {
      isProgrammaticMove.current = true;

      if (selectedCity && cityConfig[selectedCity]) {
        mapRef.current.setView(cityConfig[selectedCity].coords, CITY_ZOOM, { animate: true });
      } else if (!selectedCity && Object.keys(cityConfig).length > 0) {
        mapRef.current.setView(EUROPE_VIEW.coords, EUROPE_VIEW.zoom, { animate: true });
      }
    } catch (err) {
      console.warn('Map setView error:', err);
      isProgrammaticMove.current = false;
    }
  }, [selectedCity, cityConfig]);

  // Handle selected event
  useEffect(() => {
    if (!selectedEventId || !mapRef.current || !mapRef.current.getContainer()) return;

    try {
      const event = events.find(e => e.id === selectedEventId);
      if (event && event.venue_name) {
        const venue = venueData[event.venue_name];
        if (venue?.coords) {
          mapRef.current.setView(venue.coords, 16, { animate: true });
        }
      }
    } catch (err) {
      console.warn('Map setView error:', err);
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
    <div className="relative h-full w-full overflow-hidden">
      <div ref={mapContainerRef} className="h-full w-full" style={{ zIndex: 1 }} />

      {/* City Quick Select */}
      {!minimal && (
        <div className="absolute top-3 left-3 flex flex-wrap gap-1 max-w-[60%]" style={{ zIndex: 1000 }}>
          {availableCities.map(({ name, eventCount }) => (
            <button
              key={name}
              onClick={() => {
                const coords = getCityCoords(name);
                if (coords && mapRef.current && mapRef.current.getContainer()) {
                  try {
                    isProgrammaticMove.current = true;
                    mapRef.current.setView(coords, CITY_ZOOM, { animate: true });
                    if (onCityChange) onCityChange(name);
                  } catch (err) {
                    console.warn('Map setView error:', err);
                  }
                }
              }}
              className={clsx(
                'px-2 py-1 text-xs font-medium rounded-full shadow transition-all',
                selectedCity === name
                  ? 'bg-gray-800 text-white dark:bg-gray-700'
                  : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
              )}
            >
              {name} ({eventCount})
            </button>
          ))}
          {availableCities.length > 1 && (
            <button
              onClick={() => {
                if (mapRef.current && mapRef.current.getContainer()) {
                  try {
                    isProgrammaticMove.current = true;
                    mapRef.current.setView(EUROPE_VIEW.coords, EUROPE_VIEW.zoom, { animate: true });
                    if (onCityChange) onCityChange('');
                  } catch (err) {
                    console.warn('Map setView error:', err);
                  }
                }
              }}
              className={clsx(
                'px-2 py-1 text-xs font-medium rounded-full shadow transition-all',
                !selectedCity ? 'bg-gray-800 text-white dark:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
              )}
            >
              All
            </button>
          )}
        </div>
      )}

      {/* Legend */}
      {!minimal && (
        <div className="absolute bottom-16 left-3 bg-white/90 dark:bg-gray-800/90 backdrop-blur rounded-lg shadow-lg p-3 border border-gray-200 dark:border-gray-700" style={{ zIndex: 1000 }}>
          <div className="space-y-2">
            <div className="flex items-center">
              <div className="w-3 h-3 rounded bg-gray-400 mr-2"></div>
              <span className="text-xs text-gray-600 dark:text-gray-300">Draft</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 rounded bg-amber-400 mr-2"></div>
              <span className="text-xs text-gray-600 dark:text-gray-300">Needs Details</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 rounded bg-blue-500 mr-2"></div>
              <span className="text-xs text-gray-600 dark:text-gray-300">Ready</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 rounded bg-emerald-500 mr-2"></div>
              <span className="text-xs text-gray-600 dark:text-gray-300">Published</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 rounded bg-rose-500 mr-2 live-marker-pulse"></div>
              <span className="text-xs text-gray-800 dark:text-gray-200 font-bold">LIVE NOW</span>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      {!minimal && (
        <div className="absolute top-3 right-3 bg-white dark:bg-gray-800 rounded-lg shadow-lg px-3 py-2" style={{ zIndex: 1000 }}>
          <div className="text-xs text-gray-600 dark:text-gray-300">
            <span className="font-semibold text-gray-900 dark:text-gray-100">{events.length}</span> events
            <span className="mx-1">•</span>
            <span className="font-semibold text-emerald-600">
              {events.filter(e => e.is_published).length}
            </span>{' '}
            published
            {currentZoom >= 10 && (
              <>
                <span className="mx-1">•</span>
                <span className="font-semibold text-gray-600 dark:text-gray-400">
                  {Object.keys(venueData).length}
                </span>{' '}
                venues
              </>
            )}
          </div>
        </div>
      )}

      {/* Zoom indicator */}
      {!minimal && currentZoom >= 10 && selectedCity && (
        <div className="absolute bottom-3 right-16 bg-gray-800 dark:bg-gray-700 text-white rounded-lg shadow-lg px-3 py-1.5" style={{ zIndex: 1000 }}>
          <span className="text-xs font-medium">📍 {selectedCity} - Venue View</span>
        </div>
      )}
    </div>
  );
}
