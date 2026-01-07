
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Venue, Event } from '@/types';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { SourceFieldOptions } from '@/components/ui/SourceFieldOptions';
import { ResetSectionButton } from '@/components/ui/ResetSectionButton';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { Star, MapPin, Globe, Link as LinkIcon, Phone, Mail, FileText, Search, X, Trash2 } from 'lucide-react';
import { RelatedEventsList } from '@/components/features/RelatedEventsList';
import { getBestSourceForField } from '@/lib/smartMerge';
import { fetchCities, updateEvent, fetchEvent, fetchCountries, fetchAdminVenues, fetchVenue } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { EventForm } from '@/components/features/EventForm';
import { useToast } from '@/contexts/ToastContext';
import { AutoFillSearch } from '@/components/features/AutoFillSearch';
import { FormLayout } from '@/components/ui/FormLayout';
import { FormSection } from '@/components/ui/FormSection';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useDeleteWithUsage } from '@/hooks/useDeleteWithUsage';
import HistoryPanel from './HistoryPanel';
import clsx from 'clsx';

interface VenueFormProps {
  initialData?: Partial<Venue>;
  onSubmit: (data: Partial<Venue>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCancel: (force?: boolean) => void;
  isLoading?: boolean;
  isModal?: boolean;
  onNavigate?: (type: 'event' | 'venue' | 'artist', id?: string, data?: any) => void;
  isPanel?: boolean;
  id?: string;
  onDirtyChange?: (isDirty: boolean) => void;
}

const VENUE_TYPES = [
  'Club', 'Bar', 'Live Music Venue', 'Concert Hall', 'Festival Grounds', 'Art Space', 'Theater', 'Other'
];

export function VenueForm({
  initialData,
  onSubmit,
  onDelete,
  onCancel,
  isLoading,
  isModal = false,
  onNavigate,
  isPanel = false,
  id,
  onDirtyChange
}: VenueFormProps) {
  const { success, error: showError } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // Tabs State
  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');

  // Fetch logic if ID provided but no initialData
  const [fetchedData, setFetchedData] = useState<Partial<Venue> | null>(null);

  useEffect(() => {
    if (id && !initialData && !fetchedData) {
      fetchVenue(id).then(v => {
        if (v) {
          setFormData(prev => ({ ...prev, ...v }));
          setFetchedData(v);
        }
      });
    }
  }, [id, initialData, fetchedData]);

  // Dirty State Logic
  const effectiveInitial = useMemo(() => {
    if (initialData) {
      return {
        name: initialData.name || '',
        address: initialData.address || '',
        city: initialData.city || '',
        country: initialData.country || '',
        latitude: initialData.latitude,
        longitude: initialData.longitude,
        content_url: initialData.content_url || '',
        venue_type: initialData.venue_type || '',
        phone: initialData.phone || '',
        email: initialData.email || '',
        description: initialData.description || ''
      };
    } else if (fetchedData) {
      return fetchedData;
    }
    return {};
  }, [initialData, fetchedData]);

  // Update formData when effectiveInitial changes (only first time or force reset?)
  // We need to be careful not to overwrite user input if they started typing while fetch happened.
  // But usually this happens on mount.
  useEffect(() => {
    // Logic from original: setFormData on mount/change
    // Check if keys are actually different to avoid loop?
    // Simplified: Just update if we have data.
    if (Object.keys(effectiveInitial).length > 0) {
      setFormData(prev => ({ ...prev, ...effectiveInitial }));
    }
  }, [effectiveInitial]);

  const isDirty = useMemo(() => {
    if (!effectiveInitial || Object.keys(effectiveInitial).length === 0) return false;
    // Compare basic fields
    const keys = Object.keys(effectiveInitial) as (keyof Venue)[];
    for (const key of keys) {
      // @ts-ignore
      const val1 = formData[key];
      // @ts-ignore
      const val2 = effectiveInitial[key];

      const v1Empty = val1 === null || val1 === undefined || val1 === '';
      const v2Empty = val2 === null || val2 === undefined || val2 === '';

      if (v1Empty && v2Empty) continue;
      if (val1 != val2) return true;
    }
    return false;
  }, [formData, effectiveInitial]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);


  // Prepare Save Function
  const handleSave = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    // Duplicate Check?
    if (!initialData?.id && formData.name) {
      try {
        const existingResult = await fetchAdminVenues({
          search: formData.name,
          city: formData.city || undefined
        });
        const candidates = Array.isArray(existingResult) ? existingResult : (existingResult as any).data || [];
        const isDuplicate = candidates.some((v: Venue) =>
          v.name.toLowerCase() === formData.name?.toLowerCase() &&
          (!formData.city || v.city?.toLowerCase() === formData.city.toLowerCase())
        );

        if (isDuplicate) {
          showError('A venue with this name and city already exists.');
          setIsSubmitting(false);
          return; // Block save
        }
      } catch (err) {
        console.error('Failed to check duplicates', err);
      }
    }

    try {
      await onSubmit(formData);
      // Reset dirty state by syncing fetchedData to current form
      if (initialData?.id || fetchedData) {
        setFetchedData(prev => ({ ...prev, ...formData }));
      }
      success('Venue saved successfully');
      onCancel(true); // Close after save
    } catch (e: any) {
      console.error(e);
      showError(e.message || 'Failed to save venue');
    } finally {
      setIsSubmitting(false);
    }
  };

  const { promptBeforeAction, modalElement } = useUnsavedChanges({
    isLinkDirty: isDirty,
    onSave: handleSave,
    onDiscard: onCancel
  });

  const { handleDeleteClick, confirmDelete, cancelDelete, showConfirm: showConfirmDelete, usageCount, isDeleting } = useDeleteWithUsage({
    entityType: 'venues',
    onDelete: async (id) => {
      if (onDelete) await onDelete(id);
    },
    onSuccess: () => {
      onCancel();
      success('Venue deleted successfully');
    },
    onError: (err) => showError(err.message)
  });

  const handleCancelRequest = () => {
    promptBeforeAction(() => onCancel());
  };

  // --- Sub-Features ---
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const handleEditEvent = async (event: Event) => {
    if (onNavigate) {
      promptBeforeAction(() => onNavigate('event', event.id));
      return;
    }
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

  const [availableCities, setAvailableCities] = useState<any[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [countries, setCountries] = useState<{ name: string; code: string }[]>([]);

  useEffect(() => {
    fetchCities().then(setAvailableCities).catch(console.error);
    fetchCountries().then(setCountries).catch(console.error);
  }, []);

  const handleAutoFill = (result: any) => {
    let countryCode = result.country || '';
    if (countryCode) {
      const strictMatch = countries.find(c => c.code === countryCode.toUpperCase());
      if (strictMatch) countryCode = strictMatch.code;
      else {
        const nameMatch = countries.find(c => c.name.toLowerCase() === countryCode.toLowerCase());
        if (nameMatch) countryCode = nameMatch.code;
      }
    }
    if (!countryCode && result.raw?.address?.country) {
      const rawMatch = countries.find(c => c.name.toLowerCase() === result.raw.address.country.toLowerCase());
      if (rawMatch) countryCode = rawMatch.code;
    }

    const updates: Partial<Venue> = {
      name: result.name,
      city: result.city || formData.city,
      country: countryCode || formData.country,
      latitude: result.lat,
      longitude: result.lon
    };

    if (result.source === 'tm' && result.raw) {
      const addr = [result.raw.address?.line1, result.raw.address?.line2].filter(Boolean).join(', ');
      if (addr) updates.address = addr;
    } else if (result.source === 'osm' && result.raw?.address) {
      const addr = result.raw.address;
      const parts = [];
      if (addr.road) parts.push(addr.road);
      if (addr.house_number) parts.push(addr.house_number);
      updates.address = parts.join(' ') || result.name;
      if (!updates.city) updates.city = addr.city || addr.town || addr.village || '';
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
        if (bestSource) val = (bestSource as any)[field];
      } else {
        const source = sources.find(s => s.source_code === sourceCode);
        if (source && (source as any)[field] !== undefined) val = (source as any)[field];
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

  // Header Extra Content
  const headerExtras = (
    <div className="flex items-center gap-4">
      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
        <button
          type="button"
          onClick={() => setActiveTab('details')}
          className={clsx(
            "px-3 py-1 text-xs font-semibold rounded transition-all",
            activeTab === 'details' ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-100" : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
          )}
        >
          Details
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={clsx(
            "px-3 py-1 text-xs font-semibold rounded transition-all",
            activeTab === 'history' ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-100" : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
          )}
        >
          History
        </button>
      </div>

      {uniqueSources.length > 0 && (
        <div className="flex items-center gap-2 ml-4 pl-4 border-l border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-500">Reset:</span>
          <button type="button" onClick={() => handleResetToSource('best')} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 hover:bg-primary-100 dark:hover:bg-primary-900/50 text-primary-600 dark:text-primary-400 font-bold uppercase transition-colors" title="Reset to best matched data"><Star className="w-3 h-3 fill-current" /> Best</button>
          {uniqueSources.map(source => (
            <button key={source} type="button" onClick={() => handleResetToSource(source)} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-primary-50 dark:hover:bg-primary-900/30 text-gray-600 dark:text-gray-300 uppercase"><SourceIcon sourceCode={source} className="w-3 h-3" /></button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {modalElement}
      <FormLayout
        title={initialData && initialData.id ? 'Edit Venue' : 'New Venue'}
        isModal={isModal}
        isPanel={isPanel}
        onCancel={handleCancelRequest}
        onSave={handleSave}
        onDelete={initialData && initialData.id && onDelete ? () => handleDeleteClick(initialData.id!) : undefined}
        isLoading={isLoading || isSubmitting}
        headerExtras={headerExtras}
        saveLabel={initialData && initialData.id ? 'Save Changes' : 'Create Venue'}
      >
        {activeTab === 'history' ? (
          <div className="py-6"><HistoryPanel entityId={initialData?.id || ''} entityType="venue" /></div>
        ) : (
          <>
            {/* Basic Details */}
            <FormSection
              title="Basic Details"
              icon={<FileText className="w-4 h-4" />}
              sources={uniqueSources}
              onReset={(source) => resetFields(source, ['name', 'venue_type', 'description'])}
            >
              <div className="space-y-4 pt-4">
                <div className="relative">
                  {!initialData?.id && (
                    <div className="mb-4">
                      <div className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Auto-fill</div>
                      <AutoFillSearch type="venue" onSelect={handleAutoFill} placeholder="Search venue to auto-fill..." className="mb-2" />
                    </div>
                  )}

                  <Input label="Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required placeholder="e.g. Berghain" maxLength={255} />
                  <SourceFieldOptions sources={initialData?.source_references} field="name" currentValue={formData.name} onSelect={(val) => setFormData({ ...formData, name: val })} />
                </div>

                <div>
                  <div className="relative">
                    <Select
                      label="Venue Type"
                      value={formData.venue_type || ''}
                      onChange={(e) => setFormData({ ...formData, venue_type: e.target.value })}
                      options={[
                        { label: '-- Select Type --', value: '' },
                        ...VENUE_TYPES.map(type => ({ label: type, value: type }))
                      ]}
                    />
                    <SourceFieldOptions sources={initialData?.source_references} field="venue_type" currentValue={formData.venue_type} onSelect={(val) => setFormData({ ...formData, venue_type: val })} />
                  </div>
                </div>

                <div>
                  <Textarea
                    label="Description"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={4}
                    placeholder="Venue description..."
                    maxLength={5000}
                  />
                  <SourceFieldOptions sources={initialData?.source_references} field="description" currentValue={formData.description} onSelect={(val) => setFormData({ ...formData, description: val })} />
                </div>
              </div>
            </FormSection>

            {/* Location */}
            <FormSection
              title="Location"
              icon={<MapPin className="w-4 h-4" />}
              sources={uniqueSources}
              onReset={(source) => resetFields(source, ['address', 'city', 'country', 'latitude', 'longitude'])}
            >
              <div className="space-y-4 pt-4">
                <div>
                  <Input label="Address" value={formData.address || ''} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Street address..." maxLength={255} />
                  <SourceFieldOptions sources={initialData?.source_references} field="address" currentValue={formData.address} onSelect={(val) => setFormData({ ...formData, address: val })} />
                </div>

                <div className="relative" onClick={e => e.stopPropagation()}>
                  <Input label="City" value={formData.city || ''} onChange={(e) => { setFormData({ ...formData, city: e.target.value }); setShowCitySuggestions(true); }} onFocus={() => setShowCitySuggestions(true)} placeholder="e.g. Berlin" maxLength={100} />
                  {showCitySuggestions && availableCities.length > 0 && (
                    <div className="absolute z-10 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                      {availableCities.filter(c => c.name.toLowerCase().includes((formData.city || '').toLowerCase())).map(c => (
                        <div key={c.id} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm flex justify-between" onClick={() => { setFormData(prev => ({ ...prev, city: c.name, country: c.country || prev.country })); setShowCitySuggestions(false); }}>
                          <span>{c.name}</span>
                          <span className="text-gray-500 text-xs">{c.country}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <SourceFieldOptions sources={initialData?.source_references} field="city" currentValue={formData.city} onSelect={(val) => setFormData({ ...formData, city: val })} />
                </div>

                <div>
                  <Input label="Country" value={formData.country || ''} onChange={(e) => setFormData({ ...formData, country: e.target.value })} placeholder="e.g. DE" maxLength={100} />
                  <SourceFieldOptions sources={initialData?.source_references} field="country" currentValue={formData.country} onSelect={(val) => setFormData({ ...formData, country: val })} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Input label="Latitude" type="number" step="any" value={formData.latitude || ''} onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) })} placeholder="52.511" />
                  <Input label="Longitude" type="number" step="any" value={formData.longitude || ''} onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) })} placeholder="13.443" />
                </div>
              </div>
            </FormSection>

            {/* Contact */}
            <FormSection
              title="Contact & Info"
              icon={<Globe className="w-4 h-4" />}
              sources={uniqueSources}
              onReset={(source) => resetFields(source, ['content_url', 'phone', 'email'])}
            >
              <div className="space-y-4 pt-4">
                <div>
                  <Input label="Content URL" type="url" value={formData.content_url || ''} onChange={(e) => setFormData({ ...formData, content_url: e.target.value })} leftIcon={<LinkIcon className="w-4 h-4" />} placeholder="https://..." />
                  <SourceFieldOptions sources={initialData?.source_references} field="content_url" currentValue={formData.content_url} onSelect={(val) => setFormData({ ...formData, content_url: val })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Input label="Phone" type="tel" value={formData.phone || ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} leftIcon={<Phone className="w-4 h-4" />} />
                    <SourceFieldOptions sources={initialData?.source_references} field="phone" currentValue={formData.phone} onSelect={(val) => setFormData({ ...formData, phone: val })} />
                  </div>
                  <div>
                    <Input label="Email" type="email" value={formData.email || ''} onChange={(e) => setFormData({ ...formData, email: e.target.value })} leftIcon={<Mail className="w-4 h-4" />} />
                    <SourceFieldOptions sources={initialData?.source_references} field="email" currentValue={formData.email} onSelect={(val) => setFormData({ ...formData, email: val })} />
                  </div>
                </div>
              </div>
            </FormSection>

            {initialData?.events && initialData.events.length > 0 && (
              <div className="pt-6 border-t border-gray-200 dark:border-gray-800">
                <RelatedEventsList events={initialData.events} title="Upcoming Events" onEdit={handleEditEvent} />
              </div>
            )}
          </>
        )}

      </FormLayout>

      {editingEvent && (
        <Modal isOpen={!!editingEvent} onClose={() => setEditingEvent(null)} title="Edit Event" noPadding>
          <EventForm initialData={editingEvent} onSubmit={handleEventSubmit} onCancel={() => setEditingEvent(null)} isModal />
        </Modal>
      )
      }

      {
        showConfirmDelete && (
          <Modal isOpen={showConfirmDelete} onClose={cancelDelete} title="Confirm Deletion">
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Delete Venue?</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">Are you sure you want to delete <span className="font-semibold">{formData.name}</span>? This action cannot be undone.</p>

              {usageCount !== null && usageCount > 0 && (
                <div className="mb-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-md border border-red-200 dark:border-red-800">
                  <div className="flex items-start gap-3">
                    <Trash2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Warning: Linked Data</p>
                      <p className="text-sm mt-1">This venue is linked to <strong>{usageCount}</strong> events.</p>
                      <p className="text-sm mt-1">Deleting this venue will remove the association from these events.</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={cancelDelete}>Cancel</Button>
                <Button variant="danger" onClick={confirmDelete} isLoading={isDeleting}>Delete Venue</Button>
              </div>
            </div>
          </Modal>
        )
      }
    </>
  );
}
