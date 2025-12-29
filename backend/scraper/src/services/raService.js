// using global fetch


const RA_GRAPHQL_URL = 'https://ra.co/graphql';

const HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Referer': 'https://ra.co/'
};

async function fetchGraphQL(query, variables) {
    const response = await fetch(RA_GRAPHQL_URL, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ query, variables })
    });

    const data = await response.json();
    if (data.errors) {
        throw new Error(JSON.stringify(data.errors));
    }
    return data;
}

async function getEvent(id) {
    const query = `
        query GetEvent($id: ID!) {
            event(id: $id) {
                id
                title
                date
                startTime
                endTime
                content
                contentUrl
                flyerFront
                flyerBack
                isTicketed
                venue {
                    id
                    name
                    address
                    area {
                        name
                        country {
                            name
                        }
                    }
                }
                artists {
                    id
                    name
                    image
                }
                promoters {
                    id
                    name
                }
                tickets {
                    title
                    onSaleFrom
                    onSaleUntil
                }
            }
        }
    `;
    const data = await fetchGraphQL(query, { id });
    return data.data.event;
}

async function getVenue(id) {
    const query = `
        query GetVenue($id: ID!) {
            venue(id: $id) {
                id
                name
                address
                contentUrl
                blurb
                area {
                    id
                    name
                    country {
                        name
                    }
                }
            }
        }
    `;
    const data = await fetchGraphQL(query, { id });
    const venue = data.data.venue;
    if (venue) {
        venue.url = venue.contentUrl ? `https://ra.co${venue.contentUrl}` : null;
        venue.description = venue.blurb || null;
    }
    return venue;
}

async function getArtist(id) {
    const query = `
        query GetArtist($id: ID!) {
            artist(id: $id) {
                id
                name
                firstName
                lastName
                biography { content }
                contentUrl
                website
                facebook
                twitter
                instagram
                soundcloud
                discogs
                bandcamp
                image
                coverImage
                country {
                    name
                }
                residentCountry {
                    name
                }
            }
        }
    `;
    try {
        const data = await fetchGraphQL(query, { id });
        return data.data.artist;
    } catch (e) {
        console.error(`Error fetching artist ${id}:`, e.message);
        return null;
    }
}

async function getListings(filters, pageSize) {
    const query = `
        query GetEvents($filters: FilterInputDtoInput, $pageSize: Int) {
            eventListings(filters: $filters, pageSize: $pageSize) {
                data {
                    event {
                        id
                        title
                        date
                        startTime
                        endTime
                        contentUrl
                        flyerFront
                        content
                        venue {
                            id
                            name
                            address
                            area {
                                name
                                country {
                                    name
                                }
                            }
                        }
                        artists {
                            id
                            name
                            image
                        }
                        promoters {
                            id
                            name
                        }
                    }
                    listingDate
                }
                totalResults
            }
        }
    `;
    const data = await fetchGraphQL(query, { filters, pageSize });
    return data.data.eventListings;
}

async function searchAreas(queryTerm) {
    const query = `
        query Search($term: String!) {
            areas(searchTerm: $term) {
                id
                name
                country {
                    name
                }
            }
        }
    `;
    try {
        const data = await fetchGraphQL(query, { term: queryTerm });
        return data.data.areas || [];
    } catch (e) {
        console.error('RA Area Search Error:', e);
        return [];
    }
}

module.exports = {
    getEvent,
    getVenue,
    getArtist,
    getListings,
    searchAreas
};
