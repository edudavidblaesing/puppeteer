import React from 'react';
import { RefreshCw } from 'lucide-react';

interface SourceControlProps {
  label?: string;
  currentValue: any;
  sources: any[];
  field: string;
  onSelect: (value: any) => void;
  renderValue?: (value: any) => React.ReactNode;
}

export function SourceControl({ 
  label, 
  currentValue, 
  sources, 
  field, 
  onSelect,
  renderValue 
}: SourceControlProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter sources that have a value for this field
  const validSources = (sources || []).filter(s => s[field] !== undefined && s[field] !== null && s[field] !== '');

  if (validSources.length === 0) return null;

  return (
    <div className="relative inline-block ml-2" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity"
        title={`Reset ${field} from source`}
      >
        <RefreshCw className="w-3 h-3" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
          <div className="p-2 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-500 flex justify-between items-center">
            <span>Select value for {field}</span>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">&times;</button>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {validSources.map((source, idx) => (
              <button
                key={`${source.source_code}-${idx}`}
                type="button"
                onClick={() => {
                  onSelect(source[field]);
                  setIsOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex flex-col gap-0.5 border-b border-gray-100 dark:border-gray-800 last:border-0 group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[10px] uppercase text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{source.source_code}</span>
                  {source.is_primary && <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">Primary</span>}
                </div>
                <div className="text-gray-900 dark:text-gray-100 break-words mt-1 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                  {renderValue ? renderValue(source[field]) : String(source[field])}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}