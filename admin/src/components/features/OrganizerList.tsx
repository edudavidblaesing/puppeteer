import React from 'react';
import { Briefcase, Globe, Link as LinkIcon } from 'lucide-react';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { Organizer } from '@/types';

interface OrganizerListProps {
  organizers: Organizer[];
  isLoading: boolean;
  onEdit: (organizer: Organizer) => void;
}

export function OrganizerList({
  organizers,
  isLoading,
  onEdit
}: OrganizerListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (organizers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        <Briefcase className="w-12 h-12 mb-4 opacity-20" />
        <p>No organizers found</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-800">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">{organizers.length} organizers</span>
        </div>
      </div>

      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {organizers.map((organizer) => (
          <div
            key={organizer.id}
            onClick={() => onEdit(organizer)}
            className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors group"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0 text-primary-600 dark:text-primary-400">
                <Briefcase className="w-5 h-5" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                    {organizer.name}
                  </h3>
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                  {organizer.provider && (
                    <div className="flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      <span>{organizer.provider}</span>
                    </div>
                  )}
                  {organizer.website_url && (
                    <div className="flex items-center gap-1">
                      <LinkIcon className="w-3 h-3" />
                      <span className="truncate max-w-[200px]">{organizer.website_url}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-right flex-shrink-0 self-start flex flex-col items-end gap-1">
                <div className="flex items-center gap-1 mt-1 justify-end">
                  {Array.from(new Set(organizer.source_references?.map(s => s.source_code) || [])).map(source => (
                    <SourceIcon key={source} sourceCode={source} className="w-4 h-4" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
