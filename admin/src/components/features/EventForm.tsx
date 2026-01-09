
import React, { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  MapPin, Calendar, Clock, Search, Plus, Users, Music, AlertTriangle, Star,
  Image as ImageIcon, Link as LinkIcon, Ticket, X, History, Check, RotateCcw,
  GitPullRequest, Info, ArrowLeft, ArrowRight, Save, ExternalLink, Trash2
} from 'lucide-react';
import { Event, EVENT_TYPES, EventType, Venue, Artist, EventStatus, SourceReference } from '@/types';
import { EVENT_STATES, EventStatusState, canTransition } from '@/lib/eventStateMachine';

// Re-export for compatibility if needed
export const EventStatusValues = EVENT_STATES;
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { SourceFieldOptions } from '@/components/ui/SourceFieldOptions';
import { ResetSectionButton } from '@/components/ui/ResetSectionButton';
import { FormLayout } from '@/components/ui/FormLayout';
import { FormSection } from '@/components/ui/FormSection';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { getBestSourceForField } from '@/lib/smartMerge';
import * as api from '@/lib/api';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useDeleteWithUsage } from '@/hooks/useDeleteWithUsage';
import { useToast } from '@/contexts/ToastContext';
import { Modal } from '@/components/ui/Modal';
import HistoryPanel from './HistoryPanel';
import { SourceSearchModal } from './SourceSearchModal';
import { ArtistForm } from '@/components/features/ArtistForm';
import clsx from 'clsx';

// Dynamic import for Map
const EventMap = dynamic(() => import('@/components/EventMap'), { ssr: false });

interface EventFormProps {
  initialData?: Event;
  onSubmit: (data: Partial<Event>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCancel: (force?: boolean) => void;
  isLoading?: boolean;
  isModal?: boolean;
  prevEventId?: string;
  nextEventId?: string;
  onNavigate?: (type: 'event' | 'venue' | 'artist', id?: string, data?: any) => void;
  isPanel?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function EventForm({
  initialData,
  onSubmit,
  onDelete,
  onCancel,
  isLoading = false,
  isModal = false,
  prevEventId,
  nextEventId,
  onNavigate,
  isPanel = false,
  onDirtyChange
}: EventFormProps) {
  // Tabs State
  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');
  const [pendingChanges, setPendingChanges] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);

  const [formData, setFormData] = useState<Partial<Event>>(() => {
    if (!initialData) {
      return {
        title: '',
        event_type: 'event',
        status: EventStatusValues.MANUAL_DRAFT,
        is_published: false
      };
    }

    // Helper to normalize time to HH:mm
    const normalizeTime = (val: string | undefined | null) => {
      if (!val) return '';
      if (val.includes('T')) return val.split('T')[1].substring(0, 5);
      return val.substring(0, 5);
    };

    return {
      ...initialData,
      start_time: normalizeTime(initialData.start_time),
      end_time: normalizeTime(initialData.end_time)
    };
  });

  // Fetch Changes Effect
  useEffect(() => {
    // Only auto-show if we have PENDING changes (not dismissed)
    if (initialData?.id && initialData?.has_pending_changes) {
      api.fetchPendingChanges(initialData.id)
        .then(res => {
          if (res.has_changes) {
            setPendingChanges(res);
            setShowUpdateBanner(true);
          }
        })
        .catch(err => console.error('Failed to fetch pending changes:', err));
    }
  }, [initialData?.id, initialData?.has_pending_changes]);

  // Check for dismissed changes (has_changes=true but has_pending_changes=false/undefined on event)
  const hasDismissedChanges = useMemo(() => {
    if (!initialData?.source_references) return false;
    // Check if any source has changes
    const anyChanges = initialData.source_references.some((s: any) => s.has_changes);
    // If we have changes but NO pending changes flag on the main event, they are dismissed
    return anyChanges && !initialData.has_pending_changes;
  }, [initialData]);

  const handleReviewDismissed = async () => {
    if (!initialData?.id) return;
    if (!pendingChanges) {
      try {
        const res = await api.fetchPendingChanges(initialData.id);
        if (res.has_changes) setPendingChanges(res);
      } catch (e) {
        console.error(e);
      }
    }
    setShowUpdateBanner(true);
  };

  // UI State
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [selectedArtists, setSelectedArtists] = useState<{ id: string; name: string }[]>(() => {
    if (initialData?.artists_list && Array.isArray(initialData.artists_list)) {
      return initialData.artists_list.map((a: any) => ({
        id: a.id || a.source_artist_id || 'source-' + Math.random(),
        name: a.name
      }));
    }
    return [];
  });

  const [endDate, setEndDate] = useState(() => {
    if (initialData?.end_date) return initialData.end_date.split('T')[0];
    if (initialData?.end_time && initialData.end_time.includes('T')) {
      return initialData.end_time.split('T')[0];
    }
    return '';
  });

  const [saveError, setSaveError] = useState<string | null>(null);

  // Derived Dirty State
  const isDirty = useMemo(() => {
    if (!initialData) return false;

    // Check Artists
    const currentArtists = selectedArtists.map(a => String(a.id)).sort().join(',');
    const initialArtists = (initialData.artists_list || []).map((a: any) => String(a.id)).sort().join(',');

    if (currentArtists !== initialArtists) return true;

    // Check Fields
    const fields: (keyof Event)[] = ['title', 'date', 'start_time', 'end_time', 'venue_name', 'status', 'description', 'ticket_url', 'event_type', 'flyer_front', 'content_url'];

    for (const f of fields) {
      let val1 = formData[f];
      let val2 = (initialData as any)[f];

      // Normalize Dates (YYYY-MM-DD)
      if (f === 'date') {
        if (typeof val1 === 'string' && val1.includes('T')) val1 = val1.split('T')[0];
        if (typeof val2 === 'string' && val2.includes('T')) val2 = val2.split('T')[0];
      }

      // Normalize Times (HH:mm)
      if (f === 'start_time' || f === 'end_time') {
        const norm = (v: any) => {
          if (typeof v === 'string' && v.includes('T')) return v.split('T')[1].substring(0, 5);
          if (typeof v === 'string') return v.substring(0, 5);
          return v;
        };
        val1 = norm(val1);
        val2 = norm(val2);
      }

      // Treat null, undefined, and empty strings as equal
      const v1Empty = val1 === null || val1 === undefined || val1 === '';
      const v2Empty = val2 === null || val2 === undefined || val2 === '';

      if (v1Empty && v2Empty) continue;

      if (val1 != val2) {
        return true;
      }
    }
    return false;
  }, [formData, selectedArtists, initialData]);

  // Notify parent of dirty change
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Sync status from external updates (e.g. List view quick actions)
  useEffect(() => {
    if (initialData?.status && initialData.status !== formData.status) {
      setFormData(prev => ({ ...prev, status: initialData.status }));
    }
  }, [initialData?.status]);


  // Prepare Save Function
  const internalSave = async () => {
    // Construct full ISO timestamps
    let finalStartTime = formData.start_time;
    if (finalStartTime && finalStartTime.includes('T')) {
      finalStartTime = finalStartTime.split('T')[1].substring(0, 5);
    }

    let finalEndTime = formData.end_time;
    if (finalEndTime && finalEndTime.includes('T')) {
      finalEndTime = finalEndTime.split('T')[1].substring(0, 5);
    }

    // Auto-promote to PUBLISHED if currently READY and user clicked "Publish"
    let finalStatus = formData.status;
    if (formData.status === EventStatusValues.READY_TO_PUBLISH) {
      // Check validation before publishing
      if (!validateContentUniqueness(formData.title || undefined, formData.description || undefined)) {
        throw new Error("Validation failed: Content must be unique.");
      }
      finalStatus = EventStatusValues.PUBLISHED;
    }

    const finalData = {
      ...formData,
      status: finalStatus,
      start_time: finalStartTime,
      end_date: endDate || null,
      end_time: finalEndTime,
      artists_list: selectedArtists
    };

    setSaveError(null);
    await onSubmit(finalData);
  };

  const handleSaveButton = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await internalSave();
      success('Event saved successfully');
      // Explicit save button closes the form
      onCancel(true);
    } catch (err: any) {
      console.error('Failed to save event:', err);
      setSaveError(err.message || 'Failed to save event');
      showError(err.message || 'Failed to save event');
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const { success, error: showError } = useToast();

  const { handleDeleteClick, confirmDelete: performDelete, cancelDelete, showConfirm: showConfirmDelete, usageCount, isDeleting } = useDeleteWithUsage({
    entityType: 'events', // Note: Make sure backend endpoint exists now
    onDelete: async (id) => {
      if (onDelete) await onDelete(id);
    },
    onSuccess: () => {
      onCancel(true);
      success('Event deleted successfully');
    },
    onError: (err) => showError(err.message || 'Failed to delete event')
  });

  // Unsaved Changes Hook
  const { promptBeforeAction, modalElement } = useUnsavedChanges({
    isLinkDirty: isDirty,
    onSave: internalSave, // Helper only saves, lets hook handle pending action (navigation/close)
    onDiscard: () => onCancel(true) // Discard triggers close/refresh if needed? No, usually discard just proceeds. But if 'Escape', we want to close.
  });

  const handleCancelRequest = () => {
    promptBeforeAction(() => onCancel(false)); // Check dirty before cancel
  };

  // Navigation Keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;

      if (e.key === 'ArrowUp' && prevEventId) {
        e.preventDefault();
        promptBeforeAction(() => onNavigate?.('event', prevEventId));
      } else if (e.key === 'ArrowDown' && nextEventId) {
        e.preventDefault();
        promptBeforeAction(() => onNavigate?.('event', nextEventId));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancelRequest();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevEventId, nextEventId, onNavigate, isDirty]);


  // --- Logic State ---
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});

  const [venueSearchQuery, setVenueSearchQuery] = useState(initialData?.venue_name || '');
  const [venueSuggestions, setVenueSuggestions] = useState<Venue[]>([]);
  const [showVenueSuggestions, setShowVenueSuggestions] = useState(false);
  const [isVenueSearching, setIsVenueSearching] = useState(false);
  const venueSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [artistSearchQuery, setArtistSearchQuery] = useState('');
  const [artistSuggestions, setArtistSuggestions] = useState<Artist[]>([]);
  const [showArtistSuggestions, setShowArtistSuggestions] = useState(false);
  const [isArtistSearching, setIsArtistSearching] = useState(false);
  /* Removed duplicate isArtistSearching */
  const artistSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isArtistModalOpen, setIsArtistModalOpen] = useState(false);
  const [artistModalQuery, setArtistModalQuery] = useState('');

  const handleCreateArtist = async (data: Partial<Artist>) => {
    if (!data.name) {
      showError('Artist name is required');
      return;
    }
    try {
      // Cast to required type or rely on API to handle
      const newArtist = await api.createArtist(data as { name: string, country?: string });
      if (newArtist) {
        selectArtist(newArtist);
        setIsArtistModalOpen(false);
        success(`Artist "${newArtist.name}" created`);
      }
    } catch (err: any) {
      console.error(err);
      showError(err.message || 'Failed to create artist');
    }
  };

  const uniqueSources = useMemo(() => {
    const map = new Map();
    (initialData?.source_references || []).forEach((s: any) => {
      if (!map.has(s.source_code)) map.set(s.source_code, s);
    });
    return Array.from(map.values()) as SourceReference[];
  }, [initialData?.source_references]);
  const sources = initialData?.source_references || [];

  const handleStatusChange = (newStatus: EventStatus) => {
    const savedStatus = (initialData?.status || EventStatusValues.MANUAL_DRAFT) as EventStatusState;

    if (!canTransition(savedStatus, newStatus as EventStatusState)) {
      setTransitionError(`Cannot transition from ${savedStatus.replace(/_/g, ' ')} to ${newStatus.replace(/_/g, ' ')}`);
      setTimeout(() => setTransitionError(null), 3000);
      return;
    }

    setTransitionError(null);

    // VALIDATION: Moving to READY or PUBLISHED requires unique content
    if (newStatus === EventStatusValues.READY_TO_PUBLISH || newStatus === EventStatusValues.PUBLISHED) {
      if (!validateContentUniqueness(formData.title || undefined, formData.description || undefined)) {
        return; // Error set by validate function
      }
    }

    setFormData(prev => ({ ...prev, status: newStatus }));
  };

  const validateContentUniqueness = (title?: string, description?: string) => {
    setValidationErrors({});
    const normalize = (s: string | undefined | null) => (s || '').toLowerCase().trim();
    const currentTitle = normalize(title);
    const currentDesc = normalize(description);

    for (const source of initialData?.source_references || []) {
      if (source.title && normalize(source.title) === currentTitle) {
        setTransitionError(`Title matches source "${source.source_code}". Please rewrite to be unique.`);
        setValidationErrors(prev => ({ ...prev, title: true }));
        setTimeout(() => setTransitionError(null), 5000);
        return false;
      }
      if (source.description && currentDesc && normalize(source.description) === currentDesc) {
        setTransitionError(`Description matches source "${source.source_code}". Please rewrite to be unique.`);
        setValidationErrors(prev => ({ ...prev, description: true }));
        setTimeout(() => setTransitionError(null), 5000);
        return false;
      }
    }
    return true;
  };

  // -- Helpers --
  const resetFields = (sourceCode: string, fields: (keyof Event)[]) => {
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
        if (field === 'start_time' || field === 'end_time') {
          let timeVal = '';
          if (val instanceof Date) timeVal = val.toISOString().split('T')[1].substring(0, 5);
          else if (typeof val === 'string' && val.includes('T')) timeVal = val.split('T')[1].substring(0, 5);
          else timeVal = String(val).substring(0, 5);

          // @ts-ignore
          newFormData[field] = timeVal;
          if (field === 'end_time' && typeof val === 'string' && val.includes('T')) {
            setEndDate(val.split('T')[0]);
          }
        } else if (field === 'artists') {
          let artistList: any[] = [];
          if (Array.isArray(val)) artistList = val;
          else if (typeof val === 'string') { try { artistList = JSON.parse(val); } catch { } }

          if (Array.isArray(artistList)) {
            setSelectedArtists(artistList.map((a: any) => ({
              id: a.id || a.source_artist_id || 'source-' + Math.random(),
              name: a.name
            })));
            hasChanges = true;
          }
        } else if (field === 'venue_name') {
          // @ts-ignore
          newFormData['venue_id'] = null;
          // @ts-ignore
          newFormData[field] = val;
          if (typeof val === 'string') setVenueSearchQuery(val);
        } else if (field === 'end_date') {
          const d = val instanceof Date ? val.toISOString().split('T')[0] : (typeof val === 'string' ? val.split('T')[0] : '');
          setEndDate(d);
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
      'title', 'date', 'start_time', 'end_date', 'end_time', 'description',
      'venue_name', 'venue_address', 'venue_city', 'venue_country',
      'latitude', 'longitude',
      'content_url', 'flyer_front', 'ticket_url', 'event_type'
    ]);
  };

  const handleSourceSelect = (field: keyof Event, value: any) => {
    // Clear validation error if resetting field (optional, but good UX)
    setValidationErrors(prev => ({ ...prev, [field]: false }));

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
    } else if (field === 'end_date') {
      const d = typeof value === 'string' ? value.split('T')[0] : '';
      setEndDate(d);
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  // Search Logic (Venue/Artist)
  useEffect(() => {
    if (venueSearchTimeoutRef.current) clearTimeout(venueSearchTimeoutRef.current);
    if (venueSearchQuery.length > 1) {
      venueSearchTimeoutRef.current = setTimeout(async () => {
        setIsVenueSearching(true);
        try {
          const results = await api.searchVenues(venueSearchQuery, formData.venue_city || undefined);
          setVenueSuggestions(results);
          setShowVenueSuggestions(true);
        } catch (err) { console.error(err); } finally { setIsVenueSearching(false); }
      }, 400);
    } else {
      setVenueSuggestions([]);
      setShowVenueSuggestions(false);
    }
    return () => { if (venueSearchTimeoutRef.current) clearTimeout(venueSearchTimeoutRef.current); };
  }, [venueSearchQuery, formData.venue_city]);

  const removeVenue = () => {
    setVenueSearchQuery(formData.venue_name || '');
    setFormData(prev => ({
      ...prev,
      venue_id: null,
      venue_name: '',
      venue_address: '',
      venue_city: '',
      venue_country: '',
      latitude: null,
      longitude: null
    }));
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

  const openCreateVenueForQuery = () => {
    onNavigate?.('venue', undefined, { name: venueSearchQuery });
    setShowVenueSuggestions(false);
  };

  const handleArtistSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setArtistSearchQuery(value);
    if (artistSearchTimeoutRef.current) clearTimeout(artistSearchTimeoutRef.current);
    if (value.length > 1) {
      artistSearchTimeoutRef.current = setTimeout(async () => {
        setIsArtistSearching(true);
        try {
          const results = await api.searchArtists(value);
          const filtered = results.filter((a: Artist) => !selectedArtists.find(sa => sa.id === a.id));
          setArtistSuggestions(filtered);
          setShowArtistSuggestions(true);
        } catch (err) { console.error(err); } finally { setIsArtistSearching(false); }
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

  // Header Extra Content (Reset Buttons & Tabs)
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

      {hasDismissedChanges && !showUpdateBanner && (
        <button
          type="button"
          onClick={handleReviewDismissed}
          className="ml-4 flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-medium rounded-full border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
        >
          <History className="w-3 h-3" /> Review Dismissed Updates
        </button>
      )}

      {uniqueSources.length > 0 && (
        <div className="flex items-center gap-2 pl-4 border-l border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-500">Reset:</span>
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
              key={source.source_code}
              type="button"
              onClick={() => handleResetToSource(source.source_code)}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-primary-50 dark:hover:bg-primary-900/30 text-gray-600 dark:text-gray-300 uppercase"
              title={`Reset to ${source.source_code}`}
            >
              <SourceIcon sourceCode={source.source_code} className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {modalElement}
      {showSourceModal && (
        <SourceSearchModal
          isOpen={showSourceModal}
          onClose={() => setShowSourceModal(false)}
          eventId={initialData?.id || ''}
          onLinkParams={async ({ sourceCode, sourceEventId }) => {
            if (!initialData?.id) return;
            await api.linkSource(initialData.id, sourceCode, sourceEventId);
            success('Source linked successfully');
            onSubmit({ ...formData } as any); // Trigger refresh
          }}
        />
      )}
      <FormLayout
        title={initialData ? 'Edit Event' : 'New Event'}
        isModal={isModal}
        isPanel={isPanel}
        onCancel={handleCancelRequest}
        onSave={handleSaveButton}
        onDelete={initialData && onDelete ? () => promptBeforeAction(() => handleDeleteClick(initialData.id)) : undefined}
        isLoading={isLoading || isSubmitting}
        headerExtras={headerExtras}
        saveLabel={formData.status === EventStatusValues.READY_TO_PUBLISH ? 'Publish' : 'Save & Close'}
      >
        {activeTab === 'history' ? (
          <div className="py-6"><HistoryPanel entityId={initialData?.id || ''} entityType="event" /></div>
        ) : (
          <div className="space-y-6">
            {/* Scraper Updates Alert */}
            {pendingChanges && pendingChanges.has_changes && showUpdateBanner && (
              <div className={clsx(
                "border rounded-lg p-4 mb-6 transition-all",
                pendingChanges.changes?.[0]?.is_dismissed
                  ? "bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700"
                  : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
              )}>
                <div className="flex items-start gap-3">
                  <GitPullRequest className={clsx(
                    "w-5 h-5 mt-0.5",
                    pendingChanges.changes?.[0]?.is_dismissed
                      ? "text-gray-500"
                      : "text-amber-600 dark:text-amber-500"
                  )} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className={clsx(
                        "text-sm font-medium",
                        pendingChanges.changes?.[0]?.is_dismissed
                          ? "text-gray-900 dark:text-gray-100"
                          : "text-amber-900 dark:text-amber-100"
                      )}>
                        {pendingChanges.changes?.[0]?.is_dismissed ? "Dismissed Updates" : "Scraper Updates Available"}
                      </h4>
                      {pendingChanges.changes?.[0]?.is_dismissed && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                          Dismissed
                        </span>
                      )}
                    </div>
                    <p className={clsx(
                      "text-sm mt-1",
                      pendingChanges.changes?.[0]?.is_dismissed
                        ? "text-gray-500 dark:text-gray-400"
                        : "text-amber-700 dark:text-amber-300"
                    )}>
                      {pendingChanges.changes?.[0]?.is_dismissed
                        ? "These updates were previously dismissed but are available for review."
                        : "The scraper has detected changes for this event."}
                    </p>

                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={async () => {
                        if (initialData?.id && pendingChanges.changes?.[0]) {
                          await api.applyPendingChanges(initialData.id, pendingChanges.changes[0].id);
                          window.location.reload();
                        }
                      }}>
                        <Check className="w-4 h-4 mr-1.5" /> Apply All Updates
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        className={clsx(
                          pendingChanges.changes?.[0]?.is_dismissed
                            ? "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                            : "text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                        )}
                        onClick={async () => {
                          // If NOT dismissed yet, call API to dismiss
                          if (!pendingChanges.changes?.[0]?.is_dismissed && initialData?.id && pendingChanges.changes?.[0]?.id) {
                            try {
                              await api.dismissPendingChanges(initialData.id, pendingChanges.changes[0].id);
                              success("Updates dismissed");
                              // Refetch or update local state to reflect dismissal?
                              // Ideally we just hide it and next time it loads as dismissed.
                              // But we want to update the "Review Dismissed" button visibility immediately?
                              // simpler: just hide.
                            } catch (e) {
                              console.error("Failed to dismiss changes", e);
                              // showError("Failed to dismiss changes"); // Optional
                            }
                          }
                          setShowUpdateBanner(false);
                        }}>
                        {pendingChanges.changes?.[0]?.is_dismissed ? "Hide" : "Dismiss"}
                      </Button>
                    </div>

                    {/* Change List */}
                    {pendingChanges.changes?.[0]?.changes && (
                      <div className="mt-4 bg-white/50 dark:bg-black/20 rounded border border-amber-100 dark:border-amber-900/50 p-3 text-sm overflow-x-auto">
                        {Object.entries(pendingChanges.changes[0].changes).map(([key, val]: any) => (
                          <div key={key} className="flex gap-2 items-start py-1 border-b border-amber-100/50 dark:border-amber-900/30 last:border-0">
                            <span className="font-medium min-w-[120px] capitalize pt-0.5">{key.replace('_', ' ')}:</span>
                            <div className="flex-1 grid grid-cols-[1fr,auto,1fr] gap-2 items-center">
                              <span className="text-gray-500 line-through break-all text-xs">
                                {key === 'date' && val.old ? String(val.old).split('T')[0] : String(val.old)}
                              </span>
                              <span className="text-emerald-600 dark:text-emerald-400">→</span>
                              <span className="font-medium break-all text-amber-900 dark:text-amber-100">
                                {key === 'date' && val.new ? String(val.new).split('T')[0] : String(val.new)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Error Alert */}
            {saveError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-300">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-medium">{saveError}</p>
              </div>
            )}

            {/* Workflow State Bar */}
            <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Workflow</span>
                  <div className="flex bg-white dark:bg-gray-900 rounded-md p-1 border border-gray-200 dark:border-gray-700 shadow-sm flex-wrap gap-1">
                    {[
                      { value: EventStatusValues.MANUAL_DRAFT, label: 'Draft' },
                      { value: EventStatusValues.APPROVED_PENDING_DETAILS, label: 'Needs Details' },
                      { value: EventStatusValues.READY_TO_PUBLISH, label: 'Ready' },
                      { value: EventStatusValues.PUBLISHED, label: 'Published' },
                      { value: EventStatusValues.CANCELED, label: 'Canceled' },
                      { value: EventStatusValues.REJECTED, label: 'Rejected' },
                    ].map(option => {
                      const savedStatus = (initialData?.status || EventStatusValues.MANUAL_DRAFT) as EventStatusState;

                      // STRICT VALIDATION: Only allow transitions from the SAVED status.
                      // This forces the user to save the form (updating savedStatus) before progressing to the next step.
                      const isAllowed = canTransition(savedStatus, option.value as EventStatusState) ||
                        savedStatus === option.value;

                      const isActive = formData.status === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleStatusChange(option.value)}
                          disabled={!isAllowed}
                          className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${isActive
                            ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 ring-1 ring-primary-500'
                            : isAllowed
                              ? 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                              : 'text-gray-300 dark:text-gray-700 cursor-not-allowed opacity-50'
                            }`}
                          title={!isAllowed ? `Cannot move to ${option.label} from ${savedStatus.replace(/_/g, ' ')}` : ''}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {transitionError && (
                  <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded border border-red-200 dark:border-red-800">
                    <AlertTriangle className="w-3 h-3" />
                    {transitionError}
                  </div>
                )}
              </div>
            </div>

            {/* Sources List & Add Button - MOVED HERE */}
            <div className="py-2">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-500">Connected Sources</span>
                <Button size="sm" variant="outline" onClick={() => setShowSourceModal(true)}>
                  <LinkIcon className="w-3 h-3 mr-1" /> Connect Source
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {uniqueSources.map(s => (
                  <div key={s.id} className="text-xs border rounded px-2 py-1 flex items-center gap-1 bg-gray-50 dark:bg-gray-800">
                    <SourceIcon sourceCode={s.source_code} className="w-3 h-3" />
                    {s.content_url ? (
                      <a href={s.content_url} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                        {s.source_event_id || s.id}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="font-mono">{s.source_event_id || s.id}</span>
                    )}
                  </div>
                ))}
                {uniqueSources.length === 0 && <span className="text-xs text-gray-400 italic">No sources connected</span>}
              </div>
            </div>



            {/* Basic Info */}
            <FormSection
              title="Basic Info"
              sources={uniqueSources.map(s => s.source_code)}
              onReset={(source) => resetFields(source, ['title', 'event_type', 'date', 'start_time', 'end_date', 'end_time'])}
            >
              <div className="space-y-4 pt-4">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      label="Title"
                      value={formData.title || ''}
                      onChange={(e) => {
                        setFormData({ ...formData, title: e.target.value });
                        if (validationErrors.title) setValidationErrors(prev => ({ ...prev, title: false }));
                      }}
                      required
                      maxLength={255}
                      className={validationErrors.title ? "" : ""}
                      error={validationErrors.title ? "Title matches source content. Please rewrite." : undefined}
                    />
                  </div>
                </div>

                {/* Sources List & Add Button - Moved Up */}


                <SourceFieldOptions
                  sources={sources}
                  field="title"
                  onSelect={(v) => handleSourceSelect('title', v)}
                  currentValue={formData.title}
                  pendingUpdate={pendingChanges?.changes?.[0]?.changes?.title?.new}
                  pendingUpdateSource={pendingChanges?.changes?.[0]?.source_code}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Select
                        label="Type"
                        value={formData.event_type || 'event'}
                        onChange={(e) => setFormData({ ...formData, event_type: e.target.value as EventType })}
                      >
                        {EVENT_TYPES.map(type => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {pendingChanges?.changes?.[0]?.changes?.event_type && (
                      <div className="mt-0.5 text-xs text-amber-600 dark:text-amber-500 font-medium animate-pulse">
                        Update available
                      </div>
                    )}
                  </div>
                  <SourceFieldOptions
                    sources={sources}
                    field="event_type"
                    onSelect={(v) => handleSourceSelect('event_type', v)}
                    currentValue={formData.event_type}
                    pendingUpdate={pendingChanges?.changes?.[0]?.changes?.event_type?.new}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input label="Start Date" type="date" value={formData.date ? formData.date.split('T')[0] : ''} onChange={(e) => { setFormData({ ...formData, date: e.target.value }); if (!endDate) setEndDate(e.target.value); }} required />
                    </div>
                  </div>
                  <SourceFieldOptions
                    sources={sources}
                    field="date"
                    onSelect={(v) => handleSourceSelect('date', v)}
                    currentValue={formData.date}
                    pendingUpdate={pendingChanges?.changes?.[0]?.changes?.date?.new}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input label="Start Time" type="time" value={formData.start_time || ''} onChange={(e) => setFormData({ ...formData, start_time: e.target.value })} />
                    </div>
                  </div>
                  <SourceFieldOptions
                    sources={sources}
                    field="start_time"
                    onSelect={(v) => handleSourceSelect('start_time', v)}
                    currentValue={formData.start_time}
                    pendingUpdate={pendingChanges?.changes?.[0]?.changes?.start_time?.new}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input label="End Date (Optional)" type="date" value={endDate || ''} onChange={(e) => setEndDate(e.target.value)} placeholder="Same as start date" />
                    </div>
                  </div>
                  <SourceFieldOptions
                    sources={sources}
                    field="end_date"
                    label="End Date"
                    onSelect={(v) => handleSourceSelect('end_date', v)}
                    currentValue={endDate}
                    pendingUpdate={pendingChanges?.changes?.[0]?.changes?.end_date?.new}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input label="End Time" type="time" value={formData.end_time || ''} onChange={(e) => setFormData({ ...formData, end_time: e.target.value })} />
                    </div>
                  </div>
                  <SourceFieldOptions
                    sources={sources}
                    field="end_time"
                    onSelect={(v) => handleSourceSelect('end_time', v)}
                    currentValue={formData.end_time}
                    pendingUpdate={pendingChanges?.changes?.[0]?.changes?.end_time?.new}
                  />
                </div>
              </div>
            </FormSection>

            {/* Artists */}
            <FormSection
              title={
                <div className="flex items-center gap-2">
                  <span>Artists</span>
                  {pendingChanges?.changes?.[0]?.changes?.artists_json && (
                    <div className="flex items-center gap-1">
                      <div className="tooltip" data-tip="New artist list available">
                        <GitPullRequest className="w-4 h-4 text-amber-500 animate-pulse cursor-help" />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const raw = pendingChanges.changes[0].changes.artists_json.new;
                          let list: any[] = [];
                          if (Array.isArray(raw)) list = raw;
                          else if (typeof raw === 'string') { try { list = JSON.parse(raw); } catch { } }

                          if (Array.isArray(list)) {
                            setSelectedArtists(list.map((a: any) => ({
                              id: a.name,
                              name: a.name,
                            })));
                          }
                        }}
                        className="p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded text-amber-600 dark:text-amber-500"
                        title="Apply this update"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              }
              icon={<Users className="w-4 h-4" />}
              sources={uniqueSources.map(s => s.source_code)}
              onReset={(source) => resetFields(source, ['artists'])}
            >
              <div className="space-y-4 pt-4">
                <div className="flex flex-wrap gap-2 mb-2">
                  {selectedArtists.map(artist => (
                    <span key={artist.id} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                      <span onClick={() => onNavigate?.('artist', artist.id)} className="cursor-pointer hover:underline mr-1">{artist.name}</span>
                      <button type="button" onClick={() => setSelectedArtists(prev => prev.filter(p => p.id !== artist.id))} className="ml-1 text-purple-600 hover:text-purple-900"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
                <SourceFieldOptions
                  sources={sources}
                  field="artists"
                  onSelect={(v) => handleSourceSelect('artists', v)}
                  currentValue={selectedArtists}
                  label="Reset from Source"
                  formatDisplay={(val) => Array.isArray(val) ? val.map((a: any) => a.name).join(', ') : String(val)}
                  pendingUpdate={pendingChanges?.changes?.[0]?.changes?.artists_json?.new}
                />
                <div className="relative">
                  <Input value={artistSearchQuery} onChange={handleArtistSearchChange} onFocus={() => { if (artistSuggestions.length > 0) setShowArtistSuggestions(true); }} placeholder="Search artists..." leftIcon={<Search className="w-4 h-4" />} />
                  {isArtistSearching && <div className="absolute right-3 top-[38px] animate-spin h-4 w-4 border-2 border-primary-500 rounded-full border-t-transparent"></div>}
                  {showArtistSuggestions && artistSearchQuery.length > 1 && (
                    <div className="absolute z-50 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                      {artistSuggestions.map(artist => (
                        <div key={artist.id} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm flex justify-between" onClick={() => selectArtist(artist)}>
                          <span>{artist.name}</span>
                          {artist.country && <span className="text-xs text-gray-500">{artist.country}</span>}
                        </div>
                      ))}
                      <div className="px-4 py-2 hover:bg-primary-50 dark:hover:bg-primary-900/20 cursor-pointer text-sm text-primary-600 font-medium flex items-center gap-2" onClick={() => { setArtistModalQuery(artistSearchQuery); setIsArtistModalOpen(true); setShowArtistSuggestions(false); }}>
                        <Plus className="w-4 h-4" /> Create "{artistSearchQuery}"
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </FormSection>

            {/* Venue */}
            <FormSection
              title="Location"
              icon={<MapPin className="w-4 h-4" />}
              sources={uniqueSources.map(s => s.source_code)}
              onReset={(source) => resetFields(source, ['venue_name', 'venue_address', 'venue_city', 'venue_country', 'latitude', 'longitude'])}
            >
              <div className="pt-4 flex gap-4 items-start">
                <div className="w-1/3 aspect-video bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 relative pointer-events-none">
                  {(formData.venue_id || (formData.latitude && formData.longitude)) ? (
                    <EventMap events={[formData as Event]} center={formData.latitude && formData.longitude ? [formData.latitude, formData.longitude] : undefined} zoom={13} minimal />
                  ) : <div className="flex items-center justify-center h-full text-gray-400"><MapPin className="w-8 h-8 opacity-20" /></div>}
                </div>
                <div className="flex-1">
                  {formData.venue_id ? (
                    <>
                      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700 flex justify-between">
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">{formData.venue_name} <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800">Linked</span></h4>
                          <p className="text-sm text-gray-500">{formData.venue_address}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => onNavigate?.('venue', formData.venue_id!)}>Edit</Button>
                          <Button variant="ghost" size="sm" onClick={removeVenue} className="text-red-500"><X className="w-4 h-4" /></Button>
                        </div>
                      </div>
                      <SourceFieldOptions sources={sources} field="venue_name" onSelect={(v) => handleSourceSelect('venue_name', v)} currentValue={formData.venue_name} />
                    </>
                  ) : (
                    <div className="relative">
                      <Input value={venueSearchQuery} onChange={(e) => { setVenueSearchQuery(e.target.value); setFormData({ ...formData, venue_name: e.target.value, venue_id: null }); }} onFocus={() => { if (venueSuggestions.length > 0) setShowVenueSuggestions(true); }} placeholder="Search venue..." leftIcon={<Search className="w-4 h-4" />} />
                      {isVenueSearching && <div className="absolute right-3 top-[38px] animate-spin h-4 w-4 border-2 border-primary-500 rounded-full border-t-transparent"></div>}
                      {showVenueSuggestions && venueSearchQuery.length > 1 && (
                        <div className="absolute z-10 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                          {venueSuggestions.map(v => (
                            <div key={v.id} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm" onClick={() => selectVenue(v)}>
                              <p className="font-medium">{v.name}</p>
                              <p className="text-xs text-gray-500">{v.address}</p>
                            </div>
                          ))}
                          <div className="px-4 py-2 hover:bg-primary-50 cursor-pointer text-sm text-primary-600 font-medium flex items-center gap-2" onClick={openCreateVenueForQuery}>
                            <Plus className="w-4 h-4" /> Create "{venueSearchQuery}"
                          </div>
                        </div>
                      )}
                      <SourceFieldOptions sources={sources} field="venue_name" onSelect={(v) => handleSourceSelect('venue_name', v)} currentValue={formData.venue_name} />
                    </div>
                  )}
                </div>
              </div>
            </FormSection>

            {/* Media */}
            <FormSection
              title="Media & Links"
              icon={<ImageIcon className="w-4 h-4" />}
              sources={uniqueSources.map(s => s.source_code)}
              onReset={(source) => resetFields(source, ['flyer_front', 'content_url', 'ticket_url'])}
            >
              <div className="space-y-4 pt-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input label="Flyer URL" type="url" placeholder="https://..." value={formData.flyer_front || ''} onChange={(e) => setFormData({ ...formData, flyer_front: e.target.value })} />
                    </div>
                  </div>
                  <SourceFieldOptions
                    sources={sources}
                    field="flyer_front"
                    onSelect={(v) => handleSourceSelect('flyer_front', v)}
                    currentValue={formData.flyer_front}
                    pendingUpdate={pendingChanges?.changes?.[0]?.changes?.flyer_front?.new}
                  />
                </div>
                {formData.flyer_front && (
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <img src={formData.flyer_front} alt="Preview" className="w-full h-full object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input label="Content URL" type="url" placeholder="https://..." value={formData.content_url || ''} onChange={(e) => setFormData({ ...formData, content_url: e.target.value })} leftIcon={<LinkIcon className="w-4 h-4" />} />
                    </div>
                  </div>
                  <SourceFieldOptions
                    sources={sources}
                    field="content_url"
                    onSelect={(v) => handleSourceSelect('content_url', v)}
                    currentValue={formData.content_url}
                    pendingUpdate={pendingChanges?.changes?.[0]?.changes?.content_url?.new}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input label="Ticket URL" type="url" placeholder="https://..." value={formData.ticket_url || ''} onChange={(e) => setFormData({ ...formData, ticket_url: e.target.value })} leftIcon={<Ticket className="w-4 h-4" />} />
                    </div>
                  </div>
                  <SourceFieldOptions
                    sources={sources}
                    field="ticket_url"
                    onSelect={(v) => handleSourceSelect('ticket_url', v)}
                    currentValue={formData.ticket_url}
                    pendingUpdate={pendingChanges?.changes?.[0]?.changes?.ticket_url?.new}
                  />
                </div>
              </div>
            </FormSection>

            {/* Description */}
            <FormSection
              title="Description"
              sources={uniqueSources.map(s => s.source_code)}
              onReset={(source) => resetFields(source, ['description'])}
            >
              <div className="pt-4">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <Textarea
                      value={formData.description || ''}
                      onChange={(e) => {
                        setFormData({ ...formData, description: e.target.value });
                        if (validationErrors.description) setValidationErrors(prev => ({ ...prev, description: false }));
                      }}
                      rows={8}
                      maxLength={5000}
                      className={validationErrors.description ? "border-red-500" : ""}
                      error={validationErrors.description ? "Description matches source content. Please rewrite." : undefined}
                    />
                  </div>
                  {pendingChanges?.changes?.[0]?.changes?.description && (
                    <div className="mt-2 text-xs text-amber-600 dark:text-amber-500 font-medium animate-pulse">
                      Update available
                    </div>
                  )}
                </div>
                <SourceFieldOptions
                  sources={sources}
                  field="description"
                  onSelect={(v) => handleSourceSelect('description', v)}
                  currentValue={formData.description}
                  pendingUpdate={pendingChanges?.changes?.[0]?.changes?.description?.new}
                />
              </div>
            </FormSection>
          </div >
        )
        }
      </FormLayout >

      {/* Delete Confirmation Modal */}
      {
        showConfirmDelete && (
          <Modal isOpen={showConfirmDelete} onClose={cancelDelete} title="Confirm Deletion">
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Delete Event?</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">Are you sure you want to delete <span className="font-semibold">{formData.title}</span>? This action cannot be undone.</p>
              {usageCount !== null && usageCount > 0 && (
                <div className="mb-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-md border border-red-200 dark:border-red-800">
                  <div className="flex items-start gap-3">
                    <Trash2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Warning: Related Data</p>
                      <p className="text-sm mt-1">This event might be referenced in other systems.</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={cancelDelete}>Cancel</Button>
                <Button variant="danger" onClick={performDelete} isLoading={isDeleting}>Delete Event</Button>
              </div>
            </div>
          </Modal>
        )
      }

      {/* Artist Creation Modal */}
      {
        isArtistModalOpen && (
          <Modal isOpen={isArtistModalOpen} onClose={() => setIsArtistModalOpen(false)} title="Create New Artist" noPadding>
            <ArtistForm
              initialData={{ name: artistModalQuery }}
              onSubmit={handleCreateArtist}
              onCancel={() => setIsArtistModalOpen(false)}
              isModal
            />
          </Modal>
        )
      }
    </>
  );
}
