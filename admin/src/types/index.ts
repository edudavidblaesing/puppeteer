// Publish status: pending (needs review), approved (published), rejected (hidden)
export type PublishStatus = 'pending' | 'approved' | 'rejected';

// Event timing category for display
export type EventTiming = 'upcoming' | 'ongoing' | 'recent' | 'expired';

// Event type classification
export type EventType = 'event' | 'club' | 'concert' | 'festival' | 'exhibition' | 'workshop' | 'party' | 'performance' | 'rave' | 'listening';

// Event type display config
export const EVENT_TYPES: { value: EventType; label: string; icon: string; color: string }[] = [
  { value: 'event', label: 'Event', icon: '📅', color: 'gray' },
  { value: 'club', label: 'Club Night', icon: '🎧', color: 'purple' },
  { value: 'concert', label: 'Concert', icon: '🎸', color: 'red' },
  { value: 'festival', label: 'Festival', icon: '🎪', color: 'orange' },
  { value: 'exhibition', label: 'Exhibition', icon: '🎨', color: 'pink' },
  { value: 'workshop', label: 'Workshop', icon: '🛠️', color: 'blue' },
  { value: 'party', label: 'Party', icon: '🎉', color: 'yellow' },
  { value: 'performance', label: 'Performance', icon: '🎭', color: 'indigo' },
  { value: 'rave', label: 'Rave', icon: '⚡', color: 'green' },
  { value: 'listening', label: 'Listening', icon: '🎵', color: 'cyan' },
];

// Source reference from scraped events
export interface SourceReference {
  id: string;
  source_code: string;
  title?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  content_url?: string;
  flyer_front?: string;
  description?: string;
  venue_name?: string;
  venue_address?: string;
  venue_city?: string;
  venue_country?: string;
  price_info?: any;
  confidence?: number;
  updated_at?: string;
  last_synced_at?: string;
  // For other entities
  name?: string;
  address?: string;
  city?: string;
  country?: string;
  image_url?: string;
  genres?: any;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  provider?: string;
  event_type?: string;
  ticket_url?: string;
  venue_type?: string;
  artist_type?: string;
  phone?: string;
  email?: string;
  bio?: string;
  artists?: any;
}

export interface Event {
  id: string;
  source_code: string;
  source_id: string | null;
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  content_url: string | null;
  flyer_front: string | null;
  description: string | null;
  venue_id: string | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_city: string | null;
  venue_country: string | null;
  artists: string | null;
  listing_date: string | null;
  publish_status: PublishStatus;
  is_published: boolean; // kept for backwards compatibility
  event_type: EventType;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
  source_references?: SourceReference[];
  organizers_list?: { id: string; name: string }[];
  ticket_url?: string | null;
  artists_list?: { id: string; name: string }[];
}

export interface Venue {
  id: string;
  name: string;
  address?: string;
  city?: string;
  city_id?: number;
  country?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  content_url?: string;
  venue_type?: string;
  phone?: string;
  email?: string;
  description?: string;
  events?: Event[];
  source_references?: SourceReference[];
  is_active?: boolean;
}

export interface Artist {
  id: string;
  name: string;
  country: string | null;
  content_url: string | null;
  image_url?: string | null;
  artist_type?: string | null;
  genres?: string[] | null;
  bio?: string | null;
  source_references?: SourceReference[];
  events?: Event[];
}

export interface Organizer {
  id: string;
  name: string;
  provider?: string | null;
  description?: string | null;
  website_url?: string | null;
  image_url?: string | null;
  event_count?: number;
  created_at?: string;
  updated_at?: string;
  source_references?: SourceReference[];
  events?: Event[];
  venues?: Venue[];
}

// Event-Artist relationship
export interface EventArtist {
  id: number;
  event_id: string;
  artist_id: string;
  role: 'performer' | 'headliner' | 'support' | 'dj' | 'host';
  billing_order: number;
  start_time?: string | null;
  end_time?: string | null;
  // Joined from artists table
  name?: string;
  image_url?: string;
  country?: string;
  genres?: string[];
}

// Country for dropdown
export interface Country {
  id?: number;
  name: string;
  code?: string;
  continent?: string;
  is_active?: boolean;
}

export interface ApiResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Stats {
  events: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    active: number;
    new_24h: number;
    new_7d: number;
    updated_24h: number;
  };
  venues: number;
  artists: number;
  organizers: number;
  scraping: {
    total: number;
    new_24h: number;
    last_run: string | null;
    active_sources: string[];
    next_scheduled: string;
  };
}

export interface SourceConfig {
  id?: number;
  city_id?: number;
  source_id: number;
  source_name?: string;
  source_code?: string;
  external_id: string; // e.g., Area ID or city slug
  config_json?: any;
  is_active: boolean;
  scopes?: string[];
  enabled_scopes?: string[];
  entity_type?: string; // configuration for filtering
}

// Event Source (Global Definition)
export interface Source {
  id: number;
  name: string;
  code: string;
  url: string;
  type?: string;
  is_active: boolean;
  scopes?: string[];
  enabled_scopes?: string[]; // Global setting for this source
  entity_type?: string; // Legacy
  created_at?: string;
}

export interface City {
  id?: number;
  name: string;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone?: string | null;
  ra_area_id?: number | null;
  is_active?: boolean;
  event_count: number;
  venue_count: number;
  source_references?: SourceReference[];
  source_configs?: SourceConfig[];
}
// User type
export interface User {
  id?: number;
  username: string;
  role: 'superadmin' | 'admin';
  password?: string;
  created_at?: string;
}

export interface DashboardStats {
  totals: {
    events: number;
    artists: number;
    venues: number;
    cities: number;
    published_events: number;
    unpublished_events: number;
  };
  upcoming_events: number;
  events_this_week: number;
  recent_events: Event[];
}

// Helper function to parse time from either "HH:mm:ss" or ISO timestamp format
function parseTime(timeStr: string | null | undefined): [number, number] {
  if (!timeStr) return [0, 0];

  // Check if it's an ISO timestamp (contains 'T')
  if (timeStr.includes('T')) {
    const date = new Date(timeStr);
    return [date.getHours(), date.getMinutes()];
  }

  // Otherwise treat as "HH:mm" or "HH:mm:ss" format
  const parts = timeStr.split(':').map(Number);
  return [parts[0] || 0, parts[1] || 0];
}

// Helper function to determine event timing category
export function getEventTiming(event: Event): EventTiming {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDate = new Date(event.date);
  // Ensure eventDate is just the date part (midnight)
  const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());

  let eventStart: Date;
  let eventEnd: Date;

  // Check if start_time is a full ISO timestamp
  if (event.start_time && event.start_time.includes('T')) {
    eventStart = new Date(event.start_time);
  } else {
    // Fallback: use event.date + parsed time
    const startTime = parseTime(event.start_time);
    eventStart = new Date(eventDateOnly);
    eventStart.setHours(startTime[0], startTime[1]);
  }

  // Check if end_time is a full ISO timestamp
  if (event.end_time && event.end_time.includes('T')) {
    eventEnd = new Date(event.end_time);
  } else {
    // Fallback: use event.date + parsed time (+1 day logic)
    const startTime = parseTime(event.start_time);
    const endTime = event.end_time ? parseTime(event.end_time) : [23, 59] as [number, number];

    eventEnd = new Date(eventDateOnly);
    eventEnd.setHours(endTime[0], endTime[1]);

    // If end time is before start time (and not explicit date), assume it ends next day
    // Note: compare purely based on hours if dates are assumed same initially
    if (endTime[0] < startTime[0]) {
      eventEnd.setDate(eventEnd.getDate() + 1);
    }
  }

  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  if (now >= eventStart && now <= eventEnd) {
    return 'ongoing';
  } else if (eventStart > now) {
    return 'upcoming';
  } else if (eventDateOnly >= threeDaysAgo) {
    return 'recent'; // expired within last 3 days
  } else {
    return 'expired';
  }
}

// Sort events: approved first, then by timing (upcoming -> ongoing -> recent -> expired)
export function sortEventsSmart(events: Event[]): Event[] {
  const timingOrder: Record<EventTiming, number> = {
    'ongoing': 0,
    'upcoming': 1,
    'recent': 2,
    'expired': 3
  };

  const statusOrder: Record<PublishStatus, number> = {
    'approved': 0,
    'pending': 1,
    'rejected': 2
  };

  return [...events].sort((a, b) => {
    // First sort by timing
    const timingA = timingOrder[getEventTiming(a)];
    const timingB = timingOrder[getEventTiming(b)];
    if (timingA !== timingB) return timingA - timingB;

    // Then by publish status
    const statusA = statusOrder[a.publish_status || 'pending'];
    const statusB = statusOrder[b.publish_status || 'pending'];
    if (statusA !== statusB) return statusA - statusB;

    // Finally by date (ascending for upcoming, descending for past)
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (timingA <= 1) { // upcoming or ongoing
      return dateA - dateB; // soonest first
    } else {
      return dateB - dateA; // most recent first
    }
  });
}
