const wikipediaService = require('./src/services/wikipediaService');

async function run() {
    console.log('--- Testing Improved Venue Matching with Wikipedia ---');

    // Test Difficult Berlin Venues
    const venues = [
        'Renate',
        'Salon zur Wilden Renate',
        'Kater Blau',
        '://about blank',
        'Berghain',
        'Sisyphos',
        'Ohi Day', // Should fail validation now hopefully
        'To be announced' // Should fail
    ];

    for (const v of venues) {
        console.log(`\nSearching for venue: "${v}"...`);
        try {
            const res = await wikipediaService.searchAndGetDetails(v, 'venue');
            if (res) {
                console.log(`MATCH FOUND: ${res.name} `);
                console.log(`URL: ${res.content_url}`);
                console.log(`Desc: ${res.description?.substring(0, 100)}...`);
            } else {
                console.log('NO MATCH FOUND');
            }
        } catch (e) {
            console.error('Error:', e.message);
        }
    }
}

run();
