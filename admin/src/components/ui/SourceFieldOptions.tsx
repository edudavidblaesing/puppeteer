import React from 'react';
import { SourceReference } from '@/types';
import { SourceIcon } from './SourceIcon';
import { Star } from 'lucide-react';
import { getBestSourceForField, formatSourceValue } from '@/lib/smartMerge';

interface SourceFieldOptionsProps {
  sources?: SourceReference[];
  field: keyof SourceReference;
  onSelect: (value: any) => void;
  currentValue?: any;
  label?: string;
  formatDisplay?: (val: any) => string;
}

export function SourceFieldOptions({ sources, field, onSelect, currentValue, label, formatDisplay }: SourceFieldOptionsProps) {
  if (!sources || sources.length === 0) return null;

  // We only check for undefined to allow null/empty string
  const validSources = sources.filter(s => s[field] !== undefined);

  if (validSources.length === 0) return null;

  // Determine best source using smart logic
  const bestSource = getBestSourceForField(validSources, field as string);

  return (
    <div className="mt-1">
      <div className="flex flex-wrap gap-2">
        {validSources.map((source) => {
          const val = source[field];
          let displayVal = formatDisplay ? formatDisplay(val) : formatSourceValue(val);

          // Compare stringified values or handle nulls
          const currentStr = currentValue === null || currentValue === undefined ? '' : String(currentValue);
          const valStr = val === null || val === undefined ? '' : String(val);

          let isSelected = currentStr === valStr;

          // Special handling for time strings (HH:mm:ss vs HH:mm)
          if (!isSelected && field && (field as string).includes('time')) {
            const time1 = currentStr.length > 5 ? currentStr.substring(0, 5) : currentStr;
            const time2 = valStr.length > 5 ? valStr.substring(0, 5) : valStr;
            isSelected = time1 === time2 && time1 !== '';
          }

          // Special handling for date strings (ISO vs YYYY-MM-DD)
          if (field === 'date') {
            const date1 = currentStr.split('T')[0];
            const date2 = valStr.split('T')[0];
            isSelected = date1 === date2 && date1 !== '';

            // Update display value to be cleaner
            if (typeof val === 'string' && val.includes('T')) {
              displayVal = val.split('T')[0];
            }
          }

          // Special handling for time fields display
          if ((field as string).includes('time') && typeof val === 'string' && val.includes('T')) {
            displayVal = val.split('T')[1].substring(0, 5);
          }

          const isBest = bestSource && source.source_code === bestSource.source_code;

          return (
            <button
              key={`${source.source_code}-${source.id}`}
              type="button"
              onClick={() => onSelect(val)}
              className={`text-xs px-2 py-1 rounded border flex items-center gap-1 transition-colors max-w-full ${isSelected
                ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300 ring-1 ring-primary-500/20'
                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                } ${isBest ? 'ring-1 ring-amber-400 border-amber-300 dark:border-amber-600' : ''}`}
              title={isBest ? `Best Match from ${source.source_code}` : `Use value from ${source.source_code}`}
            >
              {isBest && <Star className="w-3 h-3 text-amber-500 fill-current flex-shrink-0" />}
              <SourceIcon sourceCode={source.source_code} className="w-3 h-3 flex-shrink-0" />
              <span className="truncate max-w-[300px]">{displayVal}</span>
              {/* Smart Update Indicator */}
              {source.updated_at && source.last_synced_at && new Date(source.updated_at) > new Date(source.last_synced_at) && !isSelected && (
                <span className="flex h-2 w-2 relative" title="New update available">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
