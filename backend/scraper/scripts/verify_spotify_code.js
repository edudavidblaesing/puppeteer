
const spotifyService = require('../src/services/spotifyService');

async function testSpotify() {
    console.log('Testing Spotify connection and Source Code...');
    try {
        const artist = await spotifyService.searchArtist('Daft Punk');
        if (artist) {
            console.log('Found artist:', artist.name);
            const details = await spotifyService.getArtistDetails(artist.id);
            console.log('Got details for:', details.name);
            console.log('Source Code:', details.source_code);

            if (details.source_code === 'sp') {
                console.log('SUCCESS: Source code is "sp"');
            } else {
                console.error('FAILURE: Source code is', details.source_code);
            }
        } else {
            console.warn('Artist not found');
        }
    } catch (err) {
        console.error('Test failed:', err);
    }
}

testSpotify();
