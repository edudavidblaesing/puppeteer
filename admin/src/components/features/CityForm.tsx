
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Save, Trash2, X, MapPin, Globe, Database, AlertTriangle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { City, SourceConfig } from '@/types';
import { fetchSources, fetchCity, fetchCountries, searchExternal, fetchAdminCities } from '@/lib/api';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { AutoFillSearch } from '@/components/features/AutoFillSearch';
import { FormLayout } from '@/components/ui/FormLayout';
import { FormSection } from '@/components/ui/FormSection';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useToast } from '@/contexts/ToastContext';
import { useDeleteWithUsage } from '@/hooks/useDeleteWithUsage';
import { Modal } from '@/components/ui/Modal';
import HistoryPanel from './HistoryPanel';
import clsx from 'clsx';

interface CityFormProps {
  initialData?: City;
  onSubmit: (data: Partial<City>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCancel: (force?: boolean) => void;
  isLoading?: boolean;
  isModal?: boolean;
  isPanel?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function CityForm({ initialData, onSubmit, onDelete, onCancel, isLoading = false, isModal = false, isPanel = false, onDirtyChange }: CityFormProps) {
  const { success, error: showError } = useToast();
  const [formData, setFormData] = useState<Partial<City>>({
    name: '',
    country: '',
    latitude: 0,
    longitude: 0,
    timezone: '',
    is_active: true,
    source_configs: []
  });

  const [availableSources, setAvailableSources] = useState<any[]>([]);
  const [countries, setCountries] = useState<{ name: string; code: string }[]>([]);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  // Tabs State
  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');

  // Timezones
  const timezones = Intl.supportedValuesOf('timeZone');

  // Load available sources and countries
  useEffect(() => {
    fetchSources().then(data => setAvailableSources(data)).catch(console.error);
    fetchCountries().then(setCountries).catch(console.error);
  }, []);

  // Use fetched initial data as reference for clean state
  const [fetchedInitial, setFetchedInitial] = useState<Partial<City> | null>(null);

  // Load city details including configs if initialData is provided
  useEffect(() => {
    const loadDetails = async () => {
      if (initialData && initialData.id) {
        setIsFetchingDetails(true);
        try {
          const detail = await fetchCity(initialData.id.toString());
          const loadedData = {
            ...detail,
            source_configs: detail.source_configs || []
          };
          setFormData(loadedData);
          setFetchedInitial(loadedData);
        } catch (e) {
          console.error("Failed to fetch city details", e);
        } finally {
          setIsFetchingDetails(false);
        }
      } else {
        // New city
        const empty = {
          name: '',
          country: '',
          latitude: 0,
          longitude: 0,
          timezone: '',
          is_active: true,
          source_configs: []
        };
        setFormData(empty);
        setFetchedInitial(empty);
      }
    };
    loadDetails();
  }, [initialData]);

  // Dirty State Logic
  const effectiveInitial = useMemo(() => fetchedInitial || {}, [fetchedInitial]);

  const isDirty = useMemo(() => {
    if (!effectiveInitial || Object.keys(effectiveInitial).length === 0) return false;

    const keys = ['name', 'country', 'latitude', 'longitude', 'timezone', 'is_active'] as (keyof City)[];
    for (const k of keys) {
      // @ts-ignore
      if (formData[k] != effectiveInitial[k]) return true;
    }

    // Deep check source configs
    const currentConfigs = formData.source_configs || [];
    const initialConfigs = effectiveInitial.source_configs || [];

    if (currentConfigs.length !== initialConfigs.length) return true;

    // Simple stringify check for configs for now as order might match if not modified
    if (JSON.stringify(currentConfigs) !== JSON.stringify(initialConfigs)) return true;

    return false;
  }, [formData, effectiveInitial]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);


  const selectCityResult = async (result: any) => {
    console.log('[CityForm] Selected city result:', result);
    try {
      if (!result) return;

      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);

      // 1. Map Country
      let countryCode = result.country || '';

      const resolveCountryCode = (input: string) => {
        if (!input) return '';
        const upper = input.toUpperCase();
        if (countries.some(c => c.code === upper)) return upper;
        const found = countries.find(c => c.name.toLowerCase() === input.toLowerCase());
        return found ? found.code : '';
      };

      if (countryCode) countryCode = resolveCountryCode(countryCode);
      if (!countryCode && result.raw?.address?.country) countryCode = resolveCountryCode(result.raw.address.country);
      if (!countryCode && result.raw?.address?.country_code) countryCode = resolveCountryCode(result.raw.address.country_code);

      // 2. Auto-fill Scrapers
      const cityName = result.name || result.city || '';

      const slugify = (text: string) => {
        return text.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      };
      const citySlug = slugify(cityName);

      let externalDataUpdates: Record<string, string> = {};
      try {
        const enrichmentResults = await searchExternal('city', cityName);
        enrichmentResults.forEach((item: any) => {
          const itemCountryCode = resolveCountryCode(item.country);
          if (item.source === 'ra') {
            const nameMatch = item.name.toLowerCase() === cityName.toLowerCase();
            if (itemCountryCode === countryCode || (countryCode && item.country === countryCode) || nameMatch) {
              externalDataUpdates['ra'] = String(item.id);
            }
          }
          if (item.source === 'tm') {
            if (itemCountryCode === countryCode || item.country === countryCode || item.name.toLowerCase() === cityName.toLowerCase()) {
              externalDataUpdates['tm'] = String(item.id);
            }
          }
        });
      } catch (err) { }

      const newSourceConfigs = availableSources
        .filter(s => {
          if (s.code === 'manual' || s.code === 'original') return false;
          if (s.scopes) return s.scopes.some((scope: string) => ['event', 'venue'].includes(scope));
          return s.entity_type === 'event' || !s.entity_type;
        })
        .map(source => {
          let externalId = citySlug;
          if (externalDataUpdates[source.code.toLowerCase()]) {
            externalId = externalDataUpdates[source.code.toLowerCase()];
          } else if (source.code.toLowerCase() === result.source?.toLowerCase()) {
            externalId = result.id ? String(result.id) : citySlug;
          }

          return {
            source_id: source.id,
            external_id: externalId,
            is_active: true
          };
        });

      setFormData(prev => ({
        ...prev,
        name: cityName,
        country: countryCode,
        latitude: isNaN(lat) ? 0 : lat,
        longitude: isNaN(lon) ? 0 : lon,
        source_configs: newSourceConfigs,
        timezone: ''
      }));

      // 3. Fetch Timezone
      if (!isNaN(lat) && !isNaN(lon)) {
        try {
          const tzRes = await fetch(`https://timeapi.io/api/TimeZone/coordinate?latitude=${lat}&longitude=${lon}`);
          if (tzRes.ok) {
            const tzData = await tzRes.json();
            if (tzData.timeZone) setFormData(prev => ({ ...prev, timezone: tzData.timeZone }));
          }
        } catch (e) { }
      }

    } catch (e) {
      console.error('[CityForm] Autofill error:', e);
    }
  };

  const handleSave = async () => {
    setSubmitted(true);
    setDuplicateError(null);

    // Validation
    const requiredFields = ['name', 'country', 'timezone', 'latitude', 'longitude'];
    const missingFields = requiredFields.filter(field => !formData[field as keyof City]);
    if (missingFields.length > 0) return;

    // Duplicate Check
    try {
      const existing = await fetchAdminCities({ search: formData.name });
      const isDuplicate = existing.data.some((c: City) =>
        c.name.toLowerCase() === formData.name?.toLowerCase() &&
        c.country === formData.country &&
        c.id !== initialData?.id
      );

      if (isDuplicate) {
        setDuplicateError('A city with this name and country already exists.');
        return;
      }
    } catch (err) { }

    await onSubmit(formData);
    onCancel(true);
  };

  const { promptBeforeAction, modalElement } = useUnsavedChanges({
    isLinkDirty: isDirty,
    onSave: handleSave,
    onDiscard: () => onCancel()
  });

  const { handleDeleteClick, confirmDelete, cancelDelete, showConfirm: showConfirmDelete, usageCount, isDeleting } = useDeleteWithUsage({
    entityType: 'cities',
    onDelete: async (id) => {
      if (onDelete) await onDelete(id);
    },
    onSuccess: () => {
      onCancel(true);
      success('City deleted successfully');
    },
    onError: (err) => showError(err.message)
  });

  const handleCancelRequest = () => {
    promptBeforeAction(() => onCancel());
  };

  const updateSourceConfig = (sourceId: number, field: keyof SourceConfig, value: any) => {
    const currentConfigs = formData.source_configs || [];
    const existingIndex = currentConfigs.findIndex(c => c.source_id === sourceId);

    let newConfigs = [...currentConfigs];
    if (existingIndex >= 0) {
      newConfigs[existingIndex] = { ...newConfigs[existingIndex], [field]: value };
    } else {
      newConfigs.push({
        source_id: sourceId,
        external_id: '',
        is_active: field === 'is_active' ? value : true,
        [field]: value
      } as SourceConfig);
    }
    setFormData({ ...formData, source_configs: newConfigs });
  };

  const getSourceConfig = (sourceId: number) => {
    return formData.source_configs?.find(c => c.source_id === sourceId);
  };

  const headerExtras = (
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
  );

  return (
    <>
      {modalElement}
      <FormLayout
        title={initialData ? 'Edit City' : 'New City'}
        isModal={isModal}
        isPanel={isPanel}
        onCancel={handleCancelRequest}
        onSave={handleSave}
        onDelete={initialData && onDelete ? () => handleDeleteClick(String(initialData.id)) : undefined}
        isLoading={isLoading || isFetchingDetails}
        saveLabel={initialData ? 'Save City' : 'Create City'}
        headerExtras={headerExtras}
      >
        {activeTab === 'history' ? (
          <div className="py-6"><HistoryPanel entityId={initialData?.id ? String(initialData.id) : ''} entityType="city" /></div>
        ) : (
          isFetchingDetails ? (
            <div className="p-8 text-center text-gray-500">Loading details...</div>
          ) : (
            <div className="space-y-6 pt-4">
              {duplicateError && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-md border border-red-200 dark:border-red-800 flex items-center gap-2 text-sm mx-6 mt-4">
                  <AlertTriangle className="w-4 h-4" />
                  {duplicateError}
                </div>
              )}

              <FormSection title="Location Details" icon={<Globe className="w-4 h-4" />}>
                <div className="space-y-4 pt-4">
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Auto-fill from Search</label>
                    <AutoFillSearch type="city" onSelect={(result) => selectCityResult(result)} placeholder="Search city (OpenStreetMap) to auto-fill..." filter={(r) => r.source === 'osm'} />
                  </div>

                  <div>
                    <Input label={<span>Name <span className="text-red-500">*</span></span>} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="City Name" className={submitted && !formData.name ? 'border-red-300 focus:ring-red-500' : ''} />
                    {submitted && !formData.name && <p className="text-xs text-red-500 mt-1">Name is required.</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Country <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <select value={formData.country || ''} onChange={(e) => setFormData({ ...formData, country: e.target.value })} className={`w-full appearance-none rounded-md border ${submitted && !formData.country ? 'border-red-300 dark:border-red-700 focus:ring-red-500' : 'border-gray-300 dark:border-gray-600 focus:ring-primary-500'} bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 dark:text-white pr-10`}>
                        <option value="">Select Country...</option>
                        {countries.map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                    {submitted && !formData.country && <p className="text-xs text-red-500 mt-1">Country is required.</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Timezone <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <select value={formData.timezone || ''} onChange={(e) => setFormData({ ...formData, timezone: e.target.value })} className={`w-full appearance-none rounded-md border ${submitted && !formData.timezone ? 'border-red-300 dark:border-red-700 focus:ring-red-500' : 'border-gray-300 dark:border-gray-600 focus:ring-primary-500'} bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 dark:text-white pr-10`}>
                        <option value="">Select Timezone...</option>
                        {timezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                    {submitted && !formData.timezone && <p className="text-xs text-red-500 mt-1">Timezone is required.</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Latitude</label>
                      <Input type="number" step="any" value={formData.latitude ?? ''} onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) })} className={submitted && !formData.latitude ? 'border-red-300' : ''} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Longitude</label>
                      <Input type="number" step="any" value={formData.longitude ?? ''} onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) })} className={submitted && !formData.longitude ? 'border-red-300' : ''} />
                    </div>
                  </div>
                  {submitted && (!formData.latitude || !formData.longitude) && <p className="text-xs text-red-500">Coordinates are required. Use Auto-fill or enter manually.</p>}
                </div>
              </FormSection>

              <FormSection title="Scraper Configuration" icon={<Database className="w-4 h-4" />}>
                <div className="space-y-4 pt-4">
                  <p className="text-xs text-gray-500 mb-4">Configure how each source scrapes this city.</p>
                  <div className="space-y-3">
                    {availableSources.filter(s => {
                      if (s.code === 'manual' || s.code === 'original') return false;
                      if (s.scopes) return s.scopes.some((scope: string) => ['event', 'venue'].includes(scope));
                      return s.entity_type === 'event' || !s.entity_type;
                    }).map(source => {
                      const config = getSourceConfig(source.id);
                      const isActive = config?.is_active ?? false;
                      const extId = config?.external_id ?? '';

                      return (
                        <div key={source.id} className={`p-4 rounded-lg border transition-colors ${isActive ? 'bg-primary-50 border-primary-200 dark:bg-primary-900/20 dark:border-primary-800' : 'bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700'}`}>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <input type="checkbox" id={`source-${source.id}`} checked={isActive} onChange={(e) => updateSourceConfig(source.id, 'is_active', e.target.checked)} className="rounded text-primary-600 focus:ring-primary-500 border-gray-300" />
                              <label htmlFor={`source-${source.id}`} className="font-medium text-sm text-gray-900 dark:text-white cursor-pointer select-none flex items-center gap-2">
                                <SourceIcon sourceCode={source.code} className="w-4 h-4" />
                                {source.name}
                              </label>
                            </div>
                          </div>
                          {isActive && (
                            <div className="ml-6 mt-2">
                              <label className="block text-xs font-medium text-gray-500 mb-1">External ID / Slug</label>
                              <Input value={extId} onChange={(e) => updateSourceConfig(source.id, 'external_id', e.target.value)} placeholder={`ID for ${source.name}`} className="text-sm" />
                              {formData.name && (
                                <div className="mt-1 text-[10px] text-gray-400">
                                  Try: <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded cursor-pointer hover:text-primary-500" onClick={() => updateSourceConfig(source.id, 'external_id', formData.name?.toLowerCase().replace(/\s+/g, '-'))}>{formData.name?.toLowerCase().replace(/\s+/g, '-')}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </FormSection>

              <FormSection title="Status">
                <div className="pt-4 flex items-center gap-2">
                  <input type="checkbox" id="city_active" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} className="rounded text-primary-600 dark:text-primary-500 border-gray-300 dark:border-gray-600 focus:ring-primary-500" />
                  <label htmlFor="city_active" className="text-sm font-medium text-gray-700 dark:text-gray-300">City Global Active Status</label>
                </div>
              </FormSection>
            </div>
          )
        )}
      </FormLayout>

      {showConfirmDelete && (
        <Modal isOpen={showConfirmDelete} onClose={cancelDelete} title="Confirm Deletion">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Delete City?</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">Are you sure you want to delete <span className="font-semibold">{formData.name}</span>? This action cannot be undone.</p>

            {usageCount !== null && usageCount > 0 && (
              <div className="mb-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-md border border-red-200 dark:border-red-800">
                <div className="flex items-start gap-3">
                  <Trash2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Warning: Linked Data</p>
                    <p className="text-sm mt-1">This city is linked to <strong>{usageCount}</strong> events.</p>
                    <p className="text-sm mt-1">Deleting this city will remove the association from these events.</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={cancelDelete}>Cancel</Button>
              <Button variant="danger" onClick={confirmDelete} isLoading={isDeleting}>Delete City</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
