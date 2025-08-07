// scripts/download-roms.js - Download MEGA65 Open ROMs
// These are GPL3 licensed and safe for commercial use

import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log(`
╔════════════════════════════════════════════════╗
║        MEGA65 OPEN ROMS DOWNLOAD SCRIPT        ║
╠════════════════════════════════════════════════╣
║                                                ║
║  This script provides instructions for         ║
║  obtaining the MEGA65 Open ROMs.               ║
║                                                ║
║  These ROMs are GPL3 licensed and safe for     ║
║  commercial use, avoiding Commodore copyright. ║
║                                                ║
╚════════════════════════════════════════════════╝
`);

// Create directories
const romsDir = path.join(__dirname, '..', 'public', 'roms', 'mega65');
const srcRomsDir = path.join(__dirname, '..', 'src', 'roms', 'mega65');

if (!fs.existsSync(romsDir)) {
    fs.mkdirSync(romsDir, { recursive: true });
    console.log('✅ Created directory:', romsDir);
}

if (!fs.existsSync(srcRomsDir)) {
    fs.mkdirSync(srcRomsDir, { recursive: true });
    console.log('✅ Created directory:', srcRomsDir);
}

// Since MEGA65 ROMs need to be built from source, we'll provide instructions
// and create placeholder files for testing

console.log(`
📥 MANUAL DOWNLOAD INSTRUCTIONS:
═════════════════════════════════

The MEGA65 Open ROMs must be built from source.

OPTION 1: Build from source (Recommended)
─────────────────────────────────────────
1. Install build tools:
   - Linux/Mac: apt-get install build-essential git
   - Windows: Install WSL2 or MSYS2

2. Clone and build:
   git clone https://github.com/MEGA65/open-roms.git
   cd open-roms
   make

3. Copy the ROM files:
   cp bin/mega65.rom "${romsDir}/mega65.rom"
   cp bin/chargen.rom "${romsDir}/chargen.rom"

OPTION 2: Use pre-built test ROMs (Limited functionality)
──────────────────────────────────────────────────────────
We'll create minimal test ROMs for basic testing.
`);

// Create minimal test ROMs for development
console.log('\n🔨 Creating minimal test ROMs for development...\n');

// Create a minimal test KERNAL ROM
function createTestKernal() {
    const kernal = Buffer.alloc(8192, 0x00);
    
    // Basic reset vector at $FFFC-$FFFD
    kernal[0x1FFC] = 0x00;  // Low byte
    kernal[0x1FFD] = 0xFC;  // High byte (points to $FC00)
    
    // IRQ vector at $FFFE-$FFFF
    kernal[0x1FFE] = 0x48;  // Low byte
    kernal[0x1FFF] = 0xFF;  // High byte
    
    // Minimal reset routine at $FC00
    const resetCode = [
        0x78,       // SEI - disable interrupts
        0xD8,       // CLD - clear decimal
        0xA9, 0x00, // LDA #$00
        0x85, 0xD0, // STA $D0 - clear some VIC register
        0xA9, 0x37, // LDA #$37
        0x85, 0x01, // STA $01 - memory config
        0x4C, 0x00, 0xFC // JMP $FC00 - infinite loop
    ];
    
    resetCode.forEach((byte, i) => {
        kernal[0x1C00 + i] = byte;
    });
    
    // IRQ routine at $FF48 - just RTI
    kernal[0x1F48] = 0x40; // RTI
    
    return kernal;
}

// Create a minimal test BASIC ROM
function createTestBasic() {
    const basic = Buffer.alloc(8192, 0x00);
    
    // BASIC cold start vector
    basic[0x0000] = 0x94;
    basic[0x0001] = 0xE3;
    
    // BASIC warm start vector  
    basic[0x0002] = 0x7B;
    basic[0x0003] = 0xE3;
    
    return basic;
}

// Create a minimal character ROM
function createTestCharset() {
    const charset = Buffer.alloc(4096, 0x00);
    
    // Simple 8x8 patterns for testing
    // Character 'A' at position 1
    const charA = [
        0b00111100,
        0b01100110,
        0b01100110,
        0b01111110,
        0b01100110,
        0b01100110,
        0b01100110,
        0b00000000
    ];
    
    // Space character at position 32
    const space = [
        0b00000000,
        0b00000000,
        0b00000000,
        0b00000000,
        0b00000000,
        0b00000000,
        0b00000000,
        0b00000000
    ];
    
    // Write character patterns
    charA.forEach((byte, i) => charset[8 + i] = byte);
    space.forEach((byte, i) => charset[256 + i] = byte);
    
    // Fill with a default pattern for visibility
    for (let c = 0; c < 256; c++) {
        if (charset[c * 8] === 0) {
            for (let i = 0; i < 8; i++) {
                charset[c * 8 + i] = 0xFF; // Solid block
            }
        }
    }
    
    return charset;
}

// Save test ROMs
const testKernal = createTestKernal();
const testBasic = createTestBasic();
const testCharset = createTestCharset();

// Combine into mega65.rom format
const mega65Rom = Buffer.concat([
    Buffer.alloc(0x8000, 0x00),  // Padding
    testBasic,                    // BASIC at $A000
    Buffer.alloc(0x2000, 0x00),  // Gap
    testKernal                    // KERNAL at $E000
]);

// Write test ROM files
fs.writeFileSync(path.join(romsDir, 'mega65.rom'), mega65Rom);
fs.writeFileSync(path.join(romsDir, 'chargen.rom'), testCharset);
fs.writeFileSync(path.join(romsDir, 'kernal.rom'), testKernal);
fs.writeFileSync(path.join(romsDir, 'basic.rom'), testBasic);

console.log('✅ Created test ROM files in:', romsDir);
console.log('   - mega65.rom (combined BASIC + KERNAL)');
console.log('   - chargen.rom (character set)');
console.log('   - kernal.rom (KERNAL only)');
console.log('   - basic.rom (BASIC only)');

// Create README
const readme = `# MEGA65 Open ROMs

These are minimal test ROMs for development purposes.
For full functionality, build the real MEGA65 Open ROMs:

1. Clone: git clone https://github.com/MEGA65/open-roms.git
2. Build: cd open-roms && make
3. Copy: cp bin/*.rom here

## Current ROM Files

- mega65.rom: Combined BASIC + KERNAL (test version)
- chargen.rom: Character set (minimal)
- kernal.rom: KERNAL ROM (minimal)
- basic.rom: BASIC ROM (minimal)

## License

MEGA65 Open ROMs are GPL3 licensed and safe for commercial use.
These test ROMs are created for development only.
`;

fs.writeFileSync(path.join(romsDir, 'README.md'), readme);
fs.writeFileSync(path.join(srcRomsDir, 'README.md'), readme);

console.log(`
╔════════════════════════════════════════════════╗
║                  ✅ COMPLETE                   ║
╠════════════════════════════════════════════════╣
║                                                ║
║  Test ROMs created successfully!               ║
║                                                ║
║  These minimal ROMs will allow basic testing.  ║
║  For full C64 compatibility, please build      ║
║  the real MEGA65 Open ROMs from source.        ║
║                                                ║
║  ROM Location:                                 ║
║  ${romsDir}
║                                                ║
╚════════════════════════════════════════════════╝

Next step: npm run dev
`);

// Create a simple verification script
const verifyScript = `
// Verify ROMs are loadable
import fs from 'fs';
import path from 'path';

const romsDir = '${romsDir.replace(/\\/g, '/')}';

console.log('Verifying ROM files...');

const files = ['mega65.rom', 'chargen.rom'];
files.forEach(file => {
    const filepath = path.join(romsDir, file);
    if (fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath);
        console.log(\`✅ \${file}: \${stats.size} bytes\`);
    } else {
        console.log(\`❌ \${file}: NOT FOUND\`);
    }
});
`;

fs.writeFileSync(path.join(__dirname, 'verify-roms.js'), verifyScript);
console.log('\nRun "node scripts/verify-roms.js" to verify ROM files.\n');