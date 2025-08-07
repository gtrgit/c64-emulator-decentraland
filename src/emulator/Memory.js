// Memory.js - C64 Memory Management with Bank Switching
// Clean room implementation following C64 memory map specification

export class Memory {
    constructor(size = 65536) {
        this.size = size;
        
        // Separate arrays for different memory types
        this.ram = new Uint8Array(size);        // 64KB RAM
        this.rom = new Uint8Array(size);        // ROM space (BASIC, KERNAL)
        this.charset = new Uint8Array(4096);    // Character ROM
        this.colorRAM = new Uint8Array(1024);   // Color RAM at $D800-$DBFF
        
        // I/O handlers for memory-mapped devices
        this.ioHandlers = new Map();
        
        // Bank switching configuration (controlled by $0001)
        this.bankConfig = 0x37; // Default: BASIC + KERNAL visible
        
        // Initialize color RAM with default color
        this.colorRAM.fill(14); // Light blue
    }
    
    setIOHandler(startAddr, endAddr, readHandler, writeHandler) {
        this.ioHandlers.set(`${startAddr}-${endAddr}`, {
            start: startAddr,
            end: endAddr,
            read: readHandler,
            write: writeHandler
        });
    }
    
    read(address) {
        address &= 0xFFFF; // Ensure 16-bit address
        
        // Color RAM ($D800-$DBFF)
        if (address >= 0xD800 && address <= 0xDBFF) {
            return this.colorRAM[address - 0xD800] & 0x0F;
        }
        
        // Check for I/O handler
        for (const [range, handler] of this.ioHandlers) {
            if (address >= handler.start && address <= handler.end) {
                return handler.read(address);
            }
        }
        
        // Bank switching logic based on $0001
        const config = this.bankConfig;
        
        // LORAM (bit 0): BASIC ROM at $A000-$BFFF
        // HIRAM (bit 1): KERNAL ROM at $E000-$FFFF
        // CHAREN (bit 2): Character ROM/IO at $D000-$DFFF
        
        // BASIC ROM area ($A000-$BFFF)
        if (address >= 0xA000 && address <= 0xBFFF) {
            if (config & 0x01) { // LORAM
                return this.rom[address];
            }
            return this.ram[address];
        }
        
        // IO/Character ROM area ($D000-$DFFF)
        if (address >= 0xD000 && address <= 0xDFFF) {
            if (!(config & 0x04)) { // CHAREN = 0, Character ROM visible
                return this.charset[address - 0xD000];
            }
            // IO area is visible (handled by IO handlers above)
            return this.ram[address];
        }
        
        // KERNAL ROM area ($E000-$FFFF)
        if (address >= 0xE000 && address <= 0xFFFF) {
            if (config & 0x02) { // HIRAM
                return this.rom[address];
            }
            return this.ram[address];
        }
        
        // Regular RAM
        return this.ram[address];
    }
    
    write(address, value) {
        address &= 0xFFFF;
        value &= 0xFF;
        
        // Special handling for $0000-$0001 (data direction and bank switching)
        if (address === 0x0001) {
            this.bankConfig = value;
            this.ram[address] = value;
            return;
        }
        
        // Color RAM ($D800-$DBFF)
        if (address >= 0xD800 && address <= 0xDBFF) {
            this.colorRAM[address - 0xD800] = value & 0x0F;
            return;
        }
        
        // Check for I/O handler
        for (const [range, handler] of this.ioHandlers) {
            if (address >= handler.start && address <= handler.end) {
                handler.write(address, value);
                return;
            }
        }
        
        // ROM areas are not writable, but writes go to underlying RAM
        this.ram[address] = value;
    }
    
    // Helper methods for 16-bit operations
    read16(address) {
        return this.read(address) | (this.read(address + 1) << 8);
    }
    
    write16(address, value) {
        this.write(address, value & 0xFF);
        this.write(address + 1, (value >> 8) & 0xFF);
    }
    
    // Load binary data at address
    load(address, data) {
        for (let i = 0; i < data.length; i++) {
            this.write(address + i, data[i]);
        }
    }
    
    // Get memory dump for debugging
    dump(startAddr, length = 256) {
        const result = [];
        for (let i = 0; i < length; i += 16) {
            const addr = startAddr + i;
            let line = addr.toString(16).padStart(4, '0') + ': ';
            let ascii = ' ';
            
            for (let j = 0; j < 16 && (i + j) < length; j++) {
                const byte = this.read(addr + j);
                line += byte.toString(16).padStart(2, '0') + ' ';
                ascii += (byte >= 32 && byte < 127) ? String.fromCharCode(byte) : '.';
            }
            
            result.push(line + ascii);
        }
        return result.join('\n');
    }
    
    // Clear all RAM
    clear() {
        this.ram.fill(0);
        this.colorRAM.fill(14);
    }
    
    // Get current bank configuration as string
    getBankConfigString() {
        const config = this.bankConfig;
        const banks = [];
        
        if (config & 0x01) banks.push('BASIC');
        if (config & 0x02) banks.push('KERNAL');
        if (config & 0x04) banks.push('IO'); else banks.push('CHAR');
        
        return banks.join('+');
    }
}