import { Event } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://pptr.davidblaesing.com';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'your-secure-api-key-here';

const headers = {
  'Content-Type': 'application/json',
  'x-api-key': API_KEY,
};

export async function fetchEvents(params?: {
  city?: string;
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.city) searchParams.set('city', params.city);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());
  if (params?.from) searchParams.set('from', params.from);
  if (params?.to) searchParams.set('to', params.to);

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

export async function deleteEvent(id: string) {
  const response = await fetch(`${API_URL}/db/events/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) throw new Error('Failed to delete event');
  return response.json();
}

export async function publishEvents(ids: string[], publish: boolean) {
  const response = await fetch(`${API_URL}/db/events/publish`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ids, publish }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Publish events error:', response.status, errorData);
    throw new Error(errorData.error || `Failed to update publish status (${response.status})`);
  }
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

// ============== Admin Artists API ==============

export async function fetchArtists(params?: { search?: string; country?: string; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.country) searchParams.set('country', params.country);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());

  const response = await fetch(`${API_URL}/admin/artists?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch artists');
  return response.json();
}

export async function createArtist(data: { name: string; country?: string; content_url?: string; image_url?: string }) {
  const response = await fetch(`${API_URL}/admin/artists`, {
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
  const response = await fetch(`${API_URL}/admin/artists/${id}`, {
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
  const response = await fetch(`${API_URL}/admin/artists/${id}`, {
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

  const response = await fetch(`${API_URL}/admin/cities?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch cities');
  return response.json();
}

export async function createCity(data: { name: string; country?: string; latitude?: number; longitude?: number; timezone?: string }) {
  const response = await fetch(`${API_URL}/admin/cities`, {
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
  const response = await fetch(`${API_URL}/admin/cities/${id}`, {
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
  const response = await fetch(`${API_URL}/admin/cities/${id}`, {
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

  const response = await fetch(`${API_URL}/admin/venues?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch venues');
  return response.json();
}

export async function createVenue(data: { name: string; address?: string; city?: string; country?: string; latitude?: number; longitude?: number; content_url?: string }) {
  const response = await fetch(`${API_URL}/admin/venues`, {
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
  const response = await fetch(`${API_URL}/admin/venues/${id}`, {
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
  const response = await fetch(`${API_URL}/admin/venues/${id}`, {
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
  const response = await fetch(`${API_URL}/admin/dashboard`, { headers });
  if (!response.ok) throw new Error('Failed to fetch dashboard');
  return response.json();
}

// ============== Event Artists API ==============

export async function addArtistToEvent(eventId: string, artistId: string) {
  const response = await fetch(`${API_URL}/admin/events/${eventId}/artists`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ artist_id: artistId }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to add artist to event');
  }
  return response.json();
}

export async function removeArtistFromEvent(eventId: string, artistId: string) {
  const response = await fetch(`${API_URL}/admin/events/${eventId}/artists/${artistId}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to remove artist from event');
  }
  return response.json();
}
