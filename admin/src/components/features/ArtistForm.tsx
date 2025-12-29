
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
import { createArtist, updateArtist, searchArtists, updateEvent, fetchEvent, fetchCountries, fetchArtists } from '@/lib/api';
import { SourceReference } from '@/types';
import { EventForm } from '@/components/features/EventForm';
import { useToast } from '@/contexts/ToastContext';
import { AutoFillSearch } from '@/components/features/AutoFillSearch';

interface ArtistFormProps {
  initialData?: Partial<Artist>;
  onSubmit: (data: Partial<Artist>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCancel: () => void;
  isModal?: boolean;
}


export function ArtistForm({
  initialData,
  onSubmit,
  onDelete,
  onCancel,
  isModal = false
}: ArtistFormProps) {
  const { success, error: showError } = useToast();
  const [formData, setFormData] = useState<Partial<Artist>>(initialData || {
    name: '',
    genres: [],
    country: '',
    content_url: '',
    image_url: '',
    bio: '',
    artist_type: 'individual',
    first_name: '',
    last_name: '',
    website: '',
    facebook_url: '',
    twitter_url: '',
    instagram_url: '',
    soundcloud_url: '',
    bandcamp_url: '',
    discogs_url: '',
    spotify_url: ''
  });
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  // ... (handlers skipped)

  const handleEditEvent = async (event: Event) => {
    try {
      // Fetch full event details to ensure we have source_references and full artist lists
      const fullEvent = await fetchEvent(event.id);
      setEditingEvent(fullEvent || event);
    } catch (e) {
      console.error('Failed to fetch full event details', e);
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
  const [genresInput, setGenresInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countries, setCountries] = useState<{ name: string; code: string }[]>([]);

  useEffect(() => {
    fetchCountries().then(setCountries).catch(console.error);
  }, []);

  useEffect(() => {
    if (initialData) {
      const sources = initialData.source_references || [];
      const getBest = (field: keyof Artist) => {
        // @ts-ignore
        if (initialData[field]) return initialData[field];
        const best = getBestSourceForField(sources, field as string);
        // @ts-ignore
        return best ? best[field] : (initialData[field] || '');
      };

      const newFormData = {
        name: initialData.name || '',
        country: (() => {
          const val = getBest('country') as string || '';
          if (!val) return '';
          // If value is a code (length 2, uppercase), return it
          if (val.length === 2 && val === val.toUpperCase()) return val;
          // Try to find by name
          const match = countries.find(c => c.name.toLowerCase() === val.toLowerCase());
          return match ? match.code : val; // Return code if found, else original value
        })(),
        content_url: getBest('content_url') as string || '',
        image_url: getBest('image_url') as string || '',
        bio: getBest('bio') as string || '',
        artist_type: getBest('artist_type') as string || '',
        first_name: getBest('first_name') as string || '',
        last_name: getBest('last_name') as string || '',
        website: getBest('website') as string || '',
        facebook_url: getBest('facebook_url') as string || '',
        twitter_url: getBest('twitter_url') as string || '',
        instagram_url: getBest('instagram_url') as string || '',
        soundcloud_url: getBest('soundcloud_url') as string || '',
        bandcamp_url: getBest('bandcamp_url') as string || '',
        discogs_url: getBest('discogs_url') as string || '',
        spotify_url: getBest('spotify_url') as string || '',
        genres: initialData.genres && initialData.genres.length > 0 ? initialData.genres : (
          (() => {
            const best = getBestSourceForField(sources, 'genres');
            // @ts-ignore
            return best ? best.genres : [];
          })()
        )
      };

      setFormData(newFormData);
      setGenresInput(Array.isArray(newFormData.genres) ? newFormData.genres.join(', ') : '');
    } else {
      setFormData({
        name: '',
        country: '',
        content_url: '',
        image_url: '',
        bio: '',
        genres: [],
        artist_type: '',
        first_name: '',
        last_name: '',
        website: '',
        facebook_url: '',
        twitter_url: '',
        instagram_url: '',
        soundcloud_url: '',
        bandcamp_url: '',
        discogs_url: '',
        spotify_url: ''
      });
      setGenresInput('');
    }
  }, [initialData, countries]);

  const handleGenresChange = (val: string) => {
    setGenresInput(val);
    // Split by comma or slash, trim, and filter boolean
    const genresArray = val.split(/[,\/]+/).map(s => s.trim()).filter(Boolean);
    setFormData(prev => ({ ...prev, genres: genresArray }));
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Duplicate Check for New Artists
      if (!initialData?.id && formData.name) {
        const existingResult = await fetchArtists({ search: formData.name });
        const candidates = (existingResult as any).data || [];

        const isDuplicate = candidates.some((a: Artist) =>
          a.name.toLowerCase() === formData.name?.toLowerCase()
        );

        if (isDuplicate) {
          showError('An artist with this name already exists.');
          setIsSubmitting(false);
          return;
        }
      }

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
    resetFields(sourceCode, [
      'name', 'country', 'content_url', 'image_url', 'bio', 'genres', 'artist_type',
      'first_name', 'last_name', 'website',
      'facebook_url', 'twitter_url', 'instagram_url', 'soundcloud_url', 'bandcamp_url', 'discogs_url', 'spotify_url'
    ]);
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      {!isModal && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50">
          <div className="flex items-center">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {initialData ? 'Edit Artist' : 'New Artist'}
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
      )}


      <div className="flex-1 overflow-y-auto p-6">
        <form id="artist-form" onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto">

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

            <div className="relative">
              <div className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Name / Auto-fill</div>
              {!initialData?.id ? (
                <AutoFillSearch
                  type="artist"
                  onSelect={(result) => {
                    console.log('[ArtistForm] Autofill result:', result);
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

                    // Specific fallback for Spotify/MusicBrainz data which might be in raw
                    if (!countryCode && result.raw?.country) {
                      const rawCode = result.raw.country.toUpperCase();
                      const found = countries.find(c => c.code === rawCode);
                      if (found) countryCode = found.code;
                    }

                    const updates: Partial<Artist> = {
                      name: result.name,
                      country: countryCode || formData.country || '',
                      image_url: result.image_url || formData.image_url || '',
                      genres: result.genres || formData.genres || [],
                      // Append attribution but keep existing bio if extensive
                      bio: formData.bio || (result.raw?.disambiguation ? `(${result.raw.disambiguation})` : '')
                    };

                    if (result.genres) {
                      setGenresInput(result.genres.join(', '));
                    }

                    setFormData(prev => ({ ...prev, ...updates }));
                  }}
                  placeholder="Search artist (MusicBrainz/Spotify) to auto-fill..."
                  className="mb-2"
                />
              ) : null}

              <div className="relative">
                <Input
                  label="Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Artist Name"
                />
              </div>

              <SourceFieldOptions
                sources={initialData?.source_references}
                field="name"
                currentValue={formData.name}
                onSelect={(val) => setFormData({ ...formData, name: val })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Input
                  label="First Name"
                  value={formData.first_name || ''}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  placeholder="First Name"
                />
                <SourceFieldOptions
                  sources={initialData?.source_references}
                  field="first_name"
                  currentValue={formData.first_name}
                  onSelect={(val) => setFormData({ ...formData, first_name: val })}
                />
              </div>
              <div>
                <Input
                  label="Last Name"
                  value={formData.last_name || ''}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  placeholder="Last Name"
                />
                <SourceFieldOptions
                  sources={initialData?.source_references}
                  field="last_name"
                  currentValue={formData.last_name}
                  onSelect={(val) => setFormData({ ...formData, last_name: val })}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Type
              </label>
              <select
                value={formData.artist_type || ''}
                onChange={(e) => setFormData({ ...formData, artist_type: e.target.value })}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
              >
                <option value="">Select Type...</option>
                {['Individual', 'DJ', 'Group', 'Band', 'Orchestra', 'Choir', 'Producer', 'Other'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
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
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
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


            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Globe className="w-4 h-4" /> Social Connections
                </h3>
                <ResetSectionButton
                  sources={uniqueSources}
                  onReset={(source) => resetFields(source, ['website', 'facebook_url', 'twitter_url', 'instagram_url', 'soundcloud_url', 'bandcamp_url', 'discogs_url', 'spotify_url'])}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Input
                    label="Website"
                    value={formData.website || ''}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://..."
                    leftIcon={<ExternalLink className="w-4 h-4" />}
                  />
                  <SourceFieldOptions
                    sources={initialData?.source_references}
                    field="website"
                    currentValue={formData.website}
                    onSelect={(val) => setFormData({ ...formData, website: val })}
                  />
                </div>

                {[
                  { label: 'Facebook', field: 'facebook_url' },
                  { label: 'Instagram', field: 'instagram_url' },
                  { label: 'Twitter / X', field: 'twitter_url' },
                  { label: 'SoundCloud', field: 'soundcloud_url' },
                  { label: 'Bandcamp', field: 'bandcamp_url' },
                  { label: 'Discogs', field: 'discogs_url' },
                  { label: 'Spotify', field: 'spotify_url' },
                ].map(({ label, field }) => (
                  <div key={field}>
                    <Input
                      label={label}
                      // @ts-ignore
                      value={formData[field as keyof Artist] || ''}
                      // @ts-ignore
                      onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                      placeholder="https://..."
                      leftIcon={<ExternalLink className="w-4 h-4" />}
                    />
                    <SourceFieldOptions
                      sources={initialData?.source_references}
                      field={field as keyof SourceReference}
                      // @ts-ignore
                      currentValue={formData[field as keyof Artist]}
                      // @ts-ignore
                      onSelect={(val) => setFormData({ ...formData, [field]: val })}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Country
              </label>
              <select
                value={formData.country || ''}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
              >
                <option value="">Select Country...</option>
                {countries.map(c => (
                  <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
                ))}
              </select>
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
