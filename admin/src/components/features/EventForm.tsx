
import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { format } from 'date-fns';
import {
  Save, X, Trash2, MapPin, Calendar, Clock, Globe,
  Search, Plus, Users, Music, AlertTriangle, Star,
  Image as ImageIcon, Link as LinkIcon, Ticket
} from 'lucide-react';
import { Event, EVENT_TYPES, EventType, Venue, Artist } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SourceFieldOptions } from '@/components/ui/SourceFieldOptions';
import { ResetSectionButton } from '@/components/ui/ResetSectionButton';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { Modal } from '@/components/ui/Modal';
import { getBestSourceForField, SOURCE_PRIORITY } from '@/lib/smartMerge';
import { VenueForm } from '@/components/features/VenueForm';
import { ArtistForm } from '@/components/features/ArtistForm';
import {
  searchVenues, searchArtists, createVenue, createArtist,
  fetchArtist, updateArtist, fetchVenue, updateVenue
} from '@/lib/api';

// Dynamic import for Map
const EventMap = dynamic(() => import('@/components/EventMap'), { ssr: false });

interface EventFormProps {
  initialData?: Event;
  onSubmit: (data: Partial<Event>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  isModal?: boolean;
}

export function EventForm({
  initialData,
  onSubmit,
  onDelete,
  onCancel,
  isLoading = false,
  isModal = false
}: EventFormProps) {
  const [formData, setFormData] = useState<Partial<Event>>(initialData || {
    title: '',
    event_type: 'event',
    publish_status: 'pending'
  });

  const [showMap, setShowMap] = useState(false);

  // Venue Logic
  const [venueSearchQuery, setVenueSearchQuery] = useState('');
  const [venueSuggestions, setVenueSuggestions] = useState<Venue[]>([]);
  const [showVenueSuggestions, setShowVenueSuggestions] = useState(false);
  const [isVenueSearching, setIsVenueSearching] = useState(false);
  const venueSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showVenueModal, setShowVenueModal] = useState(false);
  const [editingVenueData, setEditingVenueData] = useState<Venue | undefined>(undefined);

  // Artist Logic
  const [artistSearchQuery, setArtistSearchQuery] = useState('');
  const [artistSuggestions, setArtistSuggestions] = useState<Artist[]>([]);
  const [showArtistSuggestions, setShowArtistSuggestions] = useState(false);
  const [isArtistSearching, setIsArtistSearching] = useState(false);
  const artistSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showArtistModal, setShowArtistModal] = useState(false);
  const [selectedArtists, setSelectedArtists] = useState<{ id: string; name: string }[]>([]);
  const [editingArtistData, setEditingArtistData] = useState<Artist | undefined>(undefined);

  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (initialData) {
      // Create a clean copy of initialData
      const data = { ...initialData };

      // Set initial endDate
      if (data.end_time && data.end_time.includes('T')) {
        setEndDate(data.end_time.split('T')[0]);
      } else {
        setEndDate(data.date ? data.date.split('T')[0] : '');
      }

      // Fix time formatting if it's a full ISO string (backend sends timestamps)
      if (data.start_time && data.start_time.includes('T')) {
        data.start_time = data.start_time.split('T')[1].substring(0, 5);
      } else if (data.start_time && data.start_time.length > 5) {
        data.start_time = data.start_time.substring(0, 5);
      }

      if (data.end_time && data.end_time.includes('T')) {
        data.end_time = data.end_time.split('T')[1].substring(0, 5);
      } else if (data.end_time && data.end_time.length > 5) {
        data.end_time = data.end_time.substring(0, 5);
      }

      setFormData(data);

      // Load artists list if available
      if (initialData.artists_list && Array.isArray(initialData.artists_list)) {
        // Map to format expect by MultiSelect (value/label)
        // Wait, MultiSelect in EventForm uses simple array of strings or objects?
        // Looking at renderArtists: it map selectedArtists (EventArtist[])
        setSelectedArtists(initialData.artists_list.map((a: any) => ({
          id: a.id,
          name: a.name,
          role: a.role || 'performer',
          billing_order: a.billing_order || 0
        })));
      }
      if (initialData.venue_name && !initialData.venue_id) {
        // Pre-fill search if no ID but has name
        setVenueSearchQuery(initialData.venue_name);
      }
    }
  }, [initialData]);

  // Sync venue name to search query if ID is cleared (e.g. via Reset)
  useEffect(() => {
    if (!formData.venue_id && formData.venue_name && formData.venue_name !== venueSearchQuery) {
      setVenueSearchQuery(formData.venue_name);
    }
  }, [formData.venue_id, formData.venue_name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Construct full ISO timestamps
    let finalStartTime = formData.start_time;
    if (formData.date && formData.start_time && !formData.start_time.includes('T')) {
      finalStartTime = `${formData.date.split('T')[0]}T${formData.start_time}:00`;
    }

    let finalEndTime = formData.end_time;
    // Use explicit endDate if available, otherwise fallback to start date
    const targetEndDate = endDate || (formData.date ? formData.date.split('T')[0] : '');
    if (targetEndDate && formData.end_time && !formData.end_time.includes('T')) {
      finalEndTime = `${targetEndDate}T${formData.end_time}:00`;
    }

    // Include the selected artists in the form data
    const finalData = {
      ...formData,
      start_time: finalStartTime,
      end_time: finalEndTime,
      artists_list: selectedArtists
    };
    await onSubmit(finalData);
  };

  const handleStatusChange = (status: 'pending' | 'approved' | 'rejected') => {
    setFormData(prev => ({ ...prev, publish_status: status }));
  };

  // --- Venue Handlers ---

  // Triggers search when query changes (user types OR reset updates it)
  useEffect(() => {
    if (venueSearchTimeoutRef.current) clearTimeout(venueSearchTimeoutRef.current);

    if (venueSearchQuery.length > 1) {
      venueSearchTimeoutRef.current = setTimeout(async () => {
        setIsVenueSearching(true);
        try {
          const results = await searchVenues(venueSearchQuery, formData.venue_city || undefined);
          setVenueSuggestions(results);
          setShowVenueSuggestions(true);
        } catch (err) {
          console.error('Venue search failed', err);
        } finally {
          setIsVenueSearching(false);
        }
      }, 400);
    } else {
      setVenueSuggestions([]);
      setShowVenueSuggestions(false);
    }

    return () => {
      if (venueSearchTimeoutRef.current) clearTimeout(venueSearchTimeoutRef.current);
    };
  }, [venueSearchQuery, formData.venue_city]);

  const handleVenueSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVenueSearchQuery(e.target.value);
  };

  const selectVenue = (venue: Venue) => {
    setFormData(prev => ({
      ...prev,
      venue_id: venue.id,
      venue_name: venue.name,
      venue_address: venue.address,
      venue_city: venue.city,
      venue_country: venue.country,
      latitude: venue.latitude,
      longitude: venue.longitude
    }));
    setShowVenueSuggestions(false);
    setVenueSearchQuery('');
  };

  const removeVenue = () => {
    setFormData(prev => ({
      ...prev,
      venue_id: null,
      venue_name: null,
      venue_address: null,
      // Keep city/country as they might be event specific? 
      // Usually users want to clear everything.
      venue_city: null,
      venue_country: null,
      latitude: null,
      longitude: null
    }));
  };

  const handleCreateVenue = async (data: Partial<Venue>) => {
    try {
      let result: Venue;
      if (editingVenueData?.id) {
        result = await updateVenue(editingVenueData.id, data);
      } else {
        result = await createVenue(data as any);
      }
      selectVenue(result);
      setShowVenueModal(false);
      setEditingVenueData(undefined);
    } catch (e) {
      console.error("Failed to save venue", e);
      // You might want to show a toast here
    }
  };

  const openCreateVenueForQuery = () => {
    setEditingVenueData(undefined); // New mode
    // Pre-fill name with query
    setEditingVenueData({ name: venueSearchQuery } as any);
    setShowVenueModal(true);
    setShowVenueSuggestions(false);
  };

  const handleEditVenue = async () => {
    if (formData.venue_id) {
      try {
        const v = await fetchVenue(formData.venue_id);
        setEditingVenueData(v);
        setShowVenueModal(true);
      } catch (e) {
        console.error("Failed to fetch venue for edit", e);
      }
    }
  };


  // --- Artist Handlers ---

  const handleArtistSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setArtistSearchQuery(value);

    if (artistSearchTimeoutRef.current) clearTimeout(artistSearchTimeoutRef.current);

    if (value.length > 1) {
      artistSearchTimeoutRef.current = setTimeout(async () => {
        setIsArtistSearching(true);
        try {
          const results = await searchArtists(value);
          // Filter out already selected
          const filtered = results.filter((a: Artist) => !selectedArtists.find(sa => sa.id === a.id));
          setArtistSuggestions(filtered);
          setShowArtistSuggestions(true);
        } catch (err) {
          console.error('Artist search failed', err);
        } finally {
          setIsArtistSearching(false);
        }
      }, 400);
    } else {
      setArtistSuggestions([]);
      setShowArtistSuggestions(false);
    }
  };

  const selectArtist = (artist: Artist) => {
    setSelectedArtists(prev => [...prev, { id: artist.id, name: artist.name }]);
    setArtistSearchQuery('');
    setShowArtistSuggestions(false);
  };

  const removeArtist = (id: string) => {
    setSelectedArtists(prev => prev.filter(a => a.id !== id));
  };

  const handleCreateArtist = async (data: Partial<Artist>) => {
    try {
      let result: Artist;
      if (editingArtistData?.id) {
        result = await updateArtist(editingArtistData.id, data as any);
        // Update name in selected list if edited
        setSelectedArtists(prev => prev.map(a => a.id === result.id ? { id: result.id, name: result.name } : a));
      } else {
        const response = await createArtist(data as any);
        result = response.artist;
        selectArtist(result);
      }
      setShowArtistModal(false);
      setEditingArtistData(undefined);
    } catch (e) {
      console.error("Failed to save artist", e);
    }
  };

  const openCreateArtistForQuery = () => {
    setEditingArtistData(undefined);
    setEditingArtistData({ name: artistSearchQuery } as any);
    setShowArtistModal(true);
    setShowArtistSuggestions(false);
  };

  const handleEditArtist = async (artist: { id: string; name: string }) => {
    // If it's a temp ID or source ID that hasn't been created yet
    if (!artist.id || artist.id.toString().startsWith('temp-') || artist.id.toString().startsWith('source-')) {
      setEditingArtistData({ name: artist.name } as any);
      setShowArtistModal(true);
      return;
    }

    try {
      const data = await fetchArtist(artist.id);
      setEditingArtistData(data);
      setShowArtistModal(true);
    } catch (e) {
      console.error("Failed to fetch artist details", e);
      // Fallback to opening with name if fetch fails
      setEditingArtistData({ name: artist.name } as any);
      setShowArtistModal(true);
    }
  };


  const uniqueSources = Array.from(new Set((initialData?.source_references || []).map(s => s.source_code)));

  const resetFields = (sourceCode: string, fields: (keyof Event)[]) => {
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
        if (field === 'start_time' || field === 'end_time') {
          let timeVal = '';
          let dateVal = '';

          if (val instanceof Date) {
            const iso = val.toISOString();
            dateVal = iso.split('T')[0];
            timeVal = iso.split('T')[1].substring(0, 5);
          } else if (typeof val === 'string' && val.includes('T')) {
            const [d, t] = val.split('T');
            dateVal = d;
            timeVal = t.substring(0, 5);
          } else {
            timeVal = String(val).substring(0, 5);
          }

          // @ts-ignore
          newFormData[field] = timeVal;
          // Only update endDate if we have a date part
          if (field === 'end_time' && dateVal) setEndDate(dateVal);
        } else if (field === 'artists') {
          // Special handling for artists: reset selectedArtists list
          let artistList: any[] = [];
          if (Array.isArray(val)) {
            artistList = val;
          } else if (typeof val === 'string') {
            try { artistList = JSON.parse(val); } catch { }
          }

          if (Array.isArray(artistList)) {
            setSelectedArtists(artistList.map((a: any) => ({
              id: a.id || a.source_artist_id || 'source-' + Math.random(),
              name: a.name
            })));
            hasChanges = true; // Mark as changed so other fields update if needed
          }
        } else if (field === 'venue_name') {
          // If resetting venue name, we should unlink the Venue ID to ensure it matches source string
          // @ts-ignore
          newFormData['venue_id'] = null;
          // @ts-ignore
          newFormData[field] = val;
        } else {
          // @ts-ignore
          newFormData[field] = val;
        }
        hasChanges = true;
      }
    });

    if (hasChanges) setFormData(newFormData);
  };


  const handleResetToSource = (sourceCode: string) => {
    resetFields(sourceCode, [
      'title', 'date', 'start_time', 'end_time', 'description',
      'venue_name', 'venue_address', 'venue_city', 'venue_country',
      'latitude', 'longitude',
      'content_url', 'flyer_front', 'ticket_url', 'event_type'
    ]);
  };

  // Helper for single field source selection
  const handleSourceSelect = (field: keyof Event, value: any) => {
    if ((field === 'start_time' || field === 'end_time')) {
      let timeVal = value;
      if (typeof value === 'string') {
        if (value.includes('T')) {
          const [d, t] = value.split('T');
          timeVal = t.substring(0, 5);
          if (field === 'end_time') setEndDate(d);
        } else {
          timeVal = value.substring(0, 5);
        }
      }
      setFormData(prev => ({ ...prev, [field]: timeVal }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      <Modal
        isOpen={showVenueModal}
        onClose={() => setShowVenueModal(false)}
        title={editingVenueData?.id ? 'Edit Venue' : 'Create New Venue'}
        size="lg"
        noPadding
      >
        <div className="h-[600px]">
          <VenueForm
            initialData={editingVenueData || { name: venueSearchQuery }}
            onSubmit={handleCreateVenue}
            onCancel={() => setShowVenueModal(false)}
            isModal
          />
        </div>
      </Modal>

      <Modal
        isOpen={showArtistModal}
        onClose={() => setShowArtistModal(false)}
        title={editingArtistData?.id ? 'Edit Artist' : 'Create New Artist'}
        size="lg"
        noPadding
      >
        <div className="h-[600px]">
          <ArtistForm
            initialData={editingArtistData || { name: artistSearchQuery } as Artist}
            onSubmit={handleCreateArtist}
            onCancel={() => setShowArtistModal(false)}
            isModal
          />
        </div>
      </Modal>

      <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0 relative">
        {/* Header */}
        {!isModal && (
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {initialData ? 'Edit Event' : 'New Event'}
              </h2>

              {/* Global Reset Section - Moved to Header */}
              {uniqueSources.length > 0 && (
                <div className="flex items-center gap-2 ml-4 pl-4 border-l border-gray-200 dark:border-gray-700">
                  <span className="text-xs text-gray-500">Reset from:</span>
                  <button
                    type="button"
                    onClick={() => handleResetToSource('best')}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 font-bold uppercase transition-colors"
                    title="Reset to best matched data"
                  >
                    <Star className="w-3 h-3 fill-current" /> Best
                  </button>
                  {uniqueSources.map(source => (
                    <button
                      key={source}
                      type="button"
                      onClick={() => handleResetToSource(source)}
                      className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-600 dark:text-gray-300 uppercase"
                      title={`Reset to ${source}`}
                    >
                      <SourceIcon sourceCode={source} className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {initialData && onDelete && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => onDelete(initialData.id)}
                  disabled={isLoading}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onCancel}
                disabled={isLoading}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">


          {/* Status Bar */}
          <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</span>
            <div className="flex bg-white dark:bg-gray-900 rounded-md p-1 border border-gray-200 dark:border-gray-700 shadow-sm">
              {(['pending', 'approved', 'rejected'] as const).map(status => (
                <button
                  key={status}
                  type="button"
                  onClick={() => handleStatusChange(status)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors capitalize ${formData.publish_status === status
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Basic Info */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Basic Info</h3>
              <ResetSectionButton
                sources={uniqueSources}
                onReset={(source) => resetFields(source, ['title', 'event_type', 'date', 'start_time', 'end_time'])}
              />
            </div>
            <div>
              <Input
                label="Title"
                value={formData.title || ''}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
              <SourceFieldOptions
                sources={initialData?.source_references}
                field="title"
                currentValue={formData.title}
                onSelect={(val) => handleSourceSelect('title', val)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Type Dropdown - Full width or half? Original was half. */}
              {/* Let's keep Type half width and maybe leave the other half empty or put something else later. 
                Actually, let's just close the grid after Type so it takes its space, 
                or better, make Type full width if appropriate, OR just close the grid div. 
            */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Type
                </label>
                <select
                  value={formData.event_type || 'event'}
                  onChange={(e) => setFormData({ ...formData, event_type: e.target.value as EventType })}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                >
                  {EVENT_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.icon} {type.label}
                    </option>
                  ))}
                </select>
                <SourceFieldOptions
                  sources={initialData?.source_references}
                  field="event_type"
                  currentValue={formData.event_type}
                  onSelect={(val) => handleSourceSelect('event_type', val)}
                />
              </div>
              {/* Empty col to keep Type half width */}
              <div></div>
            </div>

            {/* Start Date & Time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Input
                  label="Start Date"
                  type="date"
                  value={formData.date ? formData.date.split('T')[0] : ''}
                  onChange={(e) => {
                    setFormData({ ...formData, date: e.target.value });
                    if (!endDate) setEndDate(e.target.value);
                  }}
                  required
                />
                <SourceFieldOptions
                  sources={initialData?.source_references}
                  field="date"
                  currentValue={formData.date ? formData.date.split('T')[0] : ''}
                  onSelect={(val) => handleSourceSelect('date', val)}
                />
              </div>
              <div>
                <Input
                  label="Start Time"
                  type="time"
                  value={formData.start_time ? formData.start_time.slice(0, 5) : ''}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                />
                <SourceFieldOptions
                  sources={initialData?.source_references}
                  field="start_time"
                  currentValue={formData.start_time}
                  onSelect={(val) => handleSourceSelect('start_time', val)}
                />
              </div>
            </div>

            {/* End Date & Time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Input
                  label="End Date (Optional)"
                  type="date"
                  value={endDate || ''}
                  onChange={(e) => setEndDate(e.target.value)}
                  placeholder="Same as start date"
                />
              </div>
              <div>
                <Input
                  label="End Time"
                  type="time"
                  value={formData.end_time ? formData.end_time.slice(0, 5) : ''}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                />
                <SourceFieldOptions
                  sources={initialData?.source_references}
                  field="end_time"
                  currentValue={formData.end_time}
                  onSelect={(val) => handleSourceSelect('end_time', val)}
                />
              </div>
            </div>
          </div>

          {/* Artists Selection */}
          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Users className="w-4 h-4" /> Artists
                </h3>
              </div>
              <ResetSectionButton
                sources={uniqueSources}
                onReset={(source) => resetFields(source, ['artists'])}
              />
            </div>

            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedArtists.map(artist => {
                  let displayName = artist.name;
                  // Double check if name is somehow a JSON string (rare but possible in legacy data)
                  if (typeof displayName === 'string' && (displayName.startsWith('{') || displayName.startsWith('['))) {
                    try {
                      const parsed = JSON.parse(displayName);
                      displayName = parsed.name || displayName;
                    } catch { }
                  }

                  return (
                    <span key={artist.id} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                      <span onClick={() => handleEditArtist(artist)} className="cursor-pointer hover:underline mr-1">
                        {displayName}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeArtist(artist.id)}
                        className="ml-1 text-purple-600 hover:text-purple-900 dark:text-purple-400 dark:hover:text-purple-200 focus:outline-none"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>

              <Input
                value={artistSearchQuery}
                onChange={handleArtistSearchChange}
                onFocus={() => { if (artistSuggestions.length > 0) setShowArtistSuggestions(true); }}
                placeholder="Search and add artists..."
                leftIcon={<Search className="w-4 h-4" />}
              />
              {initialData?.source_references && (
                <SourceFieldOptions
                  sources={initialData?.source_references}
                  field="artists"
                  currentValue={selectedArtists}
                  onSelect={(val) => {
                    if (Array.isArray(val)) {
                      setSelectedArtists(val.map((a: any) => ({
                        id: a.id || a.source_artist_id || 'temp-' + Math.random(),
                        name: a.name
                      })));
                    }
                  }}
                  formatDisplay={(val) => Array.isArray(val) ? val.map((a: any) => a.name).join(', ') : ''}
                />
              )}

              {isArtistSearching && (
                <div className="absolute right-3 top-[calc(100%-38px)] animate-spin h-4 w-4 border-2 border-purple-500 rounded-full border-t-transparent"></div>
              )}

              {showArtistSuggestions && artistSearchQuery.length > 1 && (
                <div className="absolute z-10 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                  {artistSuggestions.map(artist => (
                    <div
                      key={artist.id}
                      className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm flex items-center justify-between"
                      onClick={() => selectArtist(artist)}
                    >
                      <span>{artist.name}</span>
                      {artist.country && <span className="text-xs text-gray-500">{artist.country}</span>}
                    </div>
                  ))}
                  <div
                    className="px-4 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer text-sm text-indigo-600 dark:text-indigo-400 border-t border-gray-100 dark:border-gray-700 font-medium flex items-center gap-2"
                    onClick={openCreateArtistForQuery}
                  >
                    <Plus className="w-4 h-4" /> Create "{artistSearchQuery}"
                  </div>
                </div>
              )}
            </div>
          </div>




          {/* Venue Selection */}
          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Location
              </h3>
              <ResetSectionButton
                sources={uniqueSources}
                onReset={(source) => resetFields(source, ['venue_name', 'venue_address', 'venue_city', 'venue_country', 'latitude', 'longitude'])}
              />
            </div>

            <div className="flex gap-4 items-start">
              {/* Left Column: Map Preview */}
              <div className="w-1/3 space-y-2">
                <div className="w-full aspect-video bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 relative pointer-events-none">
                  {(formData.venue_id || (formData.latitude && formData.longitude)) ? (
                    <EventMap
                      events={[formData as Event]}
                      center={formData.latitude && formData.longitude ? [formData.latitude, formData.longitude] : undefined}
                      zoom={13}
                      minimal
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      <MapPin className="w-8 h-8 opacity-20" />
                    </div>
                  )}
                </div>
                <SourceFieldOptions
                  sources={initialData?.source_references}
                  field="venue_name"
                  currentValue={formData.venue_name}
                  onSelect={(val) => setFormData({ ...formData, venue_name: val, venue_id: null })}
                />
              </div>

              {/* Right Column: Inputs */}
              <div className="flex-1 space-y-4">
                {/* Venue Selector / Display */}
                {formData.venue_id ? (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700 flex items-start justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        {formData.venue_name}
                        <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Linked</span>
                      </h4>
                      <p className="text-sm text-gray-500 mt-1">{formData.venue_address}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{[formData.venue_city, formData.venue_country].filter(Boolean).join(', ')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={handleEditVenue}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={removeVenue} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Search Input */
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <Input
                      value={venueSearchQuery}
                      onChange={handleVenueSearchChange}
                      onFocus={() => { if (venueSuggestions.length > 0) setShowVenueSuggestions(true); }}
                      placeholder="Search for a venue..."
                      autoComplete="off"
                      leftIcon={<Search className="w-4 h-4" />}
                    />
                    {isVenueSearching && (
                      <div className="absolute right-3 top-[38px] animate-spin h-4 w-4 border-2 border-indigo-500 rounded-full border-t-transparent"></div>
                    )}

                    {showVenueSuggestions && venueSearchQuery.length > 1 && (
                      <div className="absolute z-10 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                        {venueSuggestions.map(venue => (
                          <div
                            key={venue.id}
                            className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm"
                            onClick={() => selectVenue(venue)}
                          >
                            <p className="font-medium text-gray-900 dark:text-white">{venue.name}</p>
                            <p className="text-xs text-gray-500 truncate">{venue.address}, {venue.city}</p>
                          </div>
                        ))}
                        <div
                          className="px-4 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer text-sm text-indigo-600 dark:text-indigo-400 border-t border-gray-100 dark:border-gray-700 font-medium flex items-center gap-2"
                          onClick={openCreateVenueForQuery}
                        >
                          <Plus className="w-4 h-4" /> Create "{venueSearchQuery}"
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>


          </div>


          {/* Media & Links */}
          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <ImageIcon className="w-4 h-4" /> Media & Links
              </h3>
              <ResetSectionButton
                sources={uniqueSources}
                onReset={(source) => resetFields(source, ['flyer_front', 'content_url', 'ticket_url'])}
              />
            </div>

            <div>
              <Input
                label="Flyer URL"
                value={formData.flyer_front || ''}
                onChange={(e) => setFormData({ ...formData, flyer_front: e.target.value })}
              />
              <SourceFieldOptions
                sources={initialData?.source_references}
                field="flyer_front"
                currentValue={formData.flyer_front}
                onSelect={(val) => setFormData({ ...formData, flyer_front: val })}
              />
            </div>

            {formData.flyer_front && (
              <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <img
                  src={formData.flyer_front}
                  alt="Flyer preview"
                  className="w-full h-full object-contain"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              </div>
            )}

            <div>
              <Input
                label="Content URL"
                value={formData.content_url || ''}
                onChange={(e) => setFormData({ ...formData, content_url: e.target.value })}
                leftIcon={<LinkIcon className="w-4 h-4" />}
              />
              <SourceFieldOptions
                sources={initialData?.source_references}
                field="content_url"
                currentValue={formData.content_url}
                onSelect={(val) => setFormData({ ...formData, content_url: val })}
              />
            </div>

            <Input
              label="Ticket URL"
              value={formData.ticket_url || ''}
              onChange={(e) => setFormData({ ...formData, ticket_url: e.target.value })}
              leftIcon={<Ticket className="w-4 h-4" />}
            />
            <SourceFieldOptions
              sources={initialData?.source_references}
              field="ticket_url"
              currentValue={formData.ticket_url}
              onSelect={(val) => setFormData({ ...formData, ticket_url: val })}
            />
          </div>

          {/* Description */}
          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Description
              </label>
              <ResetSectionButton
                sources={uniqueSources}
                onReset={(source) => resetFields(source, ['description'])}
              />
            </div>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={6}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
            />
            <SourceFieldOptions
              sources={initialData?.source_references}
              field="description"
              currentValue={formData.description}
              onSelect={(val) => setFormData({ ...formData, description: val })}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isLoading}
          >
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </form>

    </div>
  );
}
