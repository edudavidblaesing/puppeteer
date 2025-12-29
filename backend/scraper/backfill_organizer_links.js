const { pool } = require('./src/db');

async function backfillOrganizerLinks() {
    try {
        console.log('--- Backfilling Scraped Organizers and Links ---');

        // Fetch scraped events with organizer info
        const result = await pool.query(`
            SELECT id, source_code, organizers_json 
            FROM scraped_events 
            WHERE organizers_json IS NOT NULL 
            AND jsonb_array_length(organizers_json) > 0
        `);

        console.log(`Found ${result.rowCount} scraped events with organizer info.`);

        for (const se of result.rows) {
            const organizers = se.organizers_json;
            const sourceCode = se.source_code;

            for (const orgData of organizers) {
                const name = orgData.name;
                const sourceId = orgData.source_organizer_id;

                if (!name || !sourceId) continue;

                // 1. Upsert scraped_organizer
                let scrapedOrgId = null;
                try {
                    const res = await pool.query(`
                        INSERT INTO scraped_organizers(
                            source_code, source_id, name, url, image_url, description, updated_at
                        ) VALUES($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
                        ON CONFLICT(source_code, source_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            url = COALESCE(EXCLUDED.url, scraped_organizers.url),
                            updated_at = CURRENT_TIMESTAMP
                        RETURNING id
                    `, [
                        sourceCode,
                        sourceId,
                        name,
                        orgData.content_url || null,
                        orgData.image_url || null,
                        orgData.description || null
                    ]);
                    scrapedOrgId = res.rows[0].id;
                } catch (e) {
                    console.error(`Error creating scraped organizer for ${name}:`, e.message);
                    continue;
                }

                // 2. Find main organizer
                const mainRes = await pool.query('SELECT id FROM organizers WHERE LOWER(name) = LOWER($1)', [name]);
                if (mainRes.rows.length > 0) {
                    const mainId = mainRes.rows[0].id;

                    // 3. Link
                    try {
                        const linkRes = await pool.query(`
                            INSERT INTO organizer_scraped_links(organizer_id, scraped_organizer_id, match_confidence, is_primary)
                            VALUES($1, $2, 1.0, true)
                            ON CONFLICT(organizer_id, scraped_organizer_id) DO NOTHING
                            RETURNING *
                        `, [mainId, scrapedOrgId]);

                        if (linkRes.rows.length > 0) {
                            console.log(`Linked '${name}' (${sourceCode})`);
                        }
                    } catch (e) {
                        console.error(`Error linking ${name}:`, e.message);
                    }
                } else {
                    // console.log(`No main organizer found for '${name}' - skipping link.`);
                }
            }
        }
        console.log('Done.');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

backfillOrganizerLinks();
