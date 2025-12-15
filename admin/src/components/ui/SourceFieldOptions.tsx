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
}

export function SourceFieldOptions({ sources, field, onSelect, currentValue, label }: SourceFieldOptionsProps) {
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
          const displayVal = formatSourceValue(val);

          // Compare stringified values or handle nulls
          const currentStr = currentValue === null || currentValue === undefined ? '' : String(currentValue);
          const valStr = val === null || val === undefined ? '' : String(val);
          // Note: Simple comparison might fail for arrays if order differs, but acceptable for now.
          const isSelected = currentStr === valStr;

          const isBest = bestSource && source.source_code === bestSource.source_code;

          return (
            <button
              key={`${source.source_code}-${source.id}`}
              type="button"
              onClick={() => onSelect(val)}
              className={`text-xs px-2 py-1 rounded border flex items-center gap-1 transition-colors max-w-full ${isSelected
                ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500/20'
                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                } ${isBest ? 'ring-1 ring-amber-400 border-amber-300 dark:border-amber-600' : ''}`}
              title={isBest ? `Best Match from ${source.source_code}` : `Use value from ${source.source_code}`}
            >
              {isBest && <Star className="w-3 h-3 text-amber-500 fill-current flex-shrink-0" />}
              <SourceIcon sourceCode={source.source_code} className="w-3 h-3 flex-shrink-0" />
              <span className="truncate max-w-[300px]">{displayVal}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
