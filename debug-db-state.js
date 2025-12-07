#!/usr/bin/env node

const API_URL = 'https://pptr.davidblaesing.com';
const API_KEY = 'your-secure-api-key-here';

const headers = {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY
};

async function apiCall(endpoint) {
    const response = await fetch(`${API_URL}${endpoint}`, { headers });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || 'API call failed');
    }
    return response.json();
}

async function checkDatabaseState() {
    console.log('\n🔍 Checking Database State...\n');

    try {
        // 1. Check scraped events
        console.log('📊 SCRAPED EVENTS:');
        const scrapedEvents = await apiCall('/scraped/events?limit=1000');
        const scrapedEventsBySource = {};
        const linkedCount = {};
        scrapedEvents.data.forEach(e => {
            scrapedEventsBySource[e.source_code] = (scrapedEventsBySource[e.source_code] || 0) + 1;
            if (e.is_linked) {
                linkedCount[e.source_code] = (linkedCount[e.source_code] || 0) + 1;
            }
        });
        Object.keys(scrapedEventsBySource).forEach(source => {
            console.log(`  ${source}: ${scrapedEventsBySource[source]} total, ${linkedCount[source] || 0} linked, ${scrapedEventsBySource[source] - (linkedCount[source] || 0)} unlinked`);
        });

        // 2. Check main events
        console.log('\n📋 MAIN EVENTS:');
        const mainEvents = await apiCall('/db/events?limit=1000');
        const byStatus = {};
        mainEvents.data.forEach(e => {
            byStatus[e.publish_status || 'NULL'] = (byStatus[e.publish_status || 'NULL'] || 0) + 1;
        });
        console.log(`  Total: ${mainEvents.total}`);
        Object.keys(byStatus).forEach(status => {
            console.log(`  ${status}: ${byStatus[status]}`);
        });

        // 3. Check artists
        console.log('\n🎤 ARTISTS:');
        const mainArtists = await apiCall('/db/artists?limit=1000');
        console.log(`  Main Artists: ${mainArtists.total}`);
        
        const scrapedArtists = await apiCall('/scraped/artists?limit=2000');
        const scrapedArtistsBySource = {};
        const linkedArtists = {};
        scrapedArtists.data.forEach(a => {
            scrapedArtistsBySource[a.source_code] = (scrapedArtistsBySource[a.source_code] || 0) + 1;
            if (a.is_linked) {
                linkedArtists[a.source_code] = (linkedArtists[a.source_code] || 0) + 1;
            }
        });
        Object.keys(scrapedArtistsBySource).forEach(source => {
            console.log(`  ${source}: ${scrapedArtistsBySource[source]} scraped, ${linkedArtists[source] || 0} linked, ${scrapedArtistsBySource[source] - (linkedArtists[source] || 0)} unlinked`);
        });

        // 4. Check venues
        console.log('\n🏢 VENUES:');
        const mainVenues = await apiCall('/db/venues?limit=1000');
        console.log(`  Main Venues: ${mainVenues.total}`);
        
        const scrapedVenues = await apiCall('/scraped/venues?limit=2000');
        const scrapedVenuesBySource = {};
        const linkedVenues = {};
        scrapedVenues.data.forEach(v => {
            scrapedVenuesBySource[v.source_code] = (scrapedVenuesBySource[v.source_code] || 0) + 1;
            if (v.is_linked) {
                linkedVenues[v.source_code] = (linkedVenues[v.source_code] || 0) + 1;
            }
        });
        Object.keys(scrapedVenuesBySource).forEach(source => {
            console.log(`  ${source}: ${scrapedVenuesBySource[source]} scraped, ${linkedVenues[source] || 0} linked, ${scrapedVenuesBySource[source] - (linkedVenues[source] || 0)} unlinked`);
        });

        // 5. Sample events with source references
        console.log('\n📝 SAMPLE RECENT EVENTS:');
        const sampleEvents = mainEvents.data.slice(0, 5);
        sampleEvents.forEach(e => {
            const sourceCount = Array.isArray(e.source_references) ? e.source_references.length : 0;
            console.log(`  ${e.title?.substring(0, 40)} | ${e.venue_name?.substring(0, 20)} | ${e.publish_status} | ${sourceCount} sources`);
        });

        // Summary
        const totalUnlinkedEvents = Object.keys(scrapedEventsBySource).reduce((sum, src) => 
            sum + (scrapedEventsBySource[src] - (linkedCount[src] || 0)), 0);
        const totalUnlinkedArtists = Object.keys(scrapedArtistsBySource).reduce((sum, src) => 
            sum + (scrapedArtistsBySource[src] - (linkedArtists[src] || 0)), 0);
        const totalUnlinkedVenues = Object.keys(scrapedVenuesBySource).reduce((sum, src) => 
            sum + (scrapedVenuesBySource[src] - (linkedVenues[src] || 0)), 0);

        console.log('\n⚠️  SUMMARY:');
        console.log(`  Unlinked Events: ${totalUnlinkedEvents}`);
        console.log(`  Unlinked Artists: ${totalUnlinkedArtists}`);
        console.log(`  Unlinked Venues: ${totalUnlinkedVenues}`);

        if (totalUnlinkedEvents > 0 || totalUnlinkedArtists > 0 || totalUnlinkedVenues > 0) {
            console.log('\n❌ FOUND UNLINKED DATA - Run matching to fix!');
            console.log('   Run: node debug-db-state.js --match');
        } else {
            console.log('\n✅ All scraped data is properly linked!');
        }

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

async function runMatching() {
    console.log('\n🔗 Running Matching for Events, Artists, and Venues...\n');

    try {
        console.log('⏳ Matching events...');
        const eventsResponse = await fetch(`${API_URL}/scrape/match`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ dryRun: false })
        });
        const eventsResult = await eventsResponse.json();
        console.log('Events:', eventsResult);

        console.log('\n⏳ Matching artists...');
        const artistsResponse = await fetch(`${API_URL}/db/artists/match`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ dryRun: false })
        });
        const artistsResult = await artistsResponse.json();
        console.log('Artists:', artistsResult);

        console.log('\n⏳ Matching venues...');
        const venuesResponse = await fetch(`${API_URL}/db/venues/match`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ dryRun: false })
        });
        const venuesResult = await venuesResponse.json();
        console.log('Venues:', venuesResult);

        console.log('\n✅ Matching complete! Checking state again...\n');
        await checkDatabaseState();

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

// Main
const args = process.argv.slice(2);
if (args.includes('--match')) {
    runMatching();
} else {
    checkDatabaseState();
}
