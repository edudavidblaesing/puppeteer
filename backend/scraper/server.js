const http = require('http');
const app = require('./src/app');
const { initSocket } = require('./src/services/socketService');

const PORT = process.env.PORT || 3001;

const server = http.createServer(app);
const io = initSocket(server);

server.listen(PORT, () => {
    console.log(`[Entry] Server started via server.js on port ${PORT}`);
    console.log(`[Socket] Socket.io initialized`);
});
