import React from 'react';
import { RefreshCw, CloudDownload, Link2, Play, Activity } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ScrapeCharts } from '@/components/ScrapeCharts';

interface ScrapeDashboardProps {
  stats: any;
  history: any;
  isSyncing: boolean;
  syncProgress: string;
  onRunScraper: (cities: string[], sources: string[]) => void;
  onRunMatching: () => void;
}

export function ScrapeDashboard({
  stats,
  history,
  isSyncing,
  syncProgress,
  onRunScraper,
  onRunMatching
}: ScrapeDashboardProps) {
  return (
    <div className="h-full overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Sync Progress Banner */}
        {isSyncing && (
          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <RefreshCw className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-spin flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-indigo-900 dark:text-indigo-100 mb-1">Pipeline Running</p>
                <p className="text-sm text-indigo-700 dark:text-indigo-300">{syncProgress}</p>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
              <Activity className="w-4 h-4" />
              <span className="text-sm font-medium">Total Events</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats?.total_events || 0}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
              <CloudDownload className="w-4 h-4" />
              <span className="text-sm font-medium">Scraped (24h)</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats?.scraped_last_24h || 0}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
              <Link2 className="w-4 h-4" />
              <span className="text-sm font-medium">Pending Review</span>
            </div>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats?.pending_events || 0}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-sm">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <Play className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Actions
          </h3>
          <div className="flex flex-wrap gap-4">
            <Button
              onClick={() => onRunScraper(['Berlin', 'Hamburg'], ['ra', 'tm'])}
              disabled={isSyncing}
              leftIcon={<CloudDownload className="w-4 h-4" />}
            >
              Run Scraper (Berlin/Hamburg)
            </Button>
            <Button
              variant="secondary"
              onClick={onRunMatching}
              disabled={isSyncing}
              leftIcon={<Link2 className="w-4 h-4" />}
            >
              Run Matching
            </Button>
          </div>
        </div>

        {/* Charts */}
        {history && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-sm">
            <h3 className="font-semibold text-lg mb-4 text-gray-900 dark:text-gray-100">Scrape History</h3>
            <ScrapeCharts data={history} />
          </div>
        )}
      </div>
    </div>
  );
}
