
// Verify ROMs are loadable
import fs from 'fs';
import path from 'path';

const romsDir = 'C:/Users/grant/projects/C64-emulator/c64-emulator-decentraland/public/roms/mega65';

console.log('Verifying ROM files...');

const files = ['mega65.rom', 'chargen.rom'];
files.forEach(file => {
    const filepath = path.join(romsDir, file);
    if (fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath);
        console.log(`✅ ${file}: ${stats.size} bytes`);
    } else {
        console.log(`❌ ${file}: NOT FOUND`);
    }
});
