// ROMLoader.js - Load MEGA65 Open ROMs (GPL3, commercial-use compatible)
// These are clean-room implementations that avoid Commodore copyright

export class ROMLoader {
    static async loadMEGA65() {
        console.log('Loading MEGA65 Open ROMs (GPL3 licensed)...');
        
        try {
            // Try to load from local files first
            const roms = await this.loadFromFiles();
            if (roms) return roms;
        } catch (e) {
            console.log('Local ROMs not found, using embedded minimal ROMs');
        }
        
        // Fallback: Use minimal embedded ROM for testing
        return this.getMinimalTestROMs();
    }
    
    static async loadFromFiles() {
        const baseUrl = '/roms/mega65/';
        
        const responses = await Promise.all([
            fetch(baseUrl + 'mega65.rom'),     // Combined ROM
            fetch(baseUrl + 'chargen.rom')     // Character ROM
        ]);
        
        if (!responses.every(r => r.ok)) {
            throw new Error('Failed to load ROM files');
        }
        
        const [megaRom, charRom] = await Promise.all(
            responses.map(r => r.arrayBuffer())
        );
        
        // MEGA65 ROM layout:
        // $8000-$BFFF: BASIC (16KB)
        // $E000-$FFFF: KERNAL (8KB)
        
        const megaData = new Uint8Array(megaRom);
        
        return {
            basic: megaData.slice(0x0000, 0x4000),    // 16KB BASIC
            kernal: megaData.slice(0x6000, 0x8000),   // 8KB KERNAL
            charset: new Uint8Array(charRom)          // 4KB charset
        };
    }
    
    static getMinimalTestROMs() {
        // Minimal ROM implementation for testing
        // This provides just enough to get a BASIC prompt
        
        const kernal = new Uint8Array(8192);
        const basic = new Uint8Array(16384);
        const charset = this.generateCharset();
        
        // Minimal KERNAL vectors at $FFFA-$FFFF
        // NMI vector
        kernal[0x1FFA] = 0x00;
        kernal[0x1FFB] = 0xFE;
        
        // RESET vector - point to minimal init
        kernal[0x1FFC] = 0x00;
        kernal[0x1FFD] = 0xFC;
        
        // IRQ vector
        kernal[0x1FFE] = 0x00;
        kernal[0x1FFF] = 0xFF;
        
        // Minimal RESET routine at $FC00
        const resetRoutine = [
            0x78,       // SEI - disable interrupts
            0xD8,       // CLD - clear decimal mode
            0xA2, 0xFF, // LDX #$FF
            0x9A,       // TXS - set stack pointer
            0xA9, 0x37, // LDA #$37
            0x85, 0x01, // STA $01 - set memory config
            0xA9, 0x2F, // LDA #$2F
            0x85, 0x00, // STA $00 - data direction
            
            // Clear screen
            0xA9, 0x20, // LDA #$20 (space character)
            0xA2, 0x00, // LDX #$00
            // Loop at $FC10
            0x9D, 0x00, 0x04, // STA $0400,X
            0x9D, 0x00, 0x05, // STA $0500,X
            0x9D, 0x00, 0x06, // STA $0600,X
            0x9D, 0x00, 0x07, // STA $0700,X
            0xE8,             // INX
            0xD0, 0xF1,       // BNE loop
            
            // Set screen colors
            0xA9, 0x0E, // LDA #$0E (light blue)
            0xA2, 0x00, // LDX #$00
            // Loop at $FC24
            0x9D, 0x00, 0xD8, // STA $D800,X
            0x9D, 0x00, 0xD9, // STA $D900,X
            0x9D, 0x00, 0xDA, // STA $DA00,X
            0x9D, 0x00, 0xDB, // STA $DB00,X
            0xE8,             // INX
            0xD0, 0xF1,       // BNE loop
            
            // Display ready message
            0xA9, 0x52, // LDA #'R'
            0x8D, 0x00, 0x04, // STA $0400
            0xA9, 0x45, // LDA #'E'
            0x8D, 0x01, 0x04, // STA $0401
            0xA9, 0x41, // LDA #'A'
            0x8D, 0x02, 0x04, // STA $0402
            0xA9, 0x44, // LDA #'D'
            0x8D, 0x03, 0x04, // STA $0403
            0xA9, 0x59, // LDA #'Y'
            0x8D, 0x04, 0x04, // STA $0404
            0xA9, 0x2E, // LDA #'.'
            0x8D, 0x05, 0x04, // STA $0405
            
            // Infinite loop
            0x4C, 0x4D, 0xFC  // JMP $FC4D
        ];
        
        // Write reset routine to KERNAL ROM
        for (let i = 0; i < resetRoutine.length; i++) {
            kernal[0x1C00 + i] = resetRoutine[i];
        }
        
        // IRQ handler at $FF00 - just RTI
        kernal[0x1F00] = 0x40; // RTI
        
        // NMI handler at $FE00 - just RTI  
        kernal[0x1E00] = 0x40; // RTI
        
        console.log('Using minimal test ROMs - full MEGA65 ROMs recommended');
        
        return { kernal, basic, charset };
    }
    
    static generateCharset() {
        // Generate a basic charset for testing
        // This creates a simple 8x8 font for ASCII characters
        
        const charset = new Uint8Array(4096);
        
        // Basic uppercase letters A-Z (PETSCII 1-26)
        const basicFont = {
            // A
            1: [0x18, 0x3C, 0x66, 0x7E, 0x66, 0x66, 0x66, 0x00],
            // B
            2: [0x7C, 0x66, 0x66, 0x7C, 0x66, 0x66, 0x7C, 0x00],
            // C
            3: [0x3C, 0x66, 0x60, 0x60, 0x60, 0x66, 0x3C, 0x00],
            // D
            4: [0x78, 0x6C, 0x66, 0x66, 0x66, 0x6C, 0x78, 0x00],
            // E
            5: [0x7E, 0x60, 0x60, 0x78, 0x60, 0x60, 0x7E, 0x00],
            // ... Add more as needed
            
            // Space (32)
            32: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
            
            // Period (46)
            46: [0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x18, 0x00],
        };
        
        // Map PETSCII codes to character data
        const petsciiMap = {
            0x20: 32,  // Space
            0x2E: 46,  // Period
            0x41: 1,   // A
            0x42: 2,   // B
            0x43: 3,   // C
            0x44: 4,   // D
            0x45: 5,   // E
            0x52: 1,   // R (reuse A pattern for now)
            0x59: 1,   // Y (reuse A pattern for now)
        };
        
        // Fill charset with character patterns
        for (const [petscii, fontIndex] of Object.entries(petsciiMap)) {
            const charData = basicFont[fontIndex] || basicFont[32]; // Default to space
            const offset = parseInt(petscii) * 8;
            
            for (let i = 0; i < 8; i++) {
                charset[offset + i] = charData[i];
            }
        }
        
        // Fill in a default pattern for undefined characters
        const defaultPattern = [0x7E, 0x7E, 0x7E, 0x7E, 0x7E, 0x7E, 0x7E, 0x00];
        for (let c = 0; c < 256; c++) {
            const offset = c * 8;
            if (charset[offset] === 0 && charset[offset + 1] === 0) {
                for (let i = 0; i < 8; i++) {
                    charset[offset + i] = defaultPattern[i];
                }
            }
        }
        
        return charset;
    }
    
    // Helper to download and prepare official MEGA65 ROMs
    static async downloadMEGA65() {
        console.log(`
To use official MEGA65 Open ROMs:

1. Clone the MEGA65 repository:
   git clone https://github.com/MEGA65/open-roms.git

2. Build the ROMs:
   cd open-roms
   make

3. Copy the generated ROM files to your project:
   cp mega65.rom ../path/to/your/project/public/roms/mega65/
   cp chargen.rom ../path/to/your/project/public/roms/mega65/

These ROMs are GPL3 licensed and safe for commercial use.
        `);
    }
}