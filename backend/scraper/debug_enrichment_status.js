const { pool } = require('./src/db');

async function checkStatus() {
    try {
        console.log('--- Database Status Check ---');

        // 1. Check Source Status
        const sourceRes = await pool.query("SELECT * FROM event_sources WHERE code = 'wiki'");
        if (sourceRes.rows.length === 0) {
            console.log('❌ Source "wiki" NOT FOUND in event_sources table.');
        } else {
            const src = sourceRes.rows[0];
            console.log(`✅ Source "wiki" found. Active: ${src.is_active}. Base URL: ${src.base_url}`);
        }

        // 2. Check Scraped Venues count
        const scrapedRes = await pool.query("SELECT COUNT(*) FROM scraped_venues WHERE source_code = 'wiki'");
        console.log(`📊 Scraped Venues (Wiki): ${scrapedRes.rows[0].count}`);

        // 3. Check Links count
        const linksRes = await pool.query(`
            SELECT COUNT(*) FROM venue_scraped_links vsl
            JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
            WHERE sv.source_code = 'wiki'
        `);
        console.log(`🔗 Linked Venues (Wiki): ${linksRes.rows[0].count}`);

        // 4. Check a few recent generic errors
        console.log('\n--- Recent Processing Errors ---');
        // If there is an error table, otherwise check scraped_events errors? 
        // We only have scraped_events.processing_errors column. 
        // But for wiki enrichment, we log to stdout. 
        // Let's check if there are any venues that SHOULD be enriched but aren't.

        const pendingRes = await pool.query(`
            SELECT count(*) FROM venues v
            WHERE NOT EXISTS (
                SELECT 1 FROM venue_scraped_links vsl
                JOIN scraped_venues sv ON sv.id = vsl.scraped_venue_id
                WHERE vsl.venue_id = v.id AND sv.source_code = 'wiki'
            )
        `);
        console.log(`Potentially unenriched venues: ${pendingRes.rows[0].count}`);

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
    }
}

checkStatus();
