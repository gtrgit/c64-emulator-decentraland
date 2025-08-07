// verify-setup.js - Check if everything is ready to run
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = path.join(__dirname);

console.log(`
╔════════════════════════════════════════════════╗
║         C64 EMULATOR SETUP VERIFICATION        ║
╚════════════════════════════════════════════════╝
`);

let ready = true;

// Check essential files
const essentialFiles = [
    'index.html',
    'package.json',
    'src/emulator/C64Emulator.js',
    'src/emulator/Memory.js',
    'src/emulator/ROMLoader.js'
];

const componentFiles = [
    'src/emulator/MOS6502.js',
    'src/emulator/VIC2.js',
    'src/emulator/CIA.js',
    'src/emulator/SID.js'
];

const romFiles = [
    'public/roms/mega65/mega65.rom',
    'public/roms/mega65/chargen.rom'
];

console.log('📋 Checking Essential Files:');
essentialFiles.forEach(file => {
    const exists = fs.existsSync(path.join(rootDir, file));
    console.log(`   ${exists ? '✅' : '❌'} ${file}`);
    if (!exists) ready = false;
});

console.log('\n📦 Checking Component Files:');
componentFiles.forEach(file => {
    const exists = fs.existsSync(path.join(rootDir, file));
    console.log(`   ${exists ? '✅' : '⚠️ '} ${file} ${exists ? '' : '(needs implementation)'}`);
});

console.log('\n💾 Checking ROM Files:');
romFiles.forEach(file => {
    const filepath = path.join(rootDir, file);
    if (fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath);
        console.log(`   ✅ ${file} (${stats.size} bytes)`);
    } else {
        console.log(`   ❌ ${file}`);
        ready = false;
    }
});

console.log('\n🔒 Checking HTTPS Certificates:');
const certExists = fs.existsSync('cert.pem');
const keyExists = fs.existsSync('key.pem');
console.log(`   ${certExists ? '✅' : '⚠️ '} cert.pem ${certExists ? '' : '(run: openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365 -subj "/CN=localhost")'}`);
console.log(`   ${keyExists ? '✅' : '⚠️ '} key.pem`);

console.log('\n📚 Checking Dependencies:');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const installedDeps = fs.existsSync('node_modules');
console.log(`   ${installedDeps ? '✅' : '❌'} node_modules ${installedDeps ? '(dependencies installed)' : '(run: npm install)'}`);

console.log(`
╔════════════════════════════════════════════════╗
║                    RESULTS                     ║
╚════════════════════════════════════════════════╝
`);

if (!ready) {
    console.log('❌ Some essential files are missing!\n');
    console.log('To fix:');
    console.log('1. Make sure you saved all the artifact files');
    console.log('2. Run: npm install');
    console.log('3. Run: npm run download-roms (if ROMs missing)');
} else if (!installedDeps) {
    console.log('⚠️  Almost ready! Just need to install dependencies.\n');
    console.log('Run: npm install');
} else {
    console.log('✅ Setup looks good! You can now run the emulator.\n');
    console.log('Next steps:');
    console.log('1. Run: npm run dev');
    console.log('2. Open: https://localhost:3001');
    console.log('3. Accept the self-signed certificate warning');
    console.log('4. Click "Start Emulator"');
}

console.log(`
Note: Component files (MOS6502, VIC2, CIA, SID) need
implementation but placeholders will allow basic testing.
`);