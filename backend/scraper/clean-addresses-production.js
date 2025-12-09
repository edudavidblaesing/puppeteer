#!/usr/bin/env node

/**
 * Clean Production Venue Addresses
 * 
 * This script cleans venue addresses in the production database by removing
 * duplicate city, country, and postal code information.
 */

const { Pool } = require('pg');

const PRODUCTION_DB = {
    host: process.env.DB_HOST || 'pptr.davidblaesing.com',
    port: parseInt(process.env.DB_PORT || '5433'),
    database: process.env.DB_NAME || 'socialevents',
    user: process.env.DB_USER || 'eventuser',
    password: process.env.DB_PASSWORD || 'eventpass'
};

const pool = new Pool(PRODUCTION_DB);

async function cleanAddresses() {
    console.log('\n🧹 Cleaning Venue Addresses');
    console.log('===========================');
    console.log(`📍 Server: ${PRODUCTION_DB.host}:${PRODUCTION_DB.port}`);
    console.log(`💾 Database: ${PRODUCTION_DB.database}\n`);

    try {
        console.log('🔌 Testing connection...');
        await pool.query('SELECT 1');
        console.log('✅ Connected!\n');

        // Get count of addresses that need cleaning
        const beforeCounts = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM venues WHERE address LIKE '%;%' OR address ~ '\\y\\d{5}\\y') as venues_dirty,
                (SELECT COUNT(*) FROM scraped_events WHERE venue_address LIKE '%;%' OR venue_address ~ '\\y\\d{5}\\y') as scraped_dirty,
                (SELECT COUNT(*) FROM events WHERE venue_address LIKE '%;%' OR venue_address ~ '\\y\\d{5}\\y') as events_dirty
        `);

        const counts = beforeCounts.rows[0];
        console.log('📊 Addresses needing cleaning:');
        console.log(`   Venues: ${counts.venues_dirty}`);
        console.log(`   Scraped Events: ${counts.scraped_dirty}`);
        console.log(`   Events: ${counts.events_dirty}\n`);

        if (counts.venues_dirty === '0' && counts.scraped_dirty === '0' && counts.events_dirty === '0') {
            console.log('✅ All addresses are already clean!');
            await pool.end();
            return;
        }

        console.log('🧹 Cleaning addresses...\n');

        // Clean scraped_events
        console.log('1️⃣  Cleaning scraped_events table...');
        
        await pool.query(`
            UPDATE scraped_events
            SET venue_address = TRIM(SPLIT_PART(venue_address, ';', 1))
            WHERE venue_address LIKE '%;%'
        `);
        
        await pool.query(`
            UPDATE scraped_events se
            SET venue_address = TRIM(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(
                        REGEXP_REPLACE(
                            REGEXP_REPLACE(venue_address, '\\y\\d{5}\\y', '', 'g'),
                            se.venue_city, '', 'gi'
                        ),
                        se.venue_country, '', 'gi'
                    ),
                    '[,\\s]+', ' ', 'g'
                )
            )
            WHERE venue_address IS NOT NULL
        `);
        console.log('   ✅ Scraped events cleaned');

        // Clean venues
        console.log('2️⃣  Cleaning venues table...');
        
        await pool.query(`
            UPDATE venues
            SET address = TRIM(SPLIT_PART(address, ';', 1))
            WHERE address LIKE '%;%'
        `);
        
        await pool.query(`
            UPDATE venues v
            SET address = TRIM(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(
                        REGEXP_REPLACE(
                            REGEXP_REPLACE(address, '\\y\\d{5}\\y', '', 'g'),
                            v.city, '', 'gi'
                        ),
                        v.country, '', 'gi'
                    ),
                    '[,\\s]+', ' ', 'g'
                )
            )
            WHERE address IS NOT NULL
        `);
        console.log('   ✅ Venues cleaned');

        // Clean events
        console.log('3️⃣  Cleaning events table...');
        
        await pool.query(`
            UPDATE events
            SET venue_address = TRIM(SPLIT_PART(venue_address, ';', 1))
            WHERE venue_address LIKE '%;%'
        `);
        
        await pool.query(`
            UPDATE events e
            SET venue_address = TRIM(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(
                        REGEXP_REPLACE(
                            REGEXP_REPLACE(venue_address, '\\y\\d{5}\\y', '', 'g'),
                            e.venue_city, '', 'gi'
                        ),
                        e.venue_country, '', 'gi'
                    ),
                    '[,\\s]+', ' ', 'g'
                )
            )
            WHERE venue_address IS NOT NULL
        `);
        console.log('   ✅ Events cleaned');

        // Show some examples
        console.log('\n📋 Sample cleaned addresses:');
        const samples = await pool.query(`
            SELECT name, address, city, country 
            FROM venues 
            WHERE address IS NOT NULL 
            LIMIT 5
        `);

        samples.rows.forEach(venue => {
            console.log(`   ${venue.name}`);
            console.log(`   📍 ${venue.address}`);
            console.log(`   🌆 ${venue.city}, ${venue.country}\n`);
        });

        console.log('✅ All addresses cleaned successfully!');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

cleanAddresses();
