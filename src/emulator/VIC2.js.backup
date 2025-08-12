// VIC2.js - Minimal VIC-II Graphics Implementation
// Enough to display text mode for BASIC

export class VIC2 {
    constructor(memory) {
        this.memory = memory;
        this.canvas = null;
        this.ctx = null;
        
        // VIC-II registers
        this.registers = new Uint8Array(64);
        
        // Screen properties
        this.screenWidth = 320;
        this.screenHeight = 200;
        this.borderWidth = 32;
        this.borderHeight = 35;
        this.totalWidth = 384;
        this.totalHeight = 272;
        
        // Timing
        this.rasterY = 0;
        this.cycleCounter = 0;
        this.frameComplete = false;
        
        // Colors
        this.colors = [
            '#000000', // 0 Black
            '#FFFFFF', // 1 White
            '#880000', // 2 Red
            '#AAFFEE', // 3 Cyan
            '#CC44CC', // 4 Purple
            '#00CC55', // 5 Green
            '#0000AA', // 6 Blue
            '#EEEE77', // 7 Yellow
            '#DD8855', // 8 Orange
            '#664400', // 9 Brown
            '#FF7777', // 10 Light Red
            '#333333', // 11 Dark Gray
            '#777777', // 12 Medium Gray
            '#AAFF66', // 13 Light Green
            '#0088FF', // 14 Light Blue
            '#BBBBBB'  // 15 Light Gray
        ];
        
        // Default colors
        this.borderColor = 14; // Light blue
        this.backgroundColor = 6; // Blue
        
        // Character ROM pointer
        this.charRomBase = 0xD000;
    }
    
    setCanvas(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;
        
        // Create offscreen buffer for better performance
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCanvas.width = this.totalWidth;
        this.offscreenCanvas.height = this.totalHeight;
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');
        this.offscreenCtx.imageSmoothingEnabled = false;
    }
    
    reset() {
        this.rasterY = 0;
        this.cycle = 0;
        this.registers.fill(0);
        
        // Set default register values
        this.registers[0x20] = 14; // Border color
        this.registers[0x21] = 6;  // Background color
    }
    
    read(addr) {
        const reg = addr & 0x3F;
        
        // Raster counter
        if (reg === 0x12) {
            return this.rasterY & 0xFF;
        }
        if (reg === 0x11) {
            return ((this.rasterY & 0x100) >> 1) | (this.registers[reg] & 0x7F);
        }
        
        return this.registers[reg];
    }
    
    write(addr, value) {
        const reg = addr & 0x3F;
        this.registers[reg] = value;
        
        // Update colors
        if (reg === 0x20) {
            this.borderColor = value & 0x0F;
        }
        if (reg === 0x21) {
            this.backgroundColor = value & 0x0F;
        }
    }
    
    cycle() {
        this.cycleCounter++;
        
        // Simple raster line counter
        if (this.cycleCounter >= 63) {
            this.cycleCounter = 0;
            this.rasterY++;
            
            if (this.rasterY >= 312) { // PAL
                this.rasterY = 0;
                this.frameComplete = true;
            }
        }
    }
    
    renderFrame() {
        if (!this.ctx) return;
        
        // Clear with border color
        this.offscreenCtx.fillStyle = this.colors[this.borderColor];
        this.offscreenCtx.fillRect(0, 0, this.totalWidth, this.totalHeight);
        
        // Draw main screen area
        this.offscreenCtx.fillStyle = this.colors[this.backgroundColor];
        this.offscreenCtx.fillRect(
            this.borderWidth, 
            this.borderHeight, 
            this.screenWidth, 
            this.screenHeight
        );
        
        // Draw text screen (40x25 characters)
        this.drawTextMode();
        
        // Copy to main canvas
        this.ctx.drawImage(this.offscreenCanvas, 0, 0);
        
        this.frameComplete = false;
    }
    
    drawTextMode() {
        // Screen memory at $0400, color memory at $D800
        const screenBase = 0x0400;
        const colorBase = 0xD800;
        
        // Draw 40x25 characters
        for (let row = 0; row < 25; row++) {
            for (let col = 0; col < 40; col++) {
                const offset = row * 40 + col;
                const charCode = this.memory.read(screenBase + offset);
                const color = this.memory.read(colorBase + offset) & 0x0F;
                
                this.drawCharacter(
                    col * 8 + this.borderWidth,
                    row * 8 + this.borderHeight,
                    charCode,
                    color
                );
            }
        }
    }
    
    drawCharacter(x, y, charCode, color) {
        // Get character data from ROM
        const charAddr = charCode * 8;
        
        // Use actual charset if available, otherwise use test pattern
        for (let line = 0; line < 8; line++) {
            let charData = 0;
            
            // Try to read from character ROM
            if (this.memory.charset) {
                charData = this.memory.charset[charAddr + line];
            } else {
                // Fallback: simple test pattern for some characters
                if (charCode === 32) { // Space
                    charData = 0x00;
                } else if (charCode >= 1 && charCode <= 26) { // A-Z
                    // Simple block pattern for letters
                    charData = 0xFF;
                } else if (charCode >= 48 && charCode <= 57) { // 0-9
                    charData = 0xFF;
                } else if (charCode === 46) { // Period
                    charData = (line === 7) ? 0x18 : 0x00;
                } else {
                    // Default pattern for unknown characters
                    charData = 0x00;
                }
            }
            
            // Draw 8 pixels
            for (let bit = 0; bit < 8; bit++) {
                if ((charData & (0x80 >> bit)) !== 0) {
                    this.offscreenCtx.fillStyle = this.colors[color];
                    this.offscreenCtx.fillRect(x + bit, y + line, 1, 1);
                }
            }
        }
    }
    
    // Check for raster interrupt
    checkRasterIRQ() {
        const rasterLine = (this.registers[0x12] | ((this.registers[0x11] & 0x80) << 1));
        
        if (this.rasterY === rasterLine) {
            // Set interrupt flag
            this.registers[0x19] |= 0x01;
            
            // Trigger CPU IRQ if enabled
            if (this.registers[0x1A] & 0x01) {
                return true;
            }
        }
        return false;
    }
}