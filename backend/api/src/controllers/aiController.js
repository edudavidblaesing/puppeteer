const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { AppError, catchAsync } = require('@social-events/shared');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

exports.rewriteContent = catchAsync(async (req, res, next) => {
    const { text, type, context } = req.body; // context can be { venue, city, etc } for better titles

    if (!text) {
        return next(new AppError('No text provided', 400));
    }

    if (!GEMINI_API_KEY) {
        return next(new AppError('AI Service Not Configured (Missing API Key)', 503));
    }

    let systemInstruction = "";
    let prompt = "";

    if (type === 'title') {
        systemInstruction = "You are a helpful assistant that rewrites event titles into neutral, factual formats. Remove promotional language.";
        prompt = `Rewrite the following event title into a neutral, factual format. 
        Rules:
        - Remove promotional words (Ultimate, Best, Experience, Unmissable, etc).
        - PRESERVE specific artist names, tour names, and subtitles (e.g., "Back to Badlands", "World Tour").
        - Format: "[Artist/Event Name]: [Subtitle/Tour] at [Venue]" OR "[Artist] at [Venue]" if no subtitle.
        - Do NOT add the city unless it's part of the event name itself.
        - Keep it concise but descriptive.
        
        Example Input: "Halsey: Back to Badlands - The Ultimate Experience" 
        Example Output: "Halsey: Back to Badlands at [Venue]"
        
        Input Title: "${text}"
        ${context ? `Context: Venue=${context.venue}` : ''}`;
    } else if (type === 'description') {
        systemInstruction = "You are an encyclopedia editor. Write new, factual summaries based ONLY on the provided text.";
        prompt = `Write a neutral, factual summary of the following event description.
        Rules:
        - Create a NEW summary, do not just paraphrase.
        - Focus on facts: lineup/artists, start time, venue, musical genre.
        - NO promotional language, storytelling, or emotional adjectives.
        - Tone: Encyclopedia entry.
        - Length: Concise paragraph (2-3 sentences).
        
        Input Text:
        "${text}"`;
    } else {
        return next(new AppError('Invalid type. Must be title or description', 400));
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                system_instruction: {
                    parts: [{ text: systemInstruction }]
                }
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`Gemini API Error: ${response.status} ${JSON.stringify(errData)}`);
        }

        const data = await response.json();
        const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!candidate) {
            throw new Error('No content generated');
        }

        res.json({
            status: 'success',
            data: {
                rewritten: candidate.trim()
            }
        });

    } catch (error) {
        console.error('AI Rewrite Error:', error);
        return next(new AppError('Failed to generate content: ' + error.message, 500));
    }
});
