// using global fetch (Node 18+)

let accessToken = null;
let tokenExpiresAt = 0;

const getAccessToken = async () => {
    // Check if token is valid (with 5 min buffer)
    if (accessToken && Date.now() < tokenExpiresAt - 300000) {
        return accessToken;
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Spotify Credentials (SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET) are missing');
    }

    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    console.log('[Spotify] Refreshing Access Token...');

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Spotify Auth Failed: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        accessToken = data.access_token;
        // expires_in is usually 3600 seconds (1 hour)
        tokenExpiresAt = Date.now() + (data.expires_in * 1000);

        return accessToken;
    } catch (error) {
        console.error('[Spotify] Auth Error:', error);
        throw error;
    }
};

const searchArtist = async (name) => {
    try {
        const token = await getAccessToken();
        const query = encodeURIComponent(name);
        const url = `https://api.spotify.com/v1/search?q=${query}&type=artist&limit=1`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error(`Spotify Search Error: ${response.status}`);
        }

        const data = await response.json();
        if (data.artists && data.artists.items.length > 0) {
            return data.artists.items[0];
        }
        return null;
    } catch (error) {
        console.warn(`[Spotify] Search failed for ${name}: ${error.message}`);
        return null;
    }
};

const getArtistDetails = async (spotifyId) => {
    try {
        const token = await getAccessToken();
        const url = `https://api.spotify.com/v1/artists/${spotifyId}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error(`Spotify Details Error: ${response.status}`);
        }

        const data = await response.json();

        // Normalize
        return {
            source_code: 'spotify',
            source_artist_id: data.id,
            name: data.name,
            genres: data.genres || [],
            image_url: data.images && data.images.length > 0 ? data.images[0].url : null, // High res is usually first
            content_url: data.external_urls ? data.external_urls.spotify : null,
            popularity: data.popularity
        };
    } catch (error) {
        console.warn(`[Spotify] Get Details failed for ${spotifyId}: ${error.message}`);
        return null;
    }
};

module.exports = {
    searchArtist,
    getArtistDetails
};
