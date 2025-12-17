// using global fetch
const { pool } = require('../db');
const { getListings, getEvent, getVenue } = require('./raService');

// TICKETMASTER_API_KEY from env
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY || 'nxUv3tE9qx64KGji30MwrYZFSxfb9p6r';

// Check if source is configured for a city
async function getCitySourceConfig(cityName, sourceCode) {
    const result = await pool.query(`
        SELECT csc.*, es.code as source_code, es.scopes, es.enabled_scopes
        FROM city_source_configs csc
        JOIN cities c ON c.id = csc.city_id
        JOIN event_sources es ON es.id = csc.source_id
        WHERE LOWER(c.name) = LOWER($1) AND es.code = $2 AND csc.is_active = true
    `, [cityName, sourceCode]);

    return result.rows[0];
}

async function scrapeResidentAdvisor(city, options = {}) {
    // 1. Get Config from DB
    const config = await getCitySourceConfig(city, 'ra');
    if (!config) {
        throw new Error(`City not configured for Resident Advisor: ${city}`);
    }

    const areaId = parseInt(config.external_id);
    if (!areaId) {
        throw new Error(`Invalid RA Area ID for ${city}`);
    }

    const { limit = 100, startDate, endDate } = options;
    const today = new Date().toISOString().split('T')[0];

    // Use raService for valid GraphQL query structure
    const filters = {
        areas: { eq: areaId },
        listingDate: {
            gte: startDate || today,
            lte: endDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        }
    };

    const data = await getListings(filters, parseInt(limit));
    const events = data.data || [];

    // Map to normalized structure
    return events.map(listing => {
        const e = listing.event;
        const eventId = e.id;

        // Robust checking
        const venue = e.venue || {};
        const area = venue.area || {};
        const country = area.country || {};

        return {
            source_code: 'ra',
            source_event_id: eventId,
            title: e.title,
            date: e.date,
            start_time: e.startTime || null,
            end_time: e.endTime || null,
            content_url: e.contentUrl ? `https://ra.co${e.contentUrl}` : null,
            flyer_front: e.flyerFront,
            description: e.content,
            venue_name: venue.name,
            venue_address: venue.address,
            venue_city: area.name, // RA gives Area name
            venue_country: country.name,
            venue_latitude: null,
            venue_longitude: null,
            artists_json: e.artists?.map(a => ({
                source_artist_id: a.id,
                name: a.name,
                content_url: `https://ra.co/dj/${a.name.toLowerCase().replace(/\s/g, '')}`
            })) || [],
            organizers_json: e.promoters?.map(p => ({
                source_organizer_id: p.id,
                name: p.name,
                content_url: `https://ra.co/promoters/${p.id}`
            })) || [],
            price_info: null,
            raw_data: listing,
            venue_raw: {
                source_venue_id: venue.id,
                name: venue.name,
                address: venue.address,
                city: area.name,
                country: country.name,
                content_url: venue.id ? `https://ra.co/clubs/${venue.id}` : null
            }
        };
    });
}

async function scrapeTM(city, options = {}) {
    // 1. Get Config from DB
    const config = await getCitySourceConfig(city, 'tm');
    if (!config) {
        throw new Error(`City not configured for TM: ${city}`);
    }

    const extraConfig = config.config_json || {};
    const tmCityName = config.external_id || city; // Use external_id as city name override, or default to city arg
    const countryCode = extraConfig.countryCode;

    const { limit = 100, classificationName = 'Music' } = options;
    const params = new URLSearchParams({
        city: tmCityName,
        apikey: TICKETMASTER_API_KEY,
        size: Math.min(limit, 200).toString(),
        classificationName: classificationName,
        sort: 'date,asc'
    });

    if (countryCode) {
        params.append('countryCode', countryCode);
    }

    const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params}`;
    console.log(`Fetching Ticketmaster: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ticketmaster API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const events = data._embedded?.events || [];

    return events.map(event => {
        const venue = event._embedded?.venues?.[0];
        const attractions = event._embedded?.attractions || [];
        const priceRange = event.priceRanges?.[0];

        // Format date and time
        const date = event.dates?.start?.localDate || null;
        // Use full dateTime for start/end if available, otherwise construct or fallback
        // TM provides localDate, localTime, and dateTime (ISO with text timezone maybe, or Z)
        // safe to use dateTime if present.
        const startTime = event.dates?.start?.dateTime || (date && event.dates?.start?.localTime ? `${date}T${event.dates.start.localTime}` : null);
        const endTime = event.dates?.end?.dateTime || (event.dates?.end?.localDate && event.dates?.end?.localTime ? `${event.dates.end.localDate}T${event.dates.end.localTime}` : null);

        return {
            source_code: 'ticketmaster',
            source_event_id: event.id,
            title: event.name,
            date: date,
            start_time: startTime,
            end_time: endTime,
            content_url: event.url,
            flyer_front: event.images?.find(i => i.ratio === '16_9')?.url || event.images?.[0]?.url,
            description: event.info || event.pleaseNote,
            venue_name: venue?.name,
            venue_address: [venue?.address?.line1, venue?.address?.line2].filter(Boolean).join(', '),
            venue_city: venue?.city?.name || tmCityName,
            venue_country: venue?.country?.name || venue?.country?.countryCode,
            venue_latitude: venue?.location?.latitude ? parseFloat(venue.location.latitude) : null,
            venue_longitude: venue?.location?.longitude ? parseFloat(venue.location.longitude) : null,
            artists_json: attractions.map(a => ({
                source_artist_id: a.id,
                name: a.name,
                genres: a.classifications?.map(c => c.genre?.name).filter(Boolean),
                image_url: a.images?.[0]?.url,
                content_url: a.url,
                type: a.classifications?.[0]?.type?.name || null
            })),
            organizers_json: event.promoters ? event.promoters.map(p => ({
                source_organizer_id: p.id,
                name: p.name,
                description: p.description,
                content_url: null // TM promoters usually don't have a direct URL in this object
            })) : (event.promoter ? [{
                source_organizer_id: event.promoter.id,
                name: event.promoter.name,
                description: event.promoter.description,
                content_url: null
            }] : []),
            price_info: priceRange ? {
                min: priceRange.min,
                max: priceRange.max,
                currency: priceRange.currency
            } : null,
            raw_data: event,
            venue_raw: venue ? {
                source_venue_id: venue.id,
                name: venue.name,
                address: [venue.address?.line1, venue.address?.line2].filter(Boolean).join(', '),
                city: venue.city?.name,
                country: venue.country?.name,
                latitude: venue.location?.latitude,
                longitude: venue.location?.longitude,
                content_url: venue.url
            } : null
        };
    });
}

// Get configured cities
// Returns array of objects with city name + active sources
async function getConfiguredCities() {
    try {
        // Query cities that have at least one active config
        const result = await pool.query(`
            SELECT 
                c.name,
                c.country,
                JSON_OBJECT_AGG(es.code, json_build_object(
                    'isActive', csc.is_active,
                    'enabledScopes', es.enabled_scopes,
                    'externalId', csc.external_id
                )) as sources
            FROM cities c
            JOIN city_source_configs csc ON csc.city_id = c.id
            JOIN event_sources es ON es.id = csc.source_id
            WHERE c.is_active = true AND csc.is_active = true
            GROUP BY c.id, c.name, c.country
            ORDER BY c.name
        `);

        return result.rows.map(row => ({
            name: row.name,
            key: row.name.toLowerCase(),
            country: row.country,
            sources: row.sources
        }));
    } catch (e) {
        console.error('Error fetching configured cities:', e);
        return [];
    }
}

module.exports = {
    scrapeResidentAdvisor,
    scrapeTM,
    getConfiguredCities,
    getCitySourceConfig
};
