#!/usr/bin/env node

/**
 * Production Venue Geocoding Script
 * 
 * This script runs locally and geocodes venues on the production database.
 * It fetches venues without coordinates, geocodes them via OpenStreetMap,
 * and updates the production database directly.
 * 
 * Usage:
 *   node geocode-production.js --dry-run    # Test without updating
 *   node geocode-production.js --limit 10   # Process first 10 venues
 *   node geocode-production.js              # Process all venues
 */

const { Pool } = require('pg');

// PRODUCTION DATABASE - pptr.davidblaesing.com
// Override with environment variables: DB_USER=xxx DB_PASSWORD=xxx node geocode-production.js
const PRODUCTION_DB = {
    host: process.env.DB_HOST || 'pptr.davidblaesing.com',
    port: parseInt(process.env.DB_PORT || '5433'),
    database: process.env.DB_NAME || 'socialevents',
    user: process.env.DB_USER || 'eventuser',
    password: process.env.DB_PASSWORD || 'eventpass'
};

const pool = new Pool(PRODUCTION_DB);

// Parse command line arguments
const args = process.argv.slice(2);
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null;
const dryRun = args.includes('--dry-run');

// Geocoding using OpenStreetMap Nominatim API (free, rate-limited)
async function geocodeAddress(address, city, country) {
    try {
        // Clean up address - sometimes it has duplicate city/country info
        let cleanAddr = address || '';
        const cleanCity = city || '';
        const cleanCountry = country || '';
        
        // Parse address that might contain: "Street; District; Postal City; Country"
        if (cleanAddr && cleanAddr.includes(';')) {
            const parts = cleanAddr.split(';').map(p => p.trim());
            // Take only the first part (street address)
            cleanAddr = parts[0];
        }
        
        // Remove city and country from address if they're duplicated
        if (cleanCity && cleanAddr.toLowerCase().includes(cleanCity.toLowerCase())) {
            cleanAddr = cleanAddr.replace(new RegExp(cleanCity, 'gi'), '').trim();
        }
        if (cleanCountry && cleanAddr.toLowerCase().includes(cleanCountry.toLowerCase())) {
            cleanAddr = cleanAddr.replace(new RegExp(cleanCountry, 'gi'), '').trim();
        }
        
        // Clean up extra commas and whitespace
        cleanAddr = cleanAddr.replace(/,+/g, ',').replace(/^,|,$/g, '').trim();
        
        const query = [cleanAddr, cleanCity, cleanCountry].filter(Boolean).join(', ');
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'SocialEventsApp/1.0 (batch-geocoding)'
            }
        });

        if (!response.ok) {
            console.error(`  ❌ HTTP ${response.status}`);
            return null;
        }

        const data = await response.json();

        if (data && data.length > 0) {
            return {
                latitude: parseFloat(data[0].lat),
                longitude: parseFloat(data[0].lon),
                display_name: data[0].display_name
            };
        }

        return null;
    } catch (error) {
        console.error(`  ❌ Error: ${error.message}`);
        return null;
    }
}

async function main() {
    console.log('\n🌍 Production Venue Geocoding');
    console.log('============================');
    console.log(`📍 Server: ${PRODUCTION_DB.host}:${PRODUCTION_DB.port}`);
    console.log(`💾 Database: ${PRODUCTION_DB.database}\n`);

    if (dryRun) {
        console.log('⚠️  DRY RUN - No database updates will be made\n');
    }

    try {
        // Test connection
        console.log('🔌 Testing database connection...');
        const testResult = await pool.query('SELECT COUNT(*) FROM venues');
        console.log(`✅ Connected! Total venues: ${testResult.rows[0].count}\n`);

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

        console.log(`📊 Found ${venues.length} venues without coordinates\n`);

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

            console.log(`\n${progress} ${venue.name}`);
            console.log(`  📍 ${venue.address}, ${venue.city}`);

            if (!venue.address || !venue.city) {
                console.log(`  ⏭️  Skipped - Missing address or city`);
                skipped++;
                continue;
            }

            // Geocode the address
            const coords = await geocodeAddress(venue.address, venue.city, venue.country);

            if (coords) {
                console.log(`  ✅ Found: ${coords.latitude}, ${coords.longitude}`);

                // Update production database if not dry run
                if (!dryRun) {
                    try {
                        await pool.query(
                            `UPDATE venues 
                             SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP 
                             WHERE id = $3`,
                            [coords.latitude, coords.longitude, venue.id]
                        );
                        console.log(`  💾 Updated in production database`);
                        success++;
                    } catch (updateError) {
                        console.log(`  ❌ Database update failed: ${updateError.message}`);
                        failed++;
                    }
                } else {
                    console.log(`  🔍 Would update (dry run)`);
                    success++;
                }
            } else {
                console.log(`  ❌ Geocoding failed - No results found`);
                failed++;
            }

            // Rate limiting: Wait 1.1 seconds between requests (OpenStreetMap requirement)
            if (i < venues.length - 1) {
                process.stdout.write(`  ⏳ Waiting 1.1s (rate limit)...`);
                await new Promise(resolve => setTimeout(resolve, 1100));
                process.stdout.write('\r' + ' '.repeat(50) + '\r'); // Clear line
            }
        }

        console.log('\n\n📊 SUMMARY');
        console.log('==========');
        console.log(`Total venues:  ${venues.length}`);
        console.log(`✅ Success:    ${success}`);
        console.log(`❌ Failed:     ${failed}`);
        console.log(`⏭️  Skipped:    ${skipped}`);

        if (dryRun) {
            console.log('\n⚠️  DRY RUN - No changes were made');
            console.log('Run without --dry-run to apply changes to production');
        } else {
            console.log('\n✅ Production database updated successfully!');
        }

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
    console.log('\n\n⚠️  Interrupted by user');
    await pool.end();
    process.exit(0);
});

// Run the script
main();
