import type { Event, Organizer, Venue, City, GuestUser } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3007';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'your-secure-api-key-here';

const getDataToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('admin_token');
  }
  return null;
};

async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getDataToken();
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  } as HeadersInit;

  const config = {
    ...options,
    headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, config);

  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
    // throw new Error('Unauthorized'); // Let the caller or UI handle the redirect via event
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.details || `Request failed (${response.status})`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export async function getUsage(entityType: string, id: string) {
  const result = await request<{ usage: number; details?: any }>(`/db/${entityType}/${id}/usage`);
  return result;
}

export async function fetchEvents(params?: {
  city?: string;
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
  showPast?: boolean;
  timeFilter?: 'upcoming' | 'past' | 'all' | 'today';
  source?: string;
  createdAfter?: string;
  updatedAfter?: string;
  published?: boolean;
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
  if (params?.timeFilter) searchParams.set('timeFilter', params.timeFilter);
  if (params?.source) searchParams.set('source', params.source);
  if (params?.createdAfter) searchParams.set('createdAfter', params.createdAfter);
  if (params?.updatedAfter) searchParams.set('updatedAfter', params.updatedAfter);
  if (params?.published !== undefined) searchParams.set('published', params.published.toString());

  return request(`/db/events?${searchParams}`);
}

export async function fetchEvent(id: string) {
  return request(`/db/events/${id}`);
}

export async function updateEvent(id: string, data: Partial<Event>) {
  return request(`/db/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function createEvent(data: Partial<Event>) {
  return request(`/db/events`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteEvent(id: string) {
  return request(`/db/events/${id}`, {
    method: 'DELETE',
  });
}

export async function setPublishStatus(ids: string[], status: 'pending' | 'approved' | 'rejected' | string) {
  return request(`/db/events/publish-status`, {
    method: 'POST',
    body: JSON.stringify({ ids, status }),
  });
}

// Legacy function for backwards compatibility
export async function publishEvents(ids: string[], publish: boolean) {
  return setPublishStatus(ids, publish ? 'approved' : 'pending');
}

// Fetch recently updated events
export async function fetchRecentlyUpdatedEvents(limit: number = 50) {
  return request(`/db/events/recent-updates?limit=${limit}`);
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

  return request(`/db/events/map?${searchParams}`);
}

export async function syncEvents(city: string, limit: number = 100) {
  return request(`/db/events/sync`, {
    method: 'POST',
    body: JSON.stringify({ city, limit }),
  });
}

export async function fetchStats() {
  return request(`/db/stats`);
}

export async function fetchVenues(params?: {
  city?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sort?: string;
  order?: string;
  source?: string;
  type?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.city) searchParams.set('city', params.city);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());
  if (params?.sort) searchParams.set('sort', params.sort);
  if (params?.order) searchParams.set('order', params.order);
  if (params?.source) searchParams.set('source', params.source);
  if (params?.type) searchParams.set('type', params.type);

  return request(`/db/venues?${searchParams}`);
}

export async function fetchEnrichStats() {
  return request(`/db/enrich/stats`);
}

export async function enrichVenues(limit: number = 50) {
  return request(`/db/venues/enrich`, {
    method: 'POST',
    body: JSON.stringify({ limit }),
  });
}

export async function enrichArtists(limit: number = 100) {
  return request(`/db/artists/enrich`, {
    method: 'POST',
    body: JSON.stringify({ limit }),
  });
}

export async function fetchCities() {
  const result = await request<any>(`/db/cities`);
  return result.data || [];
}

// Fetch countries for dropdown
import { countries } from '@/lib/countries';

export async function fetchCountries() {
  // Return static list immediately
  return countries;
}

// Fetch cities for dropdown (optimized)
export async function fetchCitiesDropdown(country?: string) {
  const searchParams = new URLSearchParams();
  if (country) searchParams.set('country', country);

  const result = await request<any>(`/db/cities/dropdown?${searchParams}`);
  return result.data || [];
}

// Autocomplete search for venues
export async function searchVenues(query: string, city?: string) {
  if (!query || query.length < 2) return [];

  const searchParams = new URLSearchParams({ search: query });
  if (city) searchParams.set('city', city);

  const result = await request<{ data: any[] }>(`/db/venues/search?${searchParams}`);
  return result.data || [];
}

// Autocomplete search for artists
export async function searchArtists(query: string) {
  if (!query || query.length < 2) return [];

  const searchParams = new URLSearchParams({ q: query });

  const result = await request<{ data: any[] }>(`/db/artists/search?${searchParams}`);
  return result.data || [];
}

// External Search (Multi-source auto-fill)
export async function searchExternal(type: 'venue' | 'artist' | 'organizer' | 'city', query: string) {
  if (!query || query.length < 2) return [];
  const searchParams = new URLSearchParams({ type, q: query });
  console.log(`[API] Searching external: ${API_URL}/search/external?${searchParams}`);
  try {
    const result = await request<{ data: any[] }>(`/search/external?${searchParams}`);
    console.log('[API] Search result:', result);
    return result.data || [];
  } catch (e) {
    console.error('[API] Search failed:', e);
    return [];
  }
}

// Get artists for an event
export async function fetchEventArtists(eventId: string) {
  const result = await request<{ data: any[] }>(`/db/events/${eventId}/artists`);
  return result.data || [];
}

// History API
export async function fetchEventHistory(id: string) {
  return fetchEntityHistory('event', id);
}

export async function fetchEntityHistory(type: 'event' | 'artist' | 'venue' | 'organizer' | 'city', id: string) {
  const endpointMap: Record<string, string> = {
    event: 'events',
    artist: 'artists',
    venue: 'venues',
    organizer: 'organizers',
    city: 'cities'
  };
  const collection = endpointMap[type] || type + 's';
  const result = await request<{ data: any[] }>(`/db/${collection}/${id}/history`);
  return result.data || result; // Some might return array directly, others { data: [] }
}

// Pending Changes API
export async function fetchPendingChanges(eventId: string) {
  const result = await request<{ event_id: string; has_changes: boolean; changes: any[] }>(`/db/events/changes?id=${eventId}`);
  return result;
}

export async function applyPendingChanges(eventId: string, scrapedEventId: string, fields?: string[]) {
  return request(`/db/events/changes/apply`, {
    method: 'POST',
    body: JSON.stringify({ id: eventId, scraped_event_id: scrapedEventId, fields }),
  });
}

export async function dismissPendingChanges(eventId: string, scrapedEventId: string) {
  return request(`/db/events/changes/dismiss`, {
    method: 'POST',
    body: JSON.stringify({ id: eventId, scraped_event_id: scrapedEventId }),
  });
}

// Add artist to event
export async function addEventArtist(eventId: string, artistId: string, role: string = 'performer', billingOrder: number = 0) {
  return request(`/db/events/${eventId}/artists`, {
    method: 'POST',
    body: JSON.stringify({ artist_id: artistId, role, billing_order: billingOrder }),
  });
}

// Remove artist from event
export async function removeEventArtist(eventId: string, artistId: string) {
  return request(`/db/events/${eventId}/artists/${artistId}`, {
    method: 'DELETE',
  });
}

// Sync event artists from JSON column
export async function syncEventArtists(eventId: string) {
  return request(`/db/events/${eventId}/sync-artists`, {
    method: 'POST',
  });
}

// Health check
export async function checkHealth() {
  try {
    const result = await request<{ dbConnected?: boolean, status: string }>(`/health`);
    return { connected: result.dbConnected ?? true, status: result.status };
  } catch (error) {
    return { connected: false, status: 'error', error: (error as Error).message };
  }
}

// ============== Admin Artists API ==============

export async function fetchArtists(params?: { search?: string; country?: string; limit?: number; offset?: number; source?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.country) searchParams.set('country', params.country);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());
  if (params?.source) searchParams.set('source', params.source);

  return request(`/db/artists?${searchParams}`);
}

export async function fetchArtist(id: string) {
  return request(`/db/artists/${id}`);
}

export async function createArtist(data: { name: string; country?: string; content_url?: string; image_url?: string }) {
  return request(`/db/artists`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateArtist(id: string, data: Partial<{ name: string; country: string; content_url: string; image_url: string }>) {
  return request(`/db/artists/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteArtist(id: string) {
  return request(`/db/artists/${id}`, {
    method: 'DELETE',
  });
}

// ============== Admin Cities API ==============

export async function fetchAdminCities(params?: { search?: string; limit?: number; offset?: number; source?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());
  if (params?.source) searchParams.set('source', params.source);

  return request(`/db/cities?${searchParams}`);
}

export async function fetchCity(id: string) {
  return request(`/db/cities/${id}`);
}

export async function createCity(data: Partial<City>) {
  return request(`/db/cities`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCity(id: string, data: Partial<{ name: string; country: string; latitude: number; longitude: number; timezone: string; is_active: boolean }>) {
  return request(`/db/cities/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteCity(id: string) {
  return request(`/db/cities/${id}`, {
    method: 'DELETE',
  });
}

// ============== Admin Venues API ==============

export async function fetchAdminVenues(params?: { search?: string; city?: string; limit?: number; offset?: number; source?: string; type?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.city) searchParams.set('city', params.city);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());
  if (params?.source) searchParams.set('source', params.source);
  if (params?.type) searchParams.set('type', params.type);

  return request(`/db/venues?${searchParams}`);
}

export async function fetchVenue(id: string) {
  return request(`/db/venues/${id}`);
}

export async function createVenue(data: { name: string; address?: string; city?: string; country?: string; latitude?: number; longitude?: number; content_url?: string }) {
  return request(`/db/venues`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateVenue(id: string, data: Partial<Venue>) {
  return request(`/db/venues/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteVenue(id: string) {
  return request(`/db/venues/${id}`, {
    method: 'DELETE',
  });
}

// ============== Admin Dashboard API ==============

export async function fetchDashboard() {
  return request(`/db/dashboard`);
}

// ============== Multi-Source Scraping API ==============

export async function scrapeEvents(params: { sources?: string[]; city: string; limit?: number; match?: boolean }) {
  // Use pipeline for multi-source scraping
  // Use pipeline for multi-source scraping
  return request(`/sync/pipeline`, {
    method: 'POST',
    body: JSON.stringify({
      cities: [params.city],
      sources: params.sources || ['ra'],
      enrichAfter: false,
      dedupeAfter: false
    }),
  });
}

export async function scrapeTicketmaster(params: { city: string; limit?: number }) {
  return request(`/scrape/run`, {
    method: 'POST',
    body: JSON.stringify({
      city: params.city,
      source: 'tm',
      limit: params.limit
    }),
  });
}

export async function runMatching(params?: { dryRun?: boolean; minConfidence?: number }) {
  return request(`/scrape/match`, {
    method: 'POST',
    body: JSON.stringify(params || {}),
  });
}

export async function fetchScrapedEvents(params?: { source?: string; city?: string; linked?: boolean; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.source) searchParams.set('source', params.source);
  if (params?.city) searchParams.set('city', params.city);
  if (params?.linked !== undefined) searchParams.set('linked', params.linked.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  return request(`/scraped/events?${searchParams}`);
}

export async function fetchUnifiedEvents(params?: { city?: string; published?: boolean; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.city) searchParams.set('city', params.city);
  if (params?.published !== undefined) searchParams.set('published', params.published.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  return request(`/unified/events?${searchParams}`);
}

export async function fetchUnifiedEvent(id: string) {
  return request(`/unified/events/${id}`);
}

export async function updateUnifiedEvent(id: string, data: Record<string, any>) {
  return request(`/unified/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function fetchScrapeStats() {
  return request(`/scrape/stats`);
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

  return request(`/scraped/venues?${searchParams}`);
}

export async function fetchUnifiedVenues(params?: { city?: string; search?: string; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.city) searchParams.set('city', params.city);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  return request(`/unified/venues?${searchParams}`);
}

// Scraped & Unified Artists
export async function fetchScrapedArtists(params?: { source?: string; search?: string; linked?: boolean; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.source) searchParams.set('source', params.source);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.linked !== undefined) searchParams.set('linked', params.linked.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  return request(`/scraped/artists?${searchParams}`);
}

export async function fetchUnifiedArtists(params?: { search?: string; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  return request(`/unified/artists?${searchParams}`);
}

export async function fetchUnifiedArtist(id: string) {
  return request(`/unified/artists/${id}`);
}

export async function updateUnifiedArtist(id: string, data: Record<string, any>) {
  return request(`/unified/artists/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function fetchUnifiedVenue(id: string) {
  return request(`/unified/venues/${id}`);
}

export async function updateUnifiedVenue(id: string, data: Record<string, any>) {
  return request(`/unified/venues/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deduplicateData(type: 'all' | 'events' | 'venues' | 'artists' = 'all') {
  return request(`/scrape/deduplicate`, {
    method: 'POST',
    body: JSON.stringify({ type }),
  });
}

// Ensure configured cities fetcher is available
export async function fetchConfiguredCities() {
  return request(`/scrape/cities`);
}

// Fetch all event sources
export async function fetchSources() {
  const json = await request<{ data: any[] }>(`/db/sources`);
  return json.data || [];
}

// Toggle source active state
export async function toggleSource(id: number | string, isActive: boolean) {
  return updateSource(id, { is_active: isActive });
}

export async function updateSource(id: number | string, data: Record<string, any>) {
  return request(`/db/sources/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ============== Scrape History API ==============

export async function fetchScrapeHistory(params?: { days?: number; groupBy?: 'day' | 'hour' }) {
  const searchParams = new URLSearchParams();
  if (params?.days) searchParams.set('days', params.days.toString());
  if (params?.groupBy) searchParams.set('groupBy', params.groupBy);

  return request(`/scrape/history?${searchParams}`);
}

export async function fetchRecentScrapes(limit: number = 20) {
  return request(`/scrape/recent?limit=${limit}`);
}

// ============== Sync Pipeline API ==============

// Get sync job status (scrape status)
export async function getScrapeStatus() {
  return request(`/scrape/status`);
}

// Deprecated: use getScrapeStatus
export async function getSyncStatus() {
  return getScrapeStatus();
}

// Direct sync pipeline - scrapes, matches, enriches, and dedupes
export async function syncEventsPipeline(params: { cities: string[]; sources: string[]; enrichAfter?: boolean; dedupeAfter?: boolean }) {
  return request(`/sync/pipeline`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
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
  return request(`/admin/sql`, {
    method: 'POST',
    body: JSON.stringify({ query, params }),
  });

}

// Match artists manually
export async function matchArtists(params?: { dryRun?: boolean; minConfidence?: number }) {
  return request(`/db/artists/match`, {
    method: 'POST',
    body: JSON.stringify(params || {}),
  });
}

// Match venues manually
export async function matchVenues(params?: { dryRun?: boolean; minConfidence?: number }) {
  return request(`/db/venues/match`, {
    method: 'POST',
    body: JSON.stringify(params || {}),
  });
}

// Organizers API
export async function fetchOrganizers(params?: { search?: string; limit?: number; offset?: number; source?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());
  if (params?.source) searchParams.set('source', params.source);

  return request(`/db/organizers?${searchParams}`);
}

export async function fetchOrganizer(id: string) {
  return request(`/db/organizers/${id}`);
}

export async function createOrganizer(data: Partial<Organizer>) {
  return request(`/db/organizers`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateOrganizer(id: string, data: Partial<Organizer>) {
  return request(`/db/organizers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function resetDatabase() {
  return request(`/db/reset`, {
    method: 'POST',
  });
}

export async function deleteOrganizer(id: string) {
  return request(`/db/organizers/${id}`, {
    method: 'DELETE',
  });
}


// ============== Guest Users API ==============

export async function fetchGuestUsers(params?: { search?: string; limit?: number; offset?: number; sort?: string; order?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());
  if (params?.sort) searchParams.set('sort', params.sort);
  if (params?.order) searchParams.set('order', params.order);

  return request(`/db/guest-users?${searchParams}`);
}

export async function createGuestUser(data: Partial<GuestUser>) {
  return request(`/db/guest-users`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchGuestUser(id: string) {
  return request(`/db/guest-users/${id}`);
}

export async function updateGuestUser(id: string, data: Partial<GuestUser>) {
  return request(`/db/guest-users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteGuestUser(id: string) {
  return request(`/db/guest-users/${id}`, {
    method: 'DELETE',
  });
}

// ============== Moderation API ==============

export async function fetchReports(params?: { status?: string; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  return request(`/db/moderation/reports?${searchParams}`);
}

export async function resolveReport(id: string, status: 'resolved' | 'dismissed', admin_notes: string) {
  return request(`/db/moderation/reports/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, admin_notes })
  });
}

export async function deleteReportedContent(id: string, deleteContent: boolean) {
  return request(`/db/moderation/reports/${id}/action`, {
    method: 'POST',
    body: JSON.stringify({ delete_content: deleteContent })
  });
}

