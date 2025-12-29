const { z } = require('zod');

const processUrl = (val) => {
    if (!val) return val;
    if (typeof val !== 'string') return val;
    if (val.trim() === '') return '';
    let url = val.trim();
    if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
    }
    return url;
};

const venueSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    address: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
    blurb: z.string().optional().nullable(),
    content_url: z.preprocess(processUrl, z.string().url().optional().nullable().or(z.literal(''))),
    latitude: z.number().optional().nullable(),
    longitude: z.number().optional().nullable(),
    capacity: z.number().int().positive().optional().nullable(),
    venue_type: z.string().optional().nullable(),
    email: z.string().email().optional().nullable().or(z.literal('')),
    phone: z.string().optional().nullable()
});

const createVenueSchema = venueSchema;

const updateVenueSchema = venueSchema.partial();

module.exports = {
    createVenueSchema,
    updateVenueSchema
};
