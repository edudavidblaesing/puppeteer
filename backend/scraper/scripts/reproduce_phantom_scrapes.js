const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// Set env vars for shared pool used by scraperProcessor
process.env.PGUSER = process.env.PGUSER || 'eventuser';
process.env.PGHOST = process.env.PGHOST || 'localhost';
process.env.PGDATABASE = process.env.PGDATABASE || 'socialevents';
process.env.PGPASSWORD = process.env.PGPASSWORD || 'eventpass';
process.env.PGPORT = process.env.PGPORT || '5433';

const { processScrapedEvents } = require('../src/services/scraperProcessor');

const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
});

async function run() {
    console.log('--- Starting Phantom Update Reproduction ---');

    // 1. Setup Test Data
    const uniqueId = uuidv4().split('-')[0];
    const sourceEventId = `test-phantom-${uniqueId}`;
    const sourceCode = 'ra';

    // Construct a typical event object as it comes from a scraper
    const testEvent = {
        source_code: sourceCode,
        source_event_id: sourceEventId,
        title: 'Phantom Test Event',
        date: '2026-06-01', // String YYYY-MM-DD
        start_time: '20:00:00', // String HH:MM:SS
        end_time: '23:00:00',
        content_url: 'https://example.com/event',
        flyer_front: 'https://example.com/image.jpg',
        description: 'A test event description',
        venue_name: 'Test Venue',
        venue_address: '123 Test St',
        venue_city: 'Berlin',
        venue_country: 'Germany',
        venue_latitude: 52.5200, // Number
        venue_longitude: 13.4050, // Number
        artists_json: [
            { name: 'Artist A', genres: ['Techno'] },
            { name: 'Artist B' } // No genres
        ],
        price_info: { price: 20, currency: 'EUR' },
        raw_data: { some: 'raw data' }
    };

    try {
        // 2. Clean up previous valid runs if any (though uniqueId helps)
        // Note: 'ra' is a valid source, but we shouldn't rely on cascade delete if constraint is strict.
        // Assuming cascade or no constraint blocking delete.
        await pool.query('DELETE FROM scraped_events WHERE source_code = $1 AND source_event_id = $2', [sourceCode, sourceEventId]);

        // 3. First Pass: Create
        console.log('Running First Pass (Insert)...');
        const stats1 = await processScrapedEvents([testEvent], { scopes: ['event'] });
        console.log('Pass 1 Stats:', stats1);

        if (stats1.inserted !== 1) {
            throw new Error(`Expected 1 inserted, got ${stats1.inserted}`);
        }

        // 4. Second Pass: Update (Should be Unmodified)
        console.log('Running Second Pass (Same Data)...');
        // IMPORTANT: We must pass a NEW OBJECT copy to ensure we don't accidentally mutate the original in-memory 
        // (though processScrapedEvents shouldn't mutate input in a way that affects deepEqual logic if properly cloned? 
        // Actually processScrapedEvents cleans venue address on the object ITSELF: line 169 event.venue_address = cleaned.address.
        // So passing the SAME object again means it's already cleaned. 
        // BUT the DB stores it cleaning. 
        // So let's construct a FRESH object to simulate real scraping again.
        const testEvent2 = { ...testEvent, artists_json: JSON.parse(JSON.stringify(testEvent.artists_json)) };

        const stats2 = await processScrapedEvents([testEvent2], { scopes: ['event'] });
        console.log('Pass 2 Stats:', stats2);

        if (stats2.updated > 0) {
            console.error('❌ FAILURE: Phantom Update Detected!');
            console.error('Expected 0 updated, got', stats2.updated);

            // Debugging: Let's inspect what's in the DB to see why it differed
            const res = await pool.query('SELECT * FROM scraped_events WHERE source_code = $1 AND source_event_id = $2', [sourceCode, sourceEventId]);
            const stored = res.rows[0];

            console.log('--- DB Stored Record ---');
            console.log(JSON.stringify(stored, null, 2));
            console.log('--- Incoming Record ---');
            console.log(JSON.stringify(testEvent2, null, 2));

            console.log('--- Comparison Checks ---');
            console.log(`Title: "${stored.title}" vs "${testEvent2.title}"`);
            console.log(`Date: "${stored.date}" vs "${testEvent2.date}"`);
            console.log(`Start Time: "${stored.start_time}" vs "${testEvent2.start_time}" (Type: ${typeof stored.start_time} vs ${typeof testEvent2.start_time})`);
            console.log(`Artists:`, JSON.stringify(stored.artists_json), 'vs', JSON.stringify(testEvent2.artists_json));
            console.log(`Lat/Lon: ${stored.venue_latitude} vs ${testEvent2.venue_latitude}`);

        } else {
            console.log('✅ SUCCESS: No phantom updates detected.');
        }

        // 5. Third Pass: Real Update
        console.log('Running Third Pass (Changed Data)...');
        const testEvent3 = { ...testEvent, title: 'Phantom Test Event UPDATED' };

        const stats3 = await processScrapedEvents([testEvent3], { scopes: ['event'] });
        console.log('Pass 3 Stats:', stats3);

        if (stats3.updated === 1) {
            console.log('✅ SUCCESS: Real update detected.');

            // Verify DB content
            const res = await pool.query('SELECT * FROM scraped_events WHERE source_code = $1 AND source_event_id = $2', [sourceCode, sourceEventId]);
            const stored = res.rows[0];

            if (stored.has_changes && stored.changes && stored.changes.title) {
                console.log('✅ SUCCESS: changes JSON and has_changes flag set correctly.');
                console.log('Changes:', JSON.stringify(stored.changes));
            } else {
                console.error('❌ FAILURE: has_changes or changes column missing/incorrect.');
                console.log('Stored:', JSON.stringify(stored, null, 2));
            }

        } else {
            console.error('❌ FAILURE: Real update NOT detected!');
        }

    } catch (err) {
        console.error('Error during reproduction:', err);
    } finally {
        // Cleanup
        await pool.query('DELETE FROM scraped_events WHERE source_code = $1 AND source_event_id = $2', [sourceCode, sourceEventId]);
        await pool.end();
    }
}

run();
