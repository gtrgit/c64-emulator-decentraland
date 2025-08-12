// http-server.js - Simple HTTP server for testing (no certificates needed)
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

// Serve static files
app.use(express.static('.'));
app.use('/src', express.static('src'));
app.use('/public', express.static('public'));
app.use(express.static('public'));  // Add this line!

// Default route
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: __dirname });
});

// Start HTTP server (no certificates needed)
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════╗
║           C64 EMULATOR SERVER RUNNING          ║
╠════════════════════════════════════════════════╣
║                                                ║
║  🚀 Server: http://localhost:${PORT}             ║
║  📁 Root: ${process.cwd()}
║                                                ║
║  ✅ No certificates needed for HTTP            ║
║  📂 Serving all files from current directory   ║
║                                                ║
╚════════════════════════════════════════════════╝

Open your browser to: http://localhost:${PORT}
    `);
});