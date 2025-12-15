const app = require('./src/app');

// The app.js already has a listen call inside `if (require.main === module)`, 
// but if we require it here, that check is false.
// So we should start it here if we want this to be the entry point.
// OR we just change package.json to run `src/app.js`.

// However, to keep file structure compatible with Docker which might run `node server.js`:
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`[Entry] Server started via server.js on port ${PORT}`);
});
