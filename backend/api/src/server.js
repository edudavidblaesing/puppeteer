const app = require('./app');

const PORT = process.env.PORT || 3007;

app.listen(PORT, () => {
    console.log(`API Service running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
