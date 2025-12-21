import React, { useState, useEffect } from 'react';
import { Save, Trash2, X, MapPin, Globe, Database, AlertCircle, ChevronDown, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { City, SourceConfig } from '@/types';
import { fetchSources, fetchCity } from '@/lib/api';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { ResetSectionButton } from '@/components/ui/ResetSectionButton';
import { getBestSourceForField } from '@/lib/smartMerge';

interface CityFormProps {
  initialData?: City;
  onSubmit: (data: Partial<City>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  isModal?: boolean;
}

// Preset cities configuration data
const PRESET_CITIES = [
  {
    name: 'Berlin',
    country: 'DE',
    timezone: 'Europe/Berlin',
    latitude: 52.5200,
    longitude: 13.4050,
    source_ids: {
      ra: '34',
      tm: 'Berlin',
      di: 'berlin',
      eb: 'berlin--germany'
    }
  },
  {
    name: 'London',
    country: 'GB',
    timezone: 'Europe/London',
    latitude: 51.5074,
    longitude: -0.1278,
    source_ids: {
      ra: '13',
      tm: 'London',
      di: 'london',
      eb: 'london'
    }
  },
  {
    name: 'New York',
    country: 'US',
    timezone: 'America/New_York',
    latitude: 40.7128,
    longitude: -74.0060,
    source_ids: {
      ra: '8',
      tm: 'New York',
      di: 'new-york',
      eb: 'new-york'
    }
  },
  {
    name: 'Amsterdam',
    country: 'NL',
    timezone: 'Europe/Amsterdam',
    latitude: 52.3676,
    longitude: 4.9041,
    source_ids: {
      ra: '29',
      tm: 'Amsterdam',
      di: 'amsterdam',
      eb: 'amsterdam--netherlands'
    }
  },
  {
    name: 'Barcelona',
    country: 'ES',
    timezone: 'Europe/Madrid',
    latitude: 41.3851,
    longitude: 2.1734,
    source_ids: {
      ra: '24',
      tm: 'Barcelona',
      di: 'barcelona',
      eb: 'barcelona--spain'
    }
  },
  {
    name: 'Paris',
    country: 'FR',
    timezone: 'Europe/Paris',
    latitude: 48.8566,
    longitude: 2.3522,
    source_ids: {
      ra: '12',
      tm: 'Paris',
      di: 'paris',
      eb: 'paris--france'
    }
  }
];

export function CityForm({ initialData, onSubmit, onDelete, onCancel, isLoading = false, isModal = false }: CityFormProps) {
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
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('');

  // Load available sources
  useEffect(() => {
    fetchSources().then(data => setAvailableSources(data)).catch(console.error);
  }, []);

  // Load city details including configs if initialData is provided
  useEffect(() => {
    const loadDetails = async () => {
      if (initialData && initialData.id) {
        setIsFetchingDetails(true);
        try {
          const detail = await fetchCity(initialData.id.toString());
          setFormData({
            ...detail,
            source_configs: detail.source_configs || []
          });

          // Check if matches a preset
          const match = PRESET_CITIES.find(p => p.name === detail.name);
          if (match) setSelectedPreset(match.name);

        } catch (e) {
          console.error("Failed to fetch city details", e);
        } finally {
          setIsFetchingDetails(false);
        }
      } else {
        // New city
        setFormData({
          name: '',
          country: '',
          latitude: 0,
          longitude: 0,
          timezone: '',
          is_active: true,
          source_configs: []
        });
      }
    };
    loadDetails();
  }, [initialData]);

  const handlePresetChange = (presetName: string) => {
    setSelectedPreset(presetName);
    const preset = PRESET_CITIES.find(c => c.name === presetName);

    if (preset) {
      // Update form data with preset values
      const newConfigs = [...(formData.source_configs || [])];

      // Update or add configs for known sources
      availableSources.forEach(source => {
        // @ts-ignore
        const presetId = preset.source_ids[source.code];

        if (presetId) {
          const idx = newConfigs.findIndex(c => c.source_id === source.id);
          if (idx >= 0) {
            newConfigs[idx] = {
              ...newConfigs[idx],
              external_id: presetId,
              is_active: true
            };
          } else {
            newConfigs.push({
              source_id: source.id,
              external_id: presetId,
              is_active: true,
              schedule: '0 0 * * *' // Default schedule
            } as SourceConfig);
          }
        }
      });

      setFormData(prev => ({
        ...prev,
        name: preset.name,
        country: preset.country,
        timezone: preset.timezone,
        latitude: preset.latitude,
        longitude: preset.longitude,
        source_configs: newConfigs
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  const handleDelete = async () => {
    if (initialData?.id && onDelete) {
      await onDelete(String(initialData.id));
    }
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

  const uniqueSources = Array.from(new Set((initialData?.source_references || []).map(s => s.source_code)));

  const resetFields = (sourceCode: string, fields: (keyof City)[]) => {
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
    resetFields(sourceCode, ['name', 'country', 'timezone', 'latitude', 'longitude']);
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      {!isModal && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {initialData ? 'Edit City' : 'New City'}
          </h2>
          <div className="flex items-center gap-2">
            {initialData && onDelete && (
              <Button
                variant="danger"
                size="sm"
                onClick={handleDelete}
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

      {isFetchingDetails ? (
        <div className="p-8 text-center text-gray-500">Loading details...</div>
      ) : (
        /* Form Content */
        <div className="flex-1 overflow-y-auto p-6">
          <form id="city-form" onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto">

            {uniqueSources.length > 0 && (
              <div className="flex items-center gap-2 pb-4 border-b border-gray-100 dark:border-gray-800">
                <span className="text-xs text-gray-500">Reset whole city from:</span>
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

            <div className="space-y-4">
              {/* Preset Selection & Basic Info */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Globe className="w-4 h-4" /> Location Details
                </h3>
                <ResetSectionButton
                  sources={uniqueSources}
                  onReset={(source) => resetFields(source, ['name', 'country', 'timezone'])}
                />
              </div>

              {/* Preset Dropdown */}
              {!initialData && (
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Select City Preset
                  </label>
                  <div className="relative">
                    <select
                      value={selectedPreset}
                      onChange={(e) => handlePresetChange(e.target.value)}
                      className="w-full appearance-none rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white pr-10"
                    >
                      <option value="">-- Custom / Manual --</option>
                      {PRESET_CITIES.map(city => (
                        <option key={city.name} value={city.name}>{city.name} ({city.country})</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Select a preset to auto-fill configurations</p>
                </div>
              )}

              <div>
                <Input
                  label="Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="City Name"
                  readOnly={!!selectedPreset} // Lock if preset
                />
              </div>

              <div>
                <Input
                  label="Country"
                  value={formData.country || ''}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  placeholder="e.g. DE, US"
                  readOnly={!!selectedPreset}
                />
              </div>

              <div>
                <Input
                  label="Timezone"
                  value={formData.timezone || ''}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  placeholder="e.g. Europe/Berlin"
                  readOnly={!!selectedPreset}
                />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Coordinates
                </h3>
                <ResetSectionButton
                  sources={uniqueSources}
                  onReset={(source) => resetFields(source, ['latitude', 'longitude'])}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Input
                    label="Latitude"
                    type="number"
                    step="any"
                    value={formData.latitude ?? ''}
                    onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) })}
                    readOnly={!!selectedPreset}
                  />
                </div>
                <div>
                  <Input
                    label="Longitude"
                    type="number"
                    step="any"
                    value={formData.longitude ?? ''}
                    onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) })}
                    readOnly={!!selectedPreset}
                  />
                </div>
              </div>
            </div>

            {/* Source Configurations */}
            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Database className="w-4 h-4" /> Scraper Configuration
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                Configure how each source scrapes this city.
              </p>

              <div className="space-y-3">
                {availableSources
                  .filter(s => {
                    if (s.code === 'manual' || s.code === 'original') return false;
                    // Include if it scrapes events or venues (needs city config)
                    if (s.scopes) return s.scopes.some((scope: string) => ['event', 'venue'].includes(scope));
                    // Fallback
                    return s.entity_type === 'event' || !s.entity_type;
                  })
                  .map(source => {
                    const config = getSourceConfig(source.id);
                    const isActive = config?.is_active ?? false;
                    const extId = config?.external_id ?? '';

                    // Check if this specific field is controlled by preset
                    // @ts-ignore
                    const isPresetValue = selectedPreset && PRESET_CITIES.find(p => p.name === selectedPreset)?.source_ids[source.code] === extId;

                    return (
                      <div key={source.id} className={`p-4 rounded-lg border transition-colors ${isActive ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800' : 'bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700'}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`source-${source.id}`}
                              checked={isActive}
                              onChange={(e) => updateSourceConfig(source.id, 'is_active', e.target.checked)}
                              className="rounded text-indigo-600 focus:ring-indigo-500 border-gray-300"
                            // Allow toggling even if preset is selected
                            />
                            <label htmlFor={`source-${source.id}`} className="font-medium text-sm text-gray-900 dark:text-white cursor-pointer select-none flex items-center gap-2">
                              <SourceIcon sourceCode={source.code} className="w-4 h-4" />
                              {source.name}
                            </label>
                          </div>
                          {/* Code removed as icon is present */}
                        </div>

                        {isActive && (
                          <div className="ml-6 mt-2">
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              External ID / Slug
                            </label>
                            <Input
                              value={extId}
                              onChange={(e) => updateSourceConfig(source.id, 'external_id', e.target.value)}
                              placeholder={`ID for ${source.name}`}
                              className="text-sm"
                              readOnly={!!selectedPreset} // Lock ID if preset active
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="city_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded text-indigo-600 dark:text-indigo-500 border-gray-300 dark:border-gray-600 focus:ring-indigo-500"
                />
                <label htmlFor="city_active" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  City Global Active Status
                </label>
              </div>
            </div>

          </form>
        </div>
      )}

      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" form="city-form" isLoading={isLoading} leftIcon={<Save className="w-4 h-4" />}>
          {initialData ? 'Save City' : 'Create City'}
        </Button>
      </div>
    </div>
  );
}
