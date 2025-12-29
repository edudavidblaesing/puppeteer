const { z } = require('zod');

const organizerSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional().nullable(),
    image_url: z.string().url().optional().nullable().or(z.literal('')),
    website: z.string().url().optional().nullable().or(z.literal('')),
    website_url: z.string().url().optional().nullable().or(z.literal('')) // Alias for website
});

const createOrganizerSchema = organizerSchema;

const updateOrganizerSchema = organizerSchema.partial();

module.exports = {
    createOrganizerSchema,
    updateOrganizerSchema
};
