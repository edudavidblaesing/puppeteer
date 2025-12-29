import React, { useState, useEffect, useRef } from 'react';
import { Save, Trash2, X, MapPin, Globe, Database, Search, ChevronDown, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { City, SourceConfig } from '@/types';
import { fetchSources, fetchCity, fetchCountries, searchExternal, fetchAdminCities } from '@/lib/api';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { AutoFillSearch } from '@/components/features/AutoFillSearch';

interface CityFormProps {
  initialData?: City;
  onSubmit: (data: Partial<City>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  isModal?: boolean;
}

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
  const [countries, setCountries] = useState<{ name: string; code: string }[]>([]);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  // Timezones
  const timezones = Intl.supportedValuesOf('timeZone');

  // Load available sources and countries
  useEffect(() => {
    fetchSources().then(data => setAvailableSources(data)).catch(console.error);
    fetchCountries().then(setCountries).catch(console.error);
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

  const selectCityResult = async (result: any) => {
    console.log('[CityForm] Selected city result:', result);
    try {
      if (!result) return;

      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);

      // 1. Map Country
      let countryCode = result.country || '';

      // Helper to resolve country code
      const resolveCountryCode = (input: string) => {
        if (!input) return '';
        const upper = input.toUpperCase();
        if (countries.some(c => c.code === upper)) return upper;
        const found = countries.find(c => c.name.toLowerCase() === input.toLowerCase());
        return found ? found.code : '';
      };

      // Normalize country code
      if (countryCode) {
        countryCode = resolveCountryCode(countryCode);
      }
      if (!countryCode && result.raw?.address?.country) {
        countryCode = resolveCountryCode(result.raw.address.country);
      }
      if (!countryCode && result.raw?.address?.country_code) {
        countryCode = resolveCountryCode(result.raw.address.country_code);
      }

      // 2. Auto-fill Scrapers
      const cityName = result.name || result.city || '';

      const slugify = (text: string) => {
        return text.toLowerCase()
          .replace(/ä/g, 'ae')
          .replace(/ö/g, 'oe')
          .replace(/ü/g, 'ue')
          .replace(/ß/g, 'ss')
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');
      };
      const citySlug = slugify(cityName);
      const tryIds = [cityName.toLowerCase(), citySlug];

      // Fetch External IDs (Enrichment Step)
      let externalDataUpdates: Record<string, string> = {};
      try {
        console.log(`[CityForm] Enriching data for ${cityName} (${countryCode})...`);
        const enrichmentResults = await searchExternal('city', cityName);

        enrichmentResults.forEach((item: any) => {
          const itemCountryCode = resolveCountryCode(item.country);

          // RA Match
          if (item.source === 'ra') {
            // Logic: 
            // 1. Strict country match
            // 2. OR name match if result country is ambiguous
            // 3. OR strict name match regardless (since query was by name)
            const nameMatch = item.name.toLowerCase() === cityName.toLowerCase();
            if (itemCountryCode === countryCode || (countryCode && item.country === countryCode) || nameMatch) {
              externalDataUpdates['ra'] = String(item.id);
            }
          }
          // TM Match
          if (item.source === 'tm') {
            if (itemCountryCode === countryCode || item.country === countryCode || item.name.toLowerCase() === cityName.toLowerCase()) {
              externalDataUpdates['tm'] = String(item.id);
            }
          }
        });
        console.log('[CityForm] Found external IDs:', externalDataUpdates);
      } catch (err) {
        console.error('[CityForm] Enrichment failed', err);
      }

      const newSourceConfigs = availableSources
        .filter(s => {
          if (s.code === 'manual' || s.code === 'original') return false;
          if (s.scopes) return s.scopes.some((scope: string) => ['event', 'venue'].includes(scope));
          return s.entity_type === 'event' || !s.entity_type;
        })
        .map(source => {
          let externalId = citySlug;
          // Use enriched ID if available
          if (externalDataUpdates[source.code.toLowerCase()]) {
            externalId = externalDataUpdates[source.code.toLowerCase()];
          }
          // Fallback: If source matches search result source
          else if (source.code.toLowerCase() === result.source?.toLowerCase()) {
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

      // 3. Fetch Timezone (Non-blocking UI)
      if (!isNaN(lat) && !isNaN(lon)) {
        try {
          const tzRes = await fetch(`https://timeapi.io/api/TimeZone/coordinate?latitude=${lat}&longitude=${lon}`);
          if (tzRes.ok) {
            const tzData = await tzRes.json();
            if (tzData.timeZone) {
              setFormData(prev => ({ ...prev, timezone: tzData.timeZone }));
            }
          }
        } catch (e) {
          console.error("Failed to fetch timezone", e);
        }
      }

    } catch (e) {
      console.error('[CityForm] Autofill error:', e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setDuplicateError(null);

    // Validation
    const requiredFields = ['name', 'country', 'timezone', 'latitude', 'longitude'];
    const missingFields = requiredFields.filter(field => !formData[field as keyof City]);

    if (missingFields.length > 0) {
      // Prevent submission if missing, handled by UI state but also logic
      return;
    }

    // Duplicate Check
    try {
      const existing = await fetchAdminCities({ search: formData.name });
      // Check exact name and country match
      const isDuplicate = existing.data.some((c: City) =>
        c.name.toLowerCase() === formData.name?.toLowerCase() &&
        c.country === formData.country &&
        c.id !== initialData?.id
      );

      if (isDuplicate) {
        setDuplicateError('A city with this name and country already exists.');
        return;
      }
    } catch (err) {
      console.error('Duplicate check failed', err);
      // We might want to warn but not block if check fails? For now, proceed.
    }

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

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      {!isModal && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50">
          <div className="flex items-center">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {initialData ? 'Edit City' : 'New City'}
            </h2>
          </div>
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

            {duplicateError && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-md border border-red-200 dark:border-red-800 flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4" />
                {duplicateError}
              </div>
            )}

            <div className="space-y-4">
              {/* Location Details Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Globe className="w-4 h-4" /> Location Details
                </h3>
              </div>

              {/* Search Auto-fill */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Auto-fill from Search
                </label>
                <div className="relative">
                  <AutoFillSearch
                    type="city"
                    onSelect={(result) => selectCityResult(result)}
                    placeholder="Search city (OpenStreetMap) to auto-fill..."
                    filter={(r) => r.source === 'osm'}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="City Name"
                  className={submitted && !formData.name ? 'border-red-300 focus:ring-red-500' : ''}
                />
                {submitted && !formData.name && (
                  <p className="text-xs text-red-500 mt-1">Name is required.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Country <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.country || ''}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className={`w-full appearance-none rounded-md border ${submitted && !formData.country ? 'border-red-300 dark:border-red-700 focus:ring-red-500' : 'border-gray-300 dark:border-gray-600 focus:ring-primary-500'
                      } bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 dark:text-white pr-10`}
                  >
                    <option value="">Select Country...</option>
                    {countries.map(c => (
                      <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                {submitted && !formData.country && (
                  <p className="text-xs text-red-500 mt-1">Country is required.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Timezone <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.timezone || ''}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    className={`w-full appearance-none rounded-md border ${submitted && !formData.timezone ? 'border-red-300 dark:border-red-700 focus:ring-red-500' : 'border-gray-300 dark:border-gray-600 focus:ring-primary-500'
                      } bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 dark:text-white pr-10`}
                  >
                    <option value="">Select Timezone...</option>
                    {timezones.map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                {submitted && !formData.timezone && (
                  <p className="text-xs text-red-500 mt-1">Timezone is required.</p>
                )}
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Coordinates <span className="text-red-500">*</span>
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Latitude</label>
                  <Input
                    type="number"
                    step="any"
                    value={formData.latitude ?? ''}
                    onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) })}
                    className={submitted && !formData.latitude ? 'border-red-300' : ''}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Longitude</label>
                  <Input
                    type="number"
                    step="any"
                    value={formData.longitude ?? ''}
                    onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) })}
                    className={submitted && !formData.longitude ? 'border-red-300' : ''}
                  />
                </div>
              </div>
              {submitted && (!formData.latitude || !formData.longitude) && (
                <p className="text-xs text-red-500">Coordinates are required. Use Auto-fill or enter manually.</p>
              )}
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

                    return (
                      <div key={source.id} className={`p-4 rounded-lg border transition-colors ${isActive ? 'bg-primary-50 border-primary-200 dark:bg-primary-900/20 dark:border-primary-800' : 'bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700'}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`source-${source.id}`}
                              checked={isActive}
                              onChange={(e) => updateSourceConfig(source.id, 'is_active', e.target.checked)}
                              className="rounded text-primary-600 focus:ring-primary-500 border-gray-300"
                            />
                            <label htmlFor={`source-${source.id}`} className="font-medium text-sm text-gray-900 dark:text-white cursor-pointer select-none flex items-center gap-2">
                              <SourceIcon sourceCode={source.code} className="w-4 h-4" />
                              {source.name}
                            </label>
                          </div>
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
                            />
                            {/* Proactive mapping helper could go here */}
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

            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="city_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded text-primary-600 dark:text-primary-500 border-gray-300 dark:border-gray-600 focus:ring-primary-500"
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
