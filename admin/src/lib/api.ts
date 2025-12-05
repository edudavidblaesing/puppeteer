import { Event } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://pptr.davidblaesing.com';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'your-secure-api-key-here';

const headers = {
  'Content-Type': 'application/json',
  'x-api-key': API_KEY,
};

export async function fetchEvents(params?: {
  city?: string;
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
  showPast?: boolean;
}) {
  const searchParams = new URLSearchParams();
  if (params?.city) searchParams.set('city', params.city);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());
  if (params?.from) searchParams.set('from', params.from);
  if (params?.to) searchParams.set('to', params.to);
  if (params?.showPast) searchParams.set('showPast', 'true');

  const response = await fetch(`${API_URL}/db/events?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch events');
  return response.json();
}

export async function fetchEvent(id: string) {
  const response = await fetch(`${API_URL}/db/events/${id}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch event');
  return response.json();
}

export async function updateEvent(id: string, data: Partial<Event>) {
  const response = await fetch(`${API_URL}/db/events/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Update event error:', response.status, errorData);
    throw new Error(errorData.error || `Failed to update event (${response.status})`);
  }
  return response.json();
}

export async function createEvent(data: Partial<Event>) {
  const response = await fetch(`${API_URL}/db/events/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to create event');
  }
  return response.json();
}

export async function deleteEvent(id: string) {
  const response = await fetch(`${API_URL}/db/events/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) throw new Error('Failed to delete event');
  return response.json();
}

export async function setPublishStatus(ids: string[], status: 'pending' | 'approved' | 'rejected') {
  const response = await fetch(`${API_URL}/db/events/publish-status`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ids, status }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Set publish status error:', response.status, errorData);
    throw new Error(errorData.error || `Failed to update publish status (${response.status})`);
  }
  return response.json();
}

// Legacy function for backwards compatibility
export async function publishEvents(ids: string[], publish: boolean) {
  return setPublishStatus(ids, publish ? 'approved' : 'pending');
}

// Fetch recently updated events
export async function fetchRecentlyUpdatedEvents(limit: number = 50) {
  const response = await fetch(`${API_URL}/db/events/recent-updates?limit=${limit}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch recent updates');
  return response.json();
}

// Fetch all events for map (no pagination)
export async function fetchMapEvents(params?: {
  city?: string;
  status?: string;
  showPast?: boolean;
}) {
  const searchParams = new URLSearchParams();
  if (params?.city) searchParams.set('city', params.city);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.showPast) searchParams.set('showPast', 'true');

  const response = await fetch(`${API_URL}/db/events/map?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch map events');
  return response.json();
}

export async function syncEvents(city: string, limit: number = 100) {
  const response = await fetch(`${API_URL}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ city, limit }),
  });
  if (!response.ok) throw new Error('Failed to sync events');
  return response.json();
}

export async function fetchStats() {
  const response = await fetch(`${API_URL}/db/stats`, { headers });
  if (!response.ok) throw new Error('Failed to fetch stats');
  return response.json();
}

export async function fetchVenues(params?: { city?: string; limit?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.city) searchParams.set('city', params.city);
  if (params?.limit) searchParams.set('limit', params.limit.toString());

  const response = await fetch(`${API_URL}/db/venues?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch venues');
  return response.json();
}

export async function fetchEnrichStats() {
  const response = await fetch(`${API_URL}/db/enrich/stats`, { headers });
  if (!response.ok) throw new Error('Failed to fetch enrich stats');
  return response.json();
}

export async function enrichVenues(limit: number = 50) {
  const response = await fetch(`${API_URL}/db/venues/enrich`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ limit }),
  });
  if (!response.ok) throw new Error('Failed to enrich venues');
  return response.json();
}

export async function enrichArtists(limit: number = 100) {
  const response = await fetch(`${API_URL}/db/artists/enrich`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ limit }),
  });
  if (!response.ok) throw new Error('Failed to enrich artists');
  return response.json();
}

export async function fetchCities() {
  const response = await fetch(`${API_URL}/db/cities`, { headers });
  if (!response.ok) throw new Error('Failed to fetch cities');
  const result = await response.json();
  return result.data || [];
}

// Fetch countries for dropdown
export async function fetchCountries() {
  const response = await fetch(`${API_URL}/db/countries`, { headers });
  if (!response.ok) throw new Error('Failed to fetch countries');
  const result = await response.json();
  return result.data || [];
}

// Fetch cities for dropdown (optimized)
export async function fetchCitiesDropdown(country?: string) {
  const searchParams = new URLSearchParams();
  if (country) searchParams.set('country', country);

  const response = await fetch(`${API_URL}/db/cities/dropdown?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch cities dropdown');
  const result = await response.json();
  return result.data || [];
}

// Autocomplete search for venues
export async function searchVenues(query: string, city?: string) {
  if (!query || query.length < 2) return [];

  const searchParams = new URLSearchParams({ q: query });
  if (city) searchParams.set('city', city);

  const response = await fetch(`${API_URL}/db/venues/search?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to search venues');
  const result = await response.json();
  return result.data || [];
}

// Autocomplete search for artists
export async function searchArtists(query: string) {
  if (!query || query.length < 2) return [];

  const searchParams = new URLSearchParams({ q: query });

  const response = await fetch(`${API_URL}/db/artists/search?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to search artists');
  const result = await response.json();
  return result.data || [];
}

// Get artists for an event
export async function fetchEventArtists(eventId: string) {
  const response = await fetch(`${API_URL}/db/events/${eventId}/artists`, { headers });
  if (!response.ok) throw new Error('Failed to fetch event artists');
  const result = await response.json();
  return result.data || [];
}

// Add artist to event
export async function addEventArtist(eventId: string, artistId: string, role: string = 'performer', billingOrder: number = 0) {
  const response = await fetch(`${API_URL}/db/events/${eventId}/artists`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ artist_id: artistId, role, billing_order: billingOrder }),
  });
  if (!response.ok) throw new Error('Failed to add event artist');
  return response.json();
}

// Remove artist from event
export async function removeEventArtist(eventId: string, artistId: string) {
  const response = await fetch(`${API_URL}/db/events/${eventId}/artists/${artistId}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) throw new Error('Failed to remove event artist');
  return response.json();
}

// Sync event artists from JSON column
export async function syncEventArtists(eventId: string) {
  const response = await fetch(`${API_URL}/db/events/${eventId}/sync-artists`, {
    method: 'POST',
    headers,
  });
  if (!response.ok) throw new Error('Failed to sync event artists');
  return response.json();
}

// Health check
export async function checkHealth() {
  try {
    const response = await fetch(`${API_URL}/health`, { headers });
    const result = await response.json();
    return { connected: result.dbConnected ?? response.ok, status: result.status };
  } catch (error) {
    return { connected: false, status: 'error', error: (error as Error).message };
  }
}

// ============== Admin Artists API ==============

export async function fetchArtists(params?: { search?: string; country?: string; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.country) searchParams.set('country', params.country);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  const response = await fetch(`${API_URL}/db/artists?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch artists');
  return response.json();
}

export async function fetchArtist(id: string) {
  const response = await fetch(`${API_URL}/db/artists/${id}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch artist');
  return response.json();
}

export async function createArtist(data: { name: string; country?: string; content_url?: string; image_url?: string }) {
  const response = await fetch(`${API_URL}/db/artists`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to create artist');
  }
  return response.json();
}

export async function updateArtist(id: string, data: Partial<{ name: string; country: string; content_url: string; image_url: string }>) {
  const response = await fetch(`${API_URL}/db/artists/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to update artist');
  }
  return response.json();
}

export async function deleteArtist(id: string) {
  const response = await fetch(`${API_URL}/db/artists/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to delete artist');
  }
  return response.json();
}

// ============== Admin Cities API ==============

export async function fetchAdminCities(params?: { search?: string; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  const response = await fetch(`${API_URL}/db/cities?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch cities');
  return response.json();
}

export async function createCity(data: { name: string; country?: string; latitude?: number; longitude?: number; timezone?: string }) {
  const response = await fetch(`${API_URL}/db/cities`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to create city');
  }
  return response.json();
}

export async function updateCity(id: string, data: Partial<{ name: string; country: string; latitude: number; longitude: number; timezone: string; is_active: boolean }>) {
  const response = await fetch(`${API_URL}/db/cities/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to update city');
  }
  return response.json();
}

export async function deleteCity(id: string) {
  const response = await fetch(`${API_URL}/db/cities/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to delete city');
  }
  return response.json();
}

// ============== Admin Venues API ==============

export async function fetchAdminVenues(params?: { search?: string; city?: string; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.city) searchParams.set('city', params.city);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  const response = await fetch(`${API_URL}/db/venues?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch venues');
  return response.json();
}

export async function fetchVenue(id: string) {
  const response = await fetch(`${API_URL}/db/venues/${id}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch venue');
  return response.json();
}

export async function createVenue(data: { name: string; address?: string; city?: string; country?: string; latitude?: number; longitude?: number; content_url?: string }) {
  const response = await fetch(`${API_URL}/db/venues`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to create venue');
  }
  return response.json();
}

export async function updateVenue(id: string, data: Partial<{ name: string; address: string; city: string; country: string; latitude: number; longitude: number; content_url: string }>) {
  const response = await fetch(`${API_URL}/db/venues/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to update venue');
  }
  return response.json();
}

export async function deleteVenue(id: string) {
  const response = await fetch(`${API_URL}/db/venues/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to delete venue');
  }
  return response.json();
}

// ============== Admin Dashboard API ==============

export async function fetchDashboard() {
  const response = await fetch(`${API_URL}/db/dashboard`, { headers });
  if (!response.ok) throw new Error('Failed to fetch dashboard');
  return response.json();
}

// ============== Multi-Source Scraping API ==============

export async function scrapeEvents(params: { sources?: string[]; city: string; limit?: number; match?: boolean }) {
  const response = await fetch(`${API_URL}/scrape/events`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to scrape events');
  }
  return response.json();
}

export async function scrapeTicketmaster(params: { city: string; limit?: number }) {
  const response = await fetch(`${API_URL}/scrape/ticketmaster`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to scrape Ticketmaster');
  }
  return response.json();
}

export async function runMatching(params?: { dryRun?: boolean; minConfidence?: number }) {
  const response = await fetch(`${API_URL}/scrape/match`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params || {}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to run matching');
  }
  return response.json();
}

export async function fetchScrapedEvents(params?: { source?: string; city?: string; linked?: boolean; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.source) searchParams.set('source', params.source);
  if (params?.city) searchParams.set('city', params.city);
  if (params?.linked !== undefined) searchParams.set('linked', params.linked.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  const response = await fetch(`${API_URL}/scraped/events?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch scraped events');
  return response.json();
}

export async function fetchUnifiedEvents(params?: { city?: string; published?: boolean; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.city) searchParams.set('city', params.city);
  if (params?.published !== undefined) searchParams.set('published', params.published.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  const response = await fetch(`${API_URL}/unified/events?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch unified events');
  return response.json();
}

export async function fetchUnifiedEvent(id: string) {
  const response = await fetch(`${API_URL}/unified/events/${id}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch unified event');
  return response.json();
}

export async function updateUnifiedEvent(id: string, data: Record<string, any>) {
  const response = await fetch(`${API_URL}/unified/events/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to update unified event');
  }
  return response.json();
}

export async function fetchScrapeStats() {
  const response = await fetch(`${API_URL}/scrape/stats`, { headers });
  if (!response.ok) throw new Error('Failed to fetch scrape stats');
  return response.json();
}

// Scraped & Unified Venues
export async function fetchScrapedVenues(params?: { source?: string; city?: string; search?: string; linked?: boolean; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.source) searchParams.set('source', params.source);
  if (params?.city) searchParams.set('city', params.city);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.linked !== undefined) searchParams.set('linked', params.linked.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  const response = await fetch(`${API_URL}/scraped/venues?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch scraped venues');
  return response.json();
}

export async function fetchUnifiedVenues(params?: { city?: string; search?: string; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.city) searchParams.set('city', params.city);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  const response = await fetch(`${API_URL}/unified/venues?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch unified venues');
  return response.json();
}

// Scraped & Unified Artists
export async function fetchScrapedArtists(params?: { source?: string; search?: string; linked?: boolean; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.source) searchParams.set('source', params.source);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.linked !== undefined) searchParams.set('linked', params.linked.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  const response = await fetch(`${API_URL}/scraped/artists?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch scraped artists');
  return response.json();
}

export async function fetchUnifiedArtists(params?: { search?: string; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  const response = await fetch(`${API_URL}/unified/artists?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch unified artists');
  return response.json();
}

export async function fetchUnifiedArtist(id: string) {
  const response = await fetch(`${API_URL}/unified/artists/${id}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch unified artist');
  return response.json();
}

export async function updateUnifiedArtist(id: string, data: Record<string, any>) {
  const response = await fetch(`${API_URL}/unified/artists/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to update unified artist');
  }
  return response.json();
}

export async function fetchUnifiedVenue(id: string) {
  const response = await fetch(`${API_URL}/unified/venues/${id}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch unified venue');
  return response.json();
}

export async function updateUnifiedVenue(id: string, data: Record<string, any>) {
  const response = await fetch(`${API_URL}/unified/venues/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to update unified venue');
  }
  return response.json();
}

export async function deduplicateData(type: 'all' | 'events' | 'venues' | 'artists' = 'all') {
  const response = await fetch(`${API_URL}/scrape/deduplicate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to deduplicate data');
  }
  return response.json();
}

// ============== Scrape History API ==============

export async function fetchScrapeHistory(params?: { days?: number; groupBy?: 'day' | 'hour' }) {
  const searchParams = new URLSearchParams();
  if (params?.days) searchParams.set('days', params.days.toString());
  if (params?.groupBy) searchParams.set('groupBy', params.groupBy);

  const response = await fetch(`${API_URL}/scrape/history?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch scrape history');
  return response.json();
}

export async function fetchRecentScrapes(limit: number = 20) {
  const response = await fetch(`${API_URL}/scrape/recent?limit=${limit}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch recent scrapes');
  return response.json();
}

// ============== Sync Pipeline API ==============

// Get sync job status
export async function getSyncStatus() {
  const response = await fetch(`${API_URL}/sync/status`, {
    method: 'GET',
    headers,
  });
  if (!response.ok) {
    throw new Error('Failed to fetch sync status');
  }
  return response.json();
}

// Direct sync pipeline - scrapes, matches, enriches, and dedupes
export async function syncEventsPipeline(params: { cities: string[]; sources: string[]; enrichAfter?: boolean; dedupeAfter?: boolean }) {
  const response = await fetch(`${API_URL}/sync/pipeline`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to run sync pipeline');
  }
  return response.json();
}

// n8n Workflow Trigger (optional - for scheduled runs)
const N8N_WEBHOOK_URL = 'https://n8n.davidblaesing.com/webhook/event-scraper';

export async function triggerSyncWorkflow(params: { cities: string[]; sources: string[] }) {
  const response = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  // Handle non-JSON responses gracefully
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    if (!response.ok) {
      throw new Error(text || 'Failed to trigger sync workflow');
    }
    return { success: true, message: text };
  }
}

// Execute raw SQL query (admin only)
export async function executeSqlQuery(query: string, params: any[] = []) {
  const response = await fetch(`${API_URL}/admin/sql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, params }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || error.detail || 'SQL query failed');
  }
  return response.json();
}
