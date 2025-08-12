// ROMLoader.js - Updated for Generic Open ROMs from GitHub
export class ROMLoader {
    static async loadMEGA65() {
        console.log('Loading Generic C64 Open ROMs...');
        
        try {
            // Try to load the generic ROM files
            const [basicResp, kernalResp, charResp] = await Promise.all([
                fetch('/roms/mega65/basic_generic.rom'),
                fetch('/roms/mega65/kernal_generic.rom'),
                fetch('/roms/mega65/chargen_openroms.rom')
            ]);
            
            if (basicResp.ok && kernalResp.ok && charResp.ok) {
                const basic = new Uint8Array(await basicResp.arrayBuffer());
                const kernal = new Uint8Array(await kernalResp.arrayBuffer());
                const charset = new Uint8Array(await charResp.arrayBuffer());
                
                console.log('✅ Generic Open ROMs loaded successfully!');
                console.log(`  BASIC: ${basic.length} bytes`);
                console.log(`  KERNAL: ${kernal.length} bytes`);
                console.log(`  CHARGEN: ${charset.length} bytes`);
                
                // Verify this is the generic version
                if (basic.length === 8192 && kernal.length === 8192) {
                    console.log('  ROM Type: Generic C64 Open ROMs');
                    console.log('  Compatibility: Standard C64');
                }
                
                return { basic, kernal, charset };
            }
        } catch (error) {
            console.log('Failed to load Generic ROMs:', error);
        }
        
        // Fallback: Try alternative character ROM
        try {
            const [basicResp, kernalResp, charResp] = await Promise.all([
                fetch('/roms/mega65/basic_generic.rom'),
                fetch('/roms/mega65/kernal_generic.rom'),
                fetch('/roms/mega65/chargen_pxlfont_2.3.rom')
            ]);
            
            if (basicResp.ok && kernalResp.ok && charResp.ok) {
                console.log('Using PXLfont character ROM variant');
                return {
                    basic: new Uint8Array(await basicResp.arrayBuffer()),
                    kernal: new Uint8Array(await kernalResp.arrayBuffer()),
                    charset: new Uint8Array(await charResp.arrayBuffer())
                };
            }
        } catch (error) {
            console.log('Alternative charset also failed');
        }
        
        // Last resort: Use minimal test ROM
        console.log('⚠️ Using minimal test ROM (no real BASIC)');
        return this.createMinimalROM();
    }
    
    static createMinimalROM() {
        console.log('Creating minimal ROM for testing...');
        
        const basic = new Uint8Array(8192);
        const kernal = new Uint8Array(8192);
        const charset = new Uint8Array(4096);
        
        // Fill with NOPs
        basic.fill(0xEA);
        kernal.fill(0xEA);
        
        // Basic reset routine at $FC00 (offset 0x1C00 in kernal)
        const resetRoutine = [
            // Initialize screen
            0xA9, 0x93,        // LDA #$93 (clear screen)
            0x20, 0xD2, 0xFF,  // JSR $FFD2 (CHROUT)
            
            // Set colors
            0xA9, 0x0E,        // LDA #$0E (light blue)
            0x8D, 0x86, 0x02,  // STA $0286 (current color)
            
            0xA9, 0x06,        // LDA #$06 (blue)
            0x8D, 0x20, 0xD0,  // STA $D020 (border)
            0x8D, 0x21, 0xD0,  // STA $D021 (background)
            
            // Print "READY."
            0xA9, 0x52,        // LDA #'R'
            0x20, 0xD2, 0xFF,  // JSR $FFD2
            0xA9, 0x45,        // LDA #'E'
            0x20, 0xD2, 0xFF,  // JSR $FFD2
            0xA9, 0x41,        // LDA #'A'
            0x20, 0xD2, 0xFF,  // JSR $FFD2
            0xA9, 0x44,        // LDA #'D'
            0x20, 0xD2, 0xFF,  // JSR $FFD2
            0xA9, 0x59,        // LDA #'Y'
            0x20, 0xD2, 0xFF,  // JSR $FFD2
            0xA9, 0x2E,        // LDA #'.'
            0x20, 0xD2, 0xFF,  // JSR $FFD2
            
            // Infinite loop
            0x4C, 0x00, 0xFC   // JMP $FC00
        ];
        
        // Copy reset routine
        for (let i = 0; i < resetRoutine.length; i++) {
            kernal[0x1C00 + i] = resetRoutine[i];
        }
        
        // CHROUT routine at $FFD2 (simple version)
        kernal[0x1FD2] = 0x8D;  // STA $0400,X
        kernal[0x1FD3] = 0x00;
        kernal[0x1FD4] = 0x04;
        kernal[0x1FD5] = 0xE8;  // INX
        kernal[0x1FD6] = 0x60;  // RTS
        
        // Set vectors
        kernal[0x1FFC] = 0x00;  // Reset vector low
        kernal[0x1FFD] = 0xFC;  // Reset vector high
        kernal[0x1FFE] = 0x00;  // IRQ vector low
        kernal[0x1FFF] = 0xFC;  // IRQ vector high
        kernal[0x1FFA] = 0x00;  // NMI vector low
        kernal[0x1FFB] = 0xFC;  // NMI vector high
        
        // Create basic character set (ASCII-like)
        // Each character is 8 bytes
        const createChar = (pattern) => {
            const result = new Uint8Array(8);
            for (let i = 0; i < 8; i++) {
                result[i] = pattern[i] || 0;
            }
            return result;
        };
        
        // Add some basic characters
        // Space (char 32)
        for (let i = 0; i < 8; i++) charset[32 * 8 + i] = 0x00;
        
        // 'A' (char 65)
        const charA = [0x18, 0x3C, 0x66, 0x7E, 0x66, 0x66, 0x66, 0x00];
        for (let i = 0; i < 8; i++) charset[65 * 8 + i] = charA[i];
        
        // 'D' (char 68)
        const charD = [0x78, 0x6C, 0x66, 0x66, 0x66, 0x6C, 0x78, 0x00];
        for (let i = 0; i < 8; i++) charset[68 * 8 + i] = charD[i];
        
        // 'E' (char 69)
        const charE = [0x7E, 0x60, 0x60, 0x78, 0x60, 0x60, 0x7E, 0x00];
        for (let i = 0; i < 8; i++) charset[69 * 8 + i] = charE[i];
        
        // 'R' (char 82)
        const charR = [0x7C, 0x66, 0x66, 0x7C, 0x78, 0x6C, 0x66, 0x00];
        for (let i = 0; i < 8; i++) charset[82 * 8 + i] = charR[i];
        
        // 'Y' (char 89)
        const charY = [0x66, 0x66, 0x66, 0x3C, 0x18, 0x18, 0x18, 0x00];
        for (let i = 0; i < 8; i++) charset[89 * 8 + i] = charY[i];
        
        // '.' (char 46)
        const charDot = [0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x18, 0x00];
        for (let i = 0; i < 8; i++) charset[46 * 8 + i] = charDot[i];
        
        return { basic, kernal, charset };
    }
}