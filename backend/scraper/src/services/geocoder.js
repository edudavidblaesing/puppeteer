// using global fetch


// Geocoding using OpenStreetMap Nominatim (free, rate-limited to 1 req/sec)
const geocodeCache = new Map();
const GEOCODE_DELAY = 1100; // ms between requests to respect rate limit
let lastGeocodeTime = 0;
let consecutiveGeocodeErrors = 0;
const MAX_GEOCODE_ERRORS = 5;

async function geocodeAddress(address, city, country) {
    if (!address && !city) return null;

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
    if (cleanAddr) {
        const parts = cleanAddr.split(',').map(p => p.trim()).filter(Boolean);

        // Remove parts that match city or country
        const filteredParts = parts.filter(part => {
            const partLower = part.toLowerCase();
            if (cleanCity && partLower === cleanCity.toLowerCase()) return false;
            if (cleanCountry && partLower === cleanCountry.toLowerCase()) return false;

            // Remove if it contains "postal code + city" and we have the city separately
            if (cleanCity) {
                const cityPattern = new RegExp(`\\b\\d{4,5}\\s+${cleanCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                if (cityPattern.test(part)) return false;
            }

            // Remove if part ends with city or country
            if (cleanCity && partLower.endsWith(cleanCity.toLowerCase())) {
                const withoutCity = part.slice(0, -(cleanCity.length)).trim();
                // If what remains is just a postal code, keep the postal code
                if (/^\d{4,5}$/.test(withoutCity)) return true;
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
        cleanAddr = cleanAddr.replace(/[,;]+$/, '').trim();
    }

    const fullAddress = [cleanAddr, cleanCity, cleanCountry].filter(Boolean).join(', ');

    // Check cache first
    if (geocodeCache.has(fullAddress)) {
        return geocodeCache.get(fullAddress);
    }

    // Skip if we've had too many errors
    if (consecutiveGeocodeErrors >= MAX_GEOCODE_ERRORS) {
        if (Math.random() < 0.1) {
            console.warn('Geocoding skipped due to too many consecutive errors (403/429)');
        }
        return null;
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastGeocodeTime;
    if (timeSinceLastRequest < GEOCODE_DELAY) {
        await new Promise(resolve => setTimeout(resolve, GEOCODE_DELAY - timeSinceLastRequest));
    }
    lastGeocodeTime = Date.now();

    try {
        // Try multiple search strategies
        const searchStrategies = [
            [cleanAddr, cleanCity, cleanCountry].filter(Boolean).join(', '), // Full address
            [cleanAddr, cleanCity].filter(Boolean).join(', '), // Address + City only
            [cleanCity, cleanCountry].filter(Boolean).join(', ') // City + Country fallback
        ].filter(s => s.length > 0);

        for (const searchAddress of searchStrategies) {
            const query = encodeURIComponent(searchAddress);
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`,
                {
                    headers: {
                        'User-Agent': 'SocialEventsScraper/1.0 (admin@socialevents.com)'
                    }
                }
            );

            if (!response.ok) {
                console.warn(`Geocoding failed for "${searchAddress}": ${response.status}`);
                if (response.status === 403 || response.status === 429) {
                    consecutiveGeocodeErrors++;
                }
                continue;
            }

            consecutiveGeocodeErrors = 0; // Reset counter on success
            const data = await response.json();

            if (data && data.length > 0) {
                const result = {
                    latitude: parseFloat(data[0].lat),
                    longitude: parseFloat(data[0].lon)
                };
                geocodeCache.set(fullAddress, result);
                console.log(`Geocoded "${searchAddress}" -> ${result.latitude}, ${result.longitude}`);
                return result;
            }

            // Small delay between strategies
            if (searchStrategies.indexOf(searchAddress) < searchStrategies.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        geocodeCache.set(fullAddress, null);
        console.warn(`Could not geocode any strategy for: ${fullAddress}`);
        return null;
    } catch (error) {
        console.error(`Geocoding error for "${fullAddress}":`, error.message);
        return null;
    }
}

module.exports = { geocodeAddress };
