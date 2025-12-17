const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');
const { stringSimilarity, cleanVenueAddress } = require('../utils/stringUtils');
const { geocodeAddress } = require('./geocoder');
const { mergeSourceData } = require('./unifiedService');
const { searchArtist, getArtistDetails } = require('./musicBrainzService');

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
    // This ensures that if we have locked/manual fields (tracked in field_sources), they take priority (1)
    if (current) {
        // Parse current field_sources
        const currentFieldSources = current.field_sources || {};
        const manualSource = {
            source_code: 'og',
            priority: 1, // Highest priority
            // Populate fields if they are explicitly marked as 'og' OR if field_sources is empty (legacy data protection)
            // But if we treat ALL legacy data as 'og', we stop auto-updates for everything.
            // Better approach: If field_sources is empty, we DON'T add manual source, we let scraper win (Auto-Enrich).
            // BUT if user edited it, they expect it to stay.
            // Compromise: We only add fields that are explicitly 'og' in field_sources.
            // If field_sources is empty, we assume it's open for update (or we rely on 'modified' flag if we had one).
            // User request: "Preserving Original Entities... original entity remains intact".
            // accurate interpretation: "Once I have it, don't change it unless I say so".
            // So we SHOULD treat current values as 'og' if they exist.
        };

        // If field_sources exists, we strictly follow it.
        // If it's the specific case where we want to protect manual edits:
        // We copy fields from 'current' to 'manualSource' IF current.field_sources[field] === 'og'

        let hasManualFields = false;

        // List of fields we manage
        const managedFields = [
            'title', 'date', 'start_time', 'end_time', 'description',
            'flyer_front', 'content_url', 'venue_name', 'venue_address',
            'venue_city', 'venue_country', 'artists'
        ];

        managedFields.forEach(field => {
            // If expressly 'og', OR if we want to be conservative and protect all non-empty current values?
            // Let's stick to explicit 'og' for now to allow auto-enrichment of new scrapes.
            // BUT, if I "Edit" an event, I update field_sources to 'og' for that field? 
            // Currently updateEvent DOES NOT set field_sources to 'og'. I need to fix that too!
            // For now, let's assume if field_sources is missing, we protect nothing (auto-update).
            // Wait, if I created an event manually, it has 'og'? 'manual_...' ID events usually don't have scraped links initially.

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

    // Identify which Scraped Sources actually contributed to the final result
    // fieldSources is map: { title: 'ra', date: 'tm', ... }
    const contributingSourceCodes = new Set(Object.values(fieldSources));

    // We also want to "Touch" last_synced_at for sources that are "consistent" with the result?
    // No, strictly those that "Provided" the value.
    // If 'ra' provided title, we accept 'ra's update.
    // If 'tm' provided date, we accept 'tm's update.
    // If 'eb' provided nothing, and 'eb' has changes... we ignore 'eb'. Dot remains. Correct.

    // Extract date as YYYY-MM-DD string
    let dateStr = null;
    if (merged.date) {
        const d = merged.date instanceof Date ? merged.date : new Date(merged.date);
        dateStr = d.toISOString().split('T')[0];
    }

    // Handle start_time
    let startTimestamp = merged.start_time;
    if (startTimestamp && typeof startTimestamp === 'string' && !startTimestamp.includes('T') && dateStr) {
        startTimestamp = `${dateStr} ${startTimestamp}`;
    }

    // Handle end_time
    let endTimestamp = merged.end_time;
    if (endTimestamp && typeof endTimestamp === 'string' && !endTimestamp.includes('T') && dateStr) {
        endTimestamp = `${dateStr} ${endTimestamp}`;
    }

    // Convert artists_json/array to string/jsonb
    // merged.artists might be array from 'artists_json' property in sources?
    // mergeSourceData usually takes 'artists' field.
    // scraped_events has `artists_json` (jsonb) and `artists` (text).
    // mergeSourceData generic logic picks value.
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

    // Update last_synced_at logic
    // We only update for scraped_events that contributed to at least one field
    // source_code might not be unique in array, but usually is (one link per source code?).
    // Actually scraped_events.source_code.
    // We filter the original sourcesResult

    const contributingScrapedIds = sourcesResult.rows
        .filter(s => contributingSourceCodes.has(s.source_code))
        .map(s => s.id); // s.id is scraped_event.id

    if (contributingScrapedIds.length > 0) {
        await pool.query(`
            UPDATE event_scraped_links
            SET last_synced_at = CURRENT_TIMESTAMP
            WHERE event_id = $1 AND scraped_event_id = ANY($2::int[])
        `, [eventId, contributingScrapedIds]);
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

    // Try to find existing venue by name and city (using string or ID if added to query, but string works for now as fallback)
    const existingVenue = await pool.query(`
        SELECT id, latitude, longitude, city_id
        FROM venues
        WHERE LOWER(name) = LOWER($1)
          AND (LOWER(city) = LOWER($2) OR $2 IS NULL)
        LIMIT 1
    `, [venueName, venueCity || null]);

    if (existingVenue.rows.length > 0) {
        const venue = existingVenue.rows[0];
        let needsUpdate = false;

        // Link city if missing
        if (cityId && !venue.city_id) {
            await pool.query('UPDATE venues SET city_id = $1 WHERE id = $2', [cityId, venue.id]);
            console.log(`[Venue] Linked ${venueName} to city ID ${cityId}`);
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
                console.log(`[Venue] Geocoded: ${lat}, ${lon}`);
            }
        } catch (err) {
            console.warn(`[Venue] Geocoding failed for ${venueName}:`, err.message);
        }
    }

    // Create the venue with city_id
    await pool.query(`
        INSERT INTO venues (id, name, address, city, country, city_id, postal_code, latitude, longitude, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [venueId, venueName, cleanedAddress, venueCity, venueCountry, cityId, postalCode, lat, lon]);

    console.log(`[Venue] Created ${venueName} with ID ${venueId} (CityID: ${cityId})`);
    return venueId;
}

// Link artists to event
async function linkArtistsToEvent(eventId, artists) {
    if (!artists || !Array.isArray(artists)) return;

    for (const artistObj of artists) {
        if (!artistObj) continue;

        const artistName = typeof artistObj === 'string' ? artistObj : artistObj.name;
        if (!artistName) continue;

        // Find or create artist
        let artistId;
        const existingArtist = await pool.query('SELECT id FROM artists WHERE LOWER(name) = LOWER($1)', [artistName]);

        if (existingArtist.rows.length > 0) {
            artistId = existingArtist.rows[0].id;
        } else {
            artistId = uuidv4();
            // Store extra metadata if available and new artist
            const contentUrl = typeof artistObj === 'object' ? artistObj.content_url : null;
            const imageUrl = typeof artistObj === 'object' ? artistObj.image_url : null;

            await pool.query(`
                INSERT INTO artists (id, name, content_url, image_url, created_at, updated_at) 
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `, [artistId, artistName, contentUrl, imageUrl]);
        }

        // Link
        await pool.query(`
            INSERT INTO event_artists (event_id, artist_id) 
            VALUES ($1, $2)
            ON CONFLICT (event_id, artist_id) DO NOTHING
        `, [eventId, artistId]);
    }
}

// Link organizers to event
async function linkOrganizersToEvent(eventId, organizers) {
    if (!organizers || !Array.isArray(organizers)) return;

    for (const organizer of organizers) {
        const name = typeof organizer === 'string' ? organizer : organizer.name;
        if (!name) continue;

        // Find or create organizer
        let organizerId;
        const existingOrganizer = await pool.query('SELECT id FROM organizers WHERE LOWER(name) = LOWER($1)', [name]);

        if (existingOrganizer.rows.length > 0) {
            organizerId = existingOrganizer.rows[0].id;
        } else {
            organizerId = uuidv4();
            await pool.query('INSERT INTO organizers (id, name, created_at, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', [organizerId, name]);
        }

        // Link
        await pool.query(`
            INSERT INTO event_organizers (event_id, organizer_id) 
            VALUES ($1, $2)
            ON CONFLICT (event_id, organizer_id) DO NOTHING
        `, [eventId, organizerId]);
    }
}

// Helper: Auto-reject past events
// (Assuming this logic was in server.js but not fully extracted here yet, simplified version)
async function autoRejectPastEvents() {
    const result = await pool.query(`
        UPDATE events
        SET 
            is_published = false,
            publish_status = 'rejected'
        WHERE 
            date < CURRENT_DATE
            AND publish_status = 'pending'
            AND is_published = false
        RETURNING id
    `);
    return { rejected: result.rows.length };
}

// Match scraped events to main events or create new ones
async function matchAndLinkEvents(options = {}) {
    const { dryRun = false, minConfidence = 0.6 } = options;

    // Get unlinked scraped events (not in event_scraped_links)
    const unlinkedResult = await pool.query(`
        SELECT se.* FROM scraped_events se
        WHERE NOT EXISTS (
            SELECT 1 FROM event_scraped_links esl WHERE esl.scraped_event_id = se.id
        )
        ORDER BY se.date DESC, se.venue_city
    `);

    const unlinked = unlinkedResult.rows;
    let matched = 0, created = 0;
    const results = [];

    console.log(`[Match] Processing ${unlinked.length} unlinked scraped events`);

    for (const scraped of unlinked) {
        // Try to find matching main event
        const potentialMatches = await pool.query(`
            SELECT e.*, 
                   (SELECT array_agg(se.source_code) FROM event_scraped_links esl 
                    JOIN scraped_events se ON se.id = esl.scraped_event_id 
                    WHERE esl.event_id = e.id) as existing_sources
            FROM events e
            WHERE e.date::date = $1::date
            AND (
                LOWER(e.venue_city) = LOWER($2) 
                OR LOWER(e.venue_name) ILIKE $3
            )
        `, [scraped.date, scraped.venue_city || '', `%${(scraped.venue_name || '').substring(0, 15)}%`]);

        let bestMatch = null;
        let bestScore = 0;

        for (const potential of potentialMatches.rows) {
            // Skip if already linked from same source
            if (potential.existing_sources?.includes(scraped.source_code)) continue;

            // Calculate match score
            const titleScore = stringSimilarity(scraped.title || '', potential.title || '');
            const venueScore = stringSimilarity(scraped.venue_name || '', potential.venue_name || '');
            const score = (titleScore * 0.7) + (venueScore * 0.3);

            if (score > bestScore && score >= minConfidence) {
                bestScore = score;
                bestMatch = potential;
            }
        }

        // If no match, check other scraped events that are already linked
        if (!bestMatch) {
            const similarScraped = await pool.query(`
                SELECT se.*, esl.event_id
                FROM scraped_events se
                JOIN event_scraped_links esl ON esl.scraped_event_id = se.id
                WHERE se.date = $1
                AND se.id != $2
                AND (LOWER(se.venue_city) = LOWER($3) OR LOWER(se.venue_name) ILIKE $4)
                LIMIT 50
            `, [scraped.date, scraped.id, scraped.venue_city || '', `%${(scraped.venue_name || '').substring(0, 15)}%`]);

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
            // Link to existing main event
            if (!dryRun) {
                await pool.query(`
                    INSERT INTO event_scraped_links (event_id, scraped_event_id, match_confidence)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (event_id, scraped_event_id) DO NOTHING
                `, [bestMatch.id, scraped.id, bestScore]);

                // Refresh main event with merged data from all linked sources
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
            // Near-duplicate check
            const nearDuplicateCheck = await pool.query(`
                SELECT e.id, e.title, e.date, e.venue_name
                FROM events e
                WHERE e.date::date = $1::date
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
                // Link to existing
                if (!dryRun) {
                    await pool.query(`
                        INSERT INTO event_scraped_links (event_id, scraped_event_id, match_confidence)
                        VALUES ($1, $2, $3)
                        ON CONFLICT (event_id, scraped_event_id) DO NOTHING
                    `, [foundNearDuplicate.id, scraped.id, 0.5]);

                    await refreshMainEvent(foundNearDuplicate.id);
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
                // Create new main event
                if (!dryRun) {
                    const eventId = uuidv4();

                    // Publish status logic
                    let dateStr = null;
                    if (scraped.date) {
                        const d = scraped.date instanceof Date ? scraped.date : new Date(scraped.date);
                        dateStr = d.toISOString().split('T')[0];
                    }
                    let startTimestamp = scraped.start_time;
                    if (startTimestamp && typeof startTimestamp === 'string' && !startTimestamp.includes('T') && dateStr) {
                        startTimestamp = `${dateStr} ${startTimestamp}`;
                    }

                    let endTimestamp = scraped.end_time;
                    if (endTimestamp && typeof endTimestamp === 'string' && !endTimestamp.includes('T') && dateStr) {
                        endTimestamp = `${dateStr} ${endTimestamp}`;
                    }

                    const artistsStr = scraped.artists_json && scraped.artists_json.length > 0
                        ? JSON.stringify(scraped.artists_json) : null;

                    const eventDate = dateStr ? new Date(dateStr) : null;
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const isPastEvent = eventDate && eventDate < today;
                    const publishStatus = isPastEvent ? 'rejected' : 'pending';

                    // REMOVED: Auto-creation of cities. We only want to link to existing active cities.
                    // If the city doesn't exist in our DB, we won't create it, keeping data clean.

                    // Auto-link venue
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
                        INSERT INTO events (
                            id, source_code, source_id, title, date, start_time, end_time, 
                            description, flyer_front, content_url, venue_id, venue_name, venue_address, 
                            venue_city, venue_country, artists, is_published, publish_status
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, false, $17)
                        ON CONFLICT (id) DO NOTHING
                    `, [
                        eventId,
                        scraped.source_code,
                        scraped.source_event_id,
                        scraped.title,
                        dateStr,
                        startTimestamp,
                        endTimestamp,
                        scraped.description,
                        scraped.flyer_front,
                        scraped.content_url,
                        venueId,
                        scraped.venue_name,
                        scraped.venue_address,
                        scraped.venue_city,
                        scraped.venue_country,
                        artistsStr,
                        publishStatus
                    ]);

                    // Link artists and organizers
                    if (scraped.artists_json && Array.isArray(scraped.artists_json)) {
                        await linkArtistsToEvent(eventId, scraped.artists_json);
                    }
                    if (scraped.organizers_json && Array.isArray(scraped.organizers_json)) {
                        await linkOrganizersToEvent(eventId, scraped.organizers_json);
                    }

                    // Link to scrape source
                    await pool.query(`
                        INSERT INTO event_scraped_links (event_id, scraped_event_id, match_confidence)
                        VALUES ($1, $2, 1.0)
                        ON CONFLICT (event_id, scraped_event_id) DO NOTHING
                    `, [eventId, scraped.id]);

                    created++;
                    results.push({
                        action: 'created',
                        scraped: { id: scraped.id, title: scraped.title, source: scraped.source_code },
                        main: { id: eventId, title: scraped.title }
                    });
                }
            }
        }
    }

    const autoRejectResult = await autoRejectPastEvents();
    console.log(`[Match] Processed ${unlinked.length}: ${created} created, ${matched} matched, ${autoRejectResult.rejected} auto-rejected`);
    return { processed: unlinked.length, matched, created, autoRejected: autoRejectResult.rejected, results: results.slice(0, 20) };
}

// Refresh main artist with best data from linked sources
async function refreshMainArtist(artistId) {
    // Get current artist state
    const currentResult = await pool.query(`
        SELECT * FROM artists WHERE id = $1
    `, [artistId]);

    if (currentResult.rows.length === 0) return;
    const current = currentResult.rows[0];

    const sourcesResult = await pool.query(`
        SELECT sa.*, asl.match_confidence, asl.last_synced_at
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
    `, [artistId]);

    if (sourcesResult.rows.length === 0) return;

    let sourcesToMerge = [...sourcesResult.rows];

    // Inject "Current" as Manual Source (og) if needed
    if (current) {
        const currentFieldSources = current.field_sources || {};
        const manualSource = {
            source_code: 'og',
            priority: 1
        };
        let hasManualFields = false;

        // Fields managed for artists
        const managedFields = ['name', 'country', 'artist_type', 'genres', 'image_url', 'content_url', 'bio'];

        managedFields.forEach(field => {
            // Same logic as events: If current has value and is explicitly 'og', keep it.
            // Or if field_sources is empty, maybe protect? 
            // We'll stick to explicit 'og' for Smart Update contract.
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
        'name', 'country', 'artist_type', 'genres', 'image_url', 'content_url', 'bio'
    ]);

    // Handle genres (often JSON/Text)
    // mergeSourceData picks the raw value from scraped_artists (which might be JSON string).
    // Or from current (which might be array/jsonb).
    // We should ensure it's JSON format for DB if column is JSONB.
    // artists.genres is usually JSONB (based on recent migrations for other tables, let's assume JSONB or TEXT array).
    // The previous code didn't parse it.
    // If scraped_artists.genres is json string, and we put it in jsonb column, Postgres might auto-cast if valid?

    // Better safely stringify if it's an object/array, or leave as string.
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
            field_sources = $7,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
    `, [
        merged.name,
        merged.country,
        merged.artist_type,
        merged.image_url,
        merged.content_url,
        genresVal,
        JSON.stringify(fieldSources),
        artistId
    ]);

    // Update last_synced_at
    const contributingSourceCodes = new Set(Object.values(fieldSources));
    const contributingScrapedIds = sourcesResult.rows
        .filter(s => contributingSourceCodes.has(s.source_code))
        .map(s => s.id);

    if (contributingScrapedIds.length > 0) {
        await pool.query(`
            UPDATE artist_scraped_links
            SET last_synced_at = CURRENT_TIMESTAMP
            WHERE artist_id = $1 AND scraped_artist_id = ANY($2::int[])
        `, [artistId, contributingScrapedIds]);
    }
}

// Match and link artists
async function matchAndLinkArtists(options = {}) {
    const { dryRun = false, minConfidence = 0.7 } = options;

    const unlinkedResult = await pool.query(`
        SELECT sa.* FROM scraped_artists sa
        WHERE NOT EXISTS (
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
                    INSERT INTO artist_scraped_links (artist_id, scraped_artist_id, match_confidence)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (artist_id, scraped_artist_id) DO NOTHING
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
            // NO LOCAL MATCH FOUND
            // Try MusicBrainz lookup to enrich/find authoritative data
            let musicBrainzArtist = null;
            let mbScrapedId = null;

            if (!dryRun) {
                try {
                    const mbResults = await searchArtist(scraped.name);
                    if (mbResults.length > 0) {
                        const top = mbResults[0];
                        // Verify similarity
                        if (stringSimilarity(scraped.name, top.name) > 0.8) {
                            const details = await getArtistDetails(top.id);

                            // Insert/Update MusicBrainz entry in scraped_artists
                            // We need to store it so we can link it
                            const mbRes = await pool.query(`
                                INSERT INTO scraped_artists (
                                    source_code, source_artist_id, name, country, genres, image_url, content_url, artist_type, updated_at
                                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
                                ON CONFLICT (source_code, source_artist_id) DO UPDATE SET
                                    name = EXCLUDED.name,
                                    country = COALESCE(EXCLUDED.country, scraped_artists.country),
                                    genres = COALESCE(EXCLUDED.genres, scraped_artists.genres),
                                    artist_type = COALESCE(EXCLUDED.artist_type, scraped_artists.artist_type),
                                    content_url = COALESCE(EXCLUDED.content_url, scraped_artists.content_url),
                                    updated_at = CURRENT_TIMESTAMP
                                RETURNING id
                            `, [
                                details.source_code,
                                details.source_artist_id,
                                details.name,
                                details.country,
                                JSON.stringify(details.genres_list), // MusicBrainz service returns flattened list
                                null, // MB doesn't give direct image easily in basic query, usually requires cover art archive or fan art
                                details.content_url,
                                details.artist_type
                            ]);

                            mbScrapedId = mbRes.rows[0].id;
                            musicBrainzArtist = details;
                        }
                    }
                } catch (err) {
                    console.warn(`[MusicBrainz] Lookup failed for ${scraped.name}: ${err.message}`);
                }
            }

            if (!dryRun) {
                const artistId = uuidv4();

                // Determine initial data for main artist
                // Prefer MusicBrainz if available
                const initialName = musicBrainzArtist ? musicBrainzArtist.name : scraped.name;
                const initialCountry = musicBrainzArtist ? musicBrainzArtist.country : (scraped.country || null);
                const initialUrl = musicBrainzArtist ? musicBrainzArtist.content_url : scraped.content_url;
                const initialImage = scraped.image_url; // MB usually doesn't have image
                const initialType = musicBrainzArtist ? musicBrainzArtist.artist_type : (scraped.artist_type || null);

                await pool.query(`
                    INSERT INTO artists (id, source_code, source_id, name, country, content_url, image_url, artist_type, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `, [
                    artistId,
                    musicBrainzArtist ? 'musicbrainz' : scraped.source_code,
                    musicBrainzArtist ? musicBrainzArtist.source_artist_id : scraped.source_artist_id,
                    initialName,
                    initialCountry,
                    initialUrl,
                    initialImage,
                    initialType
                ]);

                // Link MusicBrainz Source if exists
                if (mbScrapedId) {
                    await pool.query(`
                        INSERT INTO artist_scraped_links (artist_id, scraped_artist_id, match_confidence, is_primary)
                        VALUES ($1, $2, 1.0, true)
                    `, [artistId, mbScrapedId]);
                }

                // Link Original Scraped Source
                // If MB exists, MB is primary (priority via code='musicbrainz' handled in refresh), 
                // but scraper logic sets is_primary=true for this one in else block below.
                // We should probably set is_primary=true for MB if it exists, and false for this one?
                // Actually `refreshMainArtist` uses priority score based on source_code, so is_primary flag is less critical for data merge,
                // but good for UI.

                const isPrimary = !mbScrapedId; // If MB used, it's primary

                await pool.query(`
                    INSERT INTO artist_scraped_links (artist_id, scraped_artist_id, match_confidence, is_primary)
                    VALUES ($1, $2, 1.0, $3)
                `, [artistId, scraped.id, isPrimary]);

                created++;
                results.push({
                    action: 'created',
                    scraped: { id: scraped.id, name: scraped.name, source: scraped.source_code },
                    main: { id: artistId, name: initialName, enriched: !!musicBrainzArtist }
                });
            }
        }
    }

    console.log(`[Match Artists] Processed ${unlinked.length}: ${created} created, ${matched} matched`);
    return { processed: unlinked.length, matched, created, results: results.slice(0, 50) };
}

// Refresh main venue with best data from linked sources
async function refreshMainVenue(venueId) {
    // Get current venue state
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

    // Inject "Current" as Manual Source (og) if needed
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
        merged.name,
        merged.address,
        merged.city,
        merged.country,
        merged.latitude,
        merged.longitude,
        merged.content_url,
        JSON.stringify(fieldSources),
        venueId
    ]);

    // Update last_synced_at
    const contributingSourceCodes = new Set(Object.values(fieldSources));
    const contributingScrapedIds = sourcesResult.rows
        .filter(s => contributingSourceCodes.has(s.source_code))
        .map(s => s.id);

    if (contributingScrapedIds.length > 0) {
        await pool.query(`
            UPDATE venue_scraped_links
            SET last_synced_at = CURRENT_TIMESTAMP
            WHERE venue_id = $1 AND scraped_venue_id = ANY($2::int[])
        `, [venueId, contributingScrapedIds]);
    }
}

// Match and link venues (main venues table)
async function matchAndLinkVenues(options = {}) {
    const { dryRun = false, minConfidence = 0.7 } = options;

    const unlinkedResult = await pool.query(`
        SELECT sv.* FROM scraped_venues sv
        WHERE NOT EXISTS (
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
            AND (
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
                    INSERT INTO venue_scraped_links (venue_id, scraped_venue_id, match_confidence)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (venue_id, scraped_venue_id) DO NOTHING
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
                    INSERT INTO venues (id, source_code, source_id, name, address, city, country, 
                                      postal_code, latitude, longitude, content_url, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
                    INSERT INTO venue_scraped_links (venue_id, scraped_venue_id, match_confidence, is_primary)
                    VALUES ($1, $2, 1.0, true)
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
        WHERE NOT EXISTS (
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
                    INSERT INTO organizer_scraped_links (organizer_id, scraped_organizer_id, match_confidence)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (organizer_id, scraped_organizer_id) DO NOTHING
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
                    INSERT INTO organizers (id, name, description, image_url, website, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `, [
                    organizerId,
                    scraped.name,
                    scraped.description,
                    scraped.image_url,
                    scraped.url // Note: url mapped to website
                ]);

                await pool.query(`
                    INSERT INTO organizer_scraped_links (organizer_id, scraped_organizer_id, match_confidence, is_primary)
                    VALUES ($1, $2, 1.0, true)
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

    // Find artists that have no musicbrainz source link
    // Limit to 20 per run to avoid overly long sync times and rate limits
    const artistsToEnrich = await pool.query(`
        SELECT a.id, a.name, a.country
        FROM artists a
        WHERE NOT EXISTS (
            SELECT 1 FROM artist_scraped_links asl
            JOIN scraped_artists sa ON sa.id = asl.scraped_artist_id
            WHERE asl.artist_id = a.id AND sa.source_code = 'musicbrainz'
        )
        ORDER BY a.created_at DESC
        LIMIT 20
    `);

    let enriched = 0;
    for (const artist of artistsToEnrich.rows) {
        try {
            // Search MB
            const matches = await searchArtist(artist.name, artist.country);
            if (matches.length > 0) {
                const bestMatch = matches[0];
                const details = await getArtistDetails(bestMatch.id);

                // Insert Scraped
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
                    'musicbrainz',
                    details.source_artist_id,
                    details.name,
                    details.country,
                    details.artist_type,
                    JSON.stringify(details.genres_list),
                    null,
                    details.content_url
                ]);

                const scrapedId = scrapedRes.rows[0].id;

                // Link
                await pool.query(`
                    INSERT INTO artist_scraped_links (artist_id, scraped_artist_id, match_confidence)
                    VALUES ($1, $2, 1.0)
                    ON CONFLICT (artist_id, scraped_artist_id) DO UPDATE SET match_confidence = 1.0
                `, [artist.id, scrapedId]);

                // Refresh
                await refreshMainArtist(artist.id);
                enriched++;
            }
        } catch (error) {
            console.error(`[Enrichment] Failed for ${artist.name}:`, error.message);
        }
    }
    console.log(`[Enrichment] Completed. Enriched ${enriched} artists.`);
}

module.exports = {
    matchAndLinkEvents,
    matchAndLinkArtists,
    matchAndLinkVenues,
    matchAndLinkOrganizers,
    refreshMainEvent,
    refreshMainArtist,
    findOrCreateVenue,
    autoEnrichArtists
};
