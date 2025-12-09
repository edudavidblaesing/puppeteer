#!/usr/bin/env node

/**
 * Add Postal Code Column to Production
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

async function addPostalCodeColumn() {
    console.log('\n📮 Adding Postal Code Column');
    console.log('============================');
    console.log(`📍 Server: ${PRODUCTION_DB.host}:${PRODUCTION_DB.port}\n`);

    try {
        console.log('🔌 Testing connection...');
        await pool.query('SELECT 1');
        console.log('✅ Connected!\n');

        console.log('1️⃣  Adding postal_code column to venues table...');
        await pool.query(`
            ALTER TABLE venues ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20)
        `);
        console.log('   ✅ Column added to venues\n');

        console.log('2️⃣  Adding postal_code column to scraped_venues table...');
        await pool.query(`
            ALTER TABLE scraped_venues ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20)
        `);
        console.log('   ✅ Column added to scraped_venues\n');

        console.log('3️⃣  Creating indexes...');
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_venues_postal_code ON venues(postal_code)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_scraped_venues_postal_code ON scraped_venues(postal_code)
        `);
        console.log('   ✅ Indexes created\n');

        console.log('✅ Postal code column added successfully!');
        console.log('\nℹ️  Note: Postal codes will be extracted from addresses on next scrape.');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

addPostalCodeColumn();
