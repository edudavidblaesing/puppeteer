const app = require('./src/app');

const PORT = process.env.PORT || 3008;

app.listen(PORT, () => {
    console.log(`Scraper Worker running on port ${PORT}`);
});
