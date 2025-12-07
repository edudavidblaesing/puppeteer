#!/usr/bin/env node

const { Pool } = require('pg');
const https = require('https');

// Database configuration
const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT || 5432,
    user: process.env.PGUSER || 'eventuser',
    password: process.env.PGPASSWORD || 'eventpassword',
    database: process.env.PGDATABASE || 'socialevents'
});

// Geocode using Nominatim
function geocodeAddress(address, city, country) {
    return new Promise((resolve) => {
        try {
            // Clean and normalize address components
            const cleanString = (str) => {
                if (!str) return '';
                return str
                    .trim()
                    .replace(/\s+/g, ' ') // Normalize whitespace
                    .replace(/,+/g, ',') // Remove duplicate commas
                    .replace(/^,|,$/g, ''); // Remove leading/trailing commas
            };

            let cleanAddr = cleanString(address);
            const cleanCity = cleanString(city);
            const cleanCountry = cleanString(country);

            // Remove city and country from address if they appear there
            if (cleanCity && cleanAddr.toLowerCase().includes(cleanCity.toLowerCase())) {
                cleanAddr = cleanAddr.replace(new RegExp(cleanCity, 'gi'), '').replace(/\s+/g, ' ').trim();
            }
            if (cleanCountry && cleanAddr.toLowerCase().includes(cleanCountry.toLowerCase())) {
                cleanAddr = cleanAddr.replace(new RegExp(cleanCountry, 'gi'), '').replace(/\s+/g, ' ').trim();
            }
            cleanAddr = cleanAddr.replace(/^,\s*|,\s*$/g, '').replace(/,\s*,/g, ',').trim();

            const parts = [cleanAddr, cleanCity, cleanCountry].filter(Boolean);
            const query = encodeURIComponent(parts.join(', '));
            const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;

            console.log(`  Query: ${parts.join(', ')}`);

            https.get(url, {
                headers: { 'User-Agent': 'SocialEvents/1.0' }
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (result && result.length > 0) {
                            resolve({
                                latitude: parseFloat(result[0].lat),
                                longitude: parseFloat(result[0].lon)
                            });
                        } else {
                            resolve(null);
                        }
                    } catch (e) {
                        console.error(`  Parse error: ${e.message}`);
                        resolve(null);
                    }
                });
            }).on('error', (e) => {
                console.error(`  HTTP error: ${e.message}`);
                resolve(null);
            });
        } catch (e) {
            console.error(`  Error: ${e.message}`);
            resolve(null);
        }
    });
}

async function main() {
    try {
        console.log('Fetching venues without coordinates...\n');

        const result = await pool.query(`
            SELECT id, name, address, city, country
            FROM venues
            WHERE (latitude IS NULL OR longitude IS NULL)
            AND (address IS NOT NULL OR city IS NOT NULL)
            ORDER BY name
            LIMIT 30
        `);

        console.log(`Found ${result.rows.length} venues to geocode\n`);

        let geocoded = 0;
        let failed = 0;

        for (const venue of result.rows) {
            console.log(`[${geocoded + failed + 1}/${result.rows.length}] ${venue.name}`);
            
            const coords = await geocodeAddress(venue.address, venue.city, venue.country);

            if (coords) {
                await pool.query(`
                    UPDATE venues 
                    SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3
                `, [coords.latitude, coords.longitude, venue.id]);
                console.log(`  ✓ ${coords.latitude}, ${coords.longitude}\n`);
                geocoded++;
            } else {
                console.log(`  ✗ No coordinates found\n`);
                failed++;
            }

            // Rate limit
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log(`\nComplete: ${geocoded} geocoded, ${failed} failed`);

        // Sync to events
        console.log('\nSyncing coordinates to events...');
        const syncResult = await pool.query(`
            UPDATE events e
            SET latitude = v.latitude,
                longitude = v.longitude,
                updated_at = CURRENT_TIMESTAMP
            FROM venues v
            WHERE e.venue_name = v.name
            AND e.venue_city = v.city
            AND v.latitude IS NOT NULL
            AND v.longitude IS NOT NULL
            AND (e.latitude IS NULL OR e.longitude IS NULL)
        `);
        console.log(`Updated ${syncResult.rowCount} events with venue coordinates`);

        await pool.end();
    } catch (error) {
        console.error('Error:', error);
        await pool.end();
        process.exit(1);
    }
}

main();
