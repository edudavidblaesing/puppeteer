const { pool } = require('../db');
const { stringSimilarity } = require('../utils/stringUtils');

// Source priority (lower = higher priority)
const SOURCE_PRIORITY = {
    'og': 1,
    'ra': 5,
    'tm': 6,
    'eb': 7,
    'di': 8,
    // Add missing?
    'mb': 5, // MusicBrainz high prio for artists
    'fb': 9
};

function getSourcePriority(sourceCode) {
    return SOURCE_PRIORITY[sourceCode] || 10;
}

// Merge data from multiple sources, respecting priority
function mergeSourceData(sources, fieldMapping = null) {
    // Sort sources by priority (original first)
    const sorted = [...sources].sort((a, b) =>
        getSourcePriority(a.source_code) - getSourcePriority(b.source_code)
    );

    const merged = {};
    const fieldSources = {};

    // Define fields to merge (default event fields)
    const fields = fieldMapping || [
        'title', 'date', 'start_time', 'end_time', 'description',
        'flyer_front', 'content_url', 'ticket_url', 'price_info',
        'venue_name', 'venue_address', 'venue_city', 'venue_country',
        'venue_latitude', 'venue_longitude', 'artists_json', 'organizers_json'
    ];

    for (const field of fields) {
        for (const source of sorted) {
            const value = source[field];
            if (value !== null && value !== undefined && value !== '') {
                if (merged[field] === undefined) {
                    merged[field] = value;
                    fieldSources[field] = source.source_code;
                    break;
                }
            }
        }
    }

    return { merged, fieldSources };
}

// Create or update scraped entry for 'original' source
async function saveOriginalEntry(type, data, unifiedId = null) {
    const sourceCode = 'og';
    const sourceId = data.id || `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    let scrapedId;

    if (type === 'event') {
        const result = await pool.query(`
            INSERT INTO scraped_events (
                source_code, source_event_id, title, date, start_time, end_time,
                content_url, flyer_front, description, venue_name, venue_address,
                venue_city, venue_country, venue_latitude, venue_longitude, price_info
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT (source_code, source_event_id) DO UPDATE SET
                title = EXCLUDED.title,
                date = EXCLUDED.date,
                start_time = EXCLUDED.start_time,
                end_time = EXCLUDED.end_time,
                content_url = EXCLUDED.content_url,
                flyer_front = EXCLUDED.flyer_front,
                description = EXCLUDED.description,
                venue_name = EXCLUDED.venue_name,
                venue_address = EXCLUDED.venue_address,
                venue_city = EXCLUDED.venue_city,
                venue_country = EXCLUDED.venue_country,
                venue_latitude = EXCLUDED.venue_latitude,
                venue_longitude = EXCLUDED.venue_longitude,
                price_info = EXCLUDED.price_info,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
        `, [
            sourceCode, sourceId, data.title, data.date, data.start_time, data.end_time,
            data.content_url, data.flyer_front, data.description, data.venue_name,
            data.venue_address, data.venue_city, data.venue_country,
            data.venue_latitude || data.latitude, data.venue_longitude || data.longitude,
            data.price_info ? JSON.stringify(data.price_info) : null
        ]);
        scrapedId = result.rows[0].id;
    } else if (type === 'venue') {
        const result = await pool.query(`
            INSERT INTO scraped_venues (
                source_code, source_venue_id, name, address, city, country,
                latitude, longitude, content_url, capacity
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (source_code, source_venue_id) DO UPDATE SET
                name = EXCLUDED.name,
                address = EXCLUDED.address,
                city = EXCLUDED.city,
                country = EXCLUDED.country,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                content_url = EXCLUDED.content_url,
                capacity = EXCLUDED.capacity,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
        `, [
            sourceCode, sourceId, data.name, data.address, data.city, data.country,
            data.latitude, data.longitude, data.content_url, data.capacity
        ]);
        scrapedId = result.rows[0].id;
    } else if (type === 'artist') {
        const result = await pool.query(`
            INSERT INTO scraped_artists (
                source_code, source_artist_id, name, genres, image_url, content_url
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (source_code, source_artist_id) DO UPDATE SET
                name = EXCLUDED.name,
                genres = EXCLUDED.genres,
                image_url = EXCLUDED.image_url,
                content_url = EXCLUDED.content_url,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
        `, [
            sourceCode, sourceId, data.name,
            data.genres ? JSON.stringify(data.genres) : null,
            data.image_url, data.content_url
        ]);
        scrapedId = result.rows[0].id;
    }

    return { scrapedId, sourceId };
}

// Find matching unified event
async function findMatchingUnifiedEvent(scrapedData, minConfidence = 0.7) {
    if (!scrapedData.date) return null;

    const potentialMatches = await pool.query(`
        SELECT ue.* FROM unified_events ue
        WHERE ue.date = $1
        AND (LOWER(ue.venue_city) = LOWER($2) OR LOWER(ue.venue_name) ILIKE $3)
    `, [scrapedData.date, scrapedData.venue_city || '', `%${scrapedData.venue_name || ''}%`]);

    let bestMatch = null;
    let bestScore = 0;

    for (const potential of potentialMatches.rows) {
        const titleScore = stringSimilarity(scrapedData.title, potential.title);
        const venueScore = stringSimilarity(scrapedData.venue_name, potential.venue_name);
        const score = (titleScore * 0.6) + (venueScore * 0.4);

        if (score > bestScore && score >= minConfidence) {
            bestScore = score;
            bestMatch = potential;
        }
    }

    return bestMatch;
}

// Find matching unified venue
async function findMatchingUnifiedVenue(scrapedData, minConfidence = 0.7) {
    if (!scrapedData.name) return null;

    const potentialMatches = await pool.query(`
        SELECT uv.* FROM unified_venues uv
        WHERE LOWER(uv.city) = LOWER($1) OR similarity(LOWER(uv.name), LOWER($2)) > 0.3
    `, [scrapedData.city || '', scrapedData.name]);

    let bestMatch = null;
    let bestScore = 0;

    for (const potential of potentialMatches.rows) {
        const nameScore = stringSimilarity(scrapedData.name, potential.name);
        const cityScore = scrapedData.city && potential.city ?
            (scrapedData.city.toLowerCase() === potential.city.toLowerCase() ? 1 : 0) : 0;
        const score = (nameScore * 0.8) + (cityScore * 0.2);

        if (score > bestScore && score >= minConfidence) {
            bestScore = score;
            bestMatch = potential;
        }
    }

    return bestMatch;
}

// Find matching unified artist
async function findMatchingUnifiedArtist(scrapedData, minConfidence = 0.85) {
    if (!scrapedData.name) return null;

    const potentialMatches = await pool.query(`
        SELECT ua.* FROM unified_artists ua
        WHERE similarity(LOWER(ua.name), LOWER($1)) > 0.5
    `, [scrapedData.name]);

    let bestMatch = null;
    let bestScore = 0;

    for (const potential of potentialMatches.rows) {
        const score = stringSimilarity(scrapedData.name, potential.name);
        if (score > bestScore && score >= minConfidence) {
            bestScore = score;
            bestMatch = potential;
        }
    }

    return bestMatch;
}

// Refresh unified event with merged data from all sources
async function refreshUnifiedEvent(unifiedId) {
    // Get all linked sources ordered by priority
    const sourcesResult = await pool.query(`
        SELECT se.*, esl.match_confidence, esl.last_synced_at
        FROM event_scraped_links esl
        JOIN scraped_events se ON se.id = esl.scraped_event_id
        WHERE esl.event_id = $1
        ORDER BY 
            CASE se.source_code 
                WHEN 'og' THEN 1 
                WHEN 'ra' THEN 5 
                WHEN 'tm' THEN 6 
                WHEN 'eb' THEN 7
                WHEN 'di' THEN 8
                ELSE 10 
            END ASC
    `, [unifiedId]);

    if (sourcesResult.rows.length === 0) return;

    // Update last_synced_at for all processed links
    await pool.query(`
        UPDATE event_scraped_links
        SET last_synced_at = CURRENT_TIMESTAMP
        WHERE event_id = $1
    `, [unifiedId]);

    const { merged, fieldSources } = mergeSourceData(sourcesResult.rows);

    await pool.query(`
        UPDATE unified_events SET
            title = COALESCE($1, title),
            date = COALESCE($2, date),
            start_time = COALESCE($3, start_time),
            end_time = COALESCE($4, end_time),
            description = COALESCE($5, description),
            flyer_front = COALESCE($6, flyer_front),
            ticket_url = COALESCE($7, ticket_url),
            venue_name = COALESCE($8, venue_name),
            venue_address = COALESCE($9, venue_address),
            venue_city = COALESCE($10, venue_city),
            venue_country = COALESCE($11, venue_country),
            field_sources = $12,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $13
    `, [
        merged.title, merged.date, merged.start_time, merged.end_time,
        merged.description, merged.flyer_front, merged.content_url || merged.ticket_url,
        merged.venue_name, merged.venue_address, merged.venue_city, merged.venue_country,
        JSON.stringify(fieldSources), unifiedId
    ]);
}

// Refresh unified venue with merged data
async function refreshUnifiedVenue(unifiedId) {
    const sourcesResult = await pool.query(`
        SELECT sv.*, vsl.match_confidence
        FROM venue_scraped_links vsl
        JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
        WHERE vsl.venue_id = $1
        ORDER BY 
            CASE sv.source_code 
                WHEN 'og' THEN 1 
                ELSE 10 
            END ASC
    `, [unifiedId]);

    if (sourcesResult.rows.length === 0) return;

    const { merged, fieldSources } = mergeSourceData(sourcesResult.rows, [
        'name', 'address', 'city', 'country', 'latitude', 'longitude', 'content_url', 'capacity'
    ]);

    // Update last_synced_at
    await pool.query(`
        UPDATE venue_scraped_links
        SET last_synced_at = CURRENT_TIMESTAMP
        WHERE venue_id = $1
    `, [unifiedId]);

    await pool.query(`
        UPDATE unified_venues SET
            name = COALESCE($1, name),
            address = COALESCE($2, address),
            city = COALESCE($3, city),
            country = COALESCE($4, country),
            latitude = COALESCE($5, latitude),
            longitude = COALESCE($6, longitude),
            website = COALESCE($7, website),
            capacity = COALESCE($8, capacity),
            field_sources = $9,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $10
    `, [
        merged.name, merged.address, merged.city, merged.country,
        merged.latitude, merged.longitude, merged.content_url, merged.capacity,
        JSON.stringify(fieldSources), unifiedId
    ]);
}

// Refresh unified artist with merged data
async function refreshUnifiedArtist(unifiedId) {
    const sourcesResult = await pool.query(`
        SELECT sa.*, asl.match_confidence
        FROM artist_scraped_links asl
        JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
        WHERE asl.artist_id = $1
        ORDER BY 
            CASE sa.source_code 
                WHEN 'og' THEN 1 
                WHEN 'manual' THEN 1
                WHEN 'musicbrainz' THEN 2
                ELSE 10 
            END ASC
    `, [unifiedId]);

    if (sourcesResult.rows.length === 0) return;

    const { merged, fieldSources } = mergeSourceData(sourcesResult.rows, [
        'name', 'genres', 'country', 'image_url', 'content_url'
    ]);

    // Update last_synced_at
    await pool.query(`
        UPDATE artist_scraped_links
        SET last_synced_at = CURRENT_TIMESTAMP
        WHERE artist_id = $1
    `, [unifiedId]);

    await pool.query(`
        UPDATE unified_artists SET
            name = COALESCE($1, name),
            genres = COALESCE($2, genres),
            country = COALESCE($3, country),
            image_url = COALESCE($4, image_url),
            website = COALESCE($5, website),
            field_sources = $6,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
    `, [
        merged.name, merged.genres, merged.country, merged.image_url,
        merged.content_url, JSON.stringify(fieldSources), unifiedId
    ]);
}

// Find or create unified entry and link to scraped entry
async function linkToUnified(type, scrapedId, scrapedData, existingUnifiedId = null) {
    const priority = getSourcePriority(scrapedData.source_code || 'original');
    let unifiedId = existingUnifiedId;

    if (type === 'event') {
        if (!unifiedId) {
            // Try to find matching unified event
            const match = await findMatchingUnifiedEvent(scrapedData);
            unifiedId = match?.id;
        }

        if (!unifiedId) {
            // Create new unified event
            const result = await pool.query(`
                INSERT INTO unified_events (
                    title, date, start_time, end_time, description, flyer_front,
                    ticket_url, price_info, venue_name, venue_address, venue_city, venue_country
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING id
            `, [
                scrapedData.title, scrapedData.date, scrapedData.start_time, scrapedData.end_time,
                scrapedData.description, scrapedData.flyer_front, scrapedData.content_url,
                scrapedData.price_info, scrapedData.venue_name, scrapedData.venue_address,
                scrapedData.venue_city, scrapedData.venue_country
            ]);
            unifiedId = result.rows[0].id;
        }

        // Create link
        await pool.query(`
            INSERT INTO event_source_links (unified_event_id, scraped_event_id, match_confidence, is_primary, priority)
            VALUES ($1, $2, 1.0, $3, $4)
            ON CONFLICT (unified_event_id, scraped_event_id) DO UPDATE SET
                priority = EXCLUDED.priority,
                is_primary = EXCLUDED.is_primary
        `, [unifiedId, scrapedId, priority === 1, priority]);

        // Refresh merged data on unified event
        await refreshUnifiedEvent(unifiedId);

    } else if (type === 'venue') {
        if (!unifiedId) {
            const match = await findMatchingUnifiedVenue(scrapedData);
            unifiedId = match?.id;
        }

        if (!unifiedId) {
            const result = await pool.query(`
                INSERT INTO unified_venues (name, address, city, country, latitude, longitude, website, capacity)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
            `, [
                scrapedData.name, scrapedData.address, scrapedData.city, scrapedData.country,
                scrapedData.latitude, scrapedData.longitude, scrapedData.content_url, scrapedData.capacity
            ]);
            unifiedId = result.rows[0].id;
        }

        await pool.query(`
            INSERT INTO venue_source_links (unified_venue_id, scraped_venue_id, match_confidence, is_primary, priority)
            VALUES ($1, $2, 1.0, $3, $4)
            ON CONFLICT (unified_venue_id, scraped_venue_id) DO UPDATE SET
                priority = EXCLUDED.priority,
                is_primary = EXCLUDED.is_primary
        `, [unifiedId, scrapedId, priority === 1, priority]);

        await refreshUnifiedVenue(unifiedId);

    } else if (type === 'artist') {
        if (!unifiedId) {
            const match = await findMatchingUnifiedArtist(scrapedData);
            unifiedId = match?.id;
        }

        if (!unifiedId) {
            const result = await pool.query(`
                INSERT INTO unified_artists (name, genres, country, image_url, website)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
            `, [
                scrapedData.name, scrapedData.genres, scrapedData.country,
                scrapedData.image_url, scrapedData.content_url
            ]);
            unifiedId = result.rows[0].id;
        }

        await pool.query(`
            INSERT INTO artist_source_links (unified_artist_id, scraped_artist_id, match_confidence, is_primary, priority)
            VALUES ($1, $2, 1.0, $3, $4)
            ON CONFLICT (unified_artist_id, scraped_artist_id) DO UPDATE SET
                priority = EXCLUDED.priority,
                is_primary = EXCLUDED.is_primary
        `, [unifiedId, scrapedId, priority === 1, priority]);

        await refreshUnifiedArtist(unifiedId);
    }

    return unifiedId;
}

module.exports = {
    mergeSourceData,
    saveOriginalEntry,
    linkToUnified,
    refreshUnifiedEvent,
    refreshUnifiedVenue,
    refreshUnifiedArtist,
    findMatchingUnifiedEvent,
    findMatchingUnifiedVenue,
    findMatchingUnifiedArtist
};
