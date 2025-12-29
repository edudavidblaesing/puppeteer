import React from 'react';
import { SourceIcon } from './SourceIcon';
import { Star } from 'lucide-react';

interface ResetSectionButtonProps {
  sources: string[];
  onReset: (sourceCode: string) => void;
  className?: string;
}

export function ResetSectionButton({ sources, onReset, className = '' }: ResetSectionButtonProps) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Reset section:</span>
      <button
        key="best"
        type="button"
        onClick={() => onReset('best')}
        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 hover:bg-primary-100 dark:hover:bg-primary-900/50 text-primary-600 dark:text-primary-400 font-bold uppercase transition-colors"
        title="Reset to best matched data"
      >
        <Star className="w-3 h-3 fill-current" /> Best
      </button>
      {sources.map(source => (
        <button
          key={source}
          type="button"
          onClick={() => onReset(source)}
          className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-primary-50 dark:hover:bg-primary-900/30 text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 font-medium uppercase transition-colors"
          title={`Reset to ${source}`}
        >
          <SourceIcon sourceCode={source} className="w-3 h-3" />
        </button>
      ))}
    </div>
  );
}
