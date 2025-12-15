
import React, { useState, useEffect, useRef } from 'react';
import { User, Globe, Save, X, Trash2, ArrowRight, ExternalLink, Image as ImageIcon, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SourceFieldOptions } from '@/components/ui/SourceFieldOptions';
import { ResetSectionButton } from '@/components/ui/ResetSectionButton';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { Modal } from '@/components/ui/Modal';
import { RelatedEventsList } from '@/components/features/RelatedEventsList';
import { getBestSourceForField, SOURCE_PRIORITY } from '@/lib/smartMerge';
import { Artist, Event } from '@/types';
import { createArtist, updateArtist, searchArtists, updateEvent } from '@/lib/api';
import { SourceReference } from '@/types';
import { EventForm } from '@/components/features/EventForm';
import { useToast } from '@/contexts/ToastContext';

interface ArtistFormProps {
  initialData?: Partial<Artist>;
  onSubmit: (data: Partial<Artist>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCancel: () => void;
}


export function ArtistForm({
  initialData,
  onSubmit,
  onDelete,
  onCancel
}: ArtistFormProps) {
  const { success, error: showError } = useToast();
  const [formData, setFormData] = useState<Partial<Artist>>(initialData || {
    name: '',
    genres: [],
    country: '',
    content_url: '',
    image_url: '',
    bio: '',
    artist_type: 'individual'
  });
  const [editingEvent, setEditingEvent] = useState<Event | null>(null); // New state

  const handleEditEvent = (event: Event) => {
    setEditingEvent(event);
  };

  const handleEventSubmit = async (data: Partial<Event>) => {
    if (!editingEvent) return;
    try {
      await updateEvent(editingEvent.id, data);
      success('Event updated successfully');
      setEditingEvent(null);
      // Optional: Refresh list mechanism?
      // Since specific event is updated in DB, user might need reload to see changes in "Related Events" list if titles changed.
      // But preserving view is key.
    } catch (e) {
      console.error(e);
      showError('Failed to update event');
    }
  };
  const [genresInput, setGenresInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search / Autocomplete State
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        country: initialData.country || '',
        content_url: initialData.content_url || '',
        image_url: initialData.image_url || '',
        bio: initialData.bio || '',
        artist_type: initialData.artist_type || '',
        genres: initialData.genres || []
      });
      setGenresInput(initialData.genres?.join(', ') || '');
    } else {
      setFormData({
        name: '',
        country: '',
        content_url: '',
        image_url: '',
        bio: '',
        artist_type: '',
        genres: []
      });
      setGenresInput('');
    }
  }, [initialData]);

  const handleGenresChange = (val: string) => {
    setGenresInput(val);
    const genresArray = val.split(',').map(s => s.trim()).filter(Boolean);
    setFormData(prev => ({ ...prev, genres: genresArray }));
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData({ ...formData, name: value });

    // Debounce search
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (value.length > 2) {
      searchTimeoutRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          // Using MusicBrainz API
          const response = await fetch(`https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(value)}&fmt=json`, {
            headers: {
              'User-Agent': 'EventsAdminWrapper/1.0 ( mail@example.com )' // Required by MusicBrainz
            }
          });
          const data = await response.json();
          // Filter slightly for relevance if needed, but usually search is decent.
          // We want artists with a higher score ideally.
          if (data.artists) {
            setSuggestions(data.artists.slice(0, 5));
            setShowSuggestions(true);
          }
        } catch (err) {
          console.error('Artist search failed', err);
        } finally {
          setIsSearching(false);
        }
      }, 500);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectArtist = (artist: any) => {
    // Map MusicBrainz data to our fields
    const countryCode = artist.country || '';
    // genres/tags
    const tags = artist.tags || [];
    // simple hack to get top 3 tags by count
    const genres = tags.sort((a: any, b: any) => (b.count || 0) - (a.count || 0))
      .slice(0, 5)
      .map((t: any) => t.name);

    const newForm = {
      ...formData,
      name: artist.name, // Use canonical name
      country: countryCode,
      genres: genres,
      // Bio is tougher, maybe use disambiguation if present
      bio: artist.disambiguation ? `(${artist.disambiguation})` : formData.bio
    };

    setFormData(newForm);
    setGenresInput(genres.join(', '));
    setShowSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (initialData?.id && onDelete) {
      setIsSubmitting(true);
      try {
        await onDelete(initialData.id);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const uniqueSources = Array.from(new Set((initialData?.source_references || []).map(s => s.source_code)));

  const resetFields = (sourceCode: string, fields: (keyof Artist)[]) => {
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
        if (field === 'genres') {
          let g = val;
          // Try to handle stringified array
          if (typeof g === 'string' && g.trim().startsWith('[')) {
            try { g = JSON.parse(g); } catch { }
          }

          if (Array.isArray(g)) {
            newFormData.genres = g;
            setGenresInput(g.join(', '));
          } else if (typeof g === 'string') {
            newFormData.genres = [g];
            setGenresInput(g);
          }
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
    resetFields(sourceCode, ['name', 'country', 'content_url', 'image_url', 'bio', 'genres', 'artist_type']);
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {initialData ? 'Edit Artist' : 'New Artist'}
        </h2>
        <div className="flex items-center gap-2">
          {initialData && onDelete && (
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              disabled={isSubmitting}
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

      {/* Form Content */}
      <div className="flex-1 overflow-y-auto p-6" onClick={() => setShowSuggestions(false)}>
        <form id="artist-form" onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto">

          {uniqueSources.length > 0 && (
            <div className="flex items-center gap-2 pb-4 border-b border-gray-100 dark:border-gray-800">
              <span className="text-xs text-gray-500">Reset whole artist from:</span>
              {uniqueSources.length > 0 && (
                <>
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
                </>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <User className="w-4 h-4" /> Profile Info
              </h3>
              <ResetSectionButton
                sources={uniqueSources}
                onReset={(source) => resetFields(source, ['name', 'bio', 'genres', 'artist_type'])}
              />
            </div>

            <div className="relative" onClick={e => e.stopPropagation()}>
              <div className="relative">
                <Input
                  label="Name"
                  value={formData.name}
                  onChange={handleNameChange} // Use new handler
                  onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                  required
                  placeholder="Artist Name"
                />
                {isSearching && (
                  <div className="absolute right-3 top-[38px] animate-spin h-4 w-4 border-2 border-indigo-500 rounded-full border-t-transparent"></div>
                )}
              </div>

              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-10 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                  {suggestions.map((artist) => (
                    <div
                      key={artist.id}
                      className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm border-b border-gray-100 dark:border-gray-800 last:border-0"
                      onClick={() => selectArtist(artist)}
                    >
                      <div className="flex justify-between items-center">
                        <p className="font-medium text-gray-900 dark:text-white truncate">{artist.name}</p>
                        {artist.country && <span className="text-xs text-gray-500 ml-2">{artist.country}</span>}
                      </div>
                      {artist.disambiguation && <p className="text-xs text-gray-500 truncate">{artist.disambiguation}</p>}
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {artist.tags?.slice(0, 3).map((t: any) => (
                          <span key={t.name} className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">
                            {t.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <SourceFieldOptions
                sources={initialData?.source_references}
                field="name"
                currentValue={formData.name}
                onSelect={(val) => setFormData({ ...formData, name: val })}
              />
            </div>

            <div>
              <Input
                label="Type (e.g. DJ, Band, Group)"
                value={formData.artist_type || ''}
                onChange={(e) => setFormData({ ...formData, artist_type: e.target.value })}
                placeholder="DJ"
              />
              <SourceFieldOptions
                sources={initialData?.source_references}
                field="artist_type"
                currentValue={formData.artist_type}
                onSelect={(val) => setFormData({ ...formData, artist_type: val })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Bio
              </label>
              <textarea
                value={formData.bio || ''}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                rows={4}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                placeholder="Artist biography..."
              />
              <SourceFieldOptions
                sources={initialData?.source_references}
                field="bio"
                currentValue={formData.bio}
                onSelect={(val) => setFormData({ ...formData, bio: val })}
              />
            </div>

            <div>
              <Input
                label="Genres (comma separated)"
                value={genresInput}
                onChange={(e) => handleGenresChange(e.target.value)}
                placeholder="Techno, House, Ambient"
              />
              <SourceFieldOptions
                sources={initialData?.source_references}
                field="genres"
                currentValue={formData.genres}
                onSelect={(val) => {
                  if (Array.isArray(val)) {
                    setFormData({ ...formData, genres: val });
                    setGenresInput(val.join(', '));
                  }
                }}
              />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Globe className="w-4 h-4" /> Details & Links
              </h3>
              <ResetSectionButton
                sources={uniqueSources}
                onReset={(source) => resetFields(source, ['country', 'content_url', 'image_url'])}
              />
            </div>

            <div>
              <Input
                label="Country"
                value={formData.country || ''}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                placeholder="e.g. DE, US"
              />
              <SourceFieldOptions
                sources={initialData?.source_references}
                field="country"
                currentValue={formData.country}
                onSelect={(val) => setFormData({ ...formData, country: val })}
              />
            </div>

            <div>
              <Input
                label="Content URL (Website/Social)"
                value={formData.content_url || ''}
                onChange={(e) => setFormData({ ...formData, content_url: e.target.value })}
                placeholder="https://..."
                leftIcon={<ExternalLink className="w-4 h-4" />}
              />
              <SourceFieldOptions
                sources={initialData?.source_references}
                field="content_url"
                currentValue={formData.content_url}
                onSelect={(val) => setFormData({ ...formData, content_url: val })}
              />
            </div>

            <div>
              <Input
                label="Image URL"
                value={formData.image_url || ''}
                onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                placeholder="https://..."
                leftIcon={<ImageIcon className="w-4 h-4" />}
              />
              <SourceFieldOptions
                sources={initialData?.source_references}
                field="image_url"
                currentValue={formData.image_url}
                onSelect={(val) => setFormData({ ...formData, image_url: val })}
              />
              {formData.image_url && (
                <div className="mt-2 w-32 h-32 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                  <img
                    src={formData.image_url}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                </div>
              )}
            </div>
          </div>


          {initialData?.events && initialData.events.length > 0 && (
            <div className="pt-6 border-t border-gray-200 dark:border-gray-800">
              <RelatedEventsList
                events={initialData.events}
                title="Related Events"
                onEdit={handleEditEvent}
              />
            </div>
          )}
        </form>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" form="artist-form" disabled={isSubmitting} leftIcon={<Save className="w-4 h-4" />}>
          {isSubmitting ? 'Saving...' : 'Save Artist'}
        </Button>
      </div>

      {/* Event Edit Modal */}
      {editingEvent && (
        <Modal
          isOpen={!!editingEvent}
          onClose={() => setEditingEvent(null)}
          title="Edit Event"
        >
          <EventForm
            initialData={editingEvent}
            onSubmit={handleEventSubmit}
            onCancel={() => setEditingEvent(null)}
          />
        </Modal>
      )}
    </div>
  );
}
