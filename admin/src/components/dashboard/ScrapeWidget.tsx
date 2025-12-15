'use client';

import React, { useState, useEffect } from 'react';
import { CloudDownload, Loader, Settings } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { syncEventsPipeline, fetchConfiguredCities, fetchSources, getScrapeStatus, fetchStats } from '@/lib/api';
import Link from 'next/link';

export function ScrapeWidget() {
  const [isScraping, setIsScraping] = useState(false);
  const [lastScrape, setLastScrape] = useState<Date | null>(null);
  const [nextScrape, setNextScrape] = useState<Date | null>(null);
  const [configuredCities, setConfiguredCities] = useState<any[]>([]);
  const [globalSources, setGlobalSources] = useState<any[]>([]);

  useEffect(() => {
    // Initial data fetch
    Promise.all([
      fetchConfiguredCities(),
      fetchSources(),
      fetchStats()
    ]).then(([citiesData, sourcesData, statsData]) => {
      setConfiguredCities(citiesData);
      setGlobalSources(sourcesData);
      if (statsData.nextScheduledScrape) {
        setNextScrape(new Date(statsData.nextScheduledScrape));
      }
    }).catch(console.error);

    // Polling for scrape status
    const pollStatus = async () => {
      try {
        const status = await getScrapeStatus();
        setIsScraping(status.isRunning);
      } catch (e) {
        console.error('Failed to poll status', e);
      }
    };

    pollStatus(); // check immediately
    const interval = setInterval(pollStatus, 3000); // check every 3 seconds

    return () => clearInterval(interval);
  }, []);

  const handleScrape = async () => {
    // Optimistic UI update
    setIsScraping(true);
    try {
      // Build dynamic list from configured cities
      const cities = configuredCities.map(c => c.key);

      // Get globally active source codes
      // Default to "all active" if globalSources is empty (e.g. fetch failed) to prevent blocking
      const globallyActiveCodes = globalSources.length > 0
        ? new Set(globalSources.filter(s => s.is_active).map(s => s.code))
        : null;

      const sources = new Set<string>();
      configuredCities.forEach(c => {
        Object.entries(c.sources).forEach(([src, active]) => {
          // If globallyActiveCodes is null (fetch failure), trust city config
          // Else, require both city config AND global config
          if (active && (globallyActiveCodes === null || globallyActiveCodes.has(src))) {
            sources.add(src);
          }
        });
      });

      if (cities.length === 0) {
        alert('No active cities configured!');
        setIsScraping(false);
        return;
      }

      const sourcesList = Array.from(sources);
      if (sourcesList.length === 0) {
        alert('No active sources found! Check Global Sources configuration.');
        setIsScraping(false);
        return;
      }

      await syncEventsPipeline({
        cities,
        sources: sourcesList,
        enrichAfter: true,
        dedupeAfter: true
      });
      setLastScrape(new Date());
    } catch (error) {
      console.error(error);
      alert('Failed to trigger scraper');
      setIsScraping(false);
    }
    // Finally block removed: we rely on polling to unset isScraping.
    // If we unset it here immediately, it might flicker before the poll catches the "true" state from backend.
    // However, since syncEventsPipeline returns AFTER setting flag true in backend, polling should pick it up.
  };

  return (
    <div className="relative bg-gradient-to-br from-orange-500 to-orange-600 p-6 rounded-2xl shadow-lg text-white h-full flex flex-col justify-between overflow-hidden">
      <div>
        <div className="flex justify-between items-start mb-4">
          <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm">
            <CloudDownload className="w-6 h-6 text-white" />
          </div>
          <div className="flex gap-2">
            <Link href="/sources" title="Manage Sources">
              <span className="p-1 px-2 text-xs font-medium bg-white/20 rounded-full backdrop-blur-sm hover:bg-white/30 cursor-pointer flex items-center gap-1 transition-colors">
                <Settings className="w-3 h-3" />
                Config
              </span>
            </Link>
            <span className="text-xs font-medium bg-white/20 px-2 py-1 rounded-full backdrop-blur-sm flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
              {configuredCities.length} Cities Active
            </span>
          </div>
        </div>

        <h3 className="text-lg font-semibold mb-3">Data Scraper</h3>

        <div className="mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/10 rounded-lg p-2.5 backdrop-blur-md border border-white/10">
              <span className="block text-[10px] text-orange-200 uppercase font-bold tracking-wider mb-1">Target Cities</span>
              <div className="text-xs font-medium text-white leading-relaxed truncate">
                {configuredCities.length > 0
                  ? configuredCities.map(c => c.key).join(', ')
                  : <span className="text-white/50 italic">None configured</span>}
              </div>
            </div>
            <div className="bg-white/10 rounded-lg p-2.5 backdrop-blur-md border border-white/10">
              <span className="block text-[10px] text-orange-200 uppercase font-bold tracking-wider mb-1">Active Sources</span>
              <div className="text-xs font-medium text-white leading-relaxed truncate">
                {(() => {
                  const globallyActiveCodes = new Set(
                    globalSources.filter(s => s.is_active).map(s => s.code)
                  );

                  const sources = Array.from(new Set(
                    configuredCities.flatMap(c =>
                      Object.entries(c.sources || {})
                        .filter(([src, active]) => active && globallyActiveCodes.has(src))
                        .map(([src]) => src)
                    )
                  ));
                  return sources.length > 0 ? sources.join(', ') : <span className="text-white/50 italic">None active</span>;
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Mini Stats / Last Run Info */}
        <div className="bg-white/10 rounded-xl p-3 mb-6 backdrop-blur-sm space-y-2">
          <div>
            <p className="text-xs text-orange-200 uppercase font-semibold mb-1">Last Run</p>
            <div className="flex justify-between items-end">
              <span className="text-xl font-bold">
                {lastScrape ? lastScrape.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
              </span>
              <span className="text-xs text-orange-200">
                {lastScrape ? lastScrape.toLocaleDateString() : 'No recent run'}
              </span>
            </div>
          </div>

          {nextScrape && (
            <div className="pt-2 border-t border-white/10">
              <p className="text-xs text-orange-200 uppercase font-semibold mb-1">Next Auto-Scrape</p>
              <div className="flex justify-between items-end">
                <span className="text-sm font-medium">
                  {nextScrape.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-xs text-orange-200">
                  {nextScrape.toLocaleDateString()}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <Button
        onClick={handleScrape}
        disabled={isScraping}
        className="w-full bg-white !text-orange-600 hover:bg-orange-50 border-none font-bold shadow-sm flex items-center justify-center gap-2"
      >
        {isScraping ? (
          <>
            <Loader className="w-4 h-4 animate-spin" />
            Scraping...
          </>
        ) : 'Start New Scrape'}
      </Button>
    </div>
  );
}
