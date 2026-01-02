const { z } = require('zod');

const eventBase = {
    title: z.string().min(1, "Title is required").trim(),
    date: z.string().optional().nullable().transform(val => val === '' ? null : val), // Allow empty string as null
    start_time: z.string().optional().nullable(),
    end_time: z.string().optional().nullable(),
    venue_id: z.string().uuid().optional().nullable(),
    venue_name: z.string().optional().nullable(),
    venue_address: z.string().optional().nullable(),
    venue_city: z.string().optional().nullable(),
    venue_country: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    content_url: z.string().url().optional().nullable().or(z.literal('')),
    flyer_front: z.string().url().optional().nullable().or(z.literal('')),
    is_published: z.boolean().default(false),
    event_type: z.enum(['event', 'party', 'concert', 'exhibition']).default('event').optional(),
    artists: z.string().optional().nullable(), // Legacy string field

    // Artists list object structure
    artists_list: z.array(z.object({
        id: z.string().or(z.number()), // Can be UUID or Int or temp ID
        name: z.string().min(1)
    })).optional().nullable(),

    // Status Logic
    status: z.enum([
        'SCRAPED_DRAFT', 'MANUAL_DRAFT', 'REJECTED',
        'APPROVED_PENDING_DETAILS', 'READY_TO_PUBLISH',
        'PUBLISHED', 'CANCELED'
    ]).optional()
};

const createEventSchema = z.object({
    ...eventBase
});

const updateEventSchema = z.object({
    ...eventBase
}).partial(); // All fields optional for update

module.exports = {
    createEventSchema,
    updateEventSchema
};
