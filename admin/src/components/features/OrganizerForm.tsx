
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Organizer, Event } from '@/types';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SourceFieldOptions } from '@/components/ui/SourceFieldOptions';
import { ResetSectionButton } from '@/components/ui/ResetSectionButton';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { Star, Globe, FileText, Image as ImageIcon, Save, Trash2, X } from 'lucide-react';
import { RelatedEventsList } from '@/components/features/RelatedEventsList';
import { getBestSourceForField } from '@/lib/smartMerge';
import { RelatedVenuesList } from '@/components/features/RelatedVenuesList';
import { updateEvent, fetchEvent, fetchOrganizers, fetchOrganizer } from '@/lib/api';
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

interface OrganizerFormProps {
  initialData?: Partial<Organizer>;
  onSubmit: (data: Partial<Organizer>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCancel: (force?: boolean) => void;
  isLoading?: boolean;
  isModal?: boolean;
  id?: string;
  isPanel?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function OrganizerForm({
  initialData,
  onSubmit,
  onDelete,
  onCancel,
  isLoading,
  isModal = false,
  id,
  isPanel = false,
  onDirtyChange
}: OrganizerFormProps) {
  const { success, error: showError } = useToast();
  const [formData, setFormData] = useState<Partial<Organizer>>({
    name: '',
    provider: '',
    description: '',
    website_url: '',
    image_url: ''
  });

  // Tabs State
  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');

  const [fetchedData, setFetchedData] = useState<Organizer | null>(null);

  useEffect(() => {
    if (id && !initialData && !fetchedData) {
      fetchOrganizer(id).then(setFetchedData).catch(console.error);
    }
  }, [id, initialData, fetchedData]);

  // Baseline State (Changes Tracking)
  // We snapshot the form data immediately after initialization logic runs.
  // This allows us to compare "current state" vs "initialized merged state" rather than "raw props".
  const [baselineData, setBaselineData] = useState<Partial<Organizer>>({});
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize and Sync Logic
  // Merge initial properties with best source data if needed, similar to original Effect
  useEffect(() => {
    const effectiveInitial = initialData || fetchedData;
    if (effectiveInitial) {
      const sources = effectiveInitial.source_references || [];
      const getBest = (field: string) => (getBestSourceForField(sources, field) as any)?.[field];

      const website = effectiveInitial.website_url;
      const bestWebsite = getBestSourceForField(sources, 'content_url')?.content_url;

      const newData = {
        ...effectiveInitial,
        website_url: website || bestWebsite || '',
        description: effectiveInitial.description || (getBestSourceForField(sources, 'description')?.description) || '',
        image_url: effectiveInitial.image_url || (getBestSourceForField(sources, 'image_url')?.image_url) || '',
        provider: effectiveInitial.provider || (sources.length > 0 ? sources[0].source_code : '')
      };
      setFormData(newData);
      if (!isInitialized) {
        setBaselineData(newData);
        setIsInitialized(true);
      }
    }
  }, [initialData, fetchedData, isInitialized]);

  // Dirty State
  const isDirty = useMemo(() => {
    if (!isInitialized) return false;

    const keys = ['name', 'provider', 'description', 'website_url', 'image_url'] as (keyof Organizer)[];
    for (const k of keys) {
      // @ts-ignore
      const v1 = formData[k];
      // @ts-ignore
      const v2 = baselineData[k];

      // Simple equality check is usually enough given we set baselineData = newData
      // providing strict equality for objects/references might be tricky if inputs change types
      // but for strings it's fine.
      // We handle null/undefined/empty string equivalence
      const v1E = !v1;
      const v2E = !v2;
      if (v1E && v2E) continue;
      if (v1 != v2) return true;
    }
    return false;
  }, [formData, baselineData, isInitialized]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);


  const handleSave = async () => {
    // Duplicate Check
    if (!initialData?.id && formData.name) {
      try {
        const existingResult = await fetchOrganizers({ search: formData.name });
        const candidates = (existingResult as any).data || [];
        const isDuplicate = candidates.some((o: Organizer) =>
          o.name.toLowerCase() === formData.name?.toLowerCase()
        );

        if (isDuplicate) {
          showError('An organizer with this name already exists.');
          return;
        }
      } catch (err) { }
    }
    await onSubmit(formData);
    onCancel(true);
  };

  const { promptBeforeAction, modalElement } = useUnsavedChanges({
    isLinkDirty: isDirty,
    onSave: handleSave,
    onDiscard: () => onCancel()
  });

  const { handleDeleteClick, confirmDelete, cancelDelete, showConfirm: showConfirmDelete, usageCount, isDeleting } = useDeleteWithUsage({
    entityType: 'organizers',
    onDelete: async (id) => {
      if (onDelete) await onDelete(id);
    },
    onSuccess: () => {
      onCancel(true);
      success('Organizer deleted successfully');
    },
    onError: (err) => showError(err.message)
  });

  const handleCancelRequest = () => {
    promptBeforeAction(() => onCancel());
  };


  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const handleEditEvent = async (event: Event) => {
    try {
      const fullEvent = await fetchEvent(event.id);
      setEditingEvent(fullEvent || event);
    } catch (e) { console.error(e); setEditingEvent(event); }
  };
  const handleEventSubmit = async (data: Partial<Event>) => {
    if (!editingEvent) return;
    await updateEvent(editingEvent.id, data);
    setEditingEvent(null);
  };


  const uniqueSources = Array.from(new Set((initialData?.source_references || []).map(s => s.source_code)));

  const resetFields = (sourceCode: string, fields: (keyof Organizer)[]) => {
    const newFormData = { ...formData };
    let hasChanges = false;
    const sources = initialData?.source_references || [];

    fields.forEach(field => {
      // ... existing reset logic ...
      let val: any = undefined;

      if (sourceCode === 'best') {
        let bestSource = getBestSourceForField(sources, field as string);
        if (!bestSource && field === 'website_url') bestSource = getBestSourceForField(sources, 'content_url');

        if (bestSource) {
          val = (bestSource as any)[field];
          if (field === 'website_url' && !val) val = bestSource.content_url;
        }
      } else {
        const source = sources.find(s => s.source_code === sourceCode);
        if (source) {
          val = (source as any)[field];
          if (field === 'website_url' && !val) val = source.content_url;
        }
      }

      if (val !== undefined && val !== null && val !== '') {
        // @ts-ignore
        newFormData[field] = val;
        hasChanges = true;
      }
    });

    if (hasChanges) setFormData(newFormData);
  };

  const handleResetToSource = (sourceCode: string) => {
    resetFields(sourceCode, ['name', 'description', 'website_url', 'image_url', 'provider']);
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
        title={initialData?.id ? 'Edit Organizer' : 'New Organizer'}
        isModal={isModal}
        isPanel={isPanel}
        onCancel={handleCancelRequest}
        onSave={handleSave}
        onDelete={initialData?.id && onDelete ? () => handleDeleteClick(initialData.id!) : undefined}
        headerExtras={headerExtras}
        isLoading={isLoading}
        saveLabel={initialData?.id ? 'Save Changes' : 'Create Organizer'}
      >
        {activeTab === 'history' ? (
          <div className="py-6"><HistoryPanel entityId={initialData?.id || ''} entityType="organizer" /></div>
        ) : (
          <>
            <FormSection title="Basic Details" icon={<FileText className="w-4 h-4" />} sources={uniqueSources} onReset={(source) => resetFields(source, ['name', 'description', 'provider'])}>
              <div className="space-y-4 pt-4">
                {!initialData?.id && (
                  <div className="relative mb-4">
                    <div className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Name / Auto-fill</div>
                    <AutoFillSearch type="organizer" onSelect={(result) => {
                      setFormData(prev => ({
                        ...prev,
                        name: result.name,
                        image_url: result.image_url || prev.image_url || '',
                        website_url: result.raw?.url || result.raw?.website || prev.website_url || ''
                      }));
                    }} placeholder="Search organizer to auto-fill..." className="mb-2" />
                  </div>
                )}

                <Input label="Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required placeholder="Organizer Name" />
                <SourceFieldOptions sources={initialData?.source_references} field="name" currentValue={formData.name} onSelect={(val) => setFormData({ ...formData, name: val })} />

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                  <textarea value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white" placeholder="Organizer description..." />
                  <SourceFieldOptions sources={initialData?.source_references} field="description" currentValue={formData.description} onSelect={(val) => setFormData({ ...formData, description: val })} />
                </div>

                <div>
                  <Input label="Provider" value={formData.provider || ''} onChange={(e) => setFormData({ ...formData, provider: e.target.value })} placeholder="e.g. ticketmaster" />
                  <SourceFieldOptions sources={initialData?.source_references} field="provider" currentValue={formData.provider} onSelect={(val) => setFormData({ ...formData, provider: val })} />
                </div>
              </div>
            </FormSection>

            <FormSection title="Links & Media" icon={<Globe className="w-4 h-4" />} sources={uniqueSources} onReset={(source) => resetFields(source, ['website_url', 'image_url'])}>
              <div className="space-y-4 pt-4">
                <Input label="Website URL" value={formData.website_url || ''} onChange={(e) => setFormData({ ...formData, website_url: e.target.value })} leftIcon={<Globe className="w-4 h-4" />} placeholder="https://..." />
                <SourceFieldOptions sources={initialData?.source_references} field="content_url" currentValue={formData.website_url} onSelect={(val) => setFormData({ ...formData, website_url: val })} />

                <div>
                  <Input label="Image URL" value={formData.image_url || ''} onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} leftIcon={<ImageIcon className="w-4 h-4" />} placeholder="https://..." />
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

            {initialData?.venues && initialData.venues.length > 0 && (
              <div className="pt-6 border-t border-gray-200 dark:border-gray-800">
                <RelatedVenuesList venues={initialData.venues} title="Related Venues" />
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
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Delete Organizer?</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">Are you sure you want to delete <span className="font-semibold">{formData.name}</span>? This action cannot be undone.</p>

            {usageCount !== null && usageCount > 0 && (
              <div className="mb-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-md border border-red-200 dark:border-red-800">
                <div className="flex items-start gap-3">
                  <Trash2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Warning: Linked Data</p>
                    <p className="text-sm mt-1">This organizer is linked to <strong>{usageCount}</strong> events.</p>
                    <p className="text-sm mt-1">Deleting this organizer will remove the association from these events.</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={cancelDelete}>Cancel</Button>
              <Button variant="danger" onClick={confirmDelete} isLoading={isDeleting}>Delete Organizer</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
