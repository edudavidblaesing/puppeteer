const { Vibrant } = require('node-vibrant/node');

/**
 * Calculates the contrast ratio between two hex colors.
 * Simplified luma calculation.
 */
function getContrast(hex1, hex2) {
    const getLuma = (hex) => {
        const rgb = parseInt(hex.substring(1), 16);
        const r = (rgb >> 16) & 0xff;
        const g = (rgb >> 8) & 0xff;
        const b = (rgb >> 0) & 0xff;
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const l1 = getLuma(hex1);
    const l2 = getLuma(hex2);
    const brightest = Math.max(l1, l2);
    const darkest = Math.min(l1, l2);
    return (brightest + 0.05) / (darkest + 0.05);
}

/**
 * Ensures text color has sufficient contrast against background (WCAG AA ~4.5).
 */
function ensureReadable(bgColor) {
    // Simple check: compare against white and black
    const contrastWhite = getContrast(bgColor, '#FFFFFF');
    const contrastBlack = getContrast(bgColor, '#000000');

    // Prefer white text for dark backgrounds, black for light
    // Add opacity for secondary text
    const textPrimary = contrastWhite >= contrastBlack ? '#FFFFFF' : '#000000';
    const textSecondary = contrastWhite >= contrastBlack ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';

    return { textPrimary, textSecondary };
}

/**
 * Extracts colors from an image URL and generates a theme.
 * @param {string} imageUrl 
 */
exports.extractColorsFromImage = async (imageUrl) => {
    try {
        if (!imageUrl) return null;
        console.log(`[ColorExtraction] Starting extraction for: ${imageUrl}`);

        // Extract palette
        // Vibrant.from accepts URL (string) or Buffer.
        // If specific headers are needed, we might need to fetch buffer first.
        // Let's try native Vibrant fetch first, but if RA blocks node-fetch logic inside Vibrant, we might need custom headers.

        let palette;
        try {
            palette = await Vibrant.from(imageUrl).getPalette();
            console.log(`[ColorExtraction] Palette extracted successfully`);
        } catch (vibrantError) {
            console.error(`[ColorExtraction] Vibrant.from failed:`, vibrantError);
            // attempt fallback: fetch with headers mimicking browser
            // const buffer = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0 ...' } }).then(r => r.buffer());
            // palette = await Vibrant.from(buffer).getPalette();
            throw vibrantError;
        }

        // Map Vibrant swatches to our roles
        // Vibrant provides: Vibrant, Muted, DarkVibrant, DarkMuted, LightVibrant, LightMuted

        let primary = palette.Vibrant?.hex || palette.LightVibrant?.hex || palette.DarkVibrant?.hex || '#cccccc';
        let secondary = palette.LightVibrant?.hex || palette.Vibrant?.hex || '#999999';
        let accent = palette.DarkVibrant?.hex || palette.Muted?.hex || '#666666';
        let background = palette.DarkMuted?.hex || palette.DarkVibrant?.hex || '#1a1a1a'; // Default to dark theme

        // Fallback checks
        if (!background) background = '#000000';

        // Accessibility Check
        const { textPrimary, textSecondary } = ensureReadable(background);

        const result = {
            primary,
            secondary,
            accent,
            background,
            textPrimary,
            textSecondary
        };
        console.log(`[ColorExtraction] Result:`, result);
        return result;
    } catch (error) {
        console.error('Color Extraction Error:', error);
        return null;
    }
};
