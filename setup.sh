#!/bin/bash

# C64 Emulator Project Setup Script
# MIT Licensed - Clean room implementation

echo "🚀 Setting up C64 Emulator for Decentraland..."

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p src/emulator
mkdir -p src/streaming  
mkdir -p src/input
mkdir -p src/roms/mega65
mkdir -p public/roms/mega65
mkdir -p test/programs
mkdir -p examples
mkdir -p docs

# Create placeholder files for components that need implementation
echo "📝 Creating placeholder files..."

# MOS6502.js placeholder
cat > src/emulator/MOS6502.js << 'EOF'
// MOS6502.js - 6502 CPU Emulator
// TODO: Implement 6502 instruction set
export class MOS6502 {
    constructor(memory) {
        this.memory = memory;
        this.A = 0;    // Accumulator
        this.X = 0;    // X register
        this.Y = 0;    // Y register
        this.SP = 0xFF; // Stack pointer
        this.PC = 0;    // Program counter
        this.P = 0x20;  // Status register
        
        // Status flags
        this.flagN = false; // Negative
        this.flagV = false; // Overflow
        this.flagB = false; // Break
        this.flagD = false; // Decimal
        this.flagI = false; // Interrupt disable
        this.flagZ = false; // Zero
        this.flagC = false; // Carry
    }
    
    reset() {
        this.PC = this.memory.read16(0xFFFC);
        this.SP = 0xFF;
        this.P = 0x20;
    }
    
    step() {
        // TODO: Fetch, decode, execute
        const opcode = this.memory.read(this.PC++);
        // Basic NOP for now
        return 2; // Return cycles used
    }
    
    irq() {
        // TODO: Handle IRQ
    }
    
    nmi() {
        // TODO: Handle NMI
    }
}
EOF

# VIC2.js placeholder
cat > src/emulator/VIC2.js << 'EOF'
// VIC2.js - Video Interface Chip II
// TODO: Implement VIC-II graphics
export class VIC2 {
    constructor(memory) {
        this.memory = memory;
        this.canvas = null;
        this.ctx = null;
        this.rasterY = 0;
        this.registers = new Uint8Array(64);
    }
    
    setCanvas(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
    }
    
    reset() {
        this.rasterY = 0;
        this.registers.fill(0);
    }
    
    read(addr) {
        return this.registers[addr & 0x3F];
    }
    
    write(addr, value) {
        this.registers[addr & 0x3F] = value;
    }
    
    cycle() {
        // TODO: Implement raster line processing
        this.rasterY = (this.rasterY + 1) % 312;
    }
    
    renderFrame() {
        if (!this.ctx) return;
        // Basic blue screen for now
        this.ctx.fillStyle = '#40318D';
        this.ctx.fillRect(0, 0, 384, 272);
    }
}
EOF

# CIA.js placeholder
cat > src/emulator/CIA.js << 'EOF'
// CIA.js - Complex Interface Adapter
// TODO: Implement CIA timers and I/O
export class CIA {
    constructor(chipNumber, memory) {
        this.chipNumber = chipNumber;
        this.memory = memory;
        this.registers = new Uint8Array(16);
    }
    
    reset() {
        this.registers.fill(0);
    }
    
    read(addr) {
        return this.registers[addr & 0x0F];
    }
    
    write(addr, value) {
        this.registers[addr & 0x0F] = value;
    }
    
    cycle(cycles) {
        // TODO: Update timers
    }
    
    setJoystick(state) {
        // TODO: Handle joystick input
    }
}
EOF

# SID.js placeholder
cat > src/emulator/SID.js << 'EOF'
// SID.js - Sound Interface Device
// TODO: Implement SID audio synthesis
export class SID {
    constructor(memory) {
        this.memory = memory;
        this.registers = new Uint8Array(32);
    }
    
    reset() {
        this.registers.fill(0);
    }
    
    read(addr) {
        return this.registers[addr & 0x1F];
    }
    
    write(addr, value) {
        this.registers[addr & 0x1F] = value;
    }
    
    cycle(cycles) {
        // TODO: Generate audio
    }
}
EOF

# Create streaming adapter placeholder
cat > src/streaming/StreamingAdapter.js << 'EOF'
// StreamingAdapter.js - WebSocket streaming for Decentraland
export class StreamingAdapter {
    constructor(emulator) {
        this.emulator = emulator;
        this.ws = null;
    }
    
    connect(url = 'wss://localhost:3000/emulator') {
        console.log('Streaming adapter connecting...');
        // TODO: Implement WebSocket connection
    }
    
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
EOF

# Create gamepad input placeholder
cat > src/input/GamepadInput.js << 'EOF'
// GamepadInput.js - Xbox controller support
export class GamepadInput {
    constructor(emulator) {
        this.emulator = emulator;
        this.gamepadIndex = null;
        
        window.addEventListener('gamepadconnected', (e) => {
            this.gamepadIndex = e.gamepad.index;
            console.log('Gamepad connected:', e.gamepad.id);
        });
    }
}
EOF

# Create Vite config
cat > vite.config.js << 'EOF'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3001,
    https: {
      key: './key.pem',
      cert: './cert.pem'
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html'
      }
    }
  }
})
EOF

# Create README for MEGA65 ROMs
cat > src/roms/mega65/README.md << 'EOF'
# MEGA65 Open ROMs

To use the MEGA65 Open ROMs (GPL3, commercial use allowed):

1. Clone the MEGA65 repository:
   ```bash
   git clone https://github.com/MEGA65/open-roms.git
   ```

2. Build the ROMs:
   ```bash
   cd open-roms
   make
   ```

3. Copy the ROM files here:
   - mega65.rom
   - chargen.rom

These are clean-room implementations that avoid Commodore copyright.
EOF

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Generate self-signed certificates for HTTPS
echo "🔒 Generating self-signed certificates..."
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365 -subj "/CN=localhost"

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Copy the artifact files to their locations:"
echo "   - C64Emulator.js → src/emulator/"
echo "   - Memory.js → src/emulator/"
echo "   - ROMLoader.js → src/emulator/"
echo "   - index.html → project root"
echo ""
echo "2. Download MEGA65 Open ROMs (optional):"
echo "   npm run download-roms"
echo ""
echo "3. Start development server:"
echo "   npm run dev"
echo ""
echo "4. Open https://localhost:3001 in your browser"
echo ""
echo "🎮 Happy coding!"