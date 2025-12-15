import React from 'react';
import clsx from 'clsx';
import { MapPin, Globe, Clock } from 'lucide-react';
import { City } from '@/types';

interface CityListProps {
  cities: City[];
  isLoading: boolean;
  onEdit: (city: City) => void;
}

export function CityList({
  cities,
  isLoading,
  onEdit
}: CityListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
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
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">{cities.length} cities</span>
        </div>
      </div>

      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {cities.map((city) => (
          <div
            key={city.id}
            onClick={() => onEdit(city)}
            className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors group"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0 text-indigo-600 dark:text-indigo-400">
                <MapPin className="w-5 h-5" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {city.name}
                  </h3>
                  <div className="flex items-center gap-2">
                    {city.is_active ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800">
                        Active
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                        Inactive
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
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
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
