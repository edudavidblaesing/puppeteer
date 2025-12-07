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

// Geocode using Nominatim with multiple strategies
function geocodeAddress(address, city, country) {
    return new Promise((resolve) => {
        try {
            // Clean and normalize address components
            const cleanString = (str) => {
                if (!str) return '';
                return str
                    .trim()
                    .replace(/\s+/g, ' ') // Normalize whitespace
                    .replace(/[,;]+/g, ',') // Normalize separators (semicolons to commas)
                    .replace(/,+/g, ',') // Remove duplicate commas
                    .replace(/^,|,$/g, ''); // Remove leading/trailing commas
            };

            let cleanAddr = cleanString(address);
            const cleanCity = cleanString(city);
            const cleanCountry = cleanString(country);

            // Parse address that might contain: "Street; District; Postal City; Country"
            // Example: "Rigaer Strasse 31; Friedrichshain; 10247 Berlin; Germany"
            if (cleanAddr) {
                const parts = cleanAddr.split(',').map(p => p.trim()).filter(Boolean);
                
                // Remove parts that match city or country
                const filteredParts = parts.filter(part => {
                    const partLower = part.toLowerCase();
                    
                    // Remove if it's just the city name
                    if (cleanCity && partLower === cleanCity.toLowerCase()) {
                        return false;
                    }
                    
                    // Remove if it's just the country name
                    if (cleanCountry && partLower === cleanCountry.toLowerCase()) {
                        return false;
                    }
                    
                    // Remove if it contains "postal code + city" and we have the city separately
                    if (cleanCity) {
                        const cityPattern = new RegExp(`\\b\\d{4,5}\\s+${cleanCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                        if (cityPattern.test(part)) {
                            return false;
                        }
                    }
                    
                    // Remove if part ends with city or country
                    if (cleanCity && partLower.endsWith(cleanCity.toLowerCase())) {
                        // Check if it's postal + city pattern like "10247 Berlin"
                        const withoutCity = part.slice(0, -(cleanCity.length)).trim();
                        // If what remains is just a postal code, keep the postal code
                        if (/^\d{4,5}$/.test(withoutCity)) {
                            return true; // Keep the part, we'll extract postal later
                        }
                        return false;
                    }
                    
                    return true;
                });
                
                // Extract street address (usually first part) and postal code
                const streetPart = filteredParts[0] || '';
                const postalMatch = cleanAddr.match(/\b(\d{4,5})\b/);
                const postal = postalMatch ? postalMatch[1] : '';
                
                // Rebuild clean address: Street, Postal (if found)
                const addressParts = [streetPart, postal].filter(Boolean);
                cleanAddr = addressParts.join(' ').trim();
                
                // Final cleanup
                cleanAddr = cleanAddr.replace(/[,;]+$/, '').trim();
            }

            // Try multiple search strategies
            const searchStrategies = [
                [cleanAddr, cleanCity, cleanCountry].filter(Boolean).join(', '), // Full
                [cleanAddr, cleanCity].filter(Boolean).join(', '), // Address + City
                [cleanCity, cleanCountry].filter(Boolean).join(', ') // City + Country fallback
            ].filter(s => s.length > 0);

            let currentStrategy = 0;

            const tryNextStrategy = () => {
                if (currentStrategy >= searchStrategies.length) {
                    resolve(null);
                    return;
                }

                const searchAddress = searchStrategies[currentStrategy];
                const query = encodeURIComponent(searchAddress);
                const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;

                console.log(`  Strategy ${currentStrategy + 1}: ${searchAddress}`);

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
                                    longitude: parseFloat(result[0].lon),
                                    strategy: currentStrategy + 1
                                });
                            } else {
                                currentStrategy++;
                                // Small delay between strategies
                                setTimeout(tryNextStrategy, 300);
                            }
                        } catch (e) {
                            console.error(`  Parse error: ${e.message}`);
                            currentStrategy++;
                            setTimeout(tryNextStrategy, 300);
                        }
                    });
                }).on('error', (e) => {
                    console.error(`  HTTP error: ${e.message}`);
                    currentStrategy++;
                    setTimeout(tryNextStrategy, 300);
                });
            };

            tryNextStrategy();
        } catch (e) {
            console.error(`  Error: ${e.message}`);
            resolve(null);
        }
    });
}

async function main() {
    try {
        console.log('🔍 Fetching events without coordinates...\n');

        const result = await pool.query(`
            SELECT id, title, venue_name, venue_address, venue_city, venue_country
            FROM events
            WHERE (latitude IS NULL OR longitude IS NULL)
            AND venue_city IS NOT NULL
            AND publish_status != 'rejected'
            ORDER BY date DESC, created_at DESC
        `);

        console.log(`📍 Found ${result.rows.length} events to geocode\n`);

        if (result.rows.length === 0) {
            console.log('✅ All events already have coordinates!');
            await pool.end();
            return;
        }

        let geocoded = 0;
        let failed = 0;
        let skipped = 0;

        for (const event of result.rows) {
            console.log(`[${geocoded + failed + skipped + 1}/${result.rows.length}] ${event.title}`);
            console.log(`  Venue: ${event.venue_name || 'Unknown'}`);
            console.log(`  Location: ${event.venue_address || ''}, ${event.venue_city}, ${event.venue_country || ''}`);
            
            // Skip if no useful location data
            if (!event.venue_city) {
                console.log(`  ⊘ Skipped - no city\n`);
                skipped++;
                continue;
            }

            const coords = await geocodeAddress(
                event.venue_address, 
                event.venue_city, 
                event.venue_country
            );

            if (coords) {
                await pool.query(`
                    UPDATE events 
                    SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3
                `, [coords.latitude, coords.longitude, event.id]);
                console.log(`  ✓ ${coords.latitude}, ${coords.longitude} (strategy ${coords.strategy})\n`);
                geocoded++;
            } else {
                console.log(`  ✗ No coordinates found\n`);
                failed++;
            }

            // Rate limit - 1 second between requests (OpenStreetMap policy)
            await new Promise(resolve => setTimeout(resolve, 1100));
        }

        console.log('\n' + '='.repeat(60));
        console.log('📊 Summary:');
        console.log(`  ✅ Geocoded: ${geocoded}`);
        console.log(`  ❌ Failed: ${failed}`);
        console.log(`  ⊘ Skipped: ${skipped}`);
        console.log('='.repeat(60) + '\n');

        // Show remaining events without coordinates
        const remaining = await pool.query(`
            SELECT COUNT(*) as count
            FROM events
            WHERE (latitude IS NULL OR longitude IS NULL)
            AND publish_status != 'rejected'
        `);

        console.log(`📍 Events still without coordinates: ${remaining.rows[0].count}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

main();
