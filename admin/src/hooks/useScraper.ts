import { useState, useCallback, useEffect } from 'react';
import { fetchStats, syncEventsPipeline, matchArtists, matchVenues, fetchScrapeHistory } from '@/lib/api';

export function useScraper() {
  const [stats, setStats] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const [statsData, historyData] = await Promise.all([
        fetchStats(),
        fetchScrapeHistory({ days: 30, groupBy: 'day' })
      ]);
      setStats(statsData);
      setHistory(historyData);
    } catch (error) {
      console.error('Failed to load scraper stats', error);
    }
  }, []);

  const runScraper = useCallback(async (cities: string[], sources: string[]) => {
    setIsSyncing(true);
    setSyncProgress('Starting scraper...');
    try {
      await syncEventsPipeline({ cities, sources });
      setSyncProgress('Scraping completed. Refreshing data...');
      await loadStats();
    } catch (error: any) {
      setSyncProgress(`Error: ${error.message}`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncProgress(''), 5000);
    }
  }, [loadStats]);

  const runMatching = useCallback(async () => {
    setIsSyncing(true);
    setSyncProgress('Matching artists and venues...');
    try {
      await Promise.all([matchArtists(), matchVenues()]);
      setSyncProgress('Matching completed.');
      await loadStats();
    } catch (error: any) {
      setSyncProgress(`Error: ${error.message}`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncProgress(''), 5000);
    }
  }, [loadStats]);

  return {
    stats,
    history,
    isSyncing,
    syncProgress,
    loadStats,
    runScraper,
    runMatching
  };
}
