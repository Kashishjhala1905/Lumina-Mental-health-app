// Root entry point for the Lumina backend.
// Loads the Express app from ./server/server.js and starts it (HTTP + Socket.io + reminder scheduler).
// `npm start` at the repository root runs server/server.js directly; this file is an equivalent alternative.
const path = require('path');
const { startServer } = require(path.join(__dirname, 'server', 'server.js'));

startServer();
