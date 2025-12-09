#!/usr/bin/env node

/**
 * Batch Geocode Venues
 * 
 * This script geocodes all venues in the database that don't have coordinates yet.
 * It uses OpenStreetMap Nominatim API with rate limiting (1 request per second).
 * 
 * Usage:
 *   node batch-geocode-venues.js
 *   node batch-geocode-venues.js --limit 10  # Geocode only first 10 venues
 *   node batch-geocode-venues.js --dry-run   # Test without updating database
 * 
 * Environment Variables:
 *   DB_HOST     - Database host (default: pptr.davidblaesing.com)
 *   DB_PORT     - Database port (default: 5433)
 *   DB_NAME     - Database name (default: eventdb)
 *   DB_USER     - Database user (default: eventuser)
 *   DB_PASSWORD - Database password (default: eventpassword)
 * 
 * Example with custom credentials:
 *   DB_USER=postgres DB_PASSWORD=mypass node batch-geocode-venues.js
 */

const { Pool } = require('pg');

// Database connection - defaults to production server
const pool = new Pool({
    host: process.env.DB_HOST || 'pptr.davidblaesing.com',
    port: process.env.DB_PORT || 5433,
    database: process.env.DB_NAME || 'eventdb',
    user: process.env.DB_USER || 'eventuser',
    password: process.env.DB_PASSWORD || 'eventpassword'
});

// Parse command line arguments
const args = process.argv.slice(2);
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null;
const dryRun = args.includes('--dry-run');

// Geocoding function using OpenStreetMap Nominatim API
async function geocodeAddress(address, city, country) {
    try {
        const query = [address, city, country].filter(Boolean).join(', ');
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'SocialEventsApp/1.0'
            }
        });

        if (!response.ok) {
            console.error(`Geocoding failed: HTTP ${response.status}`);
            return null;
        }

        const data = await response.json();

        if (data && data.length > 0) {
            return {
                latitude: parseFloat(data[0].lat),
                longitude: parseFloat(data[0].lon)
            };
        }

        return null;
    } catch (error) {
        console.error('Geocoding error:', error.message);
        return null;
    }
}

async function main() {
    console.log('\n🗺️  Batch Geocode Venues');
    console.log('=======================\n');

    if (dryRun) {
        console.log('⚠️  DRY RUN MODE - No database updates will be made\n');
    }

    try {
        // Get venues without coordinates
        let query = `
            SELECT id, name, address, city, country
            FROM venues
            WHERE (latitude IS NULL OR longitude IS NULL)
            AND address IS NOT NULL
            AND city IS NOT NULL
            ORDER BY created_at DESC
        `;

        if (limit) {
            query += ` LIMIT ${limit}`;
        }

        const result = await pool.query(query);
        const venues = result.rows;

        console.log(`Found ${venues.length} venues without coordinates\n`);

        if (venues.length === 0) {
            console.log('✅ All venues already have coordinates!');
            await pool.end();
            return;
        }

        let success = 0;
        let failed = 0;
        let skipped = 0;

        for (let i = 0; i < venues.length; i++) {
            const venue = venues[i];
            const progress = `[${i + 1}/${venues.length}]`;

            console.log(`${progress} ${venue.name} (${venue.city})`);

            if (!venue.address || !venue.city) {
                console.log(`  ⏭️  Skipped - Missing address or city`);
                skipped++;
                continue;
            }

            // Geocode the address
            const coords = await geocodeAddress(venue.address, venue.city, venue.country);

            if (coords) {
                console.log(`  ✅ Found: ${coords.latitude}, ${coords.longitude}`);

                // Update database if not dry run
                if (!dryRun) {
                    await pool.query(
                        `UPDATE venues 
                         SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP 
                         WHERE id = $3`,
                        [coords.latitude, coords.longitude, venue.id]
                    );
                    console.log(`  💾 Updated in database`);
                }

                success++;
            } else {
                console.log(`  ❌ Geocoding failed - No results found`);
                failed++;
            }

            // Rate limiting: Wait 1 second between requests (OpenStreetMap requirement)
            if (i < venues.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1100));
            }
        }

        console.log('\n📊 Summary');
        console.log('==========');
        console.log(`Total venues:  ${venues.length}`);
        console.log(`✅ Success:    ${success}`);
        console.log(`❌ Failed:     ${failed}`);
        console.log(`⏭️  Skipped:    ${skipped}`);

        if (dryRun) {
            console.log('\n⚠️  DRY RUN - No changes were made to the database');
            console.log('Run without --dry-run to apply changes');
        } else {
            console.log('\n✅ Batch geocoding complete!');
        }

    } catch (error) {
        console.error('\n❌ Error:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run the script
main();
