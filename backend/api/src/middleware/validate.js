const { ZodError } = require('zod');

const validate = (schema) => (req, res, next) => {
    try {
        // Parse request body against schema
        // .parse() throws if invalid, returns clean data if valid
        const validData = schema.parse(req.body);

        // Replace req.body with validated data to strip unknown fields (if schema uses .strict())
        // or just ensure types.
        req.body = validData;

        next();
    } catch (error) {
        if (error instanceof ZodError) {
            console.log('Validation Error:', error); // Debug log
            return res.status(400).json({
                error: 'Validation failed',
                details: error.errors ? error.errors.map(e => ({
                    path: e.path.join('.'),
                    message: e.message
                })) : []
            });
        }
        next(error);
    }
};

module.exports = validate;
