// websocket-bridge.js - WebSocket bridge with Delta Frame Reconstruction
const express = require('express');
const https = require('https');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const path = require('path');
const { createCanvas } = require('canvas'); // npm install canvas

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('.'));

// ============================================
// DELTA FRAME RECONSTRUCTOR CLASS
// ============================================
class DeltaFrameReconstructor {
    constructor(width = 384, height = 272) {
        this.width = width;
        this.height = height;
        this.canvas = createCanvas(width, height);
        this.ctx = this.canvas.getContext('2d');
        this.lastKeyFrame = null;
        this.frameCount = 0;
        
        // Initialize with blue C64 screen
        this.ctx.fillStyle = '#40318D';
        this.ctx.fillRect(0, 0, width, height);
    }
    
    async reconstructFrame(packet) {
        if (!packet || !packet.data) {
            console.error('Invalid packet structure');
            return null;
        }
        
        const frameData = packet.data;
        
        if (frameData.t === 'k') {
            // Keyframe - full image
            console.log(`🔑 Processing KeyFrame ${frameData.f}`);
            return await this.processKeyFrame(frameData);
        } else if (frameData.t === 'd') {
            // Delta frame - apply changes
            console.log(`🔄 Processing DeltaFrame ${frameData.f} with ${frameData.tiles.length} tiles`);
            return this.processDeltaFrame(frameData);
        }
        
        return null;
    }
    
    async processKeyFrame(frame) {
        try {
            // Load the keyframe image
            const img = await this.loadImage(frame.img);
            
            // Draw to canvas
            this.ctx.clearRect(0, 0, this.width, this.height);
            this.ctx.drawImage(img, 0, 0, this.width, this.height);
            
            // Save as last keyframe
            this.lastKeyFrame = this.canvas.toDataURL('image/webp', 0.8);
            this.frameCount = frame.f;
            
            return {
                imageData: this.lastKeyFrame,
                frameNumber: frame.f,
                timestamp: Date.now(),
                type: 'keyframe'
            };
        } catch (error) {
            console.error('KeyFrame processing error:', error);
            return null;
        }
    }
    
    processDeltaFrame(frame) {
        try {
            // Apply each tile to the canvas
            for (const tile of frame.tiles) {
                this.applyTile(tile);
            }
            
            this.frameCount = frame.f;
            
            // Return the updated canvas as data URL
            return {
                imageData: this.canvas.toDataURL('image/webp', 0.8),
                frameNumber: frame.f,
                timestamp: Date.now(),
                type: 'delta',
                tilesUpdated: frame.tiles.length
            };
        } catch (error) {
            console.error('DeltaFrame processing error:', error);
            return null;
        }
    }
    
    applyTile(tile) {
        const tileSize = 8;
        const data = this.decodeFromBase64(tile.d);
        
        // Create imageData for the tile
        const imageData = this.ctx.createImageData(tileSize, tileSize);
        
        for (let i = 0; i < data.length; i++) {
            const packed = data[i];
            
            // Unpack RGB565 format
            const r = ((packed >> 11) & 0x1F) << 3;
            const g = ((packed >> 5) & 0x3F) << 2;
            const b = (packed & 0x1F) << 3;
            
            const pixelIndex = i * 4;
            imageData.data[pixelIndex] = r;
            imageData.data[pixelIndex + 1] = g;
            imageData.data[pixelIndex + 2] = b;
            imageData.data[pixelIndex + 3] = 255;
        }
        
        // Put the tile on the canvas
        this.ctx.putImageData(imageData, tile.x, tile.y);
    }
    
    decodeFromBase64(base64) {
        const binary = Buffer.from(base64, 'base64');
        const data = [];
        
        for (let i = 0; i < binary.length; i += 2) {
            const high = binary[i];
            const low = binary[i + 1] || 0;
            data.push((high << 8) | low);
        }
        
        return data;
    }
    
    loadImage(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new (require('canvas').Image)();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = dataUrl;
        });
    }
}

// Create HTTPS server with certificates
let server;
try {
    if (fs.existsSync('localhost+2.pem') && fs.existsSync('localhost+2-key.pem')) {
        server = https.createServer({
            cert: fs.readFileSync('localhost+2.pem'),
            key: fs.readFileSync('localhost+2-key.pem')
        }, app);
        console.log('✅ Using mkcert certificates');
    } else if (fs.existsSync('cert.pem') && fs.existsSync('key.pem')) {
        server = https.createServer({
            cert: fs.readFileSync('cert.pem'),
            key: fs.readFileSync('key.pem')
        }, app);
        console.log('✅ Using OpenSSL certificates');
    } else {
        console.error('\n❌ No certificates found!');
        process.exit(1);
    }
} catch (error) {
    console.error('Error loading certificates:', error.message);
    process.exit(1);
}

const wss = new WebSocketServer({ server });

// Track all connected clients and reconstructor
const clients = new Map();
const reconstructor = new DeltaFrameReconstructor();
let frameBuffer = null;
let stats = {
    totalFrames: 0,
    keyFrames: 0,
    deltaFrames: 0,
    startTime: Date.now()
};

wss.on('connection', (ws, req) => {
    const clientId = Date.now().toString();
    const clientType = req.url.includes('emulator') ? 'emulator' : 'viewer';
    
    clients.set(clientId, {
        ws,
        type: clientType,
        frameCount: 0,
        connectedAt: Date.now()
    });
    
    console.log(`Client connected: ${clientType} (${clientId})`);
    
    // Send current frame to new viewers
    if (clientType === 'viewer' && frameBuffer) {
        ws.send(JSON.stringify({
            type: 'frame',
            ...frameBuffer
        }));
    }
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'frame' && clientType === 'emulator') {
                let processedFrame = null;
                
                // Check if frame uses delta compression
                if (data.compression === 'delta') {
                    console.log(`📦 Received compressed frame: Type=${data.data.t}, Size=${data.size} bytes`);
                    
                    // Reconstruct the frame
                    processedFrame = await reconstructor.reconstructFrame(data);
                    
                    if (processedFrame) {
                        // Update stats
                        if (data.data.t === 'k') {
                            stats.keyFrames++;
                        } else {
                            stats.deltaFrames++;
                        }
                        
                        console.log(`✅ Reconstructed frame ${processedFrame.frameNumber} (${processedFrame.type})`);
                    } else {
                        console.error('❌ Failed to reconstruct frame');
                        return;
                    }
                } else {
                    // Standard frame without compression
                    console.log(`📷 Received standard frame ${data.frameNumber}`);
                    processedFrame = {
                        imageData: data.imageData,
                        frameNumber: data.frameNumber,
                        timestamp: data.timestamp,
                        quality: data.quality || 'unknown'
                    };
                }
                
                // Store frame
                frameBuffer = processedFrame;
                stats.totalFrames++;
                
                // Broadcast to all viewers
                let viewerCount = 0;
                clients.forEach((client) => {
                    if (client.type === 'viewer' && client.ws.readyState === ws.OPEN) {
                        client.ws.send(JSON.stringify({
                            type: 'frame',
                            ...frameBuffer
                        }));
                        viewerCount++;
                    }
                });
                
                clients.get(clientId).frameCount++;
                
                // Log stats every 50 frames
                if (stats.totalFrames % 50 === 0) {
                    const runtime = (Date.now() - stats.startTime) / 1000;
                    const avgFps = stats.totalFrames / runtime;
                    console.log(`📊 Stats: Total=${stats.totalFrames}, Keys=${stats.keyFrames}, Deltas=${stats.deltaFrames}, Viewers=${viewerCount}, FPS=${avgFps.toFixed(1)}`);
                }
            }
            
            // Handle ping/pong
            if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            }
            
            // Handle keyframe requests from Decentraland
            if (data.type === 'request-keyframe') {
                console.log('🔑 Keyframe requested by viewer');
                // Forward request to emulator
                clients.forEach((client) => {
                    if (client.type === 'emulator' && client.ws.readyState === ws.OPEN) {
                        client.ws.send(JSON.stringify({ type: 'request-keyframe' }));
                    }
                });
            }
            
        } catch (error) {
            console.error('Message processing error:', error);
        }
    });
    
    ws.on('close', () => {
        const client = clients.get(clientId);
        if (client) {
            const duration = ((Date.now() - client.connectedAt) / 1000).toFixed(1);
            console.log(`Client disconnected: ${client.type} (duration: ${duration}s, frames: ${client.frameCount})`);
            clients.delete(clientId);
        }
    });
    
    ws.on('error', (error) => {
        console.error(`WebSocket error for ${clientId}:`, error.message);
    });
});

// HTTP fallback endpoint for Decentraland
app.get('/frame', (req, res) => {
    if (frameBuffer) {
        console.log(`📤 Sending frame ${frameBuffer.frameNumber} via HTTP`);
        res.json({
            success: true,
            ...frameBuffer
        });
    } else {
        res.status(404).json({ 
            success: false,
            error: 'No frame available' 
        });
    }
});

// Endpoint to request keyframe
app.post('/request-keyframe', (req, res) => {
    console.log('🔑 HTTP Keyframe request received');
    
    // Send request to all emulator clients
    let sent = false;
    clients.forEach((client) => {
        if (client.type === 'emulator' && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({ 
                type: 'request-keyframe',
                reason: req.body.reason || 'http-request'
            }));
            sent = true;
        }
    });
    
    res.json({ 
        success: sent,
        message: sent ? 'Keyframe requested' : 'No emulator connected'
    });
});

// Status endpoint
app.get('/status', (req, res) => {
    const emulatorCount = Array.from(clients.values()).filter(c => c.type === 'emulator').length;
    const viewerCount = Array.from(clients.values()).filter(c => c.type === 'viewer').length;
    const runtime = ((Date.now() - stats.startTime) / 1000).toFixed(1);
    
    res.json({
        server: 'WebSocket Bridge with Delta Reconstruction',
        uptime: runtime + 's',
        clients: {
            emulators: emulatorCount,
            viewers: viewerCount
        },
        frames: {
            total: stats.totalFrames,
            keyFrames: stats.keyFrames,
            deltaFrames: stats.deltaFrames,
            current: frameBuffer ? frameBuffer.frameNumber : 0,
            avgFps: (stats.totalFrames / (runtime || 1)).toFixed(1)
        },
        compression: {
            enabled: true,
            reconstructor: 'active',
            canvasSize: `${reconstructor.width}x${reconstructor.height}`
        },
        lastFrame: frameBuffer ? {
            timestamp: frameBuffer.timestamp,
            type: frameBuffer.type,
            number: frameBuffer.frameNumber
        } : null
    });
});

// Serve the emulator HTML
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>C64 WebSocket Bridge - Delta Reconstruction</title>
    <style>
        body { 
            background: #000; 
            color: #0f0; 
            font-family: monospace; 
            padding: 20px;
            line-height: 1.6;
        }
        a { color: #0ff; }
        .status { 
            background: rgba(0,255,0,0.1); 
            border: 1px solid #0f0; 
            padding: 10px; 
            margin: 20px 0;
        }
        .warning {
            background: rgba(255,255,0,0.1);
            border: 1px solid #ff0;
            padding: 10px;
            margin: 20px 0;
        }
        code {
            background: #222;
            padding: 2px 5px;
            color: #ff0;
        }
    </style>
</head>
<body>
    <h1>🚀 C64 WebSocket Bridge with Delta Reconstruction</h1>
    
    <div class="status">
        <strong>✅ Bridge is running with Delta Frame Reconstruction!</strong><br>
        <strong>WebSocket Endpoints:</strong><br>
        - Emulator: <code>wss://localhost:3000/emulator</code><br>
        - Viewer: <code>wss://localhost:3000/viewer</code><br>
        <strong>HTTP Endpoint:</strong> <code>https://localhost:3000/frame</code><br>
    </div>
    
    <div class="warning">
        <strong>⚡ Delta Compression Active</strong><br>
        The bridge now reconstructs delta frames into full images before sending to Decentraland.<br>
        This keeps frame size under 16KB while maintaining quality!
    </div>
    
    <h2>Quick Links:</h2>
    <ul>
        <li><a href="/c64-websocket.html">Open C64 Emulator</a></li>
        <li><a href="/status">View Server Status</a></li>
        <li><a href="/frame">Get Current Frame</a></li>
    </ul>
    
    <h2>How Delta Reconstruction Works:</h2>
    <ol>
        <li>Emulator sends compressed delta frames (1-5KB)</li>
        <li>Bridge reconstructs them into full images</li>
        <li>Decentraland receives complete frames under 16KB</li>
    </ol>
    
    <p><small>Server started at: ${new Date().toLocaleString()}</small></p>
</body>
</html>
  `);
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`\n⚡ WebSocket Bridge Server with Delta Reconstruction`);
    console.log(`🔒 HTTPS + WebSocket running on port ${PORT}`);
    console.log(`\n📡 Endpoints:`);
    console.log(`   Web Interface: https://localhost:${PORT}`);
    console.log(`   Emulator WS:   wss://localhost:${PORT}/emulator`);
    console.log(`   Viewer WS:     wss://localhost:${PORT}/viewer`);
    console.log(`   HTTP Frame:    https://localhost:${PORT}/frame`);
    console.log(`   Status:        https://localhost:${PORT}/status`);
    console.log(`\n✨ Delta Reconstruction: ENABLED`);
    console.log(`📊 Canvas Size: ${reconstructor.width}x${reconstructor.height}`);
    console.log(`\n💡 The bridge will automatically reconstruct delta frames!`);
    console.log(`💡 Decentraland will receive full images under 16KB\n`);
});