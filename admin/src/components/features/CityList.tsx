import React from 'react';
import { MapPin, Globe, Clock } from 'lucide-react';
import { City } from '@/types';
import { SelectableListItem } from '@/components/ui/SelectableListItem';

interface CityListProps {
  cities: City[];
  isLoading: boolean;
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  onEdit: (city: City) => void;
  focusedId?: string | null;
}

export function CityList({
  cities,
  isLoading,
  selectedIds,
  onSelect,
  onSelectAll,
  onEdit,
  focusedId
}: CityListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (cities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        <MapPin className="w-12 h-12 mb-4 opacity-20" />
        <p>No cities found</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-800">
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {cities.map((city) => (
          <SelectableListItem
            key={city.id}
            id={String(city.id)}
            isActiveView={focusedId === String(city.id)}
            title={city.name}
            imageUrl={null} // Cities usually don't have images in generic list?
            imageFallback={<MapPin className="w-6 h-6 text-primary-600 dark:text-primary-400" />}
            isChecked={selectedIds.has(String(city.id))}
            onToggleSelection={() => onSelect(String(city.id))}
            onClick={() => onEdit(city)}
            subtitle={
              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                {city.country && (
                  <div className="flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    <span>{city.country}</span>
                  </div>
                )}
                {city.timezone && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{city.timezone}</span>
                  </div>
                )}
              </div>
            }
            metaRight={
              <div className="flex items-center gap-2">
                {city.is_active ? (
                  <span className="text-[10px] px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium">
                    Active
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium">
                    Inactive
                  </span>
                )}
              </div>
            }
          />
        ))}
      </div>
    </div>
  );
}

