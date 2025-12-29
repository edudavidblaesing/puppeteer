const { z } = require('zod');

const artistSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    country: z.string().optional().nullable(),
    genres: z.union([z.string(), z.array(z.string())]).optional().nullable(),
    image_url: z.string().url().optional().nullable().or(z.literal('')),
    content_url: z.string().url().optional().nullable().or(z.literal('')),
    artist_type: z.string().optional().nullable(),
    bio: z.string().optional().nullable()
});

const createArtistSchema = artistSchema;

const updateArtistSchema = artistSchema.partial();

module.exports = {
    createArtistSchema,
    updateArtistSchema
};
