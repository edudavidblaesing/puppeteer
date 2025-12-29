
import React, { useState, useEffect } from 'react';
import { Organizer, Event } from '@/types'; // Added Event
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SourceFieldOptions } from '@/components/ui/SourceFieldOptions';
import { ResetSectionButton } from '@/components/ui/ResetSectionButton';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { Star } from 'lucide-react';
import { RelatedEventsList } from '@/components/features/RelatedEventsList';
import { getBestSourceForField, SOURCE_PRIORITY } from '@/lib/smartMerge';
import { RelatedVenuesList } from '@/components/features/RelatedVenuesList';
import { Save, Trash2, X, Globe, FileText, Image as ImageIcon } from 'lucide-react';
import { updateEvent, fetchEvent, fetchOrganizers } from '@/lib/api'; // Added fetchOrganizers
import { Modal } from '@/components/ui/Modal'; // Added Modal
import { EventForm } from '@/components/features/EventForm'; // Added EventForm
import { useToast } from '@/contexts/ToastContext';
import { AutoFillSearch } from '@/components/features/AutoFillSearch';
interface OrganizerFormProps {
  initialData?: Partial<Organizer>;
  onSubmit: (data: Partial<Organizer>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  isModal?: boolean;
}

export function OrganizerForm({
  initialData,
  onSubmit,
  onDelete,
  onCancel,
  isLoading,
  isModal = false
}: OrganizerFormProps) {
  const { success, error: showError } = useToast();
  const [formData, setFormData] = useState<Partial<Organizer>>({
    name: '',
    provider: '',
    description: '',
    website_url: '',
    image_url: ''
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

  useEffect(() => {
    if (initialData) {
      const sources = initialData.source_references || [];
      const getBest = (field: string) => {
        // @ts-ignore
        return getBestSourceForField(sources, field)?.[field];
      };

      const data = initialData as any;
      const website = data.website || initialData.website_url;
      const bestWebsite = getBest('content_url'); // fallback to content_url (e.g. RA profile)

      setFormData({
        ...initialData,
        // @ts-ignore
        website_url: website || bestWebsite || '',
        description: initialData.description || (getBest('description') as string) || '',
        image_url: initialData.image_url || (getBest('image_url') as string) || '',
        provider: initialData.provider || (sources.length > 0 ? sources[0].source_code : '')
      });
    }
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Duplicate Check for New Organizers
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
      } catch (err) {
        console.error('Failed to check duplicates:', err);
      }
    }

    await onSubmit(formData);
  };

  const uniqueSources = Array.from(new Set((initialData?.source_references || []).map(s => s.source_code)));

  const resetFields = (sourceCode: string, fields: (keyof Organizer)[]) => {
    const newFormData = { ...formData };
    let hasChanges = false;
    const sources = initialData?.source_references || [];

    fields.forEach(field => {
      let val: any = undefined;

      if (sourceCode === 'best') {
        let bestSource = getBestSourceForField(sources, field as string);

        // Fallback for website_url -> content_url if not found
        if (!bestSource && field === 'website_url') {
          bestSource = getBestSourceForField(sources, 'content_url');
        }

        if (bestSource) {
          val = (bestSource as any)[field];
          if (field === 'website_url' && (val === undefined || val === null || val === '')) {
            val = bestSource.content_url;
          }
        }
      } else {
        const source = sources.find(s => s.source_code === sourceCode);
        if (source) {
          val = (source as any)[field];
          if (field === 'website_url' && (val === undefined || val === null || val === '')) {
            val = source.content_url;
          }
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

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      {/* Header */}
      {!isModal && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50">
          <div className="flex items-center">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {initialData?.id ? 'Edit Organizer' : 'New Organizer'}
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
            {initialData?.id && onDelete && (
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
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <form id="organizer-form" onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto">

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Basic Details
              </h3>
              <ResetSectionButton
                sources={uniqueSources}
                onReset={(source) => resetFields(source, ['name', 'description', 'provider'])}
              />
            </div>

            <div>
              <div className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Name / Auto-fill</div>
              {!initialData?.id ? (
                <AutoFillSearch
                  type="organizer"
                  onSelect={(result) => {
                    console.log('[OrganizerForm] Autofill result:', result);
                    setFormData(prev => ({
                      ...prev,
                      name: result.name,
                      image_url: result.image_url || prev.image_url || '',
                      // Try to guess website from raw data if available
                      website_url: result.raw?.url || result.raw?.website || prev.website_url || ''
                    }));
                  }}
                  placeholder="Search organizer to auto-fill..."
                  className="mb-2"
                />
              ) : null}
              <Input
                label="Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="e.g. Live Nation"
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
                Description
              </label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white"
                placeholder="Organizer description..."
              />
              <SourceFieldOptions
                sources={initialData?.source_references}
                field="description"
                currentValue={formData.description}
                onSelect={(val) => setFormData({ ...formData, description: val })}
              />
            </div>

            <div>
              <Input
                label="Provider (Source)"
                value={formData.provider || ''}
                onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                placeholder="e.g. ticketmaster"
              />
              <SourceFieldOptions
                sources={initialData?.source_references}
                field="provider"
                currentValue={formData.provider}
                onSelect={(val) => setFormData({ ...formData, provider: val })}
              />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Globe className="w-4 h-4" /> Links & Media
              </h3>
              <ResetSectionButton
                sources={uniqueSources}
                onReset={(source) => resetFields(source, ['website_url', 'image_url'])}
              />
            </div>

            <div>
              <Input
                label="Website URL"
                value={formData.website_url || ''}
                onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                leftIcon={<Globe className="w-4 h-4" />}
                placeholder="https://..."
              />
              <SourceFieldOptions
                sources={initialData?.source_references}
                field="content_url"
                currentValue={formData.website_url}
                onSelect={(val) => setFormData({ ...formData, website_url: val })}
              />
            </div>

            <div>
              <Input
                label="Image URL"
                value={formData.image_url || ''}
                onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                leftIcon={<ImageIcon className="w-4 h-4" />}
                placeholder="https://..."
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

          {initialData?.venues && initialData.venues.length > 0 && (
            <div className="pt-6 border-t border-gray-200 dark:border-gray-800">
              <RelatedVenuesList venues={initialData.venues} title="Related Venues" />
            </div>
          )}
        </form>
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
          form="organizer-form"
          isLoading={isLoading}
          leftIcon={<Save className="w-4 h-4" />}
        >
          {initialData?.id ? 'Save Changes' : 'Create Organizer'}
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
