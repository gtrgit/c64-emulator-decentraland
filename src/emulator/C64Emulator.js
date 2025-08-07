// C64Emulator.js - Modernized ES6 C64 Emulator
// Based on c64js (MIT License) - Clean room implementation
// Summary: User wants to start C64 emulator development with modernized ES6 structure

import { MOS6502 } from './MOS6502.js';
import { VIC2 } from './VIC2.js';
import { CIA } from './CIA.js';
import { Memory } from './Memory.js';
import { SID } from './SID.js';
import { ROMLoader } from './ROMLoader.js';

export class C64Emulator {
    constructor(config = {}) {
        // Core components
        this.memory = new Memory(65536);
        this.cpu = new MOS6502(this.memory);
        this.vic = new VIC2(this.memory);
        this.cia1 = new CIA(1, this.memory);
        this.cia2 = new CIA(2, this.memory);
        this.sid = new SID(this.memory);

        // Around line 16, after creating this.vic
        this.vic = new VIC2(this.memory);
        console.log('VIC2 instance created:', this.vic);
        console.log('VIC2.cycle exists?', typeof this.vic.cycle);
        console.log('VIC2 methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(this.vic)));
        
        // Configuration
        this.config = {
            streaming: false,
            gamepad: false,
            palMode: true,
            ...config
        };
        
        // Timing
        this.running = false;
        this.frameCount = 0;
        this.cyclesPerFrame = this.config.palMode ? 19656 : 17095; // PAL vs NTSC
        this.frameRate = this.config.palMode ? 50 : 60;
        
        // Canvas for display
        this.canvas = null;
        this.ctx = null;
        
        // Callbacks
        this.onFrameComplete = null;
        this.onReset = null;
        
        // Performance tracking
        this.lastFrameTime = 0;
        this.actualFPS = 0;
    }
    
    async init(canvasElement) {
        // Set up display
        if (canvasElement) {
            this.canvas = canvasElement;
            this.ctx = this.canvas.getContext('2d');
            this.vic.setCanvas(this.canvas);
        }
        
        // Load ROMs
        await this.loadROMs();
        
        // Connect components
        this.connectComponents();
        
        // Initial reset
        this.reset();
        
        return this;
    }
    
    async loadROMs() {
        try {
            console.log('Loading MEGA65 Open ROMs...');
            const roms = await ROMLoader.loadMEGA65();
            
            // Load KERNAL ROM at $E000-$FFFF
            for (let i = 0; i < roms.kernal.length; i++) {
                this.memory.rom[0xE000 + i] = roms.kernal[i];
            }
            
            // Load BASIC ROM at $A000-$BFFF
            for (let i = 0; i < roms.basic.length; i++) {
                this.memory.rom[0xA000 + i] = roms.basic[i];
            }
            
            // Load Character ROM at $D000-$DFFF (VIC bank)
            for (let i = 0; i < roms.charset.length; i++) {
                this.memory.charset[i] = roms.charset[i];
            }
            
            console.log('ROMs loaded successfully');
        } catch (error) {
            console.error('Failed to load ROMs:', error);
            throw new Error('ROM loading failed - check that MEGA65 Open ROMs are available');
        }
    }
    
    connectComponents() {
        // Memory mapping
        // $D000-$D3FF: VIC-II
        this.memory.setIOHandler(0xD000, 0xD3FF, 
            (addr) => this.vic.read(addr),
            (addr, val) => this.vic.write(addr, val)
        );
        
        // $D400-$D7FF: SID
        this.memory.setIOHandler(0xD400, 0xD7FF,
            (addr) => this.sid.read(addr),
            (addr, val) => this.sid.write(addr, val)
        );
        
        // $DC00-$DCFF: CIA 1
        this.memory.setIOHandler(0xDC00, 0xDCFF,
            (addr) => this.cia1.read(addr),
            (addr, val) => this.cia1.write(addr, val)
        );
        
        // $DD00-$DDFF: CIA 2
        this.memory.setIOHandler(0xDD00, 0xDDFF,
            (addr) => this.cia2.read(addr),
            (addr, val) => this.cia2.write(addr, val)
        );
        
        // Connect IRQ/NMI lines
        this.vic.onIRQ = () => this.cpu.irq();
        this.cia1.onIRQ = () => this.cpu.irq();
        this.cia2.onNMI = () => this.cpu.nmi();
    }
    
    reset() {
        console.log('Resetting C64...');
        
        // Clear RAM
        for (let i = 0; i < 65536; i++) {
            this.memory.ram[i] = 0;
        }
        
        // Set up initial memory state
        this.memory.write(0x0000, 0x2F); // Data direction register
        this.memory.write(0x0001, 0x37); // Memory configuration
        
        // Reset all components
        this.cpu.reset();
        this.vic.reset();
        this.cia1.reset();
        this.cia2.reset();
        this.sid.reset();
        
        this.frameCount = 0;
        
        if (this.onReset) {
            this.onReset();
        }
    }
    
    run() {
        if (this.running) return;
        
        this.running = true;
        this.lastFrameTime = performance.now();
        this.runFrame();
    }
    
    stop() {
        this.running = false;
    }
    
    runFrame() {
        if (!this.running) return;
        
        const frameStart = performance.now();
        
        // Run one frame worth of CPU cycles
        let cycles = 0;
        while (cycles < this.cyclesPerFrame && this.running) {
            // Execute CPU instruction
            const cpuCycles = this.cpu.step();
            
            // Update VIC-II (it runs at 1MHz, same as CPU)
            for (let i = 0; i < cpuCycles; i++) {
                this.vic.cycle();
            }
            
            // Update CIAs (they run at 1MHz)
            this.cia1.cycle(cpuCycles);
            this.cia2.cycle(cpuCycles);
            
            // Update SID
            this.sid.cycle(cpuCycles);
            
            cycles += cpuCycles;
        }
        
        // Render frame
        this.vic.renderFrame();
        this.frameCount++;
        
        // Calculate FPS
        const now = performance.now();
        const frameTime = now - this.lastFrameTime;
        this.actualFPS = 1000 / frameTime;
        this.lastFrameTime = now;
        
        // Trigger frame complete callback
        if (this.onFrameComplete) {
            this.onFrameComplete(this.frameCount);
        }
        
        // Schedule next frame
        const targetFrameTime = 1000 / this.frameRate;
        const actualFrameTime = performance.now() - frameStart;
        const delay = Math.max(0, targetFrameTime - actualFrameTime);
        
        if (this.running) {
            setTimeout(() => this.runFrame(), delay);
        }
    }
    
    // Public API for external control
    loadPRG(data, address = null) {
        // PRG format: first two bytes are load address
        const loadAddr = address || (data[0] | (data[1] << 8));
        
        console.log(`Loading PRG at $${loadAddr.toString(16)}`);
        
        // Copy program to memory
        for (let i = 2; i < data.length; i++) {
            this.memory.write(loadAddr + i - 2, data[i]);
        }
        
        // Set BASIC pointers if loading to BASIC area
        if (loadAddr === 0x0801) {
            // Update BASIC program end pointer
            const endAddr = loadAddr + data.length - 2;
            this.memory.write(0x2D, endAddr & 0xFF);
            this.memory.write(0x2E, endAddr >> 8);
            this.memory.write(0x2F, endAddr & 0xFF);
            this.memory.write(0x30, endAddr >> 8);
        }
    }
    
    typeText(text) {
        // Simulate keyboard input
        for (const char of text) {
            this.cia1.typeChar(char);
        }
    }
    
    setJoystick(port, state) {
        // Port 1 or 2
        if (port === 1) {
            this.cia1.setJoystick(state);
        } else {
            this.cia2.setJoystick(state);
        }
    }
    
    getStats() {
        return {
            fps: this.actualFPS.toFixed(1),
            frameCount: this.frameCount,
            cpuPC: this.cpu.PC.toString(16).padStart(4, '0'),
            cpuA: this.cpu.A.toString(16).padStart(2, '0'),
            cpuX: this.cpu.X.toString(16).padStart(2, '0'),
            cpuY: this.cpu.Y.toString(16).padStart(2, '0'),
            rasterLine: this.vic.rasterY
        };
    }
    
    // For debugging
    peek(address) {
        return this.memory.read(address);
    }
    
    poke(address, value) {
        this.memory.write(address, value);
    }
    
    disassemble(address, lines = 10) {
        return this.cpu.disassemble(address, lines);
    }
}

// Export for use in browser or Node.js
if (typeof window !== 'undefined') {
    window.C64Emulator = C64Emulator;
}