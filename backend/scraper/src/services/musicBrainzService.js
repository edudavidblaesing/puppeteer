// using global fetch

// Rate limiting state
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1100; // 1.1 seconds

const waitIfNeeded = async () => {
    const now = Date.now();
    const timeSinceLast = now - lastRequestTime;
    if (timeSinceLast < MIN_REQUEST_INTERVAL) {
        await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLast));
    }
    lastRequestTime = Date.now();
};

const HEADERS = {
    'User-Agent': 'SocialEventsScraper/1.0 ( https://github.com/edudavidblaesing/social-events )',
    'Accept': 'application/json'
};

const searchArtist = async (name, country = null) => {
    await waitIfNeeded();
    let query = `artist:${encodeURIComponent(name)}`;
    if (country) {
        query += ` AND country:${encodeURIComponent(country)}`;
    }

    const url = `https://musicbrainz.org/ws/2/artist?query=${query}&fmt=json`;
    console.log(`[MusicBrainz] Searching: ${url}`);

    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`MusicBrainz API error: ${res.status}`);

    const data = await res.json();
    return data.artists || [];
};

const getArtistDetails = async (mbid) => {
    await waitIfNeeded();
    // Fetch with relationships to urls, tags, ratings
    const url = `https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels+tags+genres+ratings&fmt=json`;
    console.log(`[MusicBrainz] Fetching Details: ${url}`);

    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`MusicBrainz API error: ${res.status}`);

    const data = await res.json();

    // Normalize data
    const normalized = {
        source_code: 'mb',
        source_artist_id: data.id,
        name: data.name,
        country: data.country || null,
        artist_type: data.type || null, // e.g. Person, Group
        tags: (data.tags || []).sort((a, b) => b.count - a.count).map(t => t.name),
        genres: (data.genres || []).map(g => g.name),
        urls: (data.relations || []).filter(r => r.type === 'official homepage' || r.type === 'social network' || r.type === 'discogs' || r.type === 'streaming'),
        disambiguation: data.disambiguation,
        begin_date: data['life-span']?.begin,
        end_date: data['life-span']?.end
    };

    // Extract best content URL and image (Discogs often has images but MB doesn't serve them directly without CoverArtArchive which is for releases)
    // We'll trust RA/TM for images mostly, or explicit valid URLs.
    // MB doesn't natively host artist images, but links to them.

    // Construct single object for scraper compatibility
    const website = normalized.urls.find(u => u.type === 'official homepage')?.url?.resource;

    return {
        ...normalized,
        content_url: website || `https://musicbrainz.org/artist/${data.id}`,
        // Flatten genres/tags for simple storage
        genres_list: [...normalized.genres, ...normalized.tags].slice(0, 10)
    };
};

module.exports = {
    searchArtist,
    getArtistDetails
};
