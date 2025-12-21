const { searchArtist, getAccessToken } = require('./src/services/spotifyService');

async function showData() {
    try {
        console.log('Searching for Coldplay...');
        const artist = await searchArtist('Coldplay');
        if (!artist) {
            console.log('Artist not found');
            return;
        }

        console.log(`Found: ${artist.name} (${artist.id})`);

        const token = await getAccessToken();
        const url = `https://api.spotify.com/v1/artists/${artist.id}`;

        console.log(`Fetching full details from: ${url}`);
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        console.log('--- RAW SPOTIFY DATA ---');
        console.log(JSON.stringify(data, null, 2));
        console.log('------------------------');

    } catch (e) {
        console.error(e);
    }
}

showData();
