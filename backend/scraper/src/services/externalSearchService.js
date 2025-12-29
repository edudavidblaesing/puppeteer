const { searchArtist: searchSpotify } = require('./spotifyService');
const { searchArtist: searchMB } = require('./musicBrainzService');
const { searchAreas: searchRA } = require('./raService');

// Ticketmaster Config
const TM_API_KEY = process.env.TICKETMASTER_API_KEY || 'nxUv3tE9qx64KGji30MwrYZFSxfb9p6r';
const TM_BASE_URL = 'https://app.ticketmaster.com/discovery/v2';

// Rate Limiting Helpers
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const searchVenues = async (query) => {
    const results = [];

    // 1. Nominatim (OpenStreetMap)
    try {
        const osmRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`, {
            headers: { 'User-Agent': 'EventsAdmin/1.0' }
        });
        if (osmRes.ok) {
            const data = await osmRes.json();
            results.push(...data.map(item => ({
                source: 'osm',
                id: item.osm_id,
                name: item.name || item.display_name.split(',')[0],
                city: item.address?.city || item.address?.town || item.address?.village,
                country: item.address?.country_code?.toUpperCase(),
                lat: parseFloat(item.lat),
                lon: parseFloat(item.lon),
                raw: item
            })));
        }
    } catch (e) {
        console.error('OSM Search Failed:', e.message);
    }

    // 2. Ticketmaster
    try {
        const tmRes = await fetch(`${TM_BASE_URL}/venues.json?keyword=${encodeURIComponent(query)}&apikey=${TM_API_KEY}&size=5`);
        if (tmRes.ok) {
            const data = await tmRes.json();
            const venues = data._embedded?.venues || [];
            results.push(...venues.map(v => ({
                source: 'tm',
                id: v.id,
                name: v.name,
                city: v.city?.name,
                country: v.country?.countryCode,
                lat: v.location?.latitude ? parseFloat(v.location.latitude) : null,
                lon: v.location?.longitude ? parseFloat(v.location.longitude) : null,
                raw: v
            })));
        }
    } catch (e) {
        console.error('TM Venue Search Failed:', e.message);
    }

    return results;
};

const searchArtists = async (query) => {
    const results = [];

    // 1. Spotify
    try {
        const spotifyArtist = await searchSpotify(query);
        if (spotifyArtist) {
            results.push({
                source: 'spotify',
                id: spotifyArtist.id,
                name: spotifyArtist.name,
                image_url: spotifyArtist.images?.[0]?.url,
                genres: spotifyArtist.genres,
                raw: spotifyArtist
            });
        }
    } catch (e) {
        console.error('Spotify Search Failed:', e.message);
    }

    // 2. Ticketmaster
    try {
        const tmRes = await fetch(`${TM_BASE_URL}/attractions.json?keyword=${encodeURIComponent(query)}&apikey=${TM_API_KEY}&size=3`);
        if (tmRes.ok) {
            const data = await tmRes.json();
            const attractions = data._embedded?.attractions || [];
            results.push(...attractions.map(a => ({
                source: 'tm',
                id: a.id,
                name: a.name,
                image_url: a.images?.[0]?.url,
                genres: a.classifications?.[0]?.genre?.name ? [a.classifications[0].genre.name] : [],
                raw: a
            })));
        }
    } catch (e) {
        console.error('TM Artist Search Failed:', e.message);
    }

    // 3. MusicBrainz
    try {
        const mbArtists = await searchMB(query);
        if (mbArtists.length > 0) {
            results.push(...mbArtists.slice(0, 2).map(a => ({
                source: 'mb',
                id: a.id,
                name: a.name,
                country: a.country,
                tags: a.tags?.map(t => t.name) || [],
                raw: a
            })));
        }
    } catch (e) {
        console.error('MB Search Failed:', e.message);
    }

    return results;
};

const searchOrganizers = async (query) => {
    const results = [];

    // 1. Ticketmaster Attractions (as proxy for organizers/promoters)
    try {
        const tmRes = await fetch(`${TM_BASE_URL}/attractions.json?keyword=${encodeURIComponent(query)}&apikey=${TM_API_KEY}&size=5`);
        if (tmRes.ok) {
            const data = await tmRes.json();
            const attractions = data._embedded?.attractions || [];
            results.push(...attractions.map(a => ({
                source: 'tm',
                id: a.id,
                name: a.name,
                image_url: a.images?.[0]?.url,
                raw: a
            })));
        }
    } catch (e) {
        console.error('TM Organizer Search Failed:', e.message);
    }

    return results;
};

const searchCities = async (query) => {
    const results = [];
    let osmResults = [];
    let raResults = [];
    let tmResults = [];

    // Run searches in parallel
    await Promise.all([
        // 1. Nominatim (OpenStreetMap)
        (async () => {
            try {
                const osmRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`, {
                    headers: { 'User-Agent': 'EventsAdmin/1.0' }
                });
                if (osmRes.ok) {
                    const data = await osmRes.json();
                    osmResults = data.map(item => ({
                        source: 'osm',
                        id: item.osm_id,
                        name: item.name || item.display_name.split(',')[0],
                        city: item.name,
                        country: item.address?.country_code?.toUpperCase(),
                        lat: parseFloat(item.lat),
                        lon: parseFloat(item.lon),
                        raw: item
                    }));
                    results.push(...osmResults);
                }
            } catch (e) {
                console.error('OSM City Search Failed:', e.message);
            }
        })(),

        // 2. Resident Advisor (RA)
        (async () => {
            try {
                raResults = await searchRA(query);
            } catch (e) {
                console.error('RA City Search Failed:', e.message);
            }
        })(),

        // 3. Ticketmaster (Inferred from Venues)
        (async () => {
            try {
                // TM doesn't have a City Search API, so we search for venues by keyword (the city name)
                const tmRes = await fetch(`${TM_BASE_URL}/venues.json?keyword=${encodeURIComponent(query)}&apikey=${TM_API_KEY}&size=10`);
                if (tmRes.ok) {
                    const data = await tmRes.json();
                    const venues = data._embedded?.venues || [];

                    // Extract unique cities from venues
                    const uniqueCities = new Map();
                    venues.forEach(v => {
                        const cityName = v.city?.name;
                        // Filter out invalid or generic city names
                        if (cityName &&
                            cityName.toLowerCase() !== 'different locations' &&
                            !cityName.toLowerCase().includes('multiple locations')) {

                            const key = `${cityName}-${v.country?.countryCode}`;
                            if (!uniqueCities.has(key)) {
                                uniqueCities.set(key, {
                                    source: 'tm',
                                    id: cityName, // For TM scraper, we just need the exact city name
                                    name: cityName,
                                    city: cityName,
                                    country: v.country?.countryCode,
                                    lat: v.location?.latitude ? parseFloat(v.location.latitude) : null,
                                    lon: v.location?.longitude ? parseFloat(v.location.longitude) : null,
                                    raw: v
                                });
                            }
                        }
                    });
                    tmResults = Array.from(uniqueCities.values());
                }
            } catch (e) {
                console.error('TM City Search Failed:', e.message);
            }
        })()
    ]);

    // Process RA Results
    if (raResults.length > 0) {
        results.push(...raResults.map(area => {
            // Try to find matching OSM result to enrich coordinates
            const matchingOsm = osmResults.find(o =>
                o.name.toLowerCase() === area.name.toLowerCase() ||
                (area.country?.name && o.raw?.address?.country?.toLowerCase() === area.country.name.toLowerCase())
            );

            return {
                source: 'ra',
                id: area.id,
                name: area.name,
                city: area.name,
                country: area.country?.name, // Use name, frontend maps to code
                lat: matchingOsm ? matchingOsm.lat : null,
                lon: matchingOsm ? matchingOsm.lon : null,
                raw: area
            };
        }));
    }

    // Process TM Results
    if (tmResults.length > 0) {
        results.push(...tmResults);
    }

    return results;
};

module.exports = {
    searchVenues,
    searchArtists,
    searchOrganizers,
    searchCities
};
