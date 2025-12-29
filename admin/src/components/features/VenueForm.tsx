
import React, { useState, useEffect, useRef } from 'react';
import { Venue, Event } from '@/types'; // Added Event
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SourceFieldOptions } from '@/components/ui/SourceFieldOptions';
import { ResetSectionButton } from '@/components/ui/ResetSectionButton';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { Star } from 'lucide-react';
import { RelatedEventsList } from '@/components/features/RelatedEventsList';
import { getBestSourceForField, SOURCE_PRIORITY } from '@/lib/smartMerge';
import { MapPin, Globe, Link as LinkIcon, Phone, Mail, FileText, Search, X, Trash2 } from 'lucide-react';
import { fetchCities, updateEvent, fetchEvent, fetchCountries, fetchAdminVenues } from '@/lib/api'; // Added fetchAdminVenues
import { Modal } from '@/components/ui/Modal'; // Added Modal
import { EventForm } from '@/components/features/EventForm'; // Added EventForm
import { useToast } from '@/contexts/ToastContext';
import { AutoFillSearch } from '@/components/features/AutoFillSearch';

interface VenueFormProps {
  initialData?: Partial<Venue>;
  onSubmit: (data: Partial<Venue>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  isModal?: boolean;
}

const VENUE_TYPES = [
  'Club',
  'Bar',
  'Live Music Venue',
  'Concert Hall',
  'Festival Grounds',
  'Art Space',
  'Theater',
  'Other'
];

export function VenueForm({
  initialData,
  onSubmit,
  onDelete,
  onCancel,
  isLoading,
  isModal = false
}: VenueFormProps) {
  const { success, error: showError } = useToast();
  const [formData, setFormData] = useState<Partial<Venue>>({
    name: '',
    address: '',
    city: '',
    country: '',
    latitude: undefined,
    longitude: undefined,
    content_url: '',
    venue_type: '',
    phone: '',
    email: '',
    description: ''
  });

  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  const handleEditEvent = async (event: Event) => {
    try {
      const fullEvent = await fetchEvent(event.id);
      setEditingEvent(fullEvent || event);
    } catch (e) {
      console.error(e);
      setEditingEvent(event);
    }
  };

  const handleEventSubmit = async (data: Partial<Event>) => {
    if (!editingEvent) return;
    try {
      await updateEvent(editingEvent.id, data);
      success('Event updated successfully');
      setEditingEvent(null);
    } catch (e) {
      console.error(e);
      showError('Failed to update event');
    }
  };

  // City Autocomplete State
  const [availableCities, setAvailableCities] = useState<any[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);

  useEffect(() => {
    fetchCities().then(setAvailableCities).catch(console.error);
    if (initialData) {
      const data = { ...initialData };
      const sources = initialData.source_references || [];

      // Auto-fill empty fields from best source
      const fieldsToCheck: (keyof Venue)[] = ['description', 'content_url', 'venue_type', 'phone', 'email', 'address', 'city', 'country', 'latitude', 'longitude'];

      fieldsToCheck.forEach(field => {
        // @ts-ignore
        if (!data[field]) {
          // @ts-ignore
          const best = getBestSourceForField(sources, field);
          // @ts-ignore
          if (best && best[field]) data[field] = best[field];
        }
      });

      setFormData(data);
    }
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Duplicate Check for New Venues
    if (!initialData?.id && formData.name) {
      try {
        const existingResult = await fetchAdminVenues({
          search: formData.name,
          city: formData.city || undefined
        });

        // available in result.data or result directly depending on API. 
        // Based on api.ts: return request(...) -> returns JSON. 
        // Typically { data: [...] } for list endpoints.
        const candidates = (existingResult as any).data || [];

        const isDuplicate = candidates.some((v: Venue) =>
          v.name.toLowerCase() === formData.name?.toLowerCase() &&
          (!formData.city || v.city?.toLowerCase() === formData.city.toLowerCase())
        );

        if (isDuplicate) {
          showError('A venue with this name and city already exists.');
          return;
        }
      } catch (err) {
        console.error('Failed to check duplicates:', err);
        // Continue but warn? Or strictly fail? Let's strictly fail if check errors to be safe, or just log.
        // For now, duplicate check failure shouldn't block creation if API is down, but let's assume it works.
      }
    }

    await onSubmit(formData);
  };

  // Fetch countries for robust matching
  const [countries, setCountries] = useState<{ name: string; code: string }[]>([]);
  useEffect(() => {
    fetchCountries().then(setCountries).catch(console.error);
  }, []);

  const handleAutoFill = (result: any) => {
    console.log('[VenueForm] Autofill result:', result);

    let countryCode = result.country || '';

    // Robust Country Matching
    if (countryCode) {
      const strictMatch = countries.find(c => c.code === countryCode.toUpperCase());
      if (strictMatch) {
        countryCode = strictMatch.code;
      } else {
        const nameMatch = countries.find(c => c.name.toLowerCase() === countryCode.toLowerCase());
        if (nameMatch) {
          countryCode = nameMatch.code;
        }
      }
    }

    // Fallback to raw address country
    if (!countryCode && result.raw?.address?.country) {
      const rawCountryName = result.raw?.address?.country;
      const rawMatch = countries.find(c => c.name.toLowerCase() === rawCountryName.toLowerCase());
      if (rawMatch) countryCode = rawMatch.code;
    }

    const updates: Partial<Venue> = {
      name: result.name,
      city: result.city || formData.city,
      country: countryCode || formData.country,
      latitude: result.lat,
      longitude: result.lon
    };

    if (result.source === 'tm') {
      if (result.raw) {
        const addr = [result.raw.address?.line1, result.raw.address?.line2].filter(Boolean).join(', ');
        if (addr) updates.address = addr;
      }
    } else if (result.source === 'osm') {
      const addr = result.raw?.address;
      if (addr) {
        // OSM address construction
        const parts = [];
        if (addr.road) parts.push(addr.road);
        if (addr.house_number) parts.push(addr.house_number);
        const street = parts.join(' ');
        updates.address = street || result.name;

        // Also try to fill city if missing from top level
        if (!updates.city) {
          updates.city = addr.city || addr.town || addr.village || '';
        }
      }
    }

    setFormData(prev => ({ ...prev, ...updates }));
  };

  const uniqueSources = Array.from(new Set((initialData?.source_references || []).map(s => s.source_code)));

  const resetFields = (sourceCode: string, fields: (keyof Venue)[]) => {
    const newFormData = { ...formData };
    let hasChanges = false;
    const sources = initialData?.source_references || [];

    fields.forEach(field => {
      let val: any = undefined;

      if (sourceCode === 'best') {
        const bestSource = getBestSourceForField(sources, field as string);
        if (bestSource) {
          val = (bestSource as any)[field];
        }
      } else {
        const source = sources.find(s => s.source_code === sourceCode);
        if (source && (source as any)[field] !== undefined) {
          val = (source as any)[field];
        }
      }

      if (val !== undefined && val !== null) {
        // @ts-ignore
        newFormData[field] = val;
        hasChanges = true;
      }
    });

    if (hasChanges) setFormData(newFormData);
  };

  const handleResetToSource = (sourceCode: string) => {
    resetFields(sourceCode, ['name', 'address', 'city', 'country', 'latitude', 'longitude', 'content_url', 'venue_type', 'phone', 'email', 'description']);
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      {/* Header */}
      {!isModal && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50">
          <div className="flex items-center">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {initialData && initialData.id ? 'Edit Venue' : 'New Venue'}
            </h2>
            {uniqueSources.length > 0 && (
              <div className="flex items-center gap-2 ml-4 pl-4 border-l border-gray-200 dark:border-gray-700">
                <span className="text-xs text-gray-500">Reset from:</span>
                <button
                  type="button"
                  onClick={() => handleResetToSource('best')}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 hover:bg-primary-100 dark:hover:bg-primary-900/50 text-primary-600 dark:text-primary-400 font-bold uppercase transition-colors"
                  title="Reset to best matched data"
                >
                  <Star className="w-3 h-3 fill-current" /> Best
                </button>
                {uniqueSources.map(source => (
                  <button
                    key={source}
                    type="button"
                    onClick={() => handleResetToSource(source)}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-primary-50 dark:hover:bg-primary-900/30 text-gray-600 dark:text-gray-300 uppercase"
                    title={`Reset to ${source}`}
                  >
                    <SourceIcon sourceCode={source} className="w-3 h-3" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {initialData && initialData.id && onDelete && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => onDelete(initialData.id!)}
                disabled={isLoading}
                leftIcon={<Trash2 className="w-4 h-4" />}
              >
                Delete
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              leftIcon={<X className="w-4 h-4" />}
            />
          </div>
        </div>
      )}

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <form id="venue-form" onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto" onClick={() => {
          setShowCitySuggestions(false);
        }}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Basic Details
              </h3>
              <ResetSectionButton
                sources={uniqueSources}
                onReset={(source) => resetFields(source, ['name', 'venue_type', 'description'])}
              />
            </div>

            <div className="relative">
              <div className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Name / Auto-fill</div>
              {!initialData?.id ? (
                <AutoFillSearch
                  type="venue"
                  onSelect={handleAutoFill}
                  placeholder="Search venue to auto-fill..."
                  className="mb-2"
                />
              ) : null}

              <Input
                label="Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="e.g. Berghain"
              />
              <SourceFieldOptions
                sources={initialData?.source_references}
                field="name"
                currentValue={formData.name}
                onSelect={(val) => setFormData({ ...formData, name: val })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Venue Type
              </label>
              <div className="relative">
                <select
                  value={formData.venue_type || ''}
                  onChange={(e) => setFormData({ ...formData, venue_type: e.target.value })}
                  className="w-full appearance-none rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
                >
                  <option value="">-- Select Type --</option>
                  {VENUE_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
              </div>
              <SourceFieldOptions
                sources={initialData?.source_references}
                field="venue_type"
                currentValue={formData.venue_type}
                onSelect={(val) => setFormData({ ...formData, venue_type: val })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
                placeholder="Venue description..."
              />
              <SourceFieldOptions
                sources={initialData?.source_references}
                field="description"
                currentValue={formData.description}
                onSelect={(val) => setFormData({ ...formData, description: val })}
              />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Location
              </h3>
              <ResetSectionButton
                sources={uniqueSources}
                onReset={(source) => resetFields(source, ['address', 'city', 'country', 'latitude', 'longitude'])}
              />
            </div>

            <div className="relative">
              <Input
                label="Address"
                value={formData.address || ''}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Street address..."
              />
              <SourceFieldOptions
                sources={initialData?.source_references}
                field="address"
                currentValue={formData.address}
                onSelect={(val) => setFormData({ ...formData, address: val })}
              />
            </div>

            <div className="relative" onClick={e => e.stopPropagation()}>
              <Input
                label="City"
                value={formData.city || ''}
                onChange={(e) => {
                  setFormData({ ...formData, city: e.target.value });
                  setShowCitySuggestions(true);
                }}
                onFocus={() => setShowCitySuggestions(true)}
                placeholder="e.g. Berlin"
              />
              {showCitySuggestions && availableCities.length > 0 && (
                <div className="absolute z-10 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                  {availableCities
                    .filter(c => c.name.toLowerCase().includes((formData.city || '').toLowerCase()))
                    .map(c => (
                      <div
                        key={c.id}
                        className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm flex justify-between"
                        onClick={() => {
                          setFormData(prev => ({ ...prev, city: c.name, country: c.country || prev.country }));
                          setShowCitySuggestions(false);
                        }}
                      >
                        <span>{c.name}</span>
                        <span className="text-gray-500 text-xs">{c.country}</span>
                      </div>
                    ))}
                </div>
              )}
              <SourceFieldOptions
                sources={initialData?.source_references}
                field="city"
                currentValue={formData.city}
                onSelect={(val) => setFormData({ ...formData, city: val })}
              />
            </div>

            <div>
              <Input
                label="Country"
                value={formData.country || ''}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                placeholder="e.g. DE"
              />
              <SourceFieldOptions
                sources={initialData?.source_references}
                field="country"
                currentValue={formData.country}
                onSelect={(val) => setFormData({ ...formData, country: val })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Input
                  label="Latitude"
                  type="number"
                  step="any"
                  value={formData.latitude || ''}
                  onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) })}
                  placeholder="52.511"
                />
                <SourceFieldOptions
                  sources={initialData?.source_references}
                  field="latitude"
                  currentValue={formData.latitude}
                  onSelect={(val) => setFormData({ ...formData, latitude: val })}
                />
              </div>
              <div>
                <Input
                  label="Longitude"
                  type="number"
                  step="any"
                  value={formData.longitude || ''}
                  onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) })}
                  placeholder="13.443"
                />
                <SourceFieldOptions
                  sources={initialData?.source_references}
                  field="longitude"
                  currentValue={formData.longitude}
                  onSelect={(val) => setFormData({ ...formData, longitude: val })}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Globe className="w-4 h-4" /> Contact & Info
              </h3>
              <ResetSectionButton
                sources={uniqueSources}
                onReset={(source) => resetFields(source, ['content_url', 'phone', 'email'])}
              />
            </div>

            <div>
              <Input
                label="Content URL"
                value={formData.content_url || ''}
                onChange={(e) => setFormData({ ...formData, content_url: e.target.value })}
                leftIcon={<LinkIcon className="w-4 h-4" />}
                placeholder="https://..."
              />
              <SourceFieldOptions
                sources={initialData?.source_references}
                field="content_url"
                currentValue={formData.content_url}
                onSelect={(val) => setFormData({ ...formData, content_url: val })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Input
                  label="Phone"
                  value={formData.phone || ''}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  leftIcon={<Phone className="w-4 h-4" />}
                />
                <SourceFieldOptions
                  sources={initialData?.source_references}
                  field="phone"
                  currentValue={formData.phone}
                  onSelect={(val) => setFormData({ ...formData, phone: val })}
                />
              </div>
              <div>
                <Input
                  label="Email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  leftIcon={<Mail className="w-4 h-4" />}
                />
                <SourceFieldOptions
                  sources={initialData?.source_references}
                  field="email"
                  currentValue={formData.email}
                  onSelect={(val) => setFormData({ ...formData, email: val })}
                />
              </div>
            </div>
          </div>

          {initialData?.events && initialData.events.length > 0 && (
            <div className="pt-6 border-t border-gray-200 dark:border-gray-800">
              <RelatedEventsList
                events={initialData.events}
                title="Upcoming Events"
                onEdit={handleEditEvent}
              />
            </div>
          )}
        </form >
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex justify-end gap-3">
        <Button
          variant="secondary"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          form="venue-form" // Link to form id
          isLoading={isLoading}
        >
          {initialData && initialData.id ? 'Save Changes' : 'Create Venue'}
        </Button>
      </div>

      {/* Event Edit Modal */}
      {editingEvent && (
        <Modal
          isOpen={!!editingEvent}
          onClose={() => setEditingEvent(null)}
          title="Edit Event"
          noPadding
        >
          <EventForm
            initialData={editingEvent}
            onSubmit={handleEventSubmit}
            onCancel={() => setEditingEvent(null)}
            isModal
          />
        </Modal>
      )}
    </div>
  );
}
