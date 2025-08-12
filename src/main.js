// main.js - Fixed emulator initialization with debugging
import { C64Emulator } from './emulator/C64Emulator.js';
import { ROMLoader } from './emulator/ROMLoader.js';

// Global emulator instance
let emulator = null;

// Start emulator function
async function startEmulator() {
    console.log('=== Starting C64 Emulator ===');
    console.log('Timestamp:', new Date().toISOString());
    
    try {
        // Check if canvas exists
        const canvas = document.getElementById('screen');
        if (!canvas) {
            throw new Error('Canvas element with id="screen" not found');
        }
        console.log('✅ Canvas found:', canvas.width + 'x' + canvas.height);
        
        // Create emulator instance
        console.log('Creating emulator instance...');
        emulator = new C64Emulator({
            canvas: canvas,
            streaming: false,
            gamepad: false
        });
        
        // Make emulator globally accessible for debugging
        window.emulator = emulator;
        console.log('✅ Emulator instance created');
        
        // Initialize (loads ROMs)
        console.log('Initializing emulator (loading ROMs)...');
        await emulator.init();
        console.log('✅ Emulator initialized');
        
        // Check CPU state before starting
        if (emulator.cpu) {
            console.log('CPU State:');
            console.log('  PC:', emulator.cpu.PC.toString(16).padStart(4, '0'));
            console.log('  SP:', emulator.cpu.SP.toString(16).padStart(2, '0'));
            console.log('  A:', emulator.cpu.A.toString(16).padStart(2, '0'));
        }
        
        // Start emulation
        console.log('Starting emulation loop...');
        emulator.start();
        
        console.log('✅ Emulator started successfully');
        console.log('Use window.emulator to access the emulator instance');
        console.log('Commands: emulator.pause(), emulator.reset(), emulator.cpu, emulator.memory');
        
        // Add UI button handlers
        setupUIHandlers();
        
        return emulator;
        
    } catch (error) {
        console.error('❌ Failed to start emulator:', error);
        console.error('Stack trace:', error.stack);
        
        // Show error on screen
        const canvas = document.getElementById('screen');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#FF0000';
            ctx.font = '20px monospace';
            ctx.fillText('Error: ' + error.message, 10, 30);
        }
        
        throw error;
    }
}

    // Add to index.html or main.js
    function setupKeyboardInput() {
        const canvas = document.getElementById('screen');
        
        // Make canvas focusable
        canvas.tabIndex = 0;
        canvas.focus();
        
        canvas.addEventListener('keydown', (e) => {
            e.preventDefault();
            
            // Handle special keys
            if (e.key === 'Enter') {
                emulator.cia1.typeChar('\r');
                
                // Force keyboard buffer processing
                emulator.forceKeyboardProcess();
            } else if (e.key === 'Backspace') {
                // Handle backspace (DEL in C64)
                emulator.cia1.typeChar(String.fromCharCode(0x14)); // DEL
            } else if (e.key.length === 1) {
                // Regular character
                emulator.cia1.typeChar(e.key);
            }
        });
    }

        
    // function setupKeyboardHandlers() {
    //     const canvas = document.getElementById('screen');
    //     if (!canvas) {
    //         console.error('Canvas not found!');
    //         return;
    //     }
        
    //     // Make canvas focusable
    //     canvas.tabIndex = 1;
    //     canvas.focus();
        
    //     // Handle keyboard input
    //     canvas.addEventListener('keydown', (e) => {
    //         if (!window.emulator) return;
            
    //         // Prevent default for keys we handle
    //         e.preventDefault();
            
    //         // Map keys to C64
    //         if (e.key === 'Enter') {
    //             console.log('ENTER pressed - sending RETURN');
    //             emulator.cia1.typeChar('\r');
    //         } else if (e.key === 'Backspace') {
    //             // C64 DEL key
    //             console.log('Backspace pressed - sending DEL');
    //             emulator.cia1.keyQueue.push(0x14); // DEL character
    //         } else if (e.key === 'ArrowUp') {
    //             emulator.cia1.keyQueue.push(0x91); // Cursor up
    //         } else if (e.key === 'ArrowDown') {
    //             emulator.cia1.keyQueue.push(0x11); // Cursor down
    //         } else if (e.key === 'ArrowLeft') {
    //             emulator.cia1.keyQueue.push(0x9D); // Cursor left
    //         } else if (e.key === 'ArrowRight') {
    //             emulator.cia1.keyQueue.push(0x1D); // Cursor right
    //         } else if (e.key.length === 1) {
    //             // Regular character
    //             console.log(`Key pressed: '${e.key}'`);
    //             emulator.cia1.typeChar(e.key);
    //         }
            
    //         // Force keyboard processing immediately for better responsiveness
    //         emulator.cia1.processKeyboard();
    //     });
        
    //     // Click to focus
    //     canvas.addEventListener('click', () => {
    //         canvas.focus();
    //         console.log('Canvas focused - keyboard input ready');
    //     });
        
    //     console.log('✅ Keyboard handlers installed - click canvas to focus');
    // }

    // Call this after emulator starts:
    // setupKeyboardHandlers();


    // =====================================
    // FIX 4: Console test to verify everything works
    // Run this in console after applying fixes:

    function testKeyboardFix() {
        console.log('🧪 Testing keyboard fix...\n');
        
        // 1. Check if processKeyboard exists
        if (typeof emulator.cia1.processKeyboard === 'function') {
            console.log('✅ processKeyboard method exists');
        } else {
            console.error('❌ processKeyboard method missing - update CIA.js');
            return;
        }
        
        // 2. Clear any existing buffer
        emulator.memory.write(0x00C6, 0);
        console.log('Cleared keyboard buffer');
        
        // 3. Type a simple PRINT command
        console.log('\n📝 Typing: PRINT "TEST"');
        const testCommand = 'PRINT "TEST"\r';
        for (let char of testCommand) {
            emulator.cia1.typeChar(char);
        }
        
        // 4. Process the keyboard queue
        console.log('Processing keyboard queue...');
        emulator.cia1.processKeyboard();
        
        // 5. Check buffer contents
        const bufferCount = emulator.memory.read(0x00C6);
        console.log(`\n📊 Buffer has ${bufferCount} characters:`);
        for (let i = 0; i < bufferCount; i++) {
            const byte = emulator.memory.read(0x0277 + i);
            console.log(`  [${i}]: 0x${byte.toString(16).padStart(2, '0')} = '${String.fromCharCode(byte)}'`);
        }
        
        // 6. Force BASIC to read the buffer
        console.log('\n🔄 Forcing BASIC to process buffer...');
        
        // Set flag that tells BASIC to check keyboard
        emulator.memory.write(0x00CB, 0x7F);
        
        // Trigger IRQ
        emulator.cpu.irq();
        
        console.log('\n✅ If you see "TEST" printed, keyboard is working!');
        console.log('If not, BASIC might need more initialization.');
    }

    // Run the test
    // testKeyboardFix();

// Setup UI handlers
function setupUIHandlers() {
    console.log('Setting up UI handlers...');
    
    // Reset button
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            console.log('Reset button clicked');
            if (emulator) {
                emulator.reset();
            }
        });
        console.log('✅ Reset button handler attached');
    }
    
    // Pause button
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            if (emulator) {
                if (emulator.running) {
                    emulator.pause();
                    pauseBtn.textContent = 'Resume';
                    console.log('Emulator paused');
                } else {
                    emulator.start();
                    pauseBtn.textContent = 'Pause';
                    console.log('Emulator resumed');
                }
            }
        });
        console.log('✅ Pause button handler attached');
    }
    
    // Enable Streaming button
    const streamBtn = document.getElementById('streamBtn');
    if (streamBtn) {
        streamBtn.addEventListener('click', () => {
            if (emulator) {
                emulator.enableStreaming();
                streamBtn.textContent = 'Streaming Enabled';
                streamBtn.disabled = true;
                console.log('Streaming enabled');
            }
        });
        console.log('✅ Stream button handler attached');
    }
    
    // Load PRG button
    const loadBtn = document.getElementById('loadBtn');
    if (loadBtn) {
        loadBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.prg';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (file && emulator) {
                    console.log('Loading PRG file:', file.name);
                    const buffer = await file.arrayBuffer();
                    emulator.loadPRG(new Uint8Array(buffer));
                }
            };
            input.click();
        });
        console.log('✅ Load PRG button handler attached');
    }
}

// Debug helper functions
window.debugEmulator = {
    // Check memory at address
    peek: (addr) => {
        if (!emulator || !emulator.memory) {
            console.error('Emulator not initialized');
            return;
        }
        const value = emulator.memory.read(addr);
        console.log(`Memory[$${addr.toString(16).padStart(4, '0')}] = $${value.toString(16).padStart(2, '0')} (${value})`);
        return value;
    },
    
    // Write to memory
    poke: (addr, value) => {
        if (!emulator || !emulator.memory) {
            console.error('Emulator not initialized');
            return;
        }
        emulator.memory.write(addr, value);
        console.log(`Wrote $${value.toString(16).padStart(2, '0')} to $${addr.toString(16).padStart(4, '0')}`);
    },
    
    // Dump memory range
    dump: (start, length = 16) => {
        if (!emulator || !emulator.memory) {
            console.error('Emulator not initialized');
            return;
        }
        console.log(`Memory dump from $${start.toString(16).padStart(4, '0')}:`);
        for (let i = 0; i < length; i += 16) {
            let line = `$${(start + i).toString(16).padStart(4, '0')}: `;
            let ascii = ' ';
            for (let j = 0; j < 16 && (i + j) < length; j++) {
                const byte = emulator.memory.read(start + i + j);
                line += byte.toString(16).padStart(2, '0') + ' ';
                ascii += (byte >= 32 && byte < 127) ? String.fromCharCode(byte) : '.';
            }
            console.log(line + ascii);
        }
    },
    
    // Show CPU state
    cpu: () => {
        if (!emulator || !emulator.cpu) {
            console.error('Emulator not initialized');
            return;
        }
        const cpu = emulator.cpu;
        console.log('CPU State:');
        console.log(`  PC: $${cpu.PC.toString(16).padStart(4, '0')}`);
        console.log(`  A:  $${cpu.A.toString(16).padStart(2, '0')}`);
        console.log(`  X:  $${cpu.X.toString(16).padStart(2, '0')}`);
        console.log(`  Y:  $${cpu.Y.toString(16).padStart(2, '0')}`);
        console.log(`  SP: $${cpu.SP.toString(16).padStart(2, '0')}`);
        console.log(`  Flags: N=${cpu.N?1:0} V=${cpu.V?1:0} B=${cpu.B?1:0} D=${cpu.D?1:0} I=${cpu.I?1:0} Z=${cpu.Z?1:0} C=${cpu.C?1:0}`);
    },
    
    // Check ROM vectors
    vectors: () => {
        if (!emulator || !emulator.memory) {
            console.error('Emulator not initialized');
            return;
        }
        console.log('ROM Vectors:');
        const nmi = emulator.memory.read(0xFFFA) | (emulator.memory.read(0xFFFB) << 8);
        const reset = emulator.memory.read(0xFFFC) | (emulator.memory.read(0xFFFD) << 8);
        const irq = emulator.memory.read(0xFFFE) | (emulator.memory.read(0xFFFF) << 8);
        console.log(`  NMI:   $${nmi.toString(16).padStart(4, '0')}`);
        console.log(`  RESET: $${reset.toString(16).padStart(4, '0')}`);
        console.log(`  IRQ:   $${irq.toString(16).padStart(4, '0')}`);
    },
    
    // Step CPU one instruction
    step: () => {
        if (!emulator || !emulator.cpu) {
            console.error('Emulator not initialized');
            return;
        }
        const pc = emulator.cpu.PC;
        const opcode = emulator.memory.read(pc);
        console.log(`Executing: PC=$${pc.toString(16).padStart(4, '0')} Opcode=$${opcode.toString(16).padStart(2, '0')}`);
        emulator.cpu.step();
        console.log(`New PC: $${emulator.cpu.PC.toString(16).padStart(4, '0')}`);
    }
};

// MAKE FUNCTIONS GLOBALLY ACCESSIBLE
window.startEmulator = startEmulator;
window.stopEmulator = () => {
    if (emulator) {
        emulator.pause();
        console.log('Emulator stopped');
    }
};

// Auto-start when DOM is ready (optional - comment out if you want manual control)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM loaded, ready to start emulator');
        console.log('Run: startEmulator() to begin');
        // Uncomment next line to auto-start:
        // startEmulator();
    });
} else {
    // DOM already loaded
    console.log('Ready to start emulator');
    console.log('Run: startEmulator() to begin');
    // Uncomment next line to auto-start:
    // startEmulator();
}

// Add debug info on load
console.log('=== C64 Emulator Debug Console ===');
console.log('Available commands:');
console.log('  startEmulator()           - Start the emulator');
console.log('  stopEmulator()            - Stop the emulator');
console.log('  debugEmulator.cpu()       - Show CPU state');
console.log('  debugEmulator.vectors()   - Show ROM vectors');
console.log('  debugEmulator.peek(addr)  - Read memory');
console.log('  debugEmulator.poke(addr,val) - Write memory');
console.log('  debugEmulator.dump(addr,len) - Dump memory');
console.log('  debugEmulator.step()      - Step one instruction');
console.log('  emulator                  - Access emulator instance (after start)');

// Export for use in other modules
export { startEmulator, emulator };