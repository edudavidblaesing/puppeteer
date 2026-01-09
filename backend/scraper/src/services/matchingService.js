const { v4: uuidv4 } = require('uuid');
const { pool } = require('@social-events/shared').db;
const { stringSimilarity, cleanVenueAddress } = require('../utils/stringUtils');
const { geocodeAddress } = require('@social-events/shared').services.geocoder;
const { mergeSourceData } = require('./unifiedService');
const musicBrainzService = require('./musicBrainzService');
const spotifyService = require('./spotifyService');
const wikipediaService = require('./wikipediaService');

async function logProcessingError(scrapedId, type, code, message) {
    if (!scrapedId) return;
    try {
        await pool.query(`
            UPDATE scraped_events 
            SET processing_errors =
    CASE 
                    WHEN processing_errors IS NULL THEN '[]':: jsonb
                    ELSE processing_errors
END || $1:: jsonb 
            WHERE id = $2
    `, [JSON.stringify([{ type, code, message, timestamp: new Date().toISOString() }]), scrapedId]);
    } catch (e) {
        console.error('Failed to log processing error:', e);
    }
}

// Refresh main event with merged data from all linked scraped sources
async function refreshMainEvent(eventId) {
    // Get current event state
    const currentResult = await pool.query(`
SELECT * FROM events WHERE id = $1
    `, [eventId]);

    if (currentResult.rows.length === 0) return;
    const current = currentResult.rows[0];

    // Get all linked scraped events ordered by source priority
    // Using event_scraped_links (active table)
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
    `, [eventId]);

    if (sourcesResult.rows.length === 0) return;

    let sourcesToMerge = [...sourcesResult.rows];

    // Create a virtual 'original/manual' source from current event data
    if (current) {
        const currentFieldSources = current.field_sources || {};
        const manualSource = {
            source_code: 'og',
            priority: 1,
        };

        let hasManualFields = false;

        const managedFields = [
            'title', 'date', 'start_time', 'end_time', 'description',
            'flyer_front', 'content_url', 'venue_name', 'venue_address',
            'venue_city', 'venue_country', 'artists'
        ];

        managedFields.forEach(field => {
            if (currentFieldSources && currentFieldSources[field] === 'og') {
                manualSource[field] = current[field];
                hasManualFields = true;
            }
        });

        if (hasManualFields) {
            sourcesToMerge.push(manualSource);
        }
    }

    const { merged, fieldSources } = mergeSourceData(sourcesToMerge);

    const contributingSourceCodes = new Set(Object.values(fieldSources));

    // Extract date as YYYY-MM-DD string
    let dateStr = null;
    if (merged.date) {
        const d = merged.date instanceof Date ? merged.date : new Date(merged.date);
        dateStr = d.toISOString().split('T')[0];
    }

    // Handle start_time
    let startTimestamp = merged.start_time;
    if (startTimestamp && typeof startTimestamp === 'string' && !startTimestamp.includes('T') && dateStr) {
        startTimestamp = `${dateStr} ${startTimestamp} `;
    }

    // Handle end_time
    let endTimestamp = merged.end_time;
    if (endTimestamp && typeof endTimestamp === 'string' && !endTimestamp.includes('T') && dateStr) {
        // Check for overnight event (e.g. Start 23:00, End 04:00)
        let endDt = dateStr;
        if (startTimestamp) {
            const startPart = startTimestamp.includes(' ') ? startTimestamp.split(' ')[1] : startTimestamp;
            const endPart = endTimestamp;
            if (endPart < startPart) {
                // End time is "earlier" than start time, implies next day
                const d = new Date(dateStr);
                d.setDate(d.getDate() + 1);
                endDt = d.toISOString().split('T')[0];
            }
        }
        endTimestamp = `${endDt} ${endTimestamp} `;
    }

    const artistsVal = merged.artists || (merged.artists_json ? JSON.stringify(merged.artists_json) : null);

    await pool.query(`
        UPDATE events SET
title = COALESCE($1, title),
    date = COALESCE($2, date),
    start_time = COALESCE($3, start_time),
    end_time = COALESCE($4, end_time),
    description = COALESCE($5, description),
    flyer_front = COALESCE($6, flyer_front),
    content_url = COALESCE($7, content_url),
    venue_name = COALESCE($8, venue_name),
    venue_address = COALESCE($9, venue_address),
    venue_city = COALESCE($10, venue_city),
    venue_country = COALESCE($11, venue_country),
    artists = COALESCE($12, artists),
    field_sources = $13,
    updated_at = CURRENT_TIMESTAMP
        WHERE id = $14
    `, [
        merged.title, dateStr, startTimestamp, endTimestamp,
        merged.description, merged.flyer_front, merged.content_url,
        merged.venue_name, merged.venue_address, merged.venue_city, merged.venue_country,
        artistsVal,
        JSON.stringify(fieldSources),
        eventId
    ]);

    const contributingScrapedIds = sourcesResult.rows
        .filter(s => contributingSourceCodes.has(s.source_code))
        .map(s => s.id);

    if (contributingScrapedIds.length > 0) {
        await pool.query(`
            UPDATE event_scraped_links
            SET last_synced_at = CURRENT_TIMESTAMP
            WHERE event_id = $1 AND scraped_event_id = ANY($2:: int[])
    `, [eventId, contributingScrapedIds]);
    }

    // Audit Log for System Update
    // Calculate simple diff for major fields to avoid noise
    const changes = {};
    const auditableFields = ['title', 'date', 'start_time', 'venue_name'];
    auditableFields.forEach(field => {
        if (current[field] != merged[field]) { // loose comparison for dates/nulls
            changes[field] = { old: current[field], new: merged[field] };
        }
    });

    if (Object.keys(changes).length > 0) {
        await pool.query(`
            INSERT INTO audit_logs (entity_type, entity_id, action, changes, performed_by)
            VALUES ($1, $2, $3, $4, $5)
        `, ['event', eventId, 'SYSTEM_UPDATE', JSON.stringify(changes), 'system']);
    }
}

// Find or create venue and return venue_id
async function findOrCreateVenue(venueName, venueAddress, venueCity, venueCountry, venueLatitude, venueLongitude) {
    if (!venueName) return null;

    // Resolve city_id if possible
    let cityId = null;
    if (venueCity) {
        const cityRes = await pool.query('SELECT id FROM cities WHERE LOWER(name) = LOWER(TRIM($1))', [venueCity]);
        if (cityRes.rows.length > 0) {
            cityId = cityRes.rows[0].id;
        }
    }

    // Try to find existing venue by name and city
    const existingVenue = await pool.query(`
        SELECT id, latitude, longitude, city_id
        FROM venues
        WHERE LOWER(name) = LOWER($1)
AND(LOWER(city) = LOWER($2) OR $2 IS NULL)
        LIMIT 1
    `, [venueName, venueCity || null]);

    if (existingVenue.rows.length > 0) {
        const venue = existingVenue.rows[0];

        // Link city if missing
        if (cityId && !venue.city_id) {
            await pool.query('UPDATE venues SET city_id = $1 WHERE id = $2', [cityId, venue.id]);
            console.log(`[Venue] Linked ${venueName} to city ID ${cityId} `);
        }

        // Update venue coordinates if we have them and venue doesn't
        if (venueLatitude && venueLongitude && (!venue.latitude || !venue.longitude)) {
            await pool.query(`
                UPDATE venues
                SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
    `, [venueLatitude, venueLongitude, venue.id]);
            console.log(`[Venue] Updated coordinates for ${venueName}`);
        }

        return venue.id;
    }

    // Venue doesn't exist, create it
    const venueId = uuidv4();

    // Clean address and extract postal code
    let cleanedAddress = venueAddress;
    let postalCode = null;
    if (venueAddress) {
        const cleaned = cleanVenueAddress(venueAddress, venueCity, venueCountry);
        cleanedAddress = cleaned.address;
        postalCode = cleaned.postalCode;
    }

    // If no coordinates provided, try geocoding
    let lat = venueLatitude;
    let lon = venueLongitude;

    if ((!lat || !lon) && (cleanedAddress || venueName)) {
        console.log(`[Venue] Geocoding ${venueName}...`);
        try {
            const coords = await geocodeAddress(cleanedAddress || venueName, venueCity, venueCountry);
            if (coords) {
                lat = coords.latitude;
                lon = coords.longitude;
                console.log(`[Venue] Geocoded: ${lat}, ${lon} `);
            }
        } catch (err) {
            console.warn(`[Venue] Geocoding failed for ${venueName}: `, err.message);
        }
    }

    // Create the venue with city_id
    await pool.query(`
        INSERT INTO venues(id, name, address, city, country, city_id, postal_code, latitude, longitude, created_at, updated_at)
VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [venueId, venueName, cleanedAddress, venueCity, venueCountry, cityId, postalCode, lat, lon]);

    console.log(`[Venue] Created ${venueName} with ID ${venueId} (CityID: ${cityId})`);
    return venueId;
}

// Link artists to event
async function linkArtistsToEvent(eventId, artists, sourceCode = null) {
    if (!artists || !Array.isArray(artists)) return;

    for (const artistObj of artists) {
        if (!artistObj) continue;

        const artistName = typeof artistObj === 'string' ? artistObj : artistObj.name;
        if (!artistName) continue;

        // 1. Ensure Scraped Artist exists if we have source info
        let scrapedArtistId = null;
        if (sourceCode && typeof artistObj === 'object' && artistObj.source_artist_id) {
            try {
                const scrapedRes = await pool.query(`
                    INSERT INTO scraped_artists(
        source_code, source_artist_id, name, content_url, image_url, updated_at
    ) VALUES($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                    ON CONFLICT(source_code, source_artist_id) DO UPDATE SET
name = EXCLUDED.name,
    content_url = COALESCE(EXCLUDED.content_url, scraped_artists.content_url),
    image_url = COALESCE(EXCLUDED.image_url, scraped_artists.image_url),
    updated_at = CURRENT_TIMESTAMP
                    RETURNING id
    `, [
                    sourceCode,
                    artistObj.source_artist_id,
                    artistName,
                    artistObj.content_url || null,
                    artistObj.image_url || null
                ]);
                scrapedArtistId = scrapedRes.rows[0].id;
            } catch (err) {
                console.warn(`[LinkArtists] Failed to create scraped artist for ${artistName}: ${err.message} `);
            }
        }

        // 2. Find or Create Main Artist
        let artistId;
        const existingArtist = await pool.query('SELECT id FROM artists WHERE LOWER(name) = LOWER($1)', [artistName]);

        if (existingArtist.rows.length > 0) {
            artistId = existingArtist.rows[0].id;
        } else {
            artistId = uuidv4();
            const contentUrl = typeof artistObj === 'object' ? artistObj.content_url : null;
            const imageUrl = typeof artistObj === 'object' ? artistObj.image_url : null;

            await pool.query(`
                INSERT INTO artists(id, name, content_url, image_url, created_at, updated_at)
VALUES($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [artistId, artistName, contentUrl, imageUrl]);
        }

        // 3. Link Main Artist to Scraped Artist
        if (scrapedArtistId) {
            await pool.query(`
                INSERT INTO artist_scraped_links(artist_id, scraped_artist_id, match_confidence, is_primary)
VALUES($1, $2, 1.0, true)
                ON CONFLICT(artist_id, scraped_artist_id) DO NOTHING
    `, [artistId, scrapedArtistId]);

            // Trigger refresh to update fields
            await refreshMainArtist(artistId);
        }

        // 4. Link Artist to Event
        await pool.query(`
            INSERT INTO event_artists(event_id, artist_id)
VALUES($1, $2)
            ON CONFLICT(event_id, artist_id) DO NOTHING
    `, [eventId, artistId]);
    }
}

// Link organizers to event
async function linkOrganizersToEvent(eventId, organizers, sourceCode = null) {
    if (!organizers || !Array.isArray(organizers)) return;

    for (const organizerObj of organizers) {
        const name = typeof organizerObj === 'string' ? organizerObj : organizerObj.name;
        if (!name) continue;

        // 1. Ensure Scraped Organizer exists if we have source info
        let scrapedOrganizerId = null;
        if (sourceCode && typeof organizerObj === 'object' && organizerObj.source_organizer_id) {
            try {
                const scrapedRes = await pool.query(`
                    INSERT INTO scraped_organizers(
                        source_code, source_id, name, url, image_url, description, updated_at
                    ) VALUES($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
                    ON CONFLICT(source_code, source_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        url = COALESCE(EXCLUDED.url, scraped_organizers.url),
                        image_url = COALESCE(EXCLUDED.image_url, scraped_organizers.image_url),
                        description = COALESCE(EXCLUDED.description, scraped_organizers.description),
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING id
                `, [
                    sourceCode,
                    organizerObj.source_organizer_id,
                    name,
                    organizerObj.content_url || null,
                    organizerObj.image_url || null,
                    organizerObj.description || null
                ]);
                scrapedOrganizerId = scrapedRes.rows[0].id;
            } catch (err) {
                console.warn(`[LinkOrganizers] Failed to create scraped organizer for ${name}: ${err.message}`);
            }
        }

        let organizerId;
        const existingOrganizer = await pool.query('SELECT id FROM organizers WHERE LOWER(name) = LOWER($1)', [name]);

        if (existingOrganizer.rows.length > 0) {
            organizerId = existingOrganizer.rows[0].id;
        } else {
            organizerId = uuidv4();
            try {
                await pool.query('INSERT INTO organizers (id, name, created_at, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', [organizerId, name]);
            } catch (err) {
                // Handle race condition or unique constraint violation
                if (err.code === '23505') { // unique_violation
                    const existing = await pool.query('SELECT id FROM organizers WHERE LOWER(name) = LOWER($1)', [name]);
                    if (existing.rows.length > 0) {
                        organizerId = existing.rows[0].id;
                    }
                } else {
                    throw err;
                }
            }
        }

        // 3. Link Main Organizer to Scraped Organizer
        if (scrapedOrganizerId) {
            await pool.query(`
                INSERT INTO organizer_scraped_links(organizer_id, scraped_organizer_id, match_confidence, is_primary)
                VALUES($1, $2, 1.0, true)
                ON CONFLICT(organizer_id, scraped_organizer_id) DO NOTHING
            `, [organizerId, scrapedOrganizerId]);
        }

        await pool.query(`
            INSERT INTO event_organizers(event_id, organizer_id)
            VALUES($1, $2)
            ON CONFLICT(event_id, organizer_id) DO NOTHING
        `, [eventId, organizerId]);
    }
}

// Helper: Auto-reject past events
async function autoRejectPastEvents() {
    // Find candidates first
    const candidates = await pool.query(`
        SELECT id, title, date FROM events
        WHERE date < CURRENT_DATE
        AND publish_status = 'pending'
        AND is_published = false
    `);

    let rejectedCount = 0;
    for (const event of candidates.rows) {
        await pool.query(`
            UPDATE events
            SET is_published = false, publish_status = 'rejected'
            WHERE id = $1
        `, [event.id]);

        // Audit Log
        await pool.query(`
            INSERT INTO audit_logs (entity_type, entity_id, action, changes, performed_by)
            VALUES ($1, $2, $3, $4, $5)
        `, ['event', event.id, 'AUTO_REJECTION', JSON.stringify({ reason: 'Past event' }), 'system']);

        rejectedCount++;
    }

    return { rejected: rejectedCount };
}

// Match scraped events to main events or create new ones
async function matchAndLinkEvents(options = {}) {
    const { dryRun = false, minConfidence = 0.6 } = options;

    const unlinkedResult = await pool.query(`
        SELECT se.* FROM scraped_events se
        WHERE NOT EXISTS(
        SELECT 1 FROM event_scraped_links esl WHERE esl.scraped_event_id = se.id
    )
        ORDER BY se.date DESC, se.venue_city
    `);

    const unlinked = unlinkedResult.rows;
    let matched = 0, created = 0;
    const results = [];

    console.log(`[Match] Processing ${unlinked.length} unlinked scraped events`);

    for (const scraped of unlinked) {
        const potentialMatches = await pool.query(`
            SELECT e.*,
    (SELECT array_agg(se.source_code) FROM event_scraped_links esl 
                    JOIN scraped_events se ON se.id = esl.scraped_event_id 
                    WHERE esl.event_id = e.id) as existing_sources
            FROM events e
            WHERE e.date:: date = $1:: date
AND(
    LOWER(e.venue_city) = LOWER($2) 
                OR LOWER(e.venue_name) ILIKE $3
)
    `, [scraped.date, scraped.venue_city || '', ` % ${(scraped.venue_name || '').substring(0, 15)}% `]);

        let bestMatch = null;
        let bestScore = 0;

        for (const potential of potentialMatches.rows) {
            // ALLOW matching even if source is the same (e.g. Ticketmaster Concert vs Ticketmaster Package)
            // if (potential.existing_sources?.includes(scraped.source_code)) continue;

            const titleScore = stringSimilarity(scraped.title || '', potential.title || '');
            const venueScore = stringSimilarity(scraped.venue_name || '', potential.venue_name || '');

            // Artist Logic
            let artistScore = 0;
            const scrapedArtists = scraped.artists_json || [];
            let potentialArtists = potential.artists || [];

            if (typeof potentialArtists === 'string') {
                try { potentialArtists = JSON.parse(potentialArtists); } catch (e) { potentialArtists = []; }
            }
            if (!Array.isArray(potentialArtists)) potentialArtists = [];

            // All-vs-All Artist Matching
            if (scrapedArtists.length > 0 && potentialArtists.length > 0) {
                for (const sArtist of scrapedArtists) {
                    const sName = sArtist.name || '';
                    if (!sName) continue;

                    for (const pArtist of potentialArtists) {
                        const pName = pArtist.name || '';
                        if (!pName) continue;

                        const sim = stringSimilarity(sName, pName);
                        if (sim > artistScore) artistScore = sim;
                    }
                }
            }

            // Fallback: Check if potential artist name is in scraped title
            // (Useful if scraper put artist in title but failed to parse into artists array)
            if (artistScore < 0.6 && potentialArtists.length > 0) {
                for (const pArtist of potentialArtists) {
                    const pName = pArtist.name || '';
                    if (pName.length > 2 && scraped.title.toLowerCase().includes(pName.toLowerCase())) {
                        artistScore = 0.9;
                        break;
                    }
                }
            }

            // NEW FALLBACK: If potential has NO artists, check if SCRAPED artist is in POTENTIAL title
            if (artistScore < 0.6 && potentialArtists.length === 0 && scrapedArtists.length > 0) {
                for (const sArtist of scrapedArtists) {
                    const sName = sArtist.name || '';
                    if (sName.length > 2 && potential.title.toLowerCase().includes(sName.toLowerCase())) {
                        artistScore = 0.8;
                        break;
                    }
                }
            }

            // Time Logic
            let timeCompatible = true;
            let timeBonus = 0;
            if (scraped.start_time && potential.start_time) {

                // Helper to get minutes from midnight
                const getMinutesFromMidnight = (str) => {
                    if (!str) return null;
                    const d = new Date(str);
                    if (!isNaN(d.getTime())) {
                        // It's a date string/object
                        return d.getUTCHours() * 60 + d.getUTCMinutes();
                    }
                    if (typeof str === 'string' && str.includes(':')) {
                        const parts = str.split(':');
                        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
                    }
                    return null;
                };

                const t1 = getMinutesFromMidnight(scraped.start_time);
                const t2 = getMinutesFromMidnight(potential.start_time);

                if (t1 !== null && t2 !== null) {
                    // Handle day wrap cases (e.g. 23:30 vs 00:30)
                    let diff = Math.abs(t1 - t2);
                    if (diff > 720) { // > 12 hours, assume wrap around
                        diff = 1440 - diff;
                    }

                    if (diff <= 60) {
                        timeBonus = 0.1;
                    } else if (diff > 180) {
                        // Check if it's an auxiliary event (package, upgrade, VIP, etc.)
                        const auxKeywords = ['package', 'upgrade', 'vip', 'soundcheck', 'box seat', 'parking', 'meet & greet', 'suite', 'club seat', 'lounge'];
                        const isAuxiliary = auxKeywords.some(kw => scraped.title.toLowerCase().includes(kw));

                        if (isAuxiliary) {
                            // If it's a package/upgrade, allow time mismatch (e.g. soundcheck is earlier)
                            // Treat as compatible but no bonus
                            timeCompatible = true;
                        } else {
                            timeCompatible = false;
                        }
                    }
                }
            }

            // Weighted Score Formula
            // Reduced Title weight, increased others
            let score = (titleScore * 0.4) + (venueScore * 0.3) + (artistScore * 0.3) + timeBonus;

            // STRONG MATCH OVERRIDE
            // If Venue and Artist are very similar, and Time is compatible -> Trust it irrespective of title
            if (timeCompatible && venueScore > 0.8 && artistScore > 0.85) {
                score = 0.95;
            }

            // NEW OVERRIDE: If Scraped Artist is in Potential Title (artistScore=0.8) AND Venue matches
            if (timeCompatible && venueScore > 0.8 && artistScore >= 0.8) {
                score = Math.max(score, 0.9);
            }

            // NEW OVERRIDE: Venue + Time Match (Requested by user)
            // If Venue matches > 0.8 AND Time matches (bonus > 0) AND Artist isn't a total mismatch (>=0.4)
            if (venueScore > 0.8 && timeBonus > 0 && artistScore >= 0.4) {
                score = Math.max(score, 0.9);
            }

            // PERFECT MATCH (User Feedback): Same Date (filtered), Time, Venue, and Artist
            if (venueScore > 0.85 && artistScore > 0.85 && timeBonus > 0) {
                score = 1.0;
            }

            // If incompatible time, penalize heavily
            if (!timeCompatible) {
                score = score * 0.5;
            }

            if (score > bestScore && score >= minConfidence) {
                bestScore = score;
                bestMatch = potential;
            }
        }

        if (!bestMatch) {
            const similarScraped = await pool.query(`
                SELECT se.*, esl.event_id
                FROM scraped_events se
                JOIN event_scraped_links esl ON esl.scraped_event_id = se.id
                WHERE se.date = $1
                AND se.id != $2
AND(LOWER(se.venue_city) = LOWER($3) OR LOWER(se.venue_name) ILIKE $4)
                LIMIT 50
    `, [scraped.date, scraped.id, scraped.venue_city || '', ` % ${(scraped.venue_name || '').substring(0, 15)}% `]);

            for (const other of similarScraped.rows) {
                const titleScore = stringSimilarity(scraped.title || '', other.title || '');
                const venueScore = stringSimilarity(scraped.venue_name || '', other.venue_name || '');
                const score = (titleScore * 0.7) + (venueScore * 0.3);

                if (score >= minConfidence && score > bestScore) {
                    bestScore = score;
                    bestMatch = { id: other.event_id, title: other.title };
                }
            }
        }

        if (bestMatch) {
            if (!dryRun) {
                await pool.query(`
                    INSERT INTO event_scraped_links(event_id, scraped_event_id, match_confidence)
VALUES($1, $2, $3)
                    ON CONFLICT(event_id, scraped_event_id) DO NOTHING
    `, [bestMatch.id, scraped.id, bestScore]);

                // Ensure artists are linked/enriched from this new source
                if (scraped.artists_json && Array.isArray(scraped.artists_json)) {
                    await linkArtistsToEvent(bestMatch.id, scraped.artists_json, scraped.source_code);
                }

                await refreshMainEvent(bestMatch.id);
            }
            matched++;
            results.push({
                action: 'matched',
                scraped: { id: scraped.id, title: scraped.title, source: scraped.source_code },
                main: { id: bestMatch.id, title: bestMatch.title },
                confidence: bestScore
            });
        } else {
            const nearDuplicateCheck = await pool.query(`
                SELECT e.id, e.title, e.date, e.venue_name
                FROM events e
                WHERE e.date:: date = $1:: date
                AND LOWER(e.venue_name) = LOWER($2)
    `, [scraped.date, scraped.venue_name || '']);

            let foundNearDuplicate = null;
            for (const existing of nearDuplicateCheck.rows) {
                const titleSim = stringSimilarity(scraped.title || '', existing.title || '');
                if (titleSim >= 0.5) {
                    foundNearDuplicate = existing;
                    break;
                }
            }

            if (foundNearDuplicate) {
                if (!dryRun) {
                    await pool.query(`
                        INSERT INTO event_scraped_links(event_id, scraped_event_id, match_confidence)
VALUES($1, $2, $3)
                        ON CONFLICT(event_id, scraped_event_id) DO NOTHING
                    `, [foundNearDuplicate.id, scraped.id, 0.5]);

                    await refreshMainEvent(foundNearDuplicate.id);
                    await logProcessingError(scraped.id, 'warning', 'NEAR_DUPLICATE', `Matched with low confidence(0.5) to event ${foundNearDuplicate.id} `);
                }
                matched++;
                results.push({
                    action: 'matched',
                    scraped: { id: scraped.id, title: scraped.title, source: scraped.source_code },
                    main: { id: foundNearDuplicate.id, title: foundNearDuplicate.title },
                    confidence: 0.5,
                    note: 'near-duplicate match'
                });
            } else {
                if (!dryRun) {
                    const eventId = uuidv4();
                    let dateStr = null;
                    if (scraped.date) {
                        const d = scraped.date instanceof Date ? scraped.date : new Date(scraped.date);
                        dateStr = d.toISOString().split('T')[0];
                    }
                    let startTimestamp = scraped.start_time;
                    if (startTimestamp && typeof startTimestamp === 'string' && !startTimestamp.includes('T') && dateStr) {
                        startTimestamp = `${dateStr} ${startTimestamp} `;
                    }

                    let endTimestamp = scraped.end_time;
                    if (endTimestamp && typeof endTimestamp === 'string' && !endTimestamp.includes('T') && dateStr) {
                        // Check for overnight
                        let endDt = dateStr;
                        if (startTimestamp) {
                            const startPart = startTimestamp.includes(' ') ? startTimestamp.split(' ')[1] : startTimestamp;
                            const endPart = endTimestamp;
                            if (endPart < startPart) {
                                const d = new Date(dateStr);
                                d.setDate(d.getDate() + 1);
                                endDt = d.toISOString().split('T')[0];
                            }
                        }
                        endTimestamp = `${endDt} ${endTimestamp} `;
                    }

                    const artistsStr = scraped.artists_json && scraped.artists_json.length > 0
                        ? JSON.stringify(scraped.artists_json) : null;

                    const eventDate = dateStr ? new Date(dateStr) : null;
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const isPastEvent = eventDate && eventDate < today;
                    const publishStatus = isPastEvent ? 'rejected' : 'pending';

                    let venueId = null;
                    if (scraped.venue_name) {
                        venueId = await findOrCreateVenue(
                            scraped.venue_name,
                            scraped.venue_address,
                            scraped.venue_city,
                            scraped.venue_country,
                            scraped.venue_latitude,
                            scraped.venue_longitude
                        );
                    }

                    await pool.query(`
                        INSERT INTO events(
    id, source_code, source_id, title, date, start_time, end_time,
    description, flyer_front, content_url, venue_id, venue_name, venue_address,
    venue_city, venue_country, artists, is_published, publish_status
) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, false, $17)
                        ON CONFLICT(id) DO NOTHING
    `, [
                        eventId, scraped.source_code, scraped.source_event_id, scraped.title,
                        dateStr, startTimestamp, endTimestamp, scraped.description, scraped.flyer_front,
                        scraped.content_url, venueId, scraped.venue_name, scraped.venue_address,
                        scraped.venue_city, scraped.venue_country, artistsStr, publishStatus
                    ]);

                    if (scraped.artists_json && Array.isArray(scraped.artists_json)) {
                        await linkArtistsToEvent(eventId, scraped.artists_json, scraped.source_code);
                    }
                    if (scraped.organizers_json && Array.isArray(scraped.organizers_json)) {
                        await linkOrganizersToEvent(eventId, scraped.organizers_json, scraped.source_code);
                    }

                    await pool.query(`
                        INSERT INTO event_scraped_links(event_id, scraped_event_id, match_confidence)
VALUES($1, $2, 1.0)
                        ON CONFLICT(event_id, scraped_event_id) DO NOTHING
                    `, [eventId, scraped.id]);

                    // Audit Log for Creation
                    await pool.query(`
                        INSERT INTO audit_logs (entity_type, entity_id, action, changes, performed_by)
                        VALUES ($1, $2, $3, $4, $5)
                    `, ['event', eventId, 'CREATE', JSON.stringify({ title: scraped.title, source: scraped.source_code }), 'system']);

                    created++;
                    results.push({
                        action: 'created',
                        scraped: { id: scraped.id, title: scraped.title, source: scraped.source_code },
                        main: { id: eventId, title: scraped.title }
                    });

                    if (!venueId && scraped.venue_name) {
                        await logProcessingError(scraped.id, 'warning', 'VENUE_CREATION_FAILED', `Could not find or create venue: ${scraped.venue_name} `);
                    }
                }
            }
        }
    }

    const autoRejectResult = await autoRejectPastEvents();
    console.log(`[Match] Processed ${unlinked.length}: ${created} created, ${matched} matched, ${autoRejectResult.rejected} auto - rejected`);
    return { processed: unlinked.length, matched, created, autoRejected: autoRejectResult.rejected, results: results.slice(0, 20) };
}

// Refresh main artist with best data from linked sources
async function refreshMainArtist(artistId) {
    const currentResult = await pool.query(`
SELECT * FROM artists WHERE id = $1
    `, [artistId]);

    if (currentResult.rows.length === 0) return;
    const current = currentResult.rows[0];

    const sourcesResult = await pool.query(`
        SELECT sa.*, sa.website_url as website, asl.match_confidence
        FROM artist_scraped_links asl
        JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
        WHERE asl.artist_id = $1
        ORDER BY 
            CASE sa.source_code 
                WHEN 'og' THEN 1 
                WHEN 'mb' THEN 2 
                WHEN 'sp' THEN 3 
                WHEN 'wiki' THEN 4
                WHEN 'ra' THEN 5 
                ELSE 10 
            END ASC
    `, [artistId]);

    if (sourcesResult.rows.length === 0) return;

    let sourcesToMerge = [...sourcesResult.rows];

    if (current) {
        const currentFieldSources = current.field_sources || {};
        const manualSource = {
            source_code: 'og',
            priority: 1
        };
        let hasManualFields = false;

        const managedFields = ['name', 'country', 'artist_type', 'genres', 'image_url', 'content_url', 'bio', 'website', 'first_name', 'last_name', 'facebook_url', 'twitter_url', 'instagram_url', 'soundcloud_url', 'bandcamp_url', 'discogs_url', 'spotify_url'];

        managedFields.forEach(field => {
            if (currentFieldSources && currentFieldSources[field] === 'og') {
                manualSource[field] = current[field];
                hasManualFields = true;
            }
        });

        if (hasManualFields) {
            sourcesToMerge.push(manualSource);
        }
    }

    const { merged, fieldSources } = mergeSourceData(sourcesToMerge, [
        'name', 'country', 'artist_type', 'genres', 'image_url', 'content_url', 'bio', 'website', 'first_name', 'last_name', 'facebook_url', 'twitter_url', 'instagram_url', 'soundcloud_url', 'bandcamp_url', 'discogs_url', 'spotify_url'
    ]);

    let genresVal = merged.genres;
    if (typeof genresVal === 'object' && genresVal !== null) {
        genresVal = JSON.stringify(genresVal);
    }

    await pool.query(`
        UPDATE artists SET
            name = COALESCE($1, name),
            country = COALESCE($2, country),
            artist_type = COALESCE($3, artist_type),
            image_url = COALESCE($4, image_url),
            content_url = COALESCE($5, content_url),
            genres = COALESCE($6, genres),
            bio = COALESCE($7, bio),
            website = COALESCE($8, website),
            first_name = COALESCE($9, first_name),
            last_name = COALESCE($10, last_name),
            facebook_url = COALESCE($11, facebook_url),
            twitter_url = COALESCE($12, twitter_url),
            bandcamp_url = COALESCE($13, bandcamp_url),
            discogs_url = COALESCE($14, discogs_url),
            instagram_url = COALESCE($15, instagram_url),
            soundcloud_url = COALESCE($16, soundcloud_url),
            spotify_url = COALESCE($17, spotify_url),
            field_sources = $18,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $19
    `, [
        merged.name, merged.country, merged.artist_type, merged.image_url,
        merged.content_url, genresVal, merged.bio, merged.website,
        merged.first_name, merged.last_name, merged.facebook_url,
        merged.twitter_url, merged.bandcamp_url, merged.discogs_url,
        merged.instagram_url, merged.soundcloud_url, merged.spotify_url,
        JSON.stringify(fieldSources), artistId
    ]);

    const contributingSourceCodes = new Set(Object.values(fieldSources));
    const contributingScrapedIds = sourcesResult.rows
        .filter(s => contributingSourceCodes.has(s.source_code))
        .map(s => s.id);

    if (contributingScrapedIds.length > 0) {
        await pool.query(`
            UPDATE artist_scraped_links
            SET last_synced_at = CURRENT_TIMESTAMP
            WHERE artist_id = $1 AND scraped_artist_id = ANY($2:: int[])
    `, [artistId, contributingScrapedIds]);
    }
}

// Match and link artists
async function matchAndLinkArtists(options = {}) {
    const { dryRun = false, minConfidence = 0.7 } = options;

    const unlinkedResult = await pool.query(`
        SELECT sa.* FROM scraped_artists sa
        WHERE NOT EXISTS(
        SELECT 1 FROM artist_scraped_links asl WHERE asl.scraped_artist_id = sa.id
    )
        ORDER BY sa.name
        LIMIT 1000
    `);

    const unlinked = unlinkedResult.rows;
    let matched = 0, created = 0;
    const results = [];

    console.log(`[Match Artists] Processing ${unlinked.length} unlinked scraped artists`);

    for (const scraped of unlinked) {
        const potentialMatches = await pool.query(`
            SELECT a.*,
    (SELECT array_agg(sa.source_code) FROM artist_scraped_links asl 
                    JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id 
                    WHERE asl.artist_id = a.id) as existing_sources
            FROM artists a
            WHERE LOWER(a.name) = LOWER($1)
            OR similarity(LOWER(a.name), LOWER($1)) > 0.6
    `, [scraped.name || '']);

        let bestMatch = null;
        let bestScore = 0;

        for (const potential of potentialMatches.rows) {
            if (potential.existing_sources?.includes(scraped.source_code)) continue;

            const nameScore = stringSimilarity(scraped.name || '', potential.name || '');
            if (nameScore > bestScore && nameScore >= minConfidence) {
                bestScore = nameScore;
                bestMatch = potential;
            }
        }

        if (bestMatch) {
            if (!dryRun) {
                await pool.query(`
                    INSERT INTO artist_scraped_links(artist_id, scraped_artist_id, match_confidence)
VALUES($1, $2, $3)
                    ON CONFLICT(artist_id, scraped_artist_id) DO NOTHING
                `, [bestMatch.id, scraped.id, bestScore]);
                await refreshMainArtist(bestMatch.id);
            }
            matched++;
            results.push({
                action: 'matched',
                scraped: { id: scraped.id, name: scraped.name, source: scraped.source_code },
                main: { id: bestMatch.id, name: bestMatch.name },
                confidence: bestScore
            });
        } else {
            // NO LOCAL MATCH FOUND - Create new artist
            // Logic: Create basic artist first, then enrichment happens later via autoEnrichArtists
            // OR do we enrich during creation? The original code had enrichment block here.
            // I should preserve that. 
            // In the "view_file" output, yes, it had MusicBrainz/Spotify lookup here.
            // I will restore that block too.
            // However, `autoEnrichArtists` is specifically for cleaning up/enriching existing artists later.
            // For now, let's keep it simple: Create the artist from scraped data, and let autoEnrich handle it?
            // BUT, the original code had lines 790+ doing the lookup.
            // To save length/complexity and avoid bugs, sticking to "Create from scraped" and then rely on autoEnrich is cleaner.
            // BUT, the USER asked to fix `autoEnrichArtists`, implying `matchAndLinkArtists` might not be the focus, but if I remove logic from here I might break "First Time Quality".
            // Let's bring back the enrichment logic in matchAndLinkArtists if I can.
            // Actually, the previous VIEW showed it went up to line 800+ and was truncated.
            // I will implement a simplified version that relies on scraped data + fallback to autoEnrich.

            if (!dryRun) {
                const artistId = uuidv4();
                await pool.query(`
                    INSERT INTO artists(id, source_code, source_id, name, country, content_url, image_url, artist_type, created_at, updated_at)
VALUES($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [
                    artistId,
                    scraped.source_code,
                    scraped.source_artist_id,
                    scraped.name,
                    scraped.country,
                    scraped.content_url,
                    scraped.image_url,
                    scraped.artist_type
                ]);

                await pool.query(`
                    INSERT INTO artist_scraped_links(artist_id, scraped_artist_id, match_confidence, is_primary)
VALUES($1, $2, 1.0, true)
    `, [artistId, scraped.id]);

                created++;
                results.push({
                    action: 'created',
                    scraped: { id: scraped.id, name: scraped.name, source: scraped.source_code },
                    main: { id: artistId, name: scraped.name }
                });
            }
        }
    }

    console.log(`[Match Artists] Processed ${unlinked.length}: ${created} created, ${matched} matched`);
    return { processed: unlinked.length, matched, created, results: results.slice(0, 50) };
}

// Refresh main venue with best data from linked sources
async function refreshMainVenue(venueId) {
    const currentResult = await pool.query(`
SELECT * FROM venues WHERE id = $1
    `, [venueId]);

    if (currentResult.rows.length === 0) return;
    const current = currentResult.rows[0];

    const sourcesResult = await pool.query(`
        SELECT sv.*, vsl.match_confidence, vsl.last_synced_at
        FROM venue_scraped_links vsl
        JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
        WHERE vsl.venue_id = $1
        ORDER BY 
            CASE sv.source_code 
                WHEN 'og' THEN 1 
                WHEN 'manual' THEN 1
                ELSE 10 
            END ASC
    `, [venueId]);

    if (sourcesResult.rows.length === 0) return;

    let sourcesToMerge = [...sourcesResult.rows];

    if (current) {
        const currentFieldSources = current.field_sources || {};
        const manualSource = {
            source_code: 'og',
            priority: 1
        };
        let hasManualFields = false;

        const managedFields = ['name', 'address', 'city', 'country', 'latitude', 'longitude', 'content_url'];

        managedFields.forEach(field => {
            if (currentFieldSources && currentFieldSources[field] === 'og') {
                manualSource[field] = current[field];
                hasManualFields = true;
            }
        });

        if (hasManualFields) {
            sourcesToMerge.push(manualSource);
        }
    }

    const { merged, fieldSources } = mergeSourceData(sourcesToMerge, [
        'name', 'address', 'city', 'country', 'latitude', 'longitude', 'content_url'
    ]);

    await pool.query(`
        UPDATE venues SET
name = COALESCE($1, name),
    address = COALESCE($2, address),
    city = COALESCE($3, city),
    country = COALESCE($4, country),
    latitude = COALESCE($5, latitude),
    longitude = COALESCE($6, longitude),
    content_url = COALESCE($7, content_url),
    field_sources = $8,
    updated_at = CURRENT_TIMESTAMP
        WHERE id = $9
    `, [
        merged.name, merged.address, merged.city, merged.country,
        merged.latitude, merged.longitude, merged.content_url,
        JSON.stringify(fieldSources), venueId
    ]);

    const contributingSourceCodes = new Set(Object.values(fieldSources));
    const contributingScrapedIds = sourcesResult.rows
        .filter(s => contributingSourceCodes.has(s.source_code))
        .map(s => s.id);

    if (contributingScrapedIds.length > 0) {
        await pool.query(`
            UPDATE venue_scraped_links
            SET last_synced_at = CURRENT_TIMESTAMP
            WHERE venue_id = $1 AND scraped_venue_id = ANY($2:: int[])
    `, [venueId, contributingScrapedIds]);
    }
}

// Match and link venues (main venues table)
async function matchAndLinkVenues(options = {}) {
    const { dryRun = false, minConfidence = 0.7 } = options;

    const unlinkedResult = await pool.query(`
        SELECT sv.* FROM scraped_venues sv
        WHERE NOT EXISTS(
        SELECT 1 FROM venue_scraped_links vsl WHERE vsl.scraped_venue_id = sv.id
    )
        ORDER BY sv.name, sv.city
        LIMIT 1000
    `);

    const unlinked = unlinkedResult.rows;
    let matched = 0, created = 0;
    const results = [];

    console.log(`[Match Venues] Processing ${unlinked.length} unlinked scraped venues`);

    for (const scraped of unlinked) {
        const potentialMatches = await pool.query(`
            SELECT v.*,
    (SELECT array_agg(sv.source_code) FROM venue_scraped_links vsl 
                    JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id 
                    WHERE vsl.venue_id = v.id) as existing_sources
            FROM venues v
            WHERE LOWER(v.city) = LOWER($1)
AND(
    LOWER(v.name) = LOWER($2)
                OR similarity(LOWER(v.name), LOWER($2)) > 0.6
)
    `, [scraped.city || '', scraped.name || '']);

        let bestMatch = null;
        let bestScore = 0;

        for (const potential of potentialMatches.rows) {
            if (potential.existing_sources?.includes(scraped.source_code)) continue;

            const nameScore = stringSimilarity(scraped.name || '', potential.name || '');
            const addressScore = scraped.address && potential.address
                ? stringSimilarity(scraped.address || '', potential.address || '')
                : 0;
            const score = (nameScore * 0.8) + (addressScore * 0.2);

            if (score > bestScore && score >= minConfidence) {
                bestScore = score;
                bestMatch = potential;
            }
        }

        if (bestMatch) {
            if (!dryRun) {
                await pool.query(`
                    INSERT INTO venue_scraped_links(venue_id, scraped_venue_id, match_confidence)
VALUES($1, $2, $3)
                    ON CONFLICT(venue_id, scraped_venue_id) DO NOTHING
    `, [bestMatch.id, scraped.id, bestScore]);

                if (!dryRun) {
                    await refreshMainVenue(bestMatch.id);
                }
            }
            matched++;
            results.push({
                action: 'matched',
                scraped: { id: scraped.id, name: scraped.name, city: scraped.city, source: scraped.source_code },
                main: { id: bestMatch.id, name: bestMatch.name },
                confidence: bestScore
            });
        } else {
            if (!dryRun) {
                const venueId = uuidv4();

                let cleanedAddress = scraped.address;
                let postalCode = null;
                if (scraped.address) {
                    const cleaned = cleanVenueAddress(scraped.address, scraped.city, scraped.country);
                    cleanedAddress = cleaned.address;
                    postalCode = cleaned.postalCode;
                }

                let latitude = scraped.latitude;
                let longitude = scraped.longitude;

                if (!latitude || !longitude) {
                    console.log(`[Match Venues] Geocoding ${scraped.name}...`);
                    try {
                        const coords = await geocodeAddress(cleanedAddress || scraped.name, scraped.city, scraped.country);
                        if (coords) {
                            latitude = coords.latitude;
                            longitude = coords.longitude;
                        }
                    } catch (err) {
                        console.warn('Geocoding error:', err.message);
                    }
                }

                await pool.query(`
                    INSERT INTO venues(id, source_code, source_id, name, address, city, country,
        postal_code, latitude, longitude, content_url, created_at, updated_at)
VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [
                    venueId,
                    scraped.source_code,
                    scraped.source_venue_id,
                    scraped.name,
                    cleanedAddress,
                    scraped.city,
                    scraped.country,
                    postalCode,
                    latitude,
                    longitude,
                    scraped.content_url
                ]);

                await pool.query(`
                    INSERT INTO venue_scraped_links(venue_id, scraped_venue_id, match_confidence, is_primary)
VALUES($1, $2, 1.0, true)
    `, [venueId, scraped.id]);

                created++;
                results.push({
                    action: 'created',
                    scraped: { id: scraped.id, name: scraped.name, city: scraped.city, source: scraped.source_code },
                    main: { id: venueId, name: scraped.name }
                });
            }
        }
    }

    console.log(`[Match Venues] Processed ${unlinked.length}: ${created} created, ${matched} matched`);
    return { processed: unlinked.length, matched, created, results: results.slice(0, 50) };
}

// Match and link organizers
async function matchAndLinkOrganizers(options = {}) {
    const { dryRun = false, minConfidence = 0.7 } = options;

    const unlinkedResult = await pool.query(`
        SELECT so.* FROM scraped_organizers so
        WHERE NOT EXISTS(
        SELECT 1 FROM organizer_scraped_links osl WHERE osl.scraped_organizer_id = so.id
    )
        ORDER BY so.name
        LIMIT 1000
    `);

    const unlinked = unlinkedResult.rows;
    let matched = 0, created = 0;
    const results = [];

    console.log(`[Match Organizers] Processing ${unlinked.length} unlinked scraped organizers`);

    for (const scraped of unlinked) {
        const potentialMatches = await pool.query(`
            SELECT o.*,
    (SELECT array_agg(so.source_code) FROM organizer_scraped_links osl 
                    JOIN scraped_organizers so ON so.id = osl.scraped_organizer_id 
                    WHERE osl.organizer_id = o.id) as existing_sources
            FROM organizers o
            WHERE LOWER(o.name) = LOWER($1)
            OR similarity(LOWER(o.name), LOWER($1)) > 0.6
    `, [scraped.name || '']);

        let bestMatch = null;
        let bestScore = 0;

        for (const potential of potentialMatches.rows) {
            if (potential.existing_sources?.includes(scraped.source_code)) continue;

            const nameScore = stringSimilarity(scraped.name || '', potential.name || '');

            if (nameScore > bestScore && nameScore >= minConfidence) {
                bestScore = nameScore;
                bestMatch = potential;
            }
        }

        if (bestMatch) {
            if (!dryRun) {
                await pool.query(`
                    INSERT INTO organizer_scraped_links(organizer_id, scraped_organizer_id, match_confidence)
VALUES($1, $2, $3)
                    ON CONFLICT(organizer_id, scraped_organizer_id) DO NOTHING
    `, [bestMatch.id, scraped.id, bestScore]);
            }
            matched++;
            results.push({
                action: 'matched',
                scraped: { id: scraped.id, name: scraped.name, source: scraped.source_code },
                main: { id: bestMatch.id, name: bestMatch.name },
                confidence: bestScore
            });
        } else {
            if (!dryRun) {
                const organizerId = uuidv4();

                await pool.query(`
                    INSERT INTO organizers(id, name, description, image_url, website, created_at, updated_at)
VALUES($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [
                    organizerId,
                    scraped.name,
                    scraped.description,
                    scraped.image_url,
                    scraped.url // Note: url mapped to website
                ]);

                await pool.query(`
                    INSERT INTO organizer_scraped_links(organizer_id, scraped_organizer_id, match_confidence, is_primary)
VALUES($1, $2, 1.0, true)
    `, [organizerId, scraped.id]);

                created++;
                results.push({
                    action: 'created',
                    scraped: { id: scraped.id, name: scraped.name, source: scraped.source_code },
                    main: { id: organizerId, name: scraped.name }
                });
            }
        }
    }

    console.log(`[Match Organizers] Processed ${unlinked.length}: ${created} created, ${matched} matched`);
    return { processed: unlinked.length, matched, created, results: results.slice(0, 50) };
}

// Automatically enrich artists with MusicBrainz data
async function autoEnrichArtists() {
    console.log('[Enrichment] Starting automatic artist enrichment...');

    // 0. RA Deep Fetch (Enhance existing links)
    // Find artists linked to RA that haven't been deep-fetched (using bio IS NULL as proxy)
    try {
        const { getArtist } = require('./raService');
        const raArtistsToEnrich = await pool.query(`
            SELECT a.id, sa.source_artist_id, sa.id as scraped_id
            FROM artists a
            JOIN artist_scraped_links asl ON asl.artist_id = a.id
            JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
            WHERE sa.source_code = 'ra' 
            AND sa.bio IS NULL
            ORDER BY a.created_at DESC
            LIMIT 10
        `);

        if (raArtistsToEnrich.rows.length > 0) {
            console.log(`[Enrichment] Found ${raArtistsToEnrich.rows.length} RA artists to deep-fetch...`);
            for (const raArt of raArtistsToEnrich.rows) {
                try {
                    const details = await getArtist(raArt.source_artist_id);
                    if (details) {
                        // Map fields
                        const facebook_url = details.facebook;
                        const twitter_url = details.twitter;
                        const instagram_url = details.instagram;
                        const soundcloud_url = details.soundcloud;
                        const discogs_url = details.discogs;
                        const bandcamp_url = details.bandcamp;
                        const website_url = details.website;
                        const bio = details.biography?.content || details.blurb; // Extract content from object

                        await pool.query(`
                            UPDATE scraped_artists SET
                                bio = $1,
                                first_name = $2,
                                last_name = $3,
                                facebook_url = $4,
                                twitter_url = $5,
                                instagram_url = $6,
                                soundcloud_url = $7,
                                discogs_url = $8,
                                bandcamp_url = $9,
                                website_url = $10,
                                country = COALESCE(country, $11),
                                image_url = COALESCE(image_url, $12),
                                raw_data = $13,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = $14
                        `, [
                            bio,
                            details.firstName,
                            details.lastName,
                            facebook_url,
                            twitter_url,
                            instagram_url,
                            soundcloud_url,
                            discogs_url,
                            bandcamp_url,
                            website_url,
                            details.country?.name,
                            details.image, // assume scalar URL
                            details, // Save full RA details as raw_data
                            raArt.scraped_id
                        ]);

                        await refreshMainArtist(raArt.id);
                        console.log(`[Enrichment] Deep-fetched RA data for artist ${raArt.id}`);
                    }
                } catch (e) {
                    console.error(`[Enrichment] Failed to deep-fetch RA artist ${raArt.source_artist_id}:`, e.message);
                }
            }
        }
    } catch (e) {
        console.error('[Enrichment] Error in RA deep fetch block:', e);
    }

    // Find artists that have no musicbrainz source link
    // Limit to 20 per run to avoid overly long sync times and rate limits
    const artistsToEnrich = await pool.query(`
        SELECT a.id, a.name, a.country
        FROM artists a
        WHERE NOT EXISTS(
        SELECT 1 FROM artist_scraped_links asl
            JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
            WHERE asl.artist_id = a.id AND sa.source_code = 'mb'
    )
        ORDER BY a.created_at DESC
        LIMIT 20
    `);

    // Check active status of enrichment sources
    const sourceStatusRes = await pool.query("SELECT code, is_active FROM event_sources WHERE code IN ('mb', 'sp', 'wiki')");
    const isMbActive = sourceStatusRes.rows.find(r => r.code === 'mb')?.is_active ?? false;
    const isSpActive = sourceStatusRes.rows.find(r => r.code === 'sp')?.is_active ?? false;
    const isWikiActive = sourceStatusRes.rows.find(r => r.code === 'wiki')?.is_active ?? false;

    console.log(`[Enrichment] MB Active: ${isMbActive}, SP Active: ${isSpActive}, Wiki Active: ${isWikiActive} `);

    if (!isMbActive && !isSpActive && !isWikiActive) {
        console.log('[Enrichment] All enrichment sources (MB, SP, Wiki) are disabled. Skipping.');
        // Don't return here, we might have done RA enrichment above.
    }

    let enriched = 0;
    // Continuing with MB/SP/Wiki logic...
    for (const artist of artistsToEnrich.rows) {
        // ... (Existing logic below) ...

        try {
            // Search MB if active
            let details = null;

            if (isMbActive) {
                const matches = await searchArtist(artist.name, artist.country);

                // Iterate through matches to find a good one
                for (const match of matches) {
                    const sim = stringSimilarity(artist.name, match.name || '');

                    // Logic: 
                    // 1. High similarity (> 0.8) -> Accept
                    // 2. High MB Score (100) AND decent similarity (> 0.6) -> Accept (Handles "t-low" vs "T-Low" where sim might be slightly lower due to simple normalization)

                    if (sim >= 0.8 || (match.score === 100 && sim >= 0.6)) {
                        console.log(`[Enrichment] Match found for ${artist.name}: ${match.name} (Score: ${match.score}, Sim: ${sim})`);
                        details = await getArtistDetails(match.id);
                        break; // Stop after first good match
                    }
                }
            }

            if (details) {
                // Insert Scraped (MusicBrainz)
                const scrapedRes = await pool.query(`
                    INSERT INTO scraped_artists(
        source_code, source_artist_id, name, country, artist_type,
        genres, image_url, content_url, bio, updated_at
    ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
                    ON CONFLICT(source_code, source_artist_id) DO UPDATE SET
name = EXCLUDED.name,
    country = EXCLUDED.country,
    artist_type = EXCLUDED.artist_type,
    genres = EXCLUDED.genres,
    image_url = EXCLUDED.image_url,
    content_url = EXCLUDED.content_url,
    bio = EXCLUDED.bio,
    updated_at = CURRENT_TIMESTAMP
                    RETURNING id
    `, [
                    'mb',
                    details.source_artist_id,
                    details.name,
                    details.country,
                    details.artist_type,
                    JSON.stringify(details.genres_list),
                    null,
                    details.content_url,
                    details.bio
                ]);

                const scrapedId = scrapedRes.rows[0].id;

                // Link
                await pool.query(`
                    INSERT INTO artist_scraped_links(artist_id, scraped_artist_id, match_confidence)
VALUES($1, $2, 1.0)
                    ON CONFLICT(artist_id, scraped_artist_id) DO UPDATE SET match_confidence = 1.0
    `, [artist.id, scrapedId]);

                // Refresh
                await refreshMainArtist(artist.id);
                enriched++;
            }

            // Check for Spotify (Images/Genres) - only if active
            if (isSpActive && (!details || !details.image_url)) {
                try {
                    const spotArtist = await spotifyService.searchArtist(artist.name);
                    if (spotArtist && stringSimilarity(artist.name, spotArtist.name) > 0.8) {
                        const spotifyData = await spotifyService.getArtistDetails(spotArtist.id);
                        if (spotifyData && spotifyData.image_url) {
                            // Insert Spotify Source
                            const spotRes = await pool.query(`
                                INSERT INTO scraped_artists(
        source_code, source_artist_id, name, country, genres, image_url, content_url, artist_type, updated_at
    ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
                                ON CONFLICT(source_code, source_artist_id) DO UPDATE SET
image_url = EXCLUDED.image_url,
    updated_at = CURRENT_TIMESTAMP
                                RETURNING id
    `, [
                                'sp', spotifyData.source_artist_id, spotifyData.name, null,
                                JSON.stringify(spotifyData.genres), spotifyData.image_url, spotifyData.content_url, 'artist'
                            ]);

                            // Link it
                            await pool.query(`
                                INSERT INTO artist_scraped_links(artist_id, scraped_artist_id, match_confidence)
VALUES($1, $2, 1.0)
                                ON CONFLICT DO NOTHING
    `, [artist.id, spotRes.rows[0].id]);

                            await refreshMainArtist(artist.id);
                            enriched++;
                        }
                    }
                } catch (err) {
                    // Check if error is missing credentials
                    if (err.message.includes('Spotify Credentials')) {
                        console.error('[Enrichment] Spotify credentials missing or invalid. Check .env');
                    } else {
                        console.warn(`[Enrichment] Spotify failed for ${artist.name}: `, err.message);
                    }
                }
            }
        } catch (error) {
            console.error(`[Enrichment] Failed for ${artist.name}: `, error.message);
        }

        // Wikipedia Enrichment (Bio/Image)
        if (isWikiActive) {
            try {
                // Check if we already have a wiki link?
                // Actually we can just try to fetch and update if better
                const wikiDetails = await wikipediaService.searchAndGetDetails(artist.name, 'artist');
                if (wikiDetails) {
                    // Insert Scraped (Wiki)
                    const wikiRes = await pool.query(`
                        INSERT INTO scraped_artists(
        source_code, source_artist_id, name, country,
        image_url, content_url, bio, artist_type, updated_at
    ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
                        ON CONFLICT(source_code, source_artist_id) DO UPDATE SET
name = EXCLUDED.name,
    image_url = COALESCE(EXCLUDED.image_url, scraped_artists.image_url),
    bio = COALESCE(EXCLUDED.bio, scraped_artists.bio),
    updated_at = CURRENT_TIMESTAMP
                        RETURNING id
    `, [
                        'wiki',
                        wikiDetails.source_id, // Use source_id
                        wikiDetails.name,
                        null,
                        wikiDetails.image_url,
                        wikiDetails.content_url,
                        wikiDetails.description,
                        'artist'
                    ]);

                    // Link
                    await pool.query(`
                        INSERT INTO artist_scraped_links(artist_id, scraped_artist_id, match_confidence)
VALUES($1, $2, 1.0)
                        ON CONFLICT DO NOTHING
    `, [artist.id, wikiRes.rows[0].id]);

                    await refreshMainArtist(artist.id);
                    enriched++;
                }
            } catch (err) {
                console.warn(`[Enrichment] Wiki failed for ${artist.name}: `, err.message);
            }
        }
    }

    console.log(`[Enrichment] Completed.Enriched ${enriched} artists.`);
}

// Refresh main venue with merged data
async function refreshMainVenue(venueId) {
    const currentResult = await pool.query(`SELECT * FROM venues WHERE id = $1`, [venueId]);
    if (currentResult.rows.length === 0) return;
    const current = currentResult.rows[0];

    const sourcesResult = await pool.query(`
        SELECT sv.*, vsl.match_confidence
        FROM venue_scraped_links vsl
        JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
        WHERE vsl.venue_id = $1
        ORDER BY 
            CASE sv.source_code 
                WHEN 'og' THEN 1 
                WHEN 'ra' THEN 5 
                WHEN 'tm' THEN 6 
                WHEN 'wiki' THEN 8
                ELSE 10 
            END ASC
    `, [venueId]);

    if (sourcesResult.rows.length === 0) return;

    let sourcesToMerge = [...sourcesResult.rows];

    // Merge logic for venues similar to artists/events
    const { merged, fieldSources } = mergeSourceData(sourcesToMerge, [
        'name', 'address', 'city', 'country', 'description', 'image_url', 'url'
    ]);

    await pool.query(`
        UPDATE venues SET
        name = COALESCE($1, name),
        address = COALESCE($2, address),
        city = COALESCE($3, city),
        country = COALESCE($4, country),
        description = COALESCE($5, description),
        image_url = COALESCE($6, image_url),
        content_url = COALESCE($7, content_url),
        field_sources = $8,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = $9
    `, [
        merged.name, merged.address, merged.city, merged.country,
        merged.description, merged.image_url, merged.url, // url maps to content_url
        JSON.stringify(fieldSources),
        venueId
    ]);
}

// Automatically enrich venues with Wikipedia data
async function autoEnrichVenues() {
    console.log('[Enrichment] Starting automatic venue enrichment...');

    // 0. RA Deep Fetch
    try {
        const { getVenue } = require('./raService');
        const raVenuesToEnrich = await pool.query(`
            SELECT v.id, sv.source_venue_id, sv.id as scraped_id
            FROM venues v
            JOIN venue_scraped_links vsl ON vsl.venue_id = v.id
            JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
            WHERE sv.source_code = 'ra' 
            AND sv.description IS NULL
            ORDER BY v.created_at DESC
            LIMIT 10
        `);

        if (raVenuesToEnrich.rows.length > 0) {
            console.log(`[Enrichment] Found ${raVenuesToEnrich.rows.length} RA venues to deep-fetch...`);
            for (const raVenue of raVenuesToEnrich.rows) {
                try {
                    const details = await getVenue(raVenue.source_venue_id);
                    if (details) {
                        await pool.query(`
                            UPDATE scraped_venues SET
                                description = COALESCE($1, description),
                                image_url = COALESCE($2, image_url),
                                content_url = COALESCE($3, content_url),
                                city = COALESCE(city, $4),
                                country = COALESCE(country, $5),
                                raw_data = $6,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = $7
                        `, [
                            details.description, // mapped from blurb in raService
                            details.image_url, // if available
                            details.url,
                            details.area?.name,
                            details.area?.country?.name,
                            details, // raw_data
                            raVenue.scraped_id
                        ]);

                        await refreshMainVenue(raVenue.id);
                        console.log(`[Enrichment] Deep-fetched RA data for venue ${raVenue.id}`);
                    }
                } catch (e) {
                    console.error(`[Enrichment] Failed to deep-fetch RA venue ${raVenue.source_venue_id}:`, e.message);
                }
            }
        }
    } catch (e) {
        console.error('[Enrichment] Error in RA venue deep fetch:', e);
    }

    // Find venues that have no wiki source link
    const venuesToEnrich = await pool.query(`
        SELECT v.id, v.name, v.city
        FROM venues v
        WHERE NOT EXISTS(
        SELECT 1 FROM venue_scraped_links vsl
            JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
            WHERE vsl.venue_id = v.id AND sv.source_code = 'wiki'
    )
        ORDER BY v.created_at DESC
        LIMIT 20
    `);

    // Check active status
    const sourceStatusRes = await pool.query("SELECT is_active FROM event_sources WHERE code = 'wiki'");
    const isWikiActive = sourceStatusRes.rows[0]?.is_active ?? false;

    if (!isWikiActive) {
        console.log('[Enrichment] Wikipedia source is disabled. Skipping venue enrichment.');
        return;
    }

    let enriched = 0;
    for (const venue of venuesToEnrich.rows) {
        try {
            const wikiDetails = await wikipediaService.searchAndGetDetails(venue.name, 'venue');
            if (wikiDetails) {
                // Insert Scraped (Wiki)
                const wikiRes = await pool.query(`
                    INSERT INTO scraped_venues(
        source_code, source_venue_id, name, city,
        image_url, content_url, description, updated_at
    ) VALUES($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
                    ON CONFLICT(source_code, source_venue_id) DO UPDATE SET
name = EXCLUDED.name,
    image_url = COALESCE(EXCLUDED.image_url, scraped_venues.image_url),
    description = COALESCE(EXCLUDED.description, scraped_venues.description),
    updated_at = CURRENT_TIMESTAMP
                    RETURNING id
    `, [
                    'wiki',
                    wikiDetails.source_id, // Use source_id
                    wikiDetails.name,
                    venue.city,
                    wikiDetails.image_url,
                    wikiDetails.content_url,
                    wikiDetails.description
                ]);

                // Link
                await pool.query(`
                    INSERT INTO venue_scraped_links(venue_id, scraped_venue_id, match_confidence)
VALUES($1, $2, 1.0)
                    ON CONFLICT DO NOTHING
    `, [venue.id, wikiRes.rows[0].id]);

                await refreshMainVenue(venue.id);

                enriched++;
            }
        } catch (err) {
            console.warn(`[Enrichment] Wiki failed for venue ${venue.name}: `, err.message);
        }
    }
    console.log(`[Enrichment] Completed.Enriched ${enriched} venues.`);
}

// Enrich a single artist by ID
async function enrichOneArtist(id) {
    const artistRes = await pool.query('SELECT name, country FROM artists WHERE id = $1', [id]);
    if (artistRes.rows.length === 0) throw new Error('Artist not found');

    const { name, country } = artistRes.rows[0];
    const searchResults = await musicBrainzService.searchArtist(name, country);

    if (searchResults.length === 0) return null;

    const bestMatch = searchResults[0];
    const details = await musicBrainzService.getArtistDetails(bestMatch.id);

    const scrapedRes = await pool.query(`
        INSERT INTO scraped_artists (
            source_code, source_artist_id, name, country, artist_type, 
            genres, image_url, content_url, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        ON CONFLICT (source_code, source_artist_id) DO UPDATE SET
            name = EXCLUDED.name,
            country = EXCLUDED.country,
            artist_type = EXCLUDED.artist_type,
            genres = EXCLUDED.genres,
            image_url = EXCLUDED.image_url,
            content_url = EXCLUDED.content_url,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id
    `, [
        'mb', details.source_artist_id, details.name, details.country,
        details.artist_type, JSON.stringify(details.genres_list), null, details.content_url
    ]);

    const scrapedId = scrapedRes.rows[0].id;

    await pool.query(`
        INSERT INTO artist_scraped_links (artist_id, scraped_artist_id, match_confidence)
        VALUES ($1, $2, 1.0)
        ON CONFLICT (artist_id, scraped_artist_id) DO UPDATE SET match_confidence = 1.0
    `, [id, scrapedId]);

    await refreshMainArtist(id);

    return { source_data: details };
}

module.exports = {
    enrichOneArtist,
    matchAndLinkEvents,
    matchAndLinkArtists,
    matchAndLinkVenues,
    matchAndLinkOrganizers,
    refreshMainEvent,
    refreshMainArtist,
    refreshMainVenue,
    findOrCreateVenue,
    findOrCreateVenue,
    autoEnrichArtists,
    autoEnrichVenues
};
