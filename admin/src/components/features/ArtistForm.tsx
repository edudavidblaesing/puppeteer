
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, Globe, Save, X, Trash2, ArrowRight, ExternalLink, Image as ImageIcon, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SourceFieldOptions } from '@/components/ui/SourceFieldOptions';
import { ResetSectionButton } from '@/components/ui/ResetSectionButton';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { Modal } from '@/components/ui/Modal';
import { RelatedEventsList } from '@/components/features/RelatedEventsList';
import { getBestSourceForField } from '@/lib/smartMerge';
import { Artist, Event, SourceReference } from '@/types';
import { createArtist, updateArtist, searchArtists, updateEvent, fetchEvent, fetchCountries, fetchArtists, fetchArtist } from '@/lib/api';
import { EventForm } from '@/components/features/EventForm';
import { useToast } from '@/contexts/ToastContext';
import { AutoFillSearch } from '@/components/features/AutoFillSearch';
import { FormLayout } from '@/components/ui/FormLayout';
import { FormSection } from '@/components/ui/FormSection';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useDeleteWithUsage } from '@/hooks/useDeleteWithUsage';
import HistoryPanel from './HistoryPanel';
import clsx from 'clsx';

interface ArtistFormProps {
  initialData?: Partial<Artist>;
  onSubmit: (data: Partial<Artist>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCancel: (force?: boolean) => void;
  isModal?: boolean;
  onNavigate?: (type: 'event' | 'venue' | 'artist', id?: string, data?: any) => void;
  isPanel?: boolean;
  id?: string;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function ArtistForm({
  initialData,
  onSubmit,
  onDelete,
  onCancel,
  isModal = false,
  onNavigate,
  isPanel = false,
  id,
  onDirtyChange
}: ArtistFormProps) {
  const { success, error: showError } = useToast();

  const [formData, setFormData] = useState<Partial<Artist>>({
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

  // Tabs State
  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');

  const [genresInput, setGenresInput] = useState('');
  const [countries, setCountries] = useState<{ name: string; code: string }[]>([]);

  useEffect(() => {
    fetchCountries().then(setCountries).catch(console.error);
  }, []);

  const [fetchedData, setFetchedData] = useState<Partial<Artist> | null>(null);

  useEffect(() => {
    if (id && !initialData && !fetchedData) {
      fetchArtist(id).then(a => {
        if (a) {
          setFormData(prev => ({ ...prev, ...a }));
          setFetchedData(a);
          setGenresInput(Array.isArray(a.genres) ? a.genres.join(', ') : '');
        }
      });
    }
  }, [id, initialData, fetchedData]);

  // Baseline State (Changes Tracking)
  const [baselineData, setBaselineData] = useState<Partial<Artist>>({});
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize and Sync Logic
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
          if (val.length === 2 && val === val.toUpperCase()) return val;
          const match = countries.find(c => c.name.toLowerCase() === val.toLowerCase());
          return match ? match.code : val;
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

      setFormData(prev => ({ ...prev, ...newFormData }));
      if (!isInitialized) {
        setBaselineData(newFormData);
        setIsInitialized(true);
        setGenresInput(Array.isArray(newFormData.genres) ? newFormData.genres.join(', ') : '');
      }
    }
  }, [initialData, countries, isInitialized]); // Only re-run if initialData changes substantially or countries loads


  // Dirty State Calculation
  const isDirty = useMemo(() => {
    if (!isInitialized) return false;
    const base = baselineData || {};

    // Helper to normalize values for comparison
    const normalize = (val: any) => {
      if (val === null || val === undefined) return '';
      return String(val).trim();
    };

    // Normalize country code from base data
    const getBaseCountry = () => {
      const val = normalize(base.country);
      if (!val) return '';
      if (val.length === 2 && val === val.toUpperCase()) return val;
      const match = countries.find(c => c.name.toLowerCase() === val.toLowerCase());
      return match ? match.code : val;
    };

    const baseCountry = getBaseCountry();

    const keys = ['name', 'content_url', 'image_url', 'bio', 'artist_type', 'first_name', 'last_name', 'website', 'facebook_url', 'twitter_url', 'instagram_url', 'soundcloud_url', 'bandcamp_url', 'discogs_url', 'spotify_url'] as (keyof Artist)[];

    for (const k of keys) {
      // @ts-ignore
      const v1 = normalize(formData[k]);
      // @ts-ignore
      const v2 = normalize(base[k]);
      if (v1 !== v2) {
        // console.log(`[ArtistForm] Dirty field ${k}: '${v1}' vs '${v2}'`);
        return true;
      }
    }

    // Check Country with normalization
    if (normalize(formData.country) !== baseCountry) {
      // console.log(`[ArtistForm] Dirty country: '${normalize(formData.country)}' vs '${baseCountry}'`);
      return true;
    }

    // Check Genres (sort and trim)
    const g1 = (formData.genres || []).map(g => g.trim()).filter(Boolean).sort().join(',');
    const g2 = (base.genres || []).map(g => g.trim()).filter(Boolean).sort().join(',');
    if (g1 !== g2) {
      // console.log(`[ArtistForm] Dirty genres: '${g1}' vs '${g2}'`);
      return true;
    }

    return false;
  }, [formData, baselineData, isInitialized, countries]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);


  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      if (!initialData?.id && formData.name) {
        const existingResult = await fetchArtists({ search: formData.name });
        const candidates = Array.isArray(existingResult) ? existingResult : (existingResult as any).data || [];
        const isDuplicate = candidates.some((a: Artist) => a.name.toLowerCase() === formData.name?.toLowerCase());
        if (isDuplicate) {
          showError('An artist with this name already exists.');
          return;
        }
      }
      await onSubmit(formData);
      success('Artist saved successfully');
      // Reset dirty state logic if necessary, though onCancel(true) should handle closing.
      // But if parent keeps it open, we should reset baseline.
      if (initialData?.id) {
        setBaselineData({ ...formData });
      }
      onCancel(true);
    } catch (e: any) {
      console.error(e);
      showError(e.message || 'Failed to save artist');
    } finally {
      setIsSubmitting(false);
    }
  };

  const { promptBeforeAction, modalElement } = useUnsavedChanges({
    isLinkDirty: isDirty,
    onSave: handleSave,
    onDiscard: () => onCancel()
  });

  const { handleDeleteClick, confirmDelete, cancelDelete, showConfirm: showConfirmDelete, usageCount, isDeleting } = useDeleteWithUsage({
    entityType: 'artists',
    onDelete: async (id) => {
      if (onDelete) await onDelete(id);
    },
    onSuccess: () => {
      onCancel(true);
      success('Artist deleted successfully');
    },
    onError: (err) => showError(err.message)
  });

  const handleCancelRequest = () => {
    promptBeforeAction(() => onCancel());
  };


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
    await updateEvent(editingEvent.id, data);
    setEditingEvent(null);
  };


  const handleGenresChange = (val: string) => {
    setGenresInput(val);
    const genresArray = val.split(/[,\/]+/).map(s => s.trim()).filter(Boolean);
    setFormData(prev => ({ ...prev, genres: genresArray }));
  };

  const uniqueSources = Array.from(new Set((initialData?.source_references || []).map(s => s.source_code)));

  const resetFields = (sourceCode: string, fields: (keyof Artist)[]) => {
    const newFormData = { ...formData };
    let hasChanges = false;
    const sources = initialData?.source_references || [];

    fields.forEach(field => {
      // ... existing reset logic ...
      let val: any = undefined;

      if (sourceCode === 'best') {
        const bestSource = getBestSourceForField(sources, field as string);
        if (bestSource) val = (bestSource as any)[field];
      } else {
        const source = sources.find(s => s.source_code === sourceCode);
        if (source && (source as any)[field] !== undefined) val = (source as any)[field];
      }

      if (val !== undefined && val !== null) {
        if (field === 'genres') {
          let g = val;
          if (typeof g === 'string' && g.trim().startsWith('[')) { try { g = JSON.parse(g); } catch { } }
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
    resetFields(sourceCode, ['name', 'country', 'content_url', 'image_url', 'bio', 'genres', 'artist_type', 'first_name', 'last_name', 'website', 'facebook_url', 'twitter_url', 'instagram_url', 'soundcloud_url', 'bandcamp_url', 'discogs_url', 'spotify_url']);
  };

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
        title={initialData ? 'Edit Artist' : 'New Artist'}
        isModal={isModal}
        isPanel={isPanel}
        onCancel={handleCancelRequest}
        onSave={handleSave}
        onDelete={initialData && initialData.id && onDelete ? () => handleDeleteClick(initialData.id!) : undefined}
        headerExtras={headerExtras}
        isLoading={isSubmitting}
        saveLabel={initialData ? 'Save Changes' : 'Create Artist'}
      >
        {activeTab === 'history' ? (
          <div className="py-6"><HistoryPanel entityId={initialData?.id || ''} entityType="artist" /></div>
        ) : (
          <>
            <FormSection title="Profile Info" icon={<User className="w-4 h-4" />} sources={uniqueSources} onReset={(source) => resetFields(source, ['name', 'bio', 'genres', 'artist_type'])}>
              <div className="space-y-4 pt-4">

                {(!initialData?.id || initialData.id.startsWith('temp-')) && (
                  <div className="relative mb-4">
                    <div className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Name / Auto-fill</div>
                    <AutoFillSearch type="artist" onSelect={(result) => {
                      // (Logic folded for brevity, same as original)
                      let countryCode = result.country || '';
                      if (countryCode) {
                        const strictMatch = countries.find(c => c.code === countryCode.toUpperCase());
                        if (strictMatch) countryCode = strictMatch.code;
                        else { const m = countries.find(c => c.name.toLowerCase() === countryCode.toLowerCase()); if (m) countryCode = m.code; }
                      }
                      if (!countryCode && result.raw?.country) {
                        const m = countries.find(c => c.code === result.raw.country.toUpperCase());
                        if (m) countryCode = m.code;
                      }
                      const updates: Partial<Artist> = {
                        name: result.name, country: countryCode || formData.country || '', image_url: result.image_url || formData.image_url || '', genres: result.genres || formData.genres || [],
                        bio: formData.bio || (result.raw?.disambiguation ? `(${result.raw.disambiguation})` : '')
                      };
                      if (result.genres) setGenresInput(result.genres.join(', '));
                      setFormData(prev => ({ ...prev, ...updates }));
                    }} className="mb-2" />
                  </div>
                )}

                <div className="relative">
                  <Input label="Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required placeholder="Artist Name" />
                </div>
                <SourceFieldOptions sources={initialData?.source_references} field="name" currentValue={formData.name} onSelect={(val) => setFormData({ ...formData, name: val })} />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Input label="First Name" value={formData.first_name || ''} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} placeholder="First Name" />
                    <SourceFieldOptions sources={initialData?.source_references} field="first_name" currentValue={formData.first_name} onSelect={(val) => setFormData({ ...formData, first_name: val })} />
                  </div>
                  <div>
                    <Input label="Last Name" value={formData.last_name || ''} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} placeholder="Last Name" />
                    <SourceFieldOptions sources={initialData?.source_references} field="last_name" currentValue={formData.last_name} onSelect={(val) => setFormData({ ...formData, last_name: val })} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                  <select value={formData.artist_type || ''} onChange={(e) => setFormData({ ...formData, artist_type: e.target.value })} className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white">
                    <option value="">Select Type...</option>
                    {['Individual', 'DJ', 'Group', 'Band', 'Orchestra', 'Choir', 'Producer', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <SourceFieldOptions sources={initialData?.source_references} field="artist_type" currentValue={formData.artist_type} onSelect={(val) => setFormData({ ...formData, artist_type: val })} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bio</label>
                  <textarea value={formData.bio || ''} onChange={(e) => setFormData({ ...formData, bio: e.target.value })} rows={4} className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white" placeholder="Artist biography..." />
                  <SourceFieldOptions sources={initialData?.source_references} field="bio" currentValue={formData.bio} onSelect={(val) => setFormData({ ...formData, bio: val })} />
                </div>

                <div>
                  <Input label="Genres (comma separated)" value={genresInput} onChange={(e) => handleGenresChange(e.target.value)} placeholder="Techno, House, Ambient" />
                  <SourceFieldOptions sources={initialData?.source_references} field="genres" currentValue={formData.genres} onSelect={(val) => { if (Array.isArray(val)) { setFormData({ ...formData, genres: val }); setGenresInput(val.join(', ')); } }} />
                </div>
              </div>
            </FormSection>

            <FormSection title="Social Connections" icon={<Globe className="w-4 h-4" />} sources={uniqueSources} onReset={(source) => resetFields(source, ['website', 'facebook_url', 'twitter_url', 'instagram_url', 'soundcloud_url', 'bandcamp_url', 'discogs_url', 'spotify_url'])}>
              <div className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Input label="Website" value={formData.website || ''} onChange={(e) => setFormData({ ...formData, website: e.target.value })} placeholder="https://..." leftIcon={<ExternalLink className="w-4 h-4" />} />
                    <SourceFieldOptions sources={initialData?.source_references} field="website" currentValue={formData.website} onSelect={(val) => setFormData({ ...formData, website: val })} />
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
                      <Input label={label} value={(formData as any)[field] || ''} onChange={(e) => setFormData({ ...formData, [field]: e.target.value })} placeholder="https://..." leftIcon={<ExternalLink className="w-4 h-4" />} />
                      <SourceFieldOptions sources={initialData?.source_references} field={field as any} currentValue={(formData as any)[field]} onSelect={(val) => setFormData({ ...formData, [field]: val })} />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Country</label>
                  <select value={formData.country || ''} onChange={(e) => setFormData({ ...formData, country: e.target.value })} className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white">
                    <option value="">Select Country...</option>
                    {countries.map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
                  </select>
                  <SourceFieldOptions sources={initialData?.source_references} field="country" currentValue={formData.country} onSelect={(val) => setFormData({ ...formData, country: val })} />
                </div>

                <div>
                  <Input label="Content URL" value={formData.content_url || ''} onChange={(e) => setFormData({ ...formData, content_url: e.target.value })} placeholder="https://..." leftIcon={<ExternalLink className="w-4 h-4" />} />
                  <SourceFieldOptions sources={initialData?.source_references} field="content_url" currentValue={formData.content_url} onSelect={(val) => setFormData({ ...formData, content_url: val })} />
                </div>

                <div>
                  <Input label="Image URL" value={formData.image_url || ''} onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} placeholder="https://..." leftIcon={<ImageIcon className="w-4 h-4" />} />
                  <SourceFieldOptions sources={initialData?.source_references} field="image_url" currentValue={formData.image_url} onSelect={(val) => setFormData({ ...formData, image_url: val })} />
                  {formData.image_url && (
                    <div className="mt-2 w-32 h-32 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                      <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                    </div>
                  )}
                </div>
              </div>
            </FormSection>

            {initialData?.events && initialData.events.length > 0 && (
              <div className="pt-6 border-t border-gray-200 dark:border-gray-800">
                <RelatedEventsList events={initialData.events} title="Related Events" onEdit={handleEditEvent} />
              </div>
            )}
          </>
        )}
      </FormLayout>

      {editingEvent && <Modal isOpen={!!editingEvent} onClose={() => setEditingEvent(null)} title="Edit Event" noPadding>
        <EventForm initialData={editingEvent} onSubmit={handleEventSubmit} onCancel={() => setEditingEvent(null)} isModal />
      </Modal>}

      {showConfirmDelete && (
        <Modal isOpen={showConfirmDelete} onClose={cancelDelete} title="Confirm Deletion">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Delete Artist?</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">Are you sure you want to delete <span className="font-semibold">{formData.name}</span>? This action cannot be undone.</p>

            {usageCount !== null && usageCount > 0 && (
              <div className="mb-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-md border border-red-200 dark:border-red-800">
                <div className="flex items-start gap-3">
                  <Trash2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Warning: Linked Data</p>
                    <p className="text-sm mt-1">This artist is linked to <strong>{usageCount}</strong> events.</p>
                    <p className="text-sm mt-1">Deleting this artist will remove the association from these events.</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={cancelDelete}>Cancel</Button>
              <Button variant="danger" onClick={confirmDelete} isLoading={isDeleting}>Delete Artist</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
