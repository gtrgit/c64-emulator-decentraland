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

          // BASIC interpreter state
        this.basicReady = false;
        this.currentInputLine = '';
        this.originalHandleKeyDown = null; // Store original method
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

        this.setupKeyboard();
        console.log('Keyboard input initialized');

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
        
        // Initialize screen with spaces
        for (let i = 0; i < 1000; i++) {
            this.memory.write(0x0400 + i, 0x20); // Space character
        }
        
        // Write "READY." to screen memory
        const readyText = [0x12, 0x05, 0x01, 0x04, 0x19, 0x2E]; // READY. in screen codes
        for (let i = 0; i < readyText.length; i++) {
            this.memory.write(0x0400 + i, readyText[i]);
        }
        
        // Set color RAM to light blue
        for (let i = 0; i < 1000; i++) {
            this.memory.write(0xD800 + i, 14); // Light blue
        }
        
        // Reset all components
        this.cpu.reset();
        this.vic.reset();
        this.cia1.reset();
        this.cia2.reset();
        this.sid.reset();
        
        // Reset BASIC interpreter state
        this.basicReady = false;
        this.currentInputLine = '';
        if (this.basicProgram) {
            this.basicProgram.clear();
        }

        
        // Set VIC registers for proper display
        this.vic.registers[0x20] = 0x0E; // Border: light blue
        this.vic.registers[0x21] = 0x06; // Background: blue
        this.vic.registers[0x18] = 0x14; // Screen at $0400, charset at ROM
        
        this.frameCount = 0;

            // Initialize keyboard system
        this.memory.write(0x00C6, 0x00); // Clear keyboard buffer count
        this.memory.write(0x00CB, 0x00); // Clear keyboard strobe
        
        // Set up keyboard vectors
        this.memory.write(0x028F, 0x4A); // Keyboard decode table low
        this.memory.write(0x0290, 0xEB); // Keyboard decode table high
        
        // Enable keyboard interrupts
        this.cia1.registers[0x0D] = 0x81; // Enable timer A interrupts
        
        if (this.onReset) {
            this.onReset();
        }
        
        // Reinstall BASIC interpreter after reset
        if (this.running) {
            setTimeout(() => {
                console.log('🔧 Reinstalling BASIC after reset...');
                this.setupBASICInterpreter();
                console.log('✅ BASIC reinstalled after reset');
            }, 500);
        }
    }


    run() {
        if (this.running) return;
        
        this.running = true;
        this.lastFrameTime = performance.now();
        this.runFrame();
    }
    

    // start() {
    //     console.log('Starting C64 emulation...');
    //     if (this.running) return;
        
    //     this.running = true;
    //     this.lastFrameTime = performance.now();
    //     this.runFrame();
    // }

    start() {
        console.log('Starting C64 emulation...');
        if (this.running) return;
        
        this.running = true;
        this.lastFrameTime = performance.now();
        
        // Auto-setup BASIC interpreter after a brief delay
        // if (!this.basicReady) {
        //     setTimeout(() => {
        //         this.setupBASICInterpreter();
        //     }, 500); // Small delay to let emulator stabilize
        // }
        // Setup BASIC interpreter immediately when emulator starts
        if (!this.basicReady) {
            this.setupBASICInterpreter();
        }

        this.runFrame();
    }

    stop() {
        console.log('Stopping C64 emulation...');
        this.running = false;
    }


     // Add pause() as an alias for stop()
    pause() {
        this.stop();
    }
    
   
    runFrame() {
        if (!this.running) return;
        
        const frameStart = performance.now();
        let cycles = 0;

        // Process keyboard at the start of each frame!
        this.cia1.processKeyboard();  // <-- ADD THIS LINE
        
        // Run CPU and VIC in sync - THIS IS THE KEY FIX!
        while (cycles < this.cyclesPerFrame && this.running) {
            try {
                // Execute one CPU instruction
                const cpuCycles = this.cpu.step();
                
                // VIC runs at same speed as CPU (1MHz) - CRITICAL FIX
                for (let i = 0; i < cpuCycles; i++) {
                    this.vic.cycle();
                }
                
                // Update other components
                this.cia1.cycle(cpuCycles);
                this.cia2.cycle(cpuCycles);
                this.sid.cycle(cpuCycles);
                
                cycles += cpuCycles;
            } catch (error) {
                console.error('Emulation error:', error);
                this.running = false;
                break;
            }
        }
        
        this.frameCount++;
        
        // Update stats every second
        if (this.frameCount % 50 === 0) {
            const now = performance.now();
            const fps = 1000 / (now - this.lastFrameTime);
            this.lastFrameTime = now;
            
            if (document.getElementById('fps')) {
                document.getElementById('fps').textContent = fps.toFixed(1);
            }
            if (document.getElementById('frame')) {
                document.getElementById('frame').textContent = this.frameCount;
            }
            if (document.getElementById('pc')) {
                document.getElementById('pc').textContent = '$' + this.cpu.PC.toString(16).padStart(4, '0');
            }
            
            // Debug: Check VIC state
            // console.log(`Frame ${this.frameCount}: rasterY=${this.vic.rasterY}, PC=$${this.cpu.PC.toString(16)}`);
        }
        
        // Schedule next frame
        if (this.running) {
            const targetDelay = 1000 / this.frameRate; // 50fps for PAL
            const actualTime = performance.now() - frameStart;
            const delay = Math.max(0, targetDelay - actualTime);
            
            setTimeout(() => this.runFrame(), delay);
        }
    }
        
    updateStatsDisplay() {
        if (document.getElementById('fps')) {
            document.getElementById('fps').textContent = this.actualFPS.toFixed(1);
        }
        if (document.getElementById('frame')) {
            document.getElementById('frame').textContent = this.frameCount;
        }
        if (document.getElementById('pc')) {
            document.getElementById('pc').textContent = '$' + this.cpu.PC.toString(16).padStart(4, '0');
        }
        if (document.getElementById('status')) {
            document.getElementById('status').textContent = this.running ? 'Running' : 'Stopped';
        }
    }


    // Add to C64Emulator.js
    forceKeyboardProcess() {
        // Directly inject into keyboard buffer for immediate processing
        const bufferIndex = this.memory.read(0x00C6);
        
        if (this.cia1.pendingKeys && this.cia1.pendingKeys.length > 0) {
            while (this.cia1.pendingKeys.length > 0 && bufferIndex < 10) {
                const key = this.cia1.pendingKeys.shift();
                this.memory.write(0x0277 + bufferIndex, key);
                this.memory.write(0x00C6, bufferIndex + 1);
                
                // Set keyboard strobe
                this.memory.write(0x00CB, 0x01);
            }
            
            // Force BASIC to check keyboard
            this.cpu.irq();
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

    setupKeyboard() {
        // Track shift state locally in the emulator
        this.shiftPressed = false;
        
        // Set up keyboard event listeners
        document.addEventListener('keydown', (e) => {
            // Prevent default for keys we handle
            if (this.handleKeyDown(e.key)) {
                e.preventDefault();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            this.handleKeyUp(e.key);
        });
    }

    // 2. Updated handleKeyDown method (replace the entire method):
    // handleKeyDown(key) {
    //     // If BASIC is ready, use BASIC key handling
    //     if (this.basicReady) {
    //         if (key === 'Shift') {
    //             this.shiftPressed = true;
    //             return true;
    //         }
            
    //         if (key === 'Enter') {
    //             console.log('Enter pressed, currentInputLine:', this.currentInputLine);
                
    //             // Process BASIC command if we have input
    //             let isLineNumber = false;
    //             if (this.currentInputLine.trim().length > 0) {
    //                 // Check if it's a line number entry
    //                 const lineMatch = this.currentInputLine.trim().match(/^(\d+)\s+(.+)$/);
    //                 isLineNumber = !!lineMatch || /^\d+$/.test(this.currentInputLine.trim());
                    
    //                 console.log('Is line number entry:', isLineNumber);
    //                 this.processBASICCommand(this.currentInputLine);
    //             }
                
    //             // For line number entries, just move to next line
    //             // For commands, processBASICCommand handles the output
    //             if (isLineNumber || this.currentInputLine.trim().length === 0) {
    //                 // Just move cursor to next line
    //                 this.vic.cursorX = 0;
    //                 this.vic.cursorY++;
    //                 if (this.vic.cursorY >= 25) {
    //                     this.scrollScreen();
    //                     this.vic.cursorY = 24;
    //                 }
    //                 this.vic.renderFrame();
    //             }
                
    //             this.currentInputLine = '';
    //             return true;
    //         }
            
    //         if (key === 'Backspace') {
    //             if (this.currentInputLine.length > 0) {
    //                 this.currentInputLine = this.currentInputLine.slice(0, -1);
    //                 this.handleBackspace();
    //             }
    //             return true;
    //         }
            
    //         // Regular characters
    //         if (key.length === 1) {
    //             let char = key;
                
    //             // Handle shift
    //             if (this.shiftPressed && char >= 'a' && char <= 'z') {
    //                 char = char.toUpperCase();
    //             }
                
    //             // Add to input line
    //             this.currentInputLine += char;
                
    //             // Display on screen
    //             this.writeCharToScreen(char.charCodeAt(0));
    //             return true;
    //         }
            
    //         return false;
    //     }
        
    //     // Fall back to original method if BASIC not ready
    //     if (this.originalHandleKeyDown) {
    //         return this.originalHandleKeyDown(key);
    //     }
        
    //     return false;
    // }

        
    // Modified handleKeyDown that preserves existing functionality
    // and adds INPUT mode support
    handleKeyDown(key) {
        // If BASIC is ready, use BASIC key handling
        if (this.basicReady) {
            // CHECK FOR INPUT MODE FIRST
            if (this.inputMode && this.inputMode.active) {
                // Handle INPUT mode specially
                if (key === 'Enter') {
                    // Process the input
                    const varName = this.inputMode.variables[this.inputMode.currentVarIndex];
                    const value = this.inputMode.buffer.trim();
                    
                    // Store the value
                    if (varName.endsWith('$')) {
                        this.basicStrings.set(varName, value);
                    } else {
                        const numValue = parseFloat(value) || 0;
                        this.basicVariables.set(varName, numValue);
                    }
                    
                    console.log(`INPUT: ${varName} = "${value}"`);
                    
                    // Move to next variable or finish
                    this.inputMode.currentVarIndex++;
                    
                    // Move cursor to next line
                    this.vic.cursorX = 0;
                    this.vic.cursorY++;
                    if (this.vic.cursorY >= 25) {
                        this.scrollScreen();
                        this.vic.cursorY = 24;
                    }
                    
                    if (this.inputMode.currentVarIndex < this.inputMode.variables.length) {
                        // More variables to input
                        this.inputMode.buffer = '';
                        
                        // Print ?? prompt for next input
                        this.writeCharToScreen('?'.charCodeAt(0));
                        this.writeCharToScreen('?'.charCodeAt(0));
                        this.writeCharToScreen(' '.charCodeAt(0));
                    } else {
                        // All inputs complete
                        this.inputMode = null;
                        
                        // Continue program execution
                        if (this.executionContext) {
                            this.continueExecution();
                        }
                    }
                    
                    this.vic.renderFrame();
                    return true;
                }
                
                if (key === 'Backspace') {
                    if (this.inputMode.buffer.length > 0) {
                        this.inputMode.buffer = this.inputMode.buffer.slice(0, -1);
                        this.handleBackspace();
                    }
                    return true;
                }
                
                // Regular characters for INPUT
                if (key.length === 1) {
                    let char = key;
                    
                    // Handle shift
                    if (this.shiftPressed && char >= 'a' && char <= 'z') {
                        char = char.toUpperCase();
                    }
                    
                    // Add to input buffer
                    this.inputMode.buffer += char;
                    
                    // Display on screen
                    this.writeCharToScreen(char.charCodeAt(0));
                    return true;
                }
                
                return false;
            }
            
            // EXISTING BASIC HANDLING (when not in INPUT mode)
            if (key === 'Shift') {
                this.shiftPressed = true;
                return true;
            }
            
            if (key === 'Enter') {
                console.log('Enter pressed, currentInputLine:', this.currentInputLine);
                            // Process the input
                // const varName = this.inputMode.variables[this.inputMode.currentVarIndex];
                // const value = this.inputMode.buffer.trim();
                
                // // Store the value - use uppercase for consistency but accept both
                // const upperVarName = varName.toUpperCase();
                // if (upperVarName.endsWith('$')) {
                //     this.basicStrings.set(upperVarName, value);
                // } else {
                //     const numValue = parseFloat(value) || 0;
                //     this.basicVariables.set(upperVarName, numValue);
                // }
                
                // console.log(`INPUT: ${upperVarName} = "${value}"`);


                // Process BASIC command if we have input
                let isLineNumber = false;
                if (this.currentInputLine.trim().length > 0) {
                    // Check if it's a line number entry
                    const lineMatch = this.currentInputLine.trim().match(/^(\d+)\s+(.+)$/);
                    isLineNumber = !!lineMatch || /^\d+$/.test(this.currentInputLine.trim());
                    
                    console.log('Is line number entry:', isLineNumber);
                    this.processBASICCommand(this.currentInputLine);
                }
                
                // For line number entries, just move to next line
                // For commands, processBASICCommand handles the output
                if (isLineNumber || this.currentInputLine.trim().length === 0) {
                    // Just move cursor to next line
                    this.vic.cursorX = 0;
                    this.vic.cursorY++;
                    if (this.vic.cursorY >= 25) {
                        this.scrollScreen();
                        this.vic.cursorY = 24;
                    }
                    this.vic.renderFrame();
                }
                
                this.currentInputLine = '';
                return true;
            }
            
            if (key === 'Backspace') {
                if (this.currentInputLine.length > 0) {
                    this.currentInputLine = this.currentInputLine.slice(0, -1);
                    this.handleBackspace();
                }
                return true;
            }
            
            // Regular characters
            if (key.length === 1) {
                let char = key;
                
                // Handle shift
                if (this.shiftPressed && char >= 'a' && char <= 'z') {
                    char = char.toUpperCase();
                }
                
                // Add to input line
                this.currentInputLine += char;
                
                // Display on screen
                this.writeCharToScreen(char.charCodeAt(0));
                return true;
            }
            
            return false;
        }
        
        // Fall back to original method if BASIC not ready
        if (this.originalHandleKeyDown) {
            return this.originalHandleKeyDown(key);
        }
        
        return false;
    }

        handleKeyUp(key) {
            if (key === 'Shift') {
                this.shiftPressed = false;
            }
        }

        handleBackspace() {
            // Handle backspace directly on screen
            if (this.vic.cursorX > 0) {
                this.vic.cursorX--;
            } else if (this.vic.cursorY > 0) {
                // Move to end of previous line
                this.vic.cursorY--;
                this.vic.cursorX = 39;
            }
            
            // Clear the character at cursor position
            const pos = this.vic.cursorY * 40 + this.vic.cursorX;
            this.memory.write(0x0400 + pos, 0x20); // Write space
            this.memory.write(0xD800 + pos, 14); // Light blue color
        }

        writeCharToScreen(charCode) {
            // Get current cursor position
            const cursorPos = this.vic.cursorY * 40 + this.vic.cursorX;
            
            // Handle special characters
            if (charCode === 0x0D) { // Return key
                // Move cursor to start of next line
                this.vic.cursorX = 0;
                this.vic.cursorY++;
                
                // Scroll if needed
                if (this.vic.cursorY >= 25) {
                    this.scrollScreen();
                    this.vic.cursorY = 24;
                }
                return;
            }
            
            // Convert ASCII to screen code
            let screenCode = this.asciiToScreenCode(charCode);
            
            // Write to screen memory
            this.memory.write(0x0400 + cursorPos, screenCode);
            
            // Set color for new character
            this.memory.write(0xD800 + cursorPos, 14); // Light blue
            
            // Move cursor
            this.vic.cursorX++;
            if (this.vic.cursorX >= 40) {
                this.vic.cursorX = 0;
                this.vic.cursorY++;
                
                if (this.vic.cursorY >= 25) {
                    this.scrollScreen();
                    this.vic.cursorY = 24;
                }
            }
            
            // Force immediate render to see the character
            this.vic.renderFrame();
        }


        // Add this new method to C64Emulator class
        asciiToScreenCode(ascii) {
            // C64 Screen Code conversion table
            // Based on default character set (uppercase/graphics mode)
            
            // Space
            if (ascii === 0x20) return 0x20;
            
            // @ (at sign)
            if (ascii === 0x40) return 0x00;
            
            // A-Z (uppercase letters) -> screen codes 1-26
            if (ascii >= 0x41 && ascii <= 0x5A) {
                return ascii - 0x40; // A=1, B=2, ... Z=26
            }
            
            // a-z (lowercase letters) -> display as uppercase in default mode
            if (ascii >= 0x61 && ascii <= 0x7A) {
                return ascii - 0x60; // a=1, b=2, ... z=26 (same as uppercase)
            }
            
            // 0-9 (numbers) -> screen codes 48-57
            if (ascii >= 0x30 && ascii <= 0x39) {
                return ascii; // Numbers are same: 0=48, 1=49, ... 9=57
            }
            
            // Special characters with direct mappings
            const specialChars = {
                0x21: 0x21, // !
                0x22: 0x22, // "
                0x23: 0x23, // #
                0x24: 0x24, // $
                0x25: 0x25, // %
                0x26: 0x26, // &
                0x27: 0x27, // '
                0x28: 0x28, // (
                0x29: 0x29, // )
                0x2A: 0x2A, // *
                0x2B: 0x2B, // +
                0x2C: 0x2C, // ,
                0x2D: 0x2D, // -
                0x2E: 0x2E, // .
                0x2F: 0x2F, // /
                0x3A: 0x3A, // :
                0x3B: 0x3B, // ;
                0x3C: 0x3C, // <
                0x3D: 0x3D, // =
                0x3E: 0x3E, // >
                0x3F: 0x3F, // ?
                0x5B: 0x1B, // [ -> screen code 27
                0x5D: 0x1D, // ] -> screen code 29
            };
            
            if (specialChars[ascii] !== undefined) {
                return specialChars[ascii];
            }
            
            // Default: return space for unmapped characters
            console.log(`Unmapped character: ${String.fromCharCode(ascii)} (0x${ascii.toString(16)})`);
            return 0x20; // Space as fallback
        }


        scrollScreen() {
            // Scroll screen up one line
            for (let y = 0; y < 24; y++) {
                for (let x = 0; x < 40; x++) {
                    const src = (y + 1) * 40 + x;
                    const dst = y * 40 + x;
                    // Copy character
                    this.memory.write(0x0400 + dst, this.memory.read(0x0400 + src));
                    // Copy color
                    this.memory.write(0xD800 + dst, this.memory.read(0xD800 + src));
                }
            }
            
            // Clear last line
            for (let x = 0; x < 40; x++) {
                this.memory.write(0x0400 + 24 * 40 + x, 0x20); // Space
                this.memory.write(0xD800 + 24 * 40 + x, 14); // Light blue
            }
        }
        // ========== BASIC INTERPRETER METHODS ==========
    

        
    // Also ensure setupBASICInterpreter initializes forLoopStack
    setupBASICInterpreter() {
        console.log('🔧 Setting up BASIC interpreter...');
        
        // Ensure all data structures exist
        if (!this.basicProgram) {
            this.basicProgram = new Map();
        }
        
        // Initialize all BASIC data structures
        this.basicVariables = new Map();
        this.basicStrings = new Map();
        this.basicArrays = new Map();
        this.basicCallStack = [];
        this.forLoopStack = []; // ← Make sure this is initialized
        this.basicDataPointer = { line: 0, position: 0 };
        this.basicData = [];
        
        // Store original method if not already stored
        if (!this.originalHandleKeyDown) {
            this.originalHandleKeyDown = this.handleKeyDown.bind(this);
        }
        
        // Create printToScreen method (keep existing implementation)
        this.printToScreen = (text) => {
            if (text === '') {
                this.vic.cursorX = 0;
                this.vic.cursorY++;
                if (this.vic.cursorY >= 25) {
                    this.scrollScreen();
                    this.vic.cursorY = 24;
                }
                this.vic.renderFrame();
                return;
            }
            
            for (const char of text) {
                const screenPos = this.vic.cursorY * 40 + this.vic.cursorX;
                const screenCode = this.asciiToScreenCode(char.charCodeAt(0));
                
                this.memory.write(0x0400 + screenPos, screenCode);
                this.memory.write(0xD800 + screenPos, 14);
                
                this.vic.cursorX++;
                if (this.vic.cursorX >= 40) {
                    this.vic.cursorX = 0;
                    this.vic.cursorY++;
                    if (this.vic.cursorY >= 25) {
                        this.scrollScreen();
                        this.vic.cursorY = 24;
                    }
                }
            }
            
            // Move to next line after printing
            this.vic.cursorX = 0;
            this.vic.cursorY++;
            if (this.vic.cursorY >= 25) {
                this.scrollScreen();
                this.vic.cursorY = 24;
            }
            
            this.vic.renderFrame();
        };
        
        this.basicReady = true;
        console.log('✅ BASIC interpreter ready');
    }

    // Debug helper to check current state
    debugBASICState() {
        console.log('🔍 BASIC State Debug:');
        console.log('  forLoopStack:', this.forLoopStack);
        console.log('  basicVariables:', Array.from(this.basicVariables.entries()));
        console.log('  Program lines:', Array.from(this.basicProgram.entries()));
    }


    // executeRUN() {
    //     this.printToScreen('');
        
    //     // Reset all state - USE forLoopStack, not forLoops!
    //     this.basicVariables.clear();
    //     this.basicStrings.clear();
    //     this.basicArrays.clear();
    //     this.basicCallStack = [];
    //     this.forLoopStack = [];  // ← CHANGED: Use forLoopStack instead of forLoops
        
    //     // Get sorted program lines
    //     const sortedLines = Array.from(this.basicProgram.entries()).sort((a, b) => a[0] - b[0]);
        
    //     if (sortedLines.length === 0) {
    //         this.printToScreen('READY.');
    //         return;
    //     }
        
    //     // Execute program
    //     let currentIndex = 0;
        
    //     while (currentIndex < sortedLines.length && currentIndex >= 0) {
    //         const [lineNum, lineContent] = sortedLines[currentIndex];
            
    //         console.log(`Executing line ${lineNum}: ${lineContent}`);
    //         console.log(`  forLoopStack:`, this.forLoopStack);
            
    //         // Execute the line
    //         const result = this.executeLine(lineNum, lineContent, sortedLines, currentIndex);
            
    //         if (result === 'END') {
    //             break;
    //         } else if (result && result.type === 'GOTO') {
    //             // Find target line
    //             const targetIndex = sortedLines.findIndex(([num]) => num >= result.target);
    //             if (targetIndex === -1) {
    //                 this.printToScreen(`?UNDEFINED STATEMENT ERROR IN ${lineNum}`);
    //                 break;
    //             }
    //             currentIndex = targetIndex;
    //             continue;
    //         } else if (result && result.type === 'NEXT_CONTINUE') {
    //             // Continue FOR loop from stored position
    //             currentIndex = result.index;
    //             continue;
    //         }
            
    //         currentIndex++;
    //     }
        
    //     this.printToScreen('');
    //     this.printToScreen('READY.');
    // }
    // Updated executeRUN to support INPUT pause and GOSUB return
    executeRUN() {
        this.printToScreen('');
        
        // Reset all state
        this.basicVariables.clear();
        this.basicStrings.clear();
        this.basicArrays.clear();
        this.basicCallStack = [];
        this.forLoopStack = [];
        
        // Get sorted program lines
        const sortedLines = Array.from(this.basicProgram.entries()).sort((a, b) => a[0] - b[0]);
        
        if (sortedLines.length === 0) {
            this.printToScreen('READY.');
            return;
        }
        
        // Store execution context for INPUT continuation
        this.executionContext = {
            sortedLines: sortedLines,
            currentIndex: 0,
            running: true
        };
        
        // Start execution
        this.continueExecution();
    }

    
    // // Continue execution (called after INPUT completes)
    // continueExecution() {
    //     if (!this.executionContext || !this.executionContext.running) return;
        
    //     const { sortedLines } = this.executionContext;
    //     let { currentIndex } = this.executionContext;
        
    //     while (currentIndex < sortedLines.length && currentIndex >= 0) {
    //         const [lineNum, lineContent] = sortedLines[currentIndex];
            
    //         console.log(`Executing line ${lineNum}: ${lineContent}`);
            
    //         // Execute the line
    //         const result = this.executeLine(lineNum, lineContent, sortedLines, currentIndex);
            
    //         if (result === 'END') {
    //             this.executionContext.running = false;
    //             break;
    //         } else if (result === 'PAUSE') {
    //             // Pause for INPUT
    //             this.executionContext.currentIndex = currentIndex + 1;
    //             return; // Exit and wait for input
    //         } else if (result && result.type === 'GOTO') {
    //             // Find target line
    //             const targetIndex = sortedLines.findIndex(([num]) => num >= result.target);
    //             if (targetIndex === -1) {
    //                 this.printToScreen(`?UNDEFINED STATEMENT ERROR IN ${lineNum}`);
    //                 this.executionContext.running = false;
    //                 break;
    //             }
    //             currentIndex = targetIndex;
    //             continue;
    //         } else if (result && result.type === 'GOTO_INDEX') {
    //             // Direct jump to index (for RETURN)
    //             currentIndex = result.index;
    //             continue;
    //         } else if (result && result.type === 'NEXT_CONTINUE') {
    //             // Continue FOR loop from stored position
    //             currentIndex = result.index;
    //             continue;
    //         } else {
    //             currentIndex++;
    //         }
    //     }
        
    //     if (this.executionContext.running) {
    //         this.printToScreen('');
    //         this.printToScreen('READY.');
    //         this.executionContext = null;
    //     }
    // }
    continueExecution() {
        if (!this.executionContext || !this.executionContext.running) return;
        
        const { sortedLines } = this.executionContext;
        let { currentIndex } = this.executionContext;
        
        // Use setTimeout to break up execution and prevent UI blocking
        const executeNextLine = () => {
            if (currentIndex >= sortedLines.length || currentIndex < 0 || !this.executionContext.running) {
                // Program finished
                this.printToScreen('');
                this.printToScreen('READY.');
                this.executionContext = null;
                return;
            }
            
            const [lineNum, lineContent] = sortedLines[currentIndex];
            
            console.log(`Executing line ${lineNum}: ${lineContent}`);
            
            // Execute the line
            const result = this.executeLine(lineNum, lineContent, sortedLines, currentIndex);
            
            if (result === 'END') {
                this.executionContext.running = false;
                this.printToScreen('');
                this.printToScreen('READY.');
                this.executionContext = null;
                return;
            } else if (result === 'PAUSE') {
                // Pause for INPUT
                this.executionContext.currentIndex = currentIndex + 1;
                return; // Exit and wait for input
            } else if (result && result.type === 'GOTO') {
                // Find target line
                const targetIndex = sortedLines.findIndex(([num]) => num >= result.target);
                if (targetIndex === -1) {
                    this.printToScreen(`?UNDEFINED STATEMENT ERROR IN ${lineNum}`);
                    this.executionContext.running = false;
                    this.printToScreen('');
                    this.printToScreen('READY.');
                    this.executionContext = null;
                    return;
                }
                currentIndex = targetIndex;
            } else if (result && result.type === 'GOTO_INDEX') {
                currentIndex = result.index;
            } else if (result && result.type === 'NEXT_CONTINUE') {
                currentIndex = result.index;
            } else {
                currentIndex++;
            }
            
            // Store updated index
            this.executionContext.currentIndex = currentIndex;
            
            // Continue with next line after a tiny delay
            setTimeout(executeNextLine, 0);
        };
        
        // Start execution
        executeNextLine();
    }


    // Fixed executeLine method
    executeLine(lineNum, lineContent, sortedLines, currentIndex) {
        const upperLine = lineContent.toUpperCase();
        
        // Handle REM (remarks/comments)
        if (upperLine.startsWith('REM ') || upperLine.includes(': REM ')) {
            return null;
        }
        
        // Handle multiple statements separated by colon
        if (lineContent.includes(':') && !this.isInQuotes(lineContent, lineContent.indexOf(':'))) {
            const statements = this.splitStatements(lineContent);
            let result = null;
            for (const stmt of statements) {
                result = this.executeLine(lineNum, stmt.trim(), sortedLines, currentIndex);
                if (result === 'END' || (result && result.type === 'GOTO')) {
                    return result;
                }
            }
            return result;
        }
        
        // Handle PRINT
        if (upperLine.startsWith('PRINT ')) {
            this.executePRINT(lineContent.substring(6).trim());
            return null;
        }
        
        // Handle IF...THEN
        if (upperLine.startsWith('IF ')) {
            return this.executeIF(lineContent);
        }
        
        // Handle FOR...TO...STEP
        if (upperLine.startsWith('FOR ')) {
            this.executeFOR(lineNum, lineContent, currentIndex);
            return null;
        }
        
        // Handle NEXT
        if (upperLine.startsWith('NEXT')) {
            return this.executeNEXT(lineNum, lineContent, sortedLines);
        }
        
        // Handle GOTO
        if (upperLine.startsWith('GOTO ')) {
            const targetLine = parseInt(lineContent.substring(5).trim());
            return { type: 'GOTO', target: targetLine };
        }
        
        // Handle END
        if (upperLine === 'END') {
            return 'END';
        }
        
        // Handle variable assignment
        if (lineContent.includes('=') && !upperLine.startsWith('IF ')) {
            this.executeAssignment(lineContent);
            return null;
        }
        
        return null;
    }

    executeFOR(lineNum, statement, currentIndex) {
        const match = statement.match(/^FOR\s+([A-Z])\s*=\s*(.+?)\s+TO\s+(.+?)(?:\s+STEP\s+(.+?))?$/i);
        if (!match) {
            this.printToScreen('?SYNTAX ERROR');
            return;
        }
        
        const varName = match[1].toUpperCase(); // ← ENSURE UPPERCASE
        const startValue = this.evaluateNumericExpression(match[2]);
        const endValue = this.evaluateNumericExpression(match[3]);
        const stepValue = match[4] ? this.evaluateNumericExpression(match[4]) : 1;
        
        console.log(`FOR ${varName} = ${startValue} TO ${endValue} STEP ${stepValue}`);
        
        // Initialize loop variable
        this.basicVariables.set(varName, startValue);
        
        // Initialize forLoopStack if it doesn't exist
        if (!this.forLoopStack) {
            this.forLoopStack = [];
        }
        
        // Push loop info onto stack
        this.forLoopStack.push({
            varName: varName,
            endValue: endValue,
            stepValue: stepValue,
            forLineNum: lineNum,
            forIndex: currentIndex
        });
        
        console.log('FOR loop stack:', this.forLoopStack);
    }



    // Updated executeNEXT to ensure uppercase variable names and better error handling
    executeNEXT(lineNum, statement, sortedLines) {
        // Extract variable name if specified
        const match = statement.match(/^NEXT\s*([A-Z])?/i);
        const specifiedVar = match && match[1] ? match[1].toUpperCase() : null; // ← ENSURE UPPERCASE
        
        console.log(`NEXT statement, specified var: ${specifiedVar}, stack size: ${this.forLoopStack ? this.forLoopStack.length : 0}`);
        
        // Check if forLoopStack exists
        if (!this.forLoopStack) {
            this.forLoopStack = [];
        }
        
        // Check if we have any FOR loops
        if (this.forLoopStack.length === 0) {
            this.printToScreen(`?NEXT WITHOUT FOR ERROR IN ${lineNum}`);
            return 'END';
        }
        
        // Get the most recent FOR loop (or matching one if variable specified)
        let loopInfo = null;
        let loopIndex = -1;
        
        if (specifiedVar) {
            // Find matching FOR loop
            for (let i = this.forLoopStack.length - 1; i >= 0; i--) {
                console.log(`  Checking: '${this.forLoopStack[i].varName}' vs '${specifiedVar}'`);
                if (this.forLoopStack[i].varName === specifiedVar) {
                    loopInfo = this.forLoopStack[i];
                    loopIndex = i;
                    break;
                }
            }
            if (!loopInfo) {
                this.printToScreen(`?NEXT WITHOUT FOR ERROR IN ${lineNum}`);
                return 'END';
            }
        } else {
            // Use most recent FOR loop
            loopInfo = this.forLoopStack[this.forLoopStack.length - 1];
            loopIndex = this.forLoopStack.length - 1;
        }
        
        // Increment loop variable
        const currentValue = this.basicVariables.get(loopInfo.varName) || 0;
        const newValue = currentValue + loopInfo.stepValue;
        
        console.log(`${loopInfo.varName}: ${currentValue} -> ${newValue}, end: ${loopInfo.endValue}`);
        
        // Check if loop should continue
        const shouldContinue = (loopInfo.stepValue > 0 && newValue <= loopInfo.endValue) ||
                            (loopInfo.stepValue < 0 && newValue >= loopInfo.endValue);
        
        if (shouldContinue) {
            // Update variable and continue loop
            this.basicVariables.set(loopInfo.varName, newValue);
            return { type: 'NEXT_CONTINUE', index: loopInfo.forIndex + 1 };
        } else {
            // Loop finished, remove from stack
            this.forLoopStack.splice(loopIndex, 1);
            return null;
        }
    }


        // Helper to check if position is inside quotes
        isInQuotes(str, position) {
            let inQuotes = false;
            for (let i = 0; i < position && i < str.length; i++) {
                if (str[i] === '"') {
                    inQuotes = !inQuotes;
                }
            }
            return inQuotes;
        }

        // Split statements by colon, respecting quotes
        splitStatements(line) {
            const statements = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                }
                if (char === ':' && !inQuotes) {
                    statements.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            
            if (current.trim()) {
                statements.push(current.trim());
            }
            
            return statements;
        }

    

        // Update evaluateNumericExpression to handle case-insensitive variables
        evaluateNumericExpression(expr) {
            // Replace variables with their values (case-insensitive)
            let processedExpr = expr;
            
            // Replace all single-letter variables
            for (let c = 65; c <= 90; c++) {
                const varName = String.fromCharCode(c);
                if (this.basicVariables.has(varName)) {
                    // Match both uppercase and lowercase in expression
                    const regex = new RegExp(`\\b${varName}\\b`, 'gi');
                    processedExpr = processedExpr.replace(regex, this.basicVariables.get(varName));
                }
            }
            
            try {
                return eval(processedExpr);
            } catch (e) {
                return 0;
            }
        }



        // Replace the existing processBASICCommand method with this enhanced version
        processBASICCommand(input) {
            const originalInput = input.trim();
            const cmd = originalInput.toUpperCase();

             if (this.inputMode && this.inputMode.active) {
                    this.handleInputMode(originalInput + '\n');
                    return true;
                }
                
            
            console.log(`Processing: "${originalInput}"`);
            
            // Ensure basicProgram exists
            if (!this.basicProgram) {
                this.basicProgram = new Map();
                this.basicVariables = new Map();
                this.basicStrings = new Map();
                this.basicArrays = new Map();
                this.basicCallStack = [];
                this.basicDataPointer = { line: 0, position: 0 };
                this.basicData = [];
            }
            
            // Check if input starts with a line number
            const lineNumberMatch = originalInput.match(/^(\d+)\s+(.+)$/);
            if (lineNumberMatch) {
                const lineNumber = parseInt(lineNumberMatch[1]);
                const lineContent = lineNumberMatch[2];
                
                console.log(`Storing line ${lineNumber}: ${lineContent}`);
                this.basicProgram.set(lineNumber, lineContent);
                return true;
            }
            
            // Check if it's just a line number (delete that line)
            if (/^\d+$/.test(originalInput)) {
                const lineNumber = parseInt(originalInput);
                this.basicProgram.delete(lineNumber);
                console.log(`Deleted line ${lineNumber}`);
                return true;
            }
            
            // Direct mode commands
            if (cmd.startsWith('PRINT ')) {
                this.executePRINT(originalInput.substring(6).trim());
                return true;
            }
            
            if (cmd === 'LIST') {
                this.executeLIST();
                return true;
            }
            
            if (cmd === 'NEW') {
                this.executeNEW();
                return true;
            }
            
            if (cmd === 'RUN') {
                this.executeRUN();
                return true;
            }
            
            // Handle variable assignment in direct mode
            if (originalInput.includes('=') && !cmd.startsWith('IF ')) {
                this.executeAssignment(originalInput);
                return true;
            }
            
            if (cmd.length > 0) {
                this.printToScreen('');
                this.printToScreen('?SYNTAX ERROR');
                this.printToScreen('');
                this.printToScreen('READY.');
                return true;
            }
            
            return false;
        }

        // Execute PRINT statement
        executePRINT(expr) {
            let output = '';
            let newline = true;
            
            // Split by semicolons and commas
            const parts = this.splitPrintExpression(expr);
            
            for (const part of parts) {
                const trimmedPart = part.trim();
                
                if (trimmedPart === '') continue;
                
                // Check if it ends with semicolon (no newline)
                if (trimmedPart.endsWith(';')) {
                    newline = false;
                    const actualPart = trimmedPart.slice(0, -1).trim();
                    output += this.evaluateExpression(actualPart);
                } else {
                    output += this.evaluateExpression(trimmedPart);
                }
            }
            
            this.printToScreen(output);
            
            if (newline && !expr.endsWith(';')) {
                // Move to next line
                this.vic.cursorX = 0;
                this.vic.cursorY++;
                if (this.vic.cursorY >= 25) {
                    this.scrollScreen();
                    this.vic.cursorY = 24;
                }
            }
        }

        // // Split PRINT expression handling quotes properly
        // splitPrintExpression(expr) {
        //     const parts = [];
        //     let current = '';
        //     let inQuotes = false;
            
        //     for (let i = 0; i < expr.length; i++) {
        //         const char = expr[i];
                
        //         if (char === '"') {
        //             inQuotes = !inQuotes;
        //             current += char;
        //         } else if ((char === ';' || char === ',') && !inQuotes) {
        //             if (current) parts.push(current);
        //             if (char === ';') parts.push(current + ';');
        //             current = '';
        //         } else {
        //             current += char;
        //         }
        //     }
            
        //     if (current) parts.push(current);
        //     return parts;
        // }

        splitPrintExpression(expr) {
            const parts = [];
            let current = '';
            let inQuotes = false;
            let parenCount = 0;  // Track parentheses for array syntax
            
            for (let i = 0; i < expr.length; i++) {
                const char = expr[i];
                
                if (char === '"') {
                    inQuotes = !inQuotes;
                    current += char;
                } else if (char === '(') {
                    parenCount++;
                    current += char;
                } else if (char === ')') {
                    parenCount--;
                    current += char;
                } else if ((char === ';' || char === ',') && !inQuotes && parenCount === 0) {
                    // Only split on ; or , if we're not inside quotes or parentheses
                    if (current) parts.push(current.trim());
                    current = '';
                    if (char === ',') parts.push(','); // Keep comma as separator for tabbing
                } else {
                    current += char;
                }
            }
            
            if (current) parts.push(current.trim());
            return parts;
        }


        // Evaluate expressions (numbers, strings, variables, math)
        // evaluateExpression(expr) {
        //     expr = expr.trim();
            
        //     // Handle quoted strings
        //     if (expr.startsWith('"') && expr.endsWith('"')) {
        //         return expr.slice(1, -1);
        //     }
            
        //     // Handle CHR$() function
        //     if (expr.startsWith('CHR$(') && expr.endsWith(')')) {
        //         const num = parseInt(expr.slice(5, -1));
        //         if (num === 147) {
        //             // Clear screen
        //             this.clearScreen();
        //             return '';
        //         }
        //         return String.fromCharCode(num);
        //     }
            
        //     // Handle string variables
        //     if (expr.match(/^[A-Z]\$$/)) {
        //         return this.basicStrings.get(expr) || '';
        //     }
            
        //     // Handle numeric variables
        //     if (expr.match(/^[A-Z]$/)) {
        //         const value = this.basicVariables.get(expr);
        //         return value !== undefined ? ' ' + value : ' 0';
        //     }
            
        //     // Handle math expressions
        //     if (/^[\d\+\-\*\/\(\)\s]+$/.test(expr)) {
        //         try {
        //             const result = eval(expr);
        //             return ' ' + result;
        //         } catch (e) {
        //             return '?SYNTAX ERROR';
        //         }
        //     }
            
        //     // Handle expressions with variables
        //     let processedExpr = expr;
            
        //     // Replace variables with their values
        //     const varMatches = expr.match(/[A-Z]/g);
        //     if (varMatches) {
        //         for (const varName of varMatches) {
        //             if (this.basicVariables.has(varName)) {
        //                 processedExpr = processedExpr.replace(new RegExp(varName, 'g'), this.basicVariables.get(varName));
        //             }
        //         }
        //     }
            
        //     // Try to evaluate the processed expression
        //     try {
        //         if (/^[\d\+\-\*\/\(\)\s\.]+$/.test(processedExpr)) {
        //             const result = eval(processedExpr);
        //             return ' ' + result;
        //         }
        //     } catch (e) {
        //         // Fall through
        //     }
            
        //     return expr;
        // }

        // // 2. Fix evaluateExpression to handle string variables without forcing uppercase
        // evaluateExpression(expr) {
        //     expr = expr.trim();
            
        //     // Handle quoted strings
        //     if (expr.startsWith('"') && expr.endsWith('"')) {
        //         return expr.slice(1, -1);
        //     }
            
        //     // Handle CHR$() function
        //     if (expr.match(/^CHR\$\s*\(\s*(\d+)\s*\)$/i)) {
        //         const match = expr.match(/^CHR\$\s*\(\s*(\d+)\s*\)$/i);
        //         const num = parseInt(match[1]);
        //         if (num === 147) {
        //             this.clearScreen();
        //             return '';
        //         }
        //         return String.fromCharCode(num);
        //     }
            
        //     // Handle string variables - check both cases
        //     if (expr.match(/^[A-Za-z][A-Za-z0-9]*\$$/)) {
        //         // Try exact case first
        //         if (this.basicStrings.has(expr)) {
        //             return this.basicStrings.get(expr) || '';
        //         }
        //         // Try uppercase
        //         const upperExpr = expr.toUpperCase();
        //         if (this.basicStrings.has(upperExpr)) {
        //             return this.basicStrings.get(upperExpr) || '';
        //         }
        //         return '';
        //     }
            
        //     // Handle numeric variables - check both cases
        //     if (expr.match(/^[A-Za-z][A-Za-z0-9]*$/)) {
        //         // Try exact case first
        //         if (this.basicVariables.has(expr)) {
        //             return String(this.basicVariables.get(expr));
        //         }
        //         // Try uppercase
        //         const upperExpr = expr.toUpperCase();
        //         if (this.basicVariables.has(upperExpr)) {
        //             return String(this.basicVariables.get(upperExpr));
        //         }
        //         return '0';
        //     }
            
        //     // Handle math expressions
        //     if (/^[\d\+\-\*\/\(\)\s\.]+$/.test(expr)) {
        //         try {
        //             const result = eval(expr);
        //             return String(result);
        //         } catch (e) {
        //             return '?SYNTAX ERROR';
        //         }
        //     }
            
        //     // Handle expressions with variables
        //     let processedExpr = expr;
            
        //     // Replace variables with their values (both uppercase and lowercase)
        //     const varPattern = /\b([A-Za-z][A-Za-z0-9]*\$?)\b/g;
        //     processedExpr = processedExpr.replace(varPattern, (match) => {
        //         // Check exact case first
        //         if (this.basicVariables.has(match)) {
        //             return this.basicVariables.get(match);
        //         }
        //         if (this.basicStrings.has(match)) {
        //             return '"' + this.basicStrings.get(match) + '"';
        //         }
        //         // Check uppercase
        //         const upperMatch = match.toUpperCase();
        //         if (this.basicVariables.has(upperMatch)) {
        //             return this.basicVariables.get(upperMatch);
        //         }
        //         if (this.basicStrings.has(upperMatch)) {
        //             return '"' + this.basicStrings.get(upperMatch) + '"';
        //         }
        //         return match;
        //     });
            
        //     // Try to evaluate the processed expression
        //     try {
        //         if (/^[\d\+\-\*\/\(\)\s\.]+$/.test(processedExpr)) {
        //             const result = eval(processedExpr);
        //             return String(result);
        //         }
        //     } catch (e) {
        //         // Fall through
        //     }
            
        //     return expr;
        // }


        // // Also update variable assignment to ensure uppercase
        // executeAssignment(statement) {
        //     const match = statement.match(/^([A-Z]\$?)\s*=\s*(.+)$/i); // ← Added 'i' flag
        //     if (!match) {
        //         this.printToScreen('?SYNTAX ERROR');
        //         return;
        //     }
            
        //     const varName = match[1].toUpperCase(); // ← ENSURE UPPERCASE
        //     const expr = match[2].trim();
            
        //     if (varName.endsWith('$')) {
        //         // String variable
        //         const value = this.evaluateExpression(expr);
        //         this.basicStrings.set(varName, value);
        //     } else {
        //         // Numeric variable
        //         const value = this.evaluateNumericExpression(expr);
        //         this.basicVariables.set(varName, value);
        //     }
        // }

        // Fix evaluateExpression to handle array access
        // evaluateExpression(expr) {
        //     expr = expr.trim();
            
        //     // Handle quoted strings
        //     if (expr.startsWith('"') && expr.endsWith('"')) {
        //         return expr.slice(1, -1);
        //     }
            
        //     // Handle CHR$() function
        //     if (expr.match(/^CHR\$\s*\(\s*(\d+)\s*\)$/i)) {
        //         const match = expr.match(/^CHR\$\s*\(\s*(\d+)\s*\)$/i);
        //         const num = parseInt(match[1]);
        //         if (num === 147) {
        //             this.clearScreen();
        //             return '';
        //         }
        //         return String.fromCharCode(num);
        //     }
            
        //     // CHECK FOR ARRAY ACCESS FIRST (before simple variables)
        //     // Match array access like A(3) or B$(1,2)
        //     const arrayMatch = expr.match(/^([A-Za-z][A-Za-z0-9]*\$?)\s*\((.*)\)$/);
        //     if (arrayMatch) {
        //         const arrayName = arrayMatch[1].toUpperCase();
        //         const indexExpr = arrayMatch[2];
                
        //         // Parse indices
        //         const indices = indexExpr.split(',').map(idx => {
        //             const evaluated = this.evaluateNumericExpression(idx.trim());
        //             return Math.floor(evaluated);
        //         });
                
        //         // Check if array exists
        //         if (!this.basicArrays || !this.basicArrays.has(arrayName)) {
        //             // Auto-dimension array if not exists (C64 BASIC behavior)
        //             const dimensions = indices.map(() => 11); // Default size 11 (0-10)
        //             if (!this.basicArrays) this.basicArrays = new Map();
        //             this.basicArrays.set(arrayName, {
        //                 dimensions: dimensions,
        //                 data: this.createMultiDimArray(dimensions, arrayName.endsWith('$') ? '' : 0)
        //             });
        //         }
                
        //         const array = this.basicArrays.get(arrayName);
                
        //         // Access array element
        //         let element = array.data;
        //         for (let i = 0; i < indices.length; i++) {
        //             const idx = indices[i];
        //             if (idx < 0 || idx >= element.length) {
        //                 return '?SUBSCRIPT OUT OF RANGE';
        //             }
        //             element = element[idx];
        //         }
                
        //         return String(element);
        //     }
            
        //     // Handle string variables - check both cases
        //     if (expr.match(/^[A-Za-z][A-Za-z0-9]*\$$/)) {
        //         // Try exact case first
        //         if (this.basicStrings.has(expr)) {
        //             return this.basicStrings.get(expr) || '';
        //         }
        //         // Try uppercase
        //         const upperExpr = expr.toUpperCase();
        //         if (this.basicStrings.has(upperExpr)) {
        //             return this.basicStrings.get(upperExpr) || '';
        //         }
        //         return '';
        //     }
            
        //     // Handle numeric variables - check both cases
        //     if (expr.match(/^[A-Za-z][A-Za-z0-9]*$/)) {
        //         // Try exact case first
        //         if (this.basicVariables.has(expr)) {
        //             return String(this.basicVariables.get(expr));
        //         }
        //         // Try uppercase
        //         const upperExpr = expr.toUpperCase();
        //         if (this.basicVariables.has(upperExpr)) {
        //             return String(this.basicVariables.get(upperExpr));
        //         }
        //         return '0';
        //     }
            
        //     // Handle math expressions
        //     if (/^[\d\+\-\*\/\(\)\s\.]+$/.test(expr)) {
        //         try {
        //             const result = eval(expr);
        //             return String(result);
        //         } catch (e) {
        //             return '?SYNTAX ERROR';
        //         }
        //     }
            
        //     // Handle expressions with variables and arrays
        //     let processedExpr = expr;
            
        //     // First replace array accesses
        //     const arrayPattern = /\b([A-Za-z][A-Za-z0-9]*\$?)\s*\(([^)]+)\)/g;
        //     processedExpr = processedExpr.replace(arrayPattern, (match, arrName, indices) => {
        //         const arrayName = arrName.toUpperCase();
        //         const indexList = indices.split(',').map(idx => {
        //             return Math.floor(this.evaluateNumericExpression(idx.trim()));
        //         });
                
        //         if (this.basicArrays && this.basicArrays.has(arrayName)) {
        //             const array = this.basicArrays.get(arrayName);
        //             let element = array.data;
                    
        //             for (const idx of indexList) {
        //                 if (Array.isArray(element) && idx >= 0 && idx < element.length) {
        //                     element = element[idx];
        //                 } else {
        //                     return '0';
        //                 }
        //             }
                    
        //             return String(element);
        //         }
        //         return '0';
        //     });
            
        //     // Then replace simple variables
        //     const varPattern = /\b([A-Za-z][A-Za-z0-9]*\$?)\b/g;
        //     processedExpr = processedExpr.replace(varPattern, (match) => {
        //         // Skip if it's followed by '(' (array)
        //         if (processedExpr.charAt(processedExpr.indexOf(match) + match.length) === '(') {
        //             return match;
        //         }
                
        //         // Check exact case first
        //         if (this.basicVariables.has(match)) {
        //             return this.basicVariables.get(match);
        //         }
        //         if (this.basicStrings.has(match)) {
        //             return '"' + this.basicStrings.get(match) + '"';
        //         }
        //         // Check uppercase
        //         const upperMatch = match.toUpperCase();
        //         if (this.basicVariables.has(upperMatch)) {
        //             return this.basicVariables.get(upperMatch);
        //         }
        //         if (this.basicStrings.has(upperMatch)) {
        //             return '"' + this.basicStrings.get(upperMatch) + '"';
        //         }
        //         return match;
        //     });
            
        //     // Try to evaluate the processed expression
        //     try {
        //         if (/^[\d\+\-\*\/\(\)\s\.]+$/.test(processedExpr)) {
        //             const result = eval(processedExpr);
        //             return String(result);
        //         }
        //     } catch (e) {
        //         // Fall through
        //     }
            
        //     return expr;
        // }



        // // Let's also check evaluateExpression for array access
        // evaluateExpression(expr) {
        //     expr = expr.trim();
        //     console.log('evaluateExpression called with:', expr);
            
        //     // Handle quoted strings
        //     if (expr.startsWith('"') && expr.endsWith('"')) {
        //         return expr.slice(1, -1);
        //     }
            
        //     // CHECK FOR ARRAY ACCESS
        //     // Updated regex to handle $ in array names
        //     const arrayMatch = expr.match(/^([A-Z][A-Z0-9]*\$?)\s*\(([^)]+)\)$/i);
        //     if (arrayMatch) {
        //         console.log('Array access detected:', arrayMatch);
        //         const arrayName = arrayMatch[1].toUpperCase();
        //         const indexExpr = arrayMatch[2];
                
        //         console.log('Looking for array:', arrayName);
        //         console.log('Available arrays:', this.basicArrays ? Array.from(this.basicArrays.keys()) : 'None');
                
        //         // Parse indices
        //         const indices = indexExpr.split(',').map(idx => {
        //             const evaluated = this.evaluateNumericExpression(idx.trim());
        //             return Math.floor(evaluated);
        //         });
                
        //         console.log('Indices:', indices);
                
        //         // Check if array exists
        //         if (!this.basicArrays || !this.basicArrays.has(arrayName)) {
        //             console.log('Array not found, auto-dimensioning');
        //             // Auto-dimension array if not exists (C64 BASIC behavior)
        //             const dimensions = indices.map(() => 11); // Default size 11 (0-10)
        //             if (!this.basicArrays) this.basicArrays = new Map();
        //             this.basicArrays.set(arrayName, {
        //                 dimensions: dimensions,
        //                 data: this.createMultiDimArray(dimensions, arrayName.endsWith('$') ? '' : 0)
        //             });
        //         }
                
        //         const array = this.basicArrays.get(arrayName);
        //         console.log('Array found:', array);
                
        //         // Access array element
        //         let element = array.data;
        //         for (let i = 0; i < indices.length; i++) {
        //             const idx = indices[i];
        //             if (idx < 0 || idx >= element.length) {
        //                 console.log('Index out of range:', idx, 'for array length:', element.length);
        //                 return '?SUBSCRIPT OUT OF RANGE';
        //             }
        //             element = element[idx];
        //         }
                
        //         console.log('Array element value:', element);
        //         return String(element);
        //     }
            
        //     // ... rest of evaluateExpression code remains the same ...
            
        //     // For debugging, let's return the original expression if nothing matches
        //     console.log('No match found, returning original expression');
        //     return expr;
        // }

        // Also ensure evaluateExpression handles the array case properly
        // Update just the array matching part to be more robust
        evaluateExpression(expr) {
            expr = expr.trim();
            console.log('evaluateExpression:', expr);
            
            // Handle quoted strings
            if (expr.startsWith('"') && expr.endsWith('"')) {
                return expr.slice(1, -1);
            }
            
            // Handle CHR$() function
            if (expr.match(/^CHR\$\s*\(\s*(\d+)\s*\)$/i)) {
                const match = expr.match(/^CHR\$\s*\(\s*(\d+)\s*\)$/i);
                const num = parseInt(match[1]);
                if (num === 147) {
                    this.clearScreen();
                    return '';
                }
                return String.fromCharCode(num);
            }
            
            // CHECK FOR ARRAY ACCESS - improved regex
            // This should match: A(5), B$(1,2), etc.
            if (expr.includes('(') && expr.includes(')')) {
                const arrayMatch = expr.match(/^([A-Z]+\$?)\s*\(([^)]+)\)$/i);
                console.log('Array match attempt:', arrayMatch);
                
                if (arrayMatch) {
                    const arrayName = arrayMatch[1].toUpperCase();
                    const indexExpr = arrayMatch[2];
                    
                    console.log('Array name:', arrayName, 'Index expr:', indexExpr);
                    
                    // Parse indices
                    const indices = indexExpr.split(',').map(idx => {
                        const evaluated = this.evaluateNumericExpression(idx.trim());
                        return Math.floor(evaluated);
                    });
                    
                    // Check if array exists
                    if (!this.basicArrays || !this.basicArrays.has(arrayName)) {
                        console.log('Array not found:', arrayName);
                        // Auto-dimension array if not exists
                        const dimensions = indices.map(() => 11);
                        if (!this.basicArrays) this.basicArrays = new Map();
                        this.basicArrays.set(arrayName, {
                            dimensions: dimensions,
                            data: this.createMultiDimArray(dimensions, arrayName.endsWith('$') ? '' : 0)
                        });
                    }
                    
                    const array = this.basicArrays.get(arrayName);
                    
                    // Access array element
                    let element = array.data;
                    for (let i = 0; i < indices.length; i++) {
                        const idx = indices[i];
                        if (idx < 0 || idx >= element.length) {
                            return '?SUBSCRIPT OUT OF RANGE';
                        }
                        element = element[idx];
                    }
                    
                    console.log('Array value:', element);
                    return String(element);
                }
            }
            
            // Handle string variables
            if (expr.match(/^[A-Z]+\$$/i)) {
                const upperExpr = expr.toUpperCase();
                if (this.basicStrings.has(upperExpr)) {
                    return this.basicStrings.get(upperExpr) || '';
                }
                return '';
            }
            
            // Handle numeric variables
            if (expr.match(/^[A-Z]+$/i)) {
                const upperExpr = expr.toUpperCase();
                if (this.basicVariables.has(upperExpr)) {
                    return String(this.basicVariables.get(upperExpr));
                }
                return '0';
            }
            
            // Handle numeric expressions
            try {
                const num = parseFloat(expr);
                if (!isNaN(num)) {
                    return String(num);
                }
            } catch (e) {
                // Not a number
            }
            
            // Return original if no match
            console.log('No evaluation match, returning:', expr);
            return expr;
        }


        // Also fix executeAssignment to handle array assignment properly
        executeAssignment(statement) {
            // Check for array assignment first: A(5) = 10 or B$(1,2) = "HELLO"
            const arrayMatch = statement.match(/^([A-Za-z][A-Za-z0-9]*\$?)\s*\((.*?)\)\s*=\s*(.+)$/i);
            if (arrayMatch) {
                const arrayName = arrayMatch[1].toUpperCase();
                const indexExpr = arrayMatch[2];
                const valueExpr = arrayMatch[3].trim();
                
                // Parse indices
                const indices = indexExpr.split(',').map(idx => {
                    return Math.floor(this.evaluateNumericExpression(idx.trim()));
                });
                
                // Auto-create array if it doesn't exist
                if (!this.basicArrays) this.basicArrays = new Map();
                if (!this.basicArrays.has(arrayName)) {
                    const dimensions = indices.map(idx => Math.max(11, idx + 1)); // At least 11 or index+1
                    this.basicArrays.set(arrayName, {
                        dimensions: dimensions,
                        data: this.createMultiDimArray(dimensions, arrayName.endsWith('$') ? '' : 0)
                    });
                }
                
                // Get array
                const array = this.basicArrays.get(arrayName);
                
                // Navigate to the element
                let element = array.data;
                for (let i = 0; i < indices.length - 1; i++) {
                    const idx = indices[i];
                    if (idx >= element.length) {
                        this.printToScreen('?SUBSCRIPT OUT OF RANGE ERROR');
                        return;
                    }
                    element = element[idx];
                }
                
                // Set the value
                const lastIdx = indices[indices.length - 1];
                if (lastIdx >= element.length) {
                    this.printToScreen('?SUBSCRIPT OUT OF RANGE ERROR');
                    return;
                }
                
                if (arrayName.endsWith('$')) {
                    element[lastIdx] = this.evaluateExpression(valueExpr);
                } else {
                    element[lastIdx] = this.evaluateNumericExpression(valueExpr);
                }
                
                return;
            }
            
            // Regular variable assignment
            const match = statement.match(/^([A-Z]\$?)\s*=\s*(.+)$/i);
            if (!match) {
                this.printToScreen('?SYNTAX ERROR');
                return;
            }
            
            const varName = match[1].toUpperCase();
            const expr = match[2].trim();
            
            if (varName.endsWith('$')) {
                // String variable
                const value = this.evaluateExpression(expr);
                this.basicStrings.set(varName, value);
            } else {
                // Numeric variable
                const value = this.evaluateNumericExpression(expr);
                this.basicVariables.set(varName, value);
            }
        }


        // Execute LIST command
        executeLIST() {
            this.printToScreen('');
            const sortedLines = Array.from(this.basicProgram.entries()).sort((a, b) => a[0] - b[0]);
            for (const [lineNum, lineContent] of sortedLines) {
                this.printToScreen(`${lineNum} ${lineContent}`);
            }
            this.printToScreen('');
            this.printToScreen('READY.');
        }

        // Execute NEW command
        executeNEW() {
            this.basicProgram.clear();
            this.basicVariables.clear();
            this.basicStrings.clear();
            this.basicArrays.clear();
            this.basicCallStack = [];
            this.printToScreen('');
            this.printToScreen('READY.');
        }


        // Execute IF...THEN statement
        executeIF(statement) {
            // Parse IF condition THEN action
            const match = statement.match(/^IF\s+(.+?)\s+THEN\s+(.+)$/i);
            if (!match) {
                this.printToScreen('?SYNTAX ERROR');
                return null;
            }
            
            const condition = match[1];
            const action = match[2];
            
            // Evaluate condition
            if (this.evaluateCondition(condition)) {
                // Check if action is a line number (GOTO)
                if (/^\d+$/.test(action.trim())) {
                    return parseInt(action.trim());
                }
                // Execute the action
                return this.executeLine(0, action);
            }
            
            return null;
        }

        // Evaluate conditional expressions
        evaluateCondition(condition) {
            // Handle comparison operators
            const operators = ['<=', '>=', '<>', '<', '>', '='];
            
            for (const op of operators) {
                if (condition.includes(op)) {
                    const parts = condition.split(op);
                    if (parts.length === 2) {
                        const left = this.evaluateNumericExpression(parts[0].trim());
                        const right = this.evaluateNumericExpression(parts[1].trim());
                        
                        switch (op) {
                            case '=': return left === right;
                            case '<>': return left !== right;
                            case '<': return left < right;
                            case '>': return left > right;
                            case '<=': return left <= right;
                            case '>=': return left >= right;
                        }
                    }
                }
            }
            
            // Try to evaluate as boolean expression
            try {
                return !!this.evaluateNumericExpression(condition);
            } catch (e) {
                return false;
            }
        }


        // Find matching FOR loop when NEXT is encountered
        findMatchingFor(nextLineNum) {
            if (!this.forLoops) return null;
            
            // Find the most recent FOR loop
            let matchingFor = null;
            let matchingVarName = null;
            
            for (const [varName, forInfo] of this.forLoops) {
                if (forInfo.lineNum < nextLineNum) {
                    matchingFor = forInfo;
                    matchingVarName = varName;
                }
            }
            
            if (!matchingFor) return null;
            
            // Increment loop variable
            const currentValue = this.basicVariables.get(matchingVarName);
            const newValue = currentValue + matchingFor.stepValue;
            
            // Check if loop should continue
            if ((matchingFor.stepValue > 0 && newValue <= matchingFor.endValue) ||
                (matchingFor.stepValue < 0 && newValue >= matchingFor.endValue)) {
                // Continue loop
                this.basicVariables.set(matchingVarName, newValue);
                
                // Find the line after FOR
                const sortedLines = Array.from(this.basicProgram.entries()).sort((a, b) => a[0] - b[0]);
                const forIndex = sortedLines.findIndex(([num]) => num === matchingFor.lineNum);
                return { index: forIndex + 1 };
            } else {
                // End loop
                this.forLoops.delete(matchingVarName);
                return null;
            }
        }

        // Clear screen helper
        clearScreen() {
            // Clear screen memory
            for (let i = 0; i < 1000; i++) {
                this.memory.write(0x0400 + i, 0x20); // Space
                this.memory.write(0xD800 + i, 14); // Light blue
            }
            
            // Reset cursor
            this.vic.cursorX = 0;
            this.vic.cursorY = 0;
            
            // Force render
            this.vic.renderFrame();
        }





    //////////////////////////////////////////////////
    // Add these new methods to C64Emulator class:


    evaluatePrintExpression(expr) {
        let result = '';
        let currentExpr = expr.trim();
        
        // Parse semicolon-separated expressions
        const parts = this.parsePrintParts(currentExpr);
        
        for (const part of parts) {
            const trimmedPart = part.trim();
            
            // Handle CHR$() function
            if (trimmedPart.toUpperCase().startsWith('CHR$(')) {
                const chrMatch = trimmedPart.match(/CHR\$\s*\(\s*(\d+)\s*\)/i);
                if (chrMatch) {
                    const charCode = parseInt(chrMatch[1]);
                    if (charCode === 147) {
                        // Clear screen
                        this.clearScreen();
                        continue;
                    } else {
                        result += String.fromCharCode(charCode);
                    }
                }
            }
            // Handle quoted strings
            else if (trimmedPart.startsWith('"') && trimmedPart.endsWith('"')) {
                result += trimmedPart.slice(1, -1);
            }
            // Handle variables
            else if (this.basicVariables && this.basicVariables.has(trimmedPart)) {
                result += this.basicVariables.get(trimmedPart);
            }
            // Handle numeric expressions
            else if (/^[\d\+\-\*\/\(\)\s]+$/.test(trimmedPart)) {
                try {
                    result += ' ' + eval(trimmedPart);
                } catch (e) {
                    throw new Error('Invalid expression');
                }
            }
            // Default: treat as string
            else {
                result += trimmedPart;
            }
        }
        
        return result;
    }

    parsePrintParts(expr) {
        const parts = [];
        let current = '';
        let inQuotes = false;
        let i = 0;
        
        while (i < expr.length) {
            const char = expr[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
                current += char;
            } else if (char === ';' && !inQuotes) {
                parts.push(current.trim());
                current = '';
            } else if (char === ':' && !inQuotes) {
                // Handle REM comments
                const remaining = expr.substring(i).toUpperCase();
                if (remaining.startsWith(': REM')) {
                    parts.push(current.trim());
                    break; // Ignore rest of line
                } else {
                    current += char;
                }
            } else {
                current += char;
            }
            i++;
        }
        
        if (current.trim()) {
            parts.push(current.trim());
        }
        
        return parts;
    }


    executeStatement(statement, currentIndex, allLines) {
        const trimmed = statement.trim();
        const upper = trimmed.toUpperCase();
        
        // Remove REM comments
        const remIndex = upper.indexOf(' REM ');
        const colonRemIndex = upper.indexOf(': REM ');
        let cleanStatement = trimmed;
        
        if (colonRemIndex !== -1) {
            cleanStatement = trimmed.substring(0, colonRemIndex).trim();
        } else if (remIndex !== -1) {
            cleanStatement = trimmed.substring(0, remIndex).trim();
        }
        
        const upperClean = cleanStatement.toUpperCase();
        
        // PRINT statement
        if (upperClean.startsWith('PRINT ')) {
            this.executePRINT(cleanStatement.substring(6));
            return currentIndex + 1;
        }
        
        // FOR statement
        if (upperClean.startsWith('FOR ')) {
            return this.executeFOR(cleanStatement, currentIndex, allLines);
        }
        
        // NEXT statement
        if (upperClean.startsWith('NEXT ')) {
            return this.executeNEXT(cleanStatement, currentIndex, allLines);
        }
        
        // END statement
        if (upperClean === 'END') {
            return -1;
        }
        
        // Unknown statement - continue to next line
        return currentIndex + 1;
    }

    // Next essential BASIC features for C64 Emulator
    // Add these methods to your C64Emulator class

    // 1. INPUT statement - Get user input
    // executeINPUT(statement) {
    //     // Parse INPUT statement: INPUT "prompt"; variable
    //     const match = statement.match(/^INPUT\s*(?:"([^"]*)"(?:\s*;)?\s*)?([A-Z]\$?)$/i);
    //     if (!match) {
    //         this.printToScreen('?SYNTAX ERROR');
    //         return;
    //     }
        
    //     const prompt = match[1] || '?';
    //     const varName = match[2].toUpperCase();
        
    //     // Print prompt
    //     this.printToScreen(prompt + ' ');
        
    //     // Set up input mode
    //     this.inputMode = {
    //         active: true,
    //         varName: varName,
    //         isString: varName.endsWith('$'),
    //         buffer: '',
    //         cursorStart: this.vic.cursorX
    //     };
        
    //     // Show cursor
    //     this.showCursor = true;
    // }

    // // Handle input mode in processBASICCommand
    // handleInputMode(char) {
    //     if (!this.inputMode || !this.inputMode.active) return false;
        
    //     if (char === '\n') {
    //         // Input complete
    //         const value = this.inputMode.buffer;
            
    //         if (this.inputMode.isString) {
    //             this.basicStrings.set(this.inputMode.varName, value);
    //         } else {
    //             const numValue = parseFloat(value) || 0;
    //             this.basicVariables.set(this.inputMode.varName, numValue);
    //         }
            
    //         // Clear input mode
    //         this.inputMode = null;
    //         this.showCursor = false;
            
    //         // Continue program execution
    //         this.continueExecution();
    //         return true;
    //     } else if (char === '\b') {
    //         // Backspace
    //         if (this.inputMode.buffer.length > 0) {
    //             this.inputMode.buffer = this.inputMode.buffer.slice(0, -1);
    //             // Update display
    //             this.vic.cursorX--;
    //             const screenPos = this.vic.cursorY * 40 + this.vic.cursorX;
    //             this.memory.write(0x0400 + screenPos, 0x20); // Space
    //         }
    //     } else {
    //         // Add character to buffer
    //         this.inputMode.buffer += char;
    //         // Display character
    //         const screenPos = this.vic.cursorY * 40 + this.vic.cursorX;
    //         const screenCode = this.asciiToScreenCode(char.charCodeAt(0));
    //         this.memory.write(0x0400 + screenPos, screenCode);
    //         this.vic.cursorX++;
    //     }
        
    //     return true;
    // }

    // Fixed INPUT statement implementation
        // executeINPUT(statement) {
        //     // INPUT can have several formats:
        //     // INPUT A
        //     // INPUT A$
        //     // INPUT "prompt"; A
        //     // INPUT "prompt"; A$
        //     // INPUT A, B, C (multiple variables)
            
        //     let prompt = "? ";  // Default prompt
        //     let variables = [];
        //     let remainingStatement = statement.trim();
            
        //     // Check if there's a quoted prompt
        //     if (remainingStatement.startsWith('"')) {
        //         const endQuoteIndex = remainingStatement.indexOf('"', 1);
        //         if (endQuoteIndex !== -1) {
        //             prompt = remainingStatement.substring(1, endQuoteIndex);
        //             remainingStatement = remainingStatement.substring(endQuoteIndex + 1).trim();
                    
        //             // Skip the semicolon if present
        //             if (remainingStatement.startsWith(';')) {
        //                 remainingStatement = remainingStatement.substring(1).trim();
        //             }
        //         }
        //     }
            
        //     // Parse variable names (comma separated)
        //     if (remainingStatement) {
        //         variables = remainingStatement.split(',').map(v => v.trim().toUpperCase());
        //     }
            
        //     if (variables.length === 0) {
        //         this.printToScreen('?SYNTAX ERROR');
        //         return;
        //     }
            
        //     console.log(`INPUT: prompt="${prompt}", variables=${variables.join(',')}`);
            
        //     // Print prompt (without newline)
        //     for (const char of prompt) {
        //         const screenPos = this.vic.cursorY * 40 + this.vic.cursorX;
        //         const screenCode = this.asciiToScreenCode(char.charCodeAt(0));
                
        //         this.memory.write(0x0400 + screenPos, screenCode);
        //         this.memory.write(0xD800 + screenPos, 14);
                
        //         this.vic.cursorX++;
        //         if (this.vic.cursorX >= 40) {
        //             this.vic.cursorX = 0;
        //             this.vic.cursorY++;
        //             if (this.vic.cursorY >= 25) {
        //                 this.scrollScreen();
        //                 this.vic.cursorY = 24;
        //             }
        //         }
        //     }
            
        //     // Set up input mode
        //     this.inputMode = {
        //         active: true,
        //         variables: variables,
        //         currentVarIndex: 0,
        //         buffer: '',
        //         startX: this.vic.cursorX,
        //         startY: this.vic.cursorY
        //     };
            
        //     // Show cursor
        //     this.showInputCursor = true;
        //     this.vic.renderFrame();
        // }

        // Simplified executeINPUT that works with your existing code
        // executeINPUT(statement) {
        //     // Parse INPUT statement
        //     let prompt = "? ";
        //     let variables = [];
        //     let remainingStatement = statement.trim();
            
        //     // Check if there's a quoted prompt
        //     if (remainingStatement.startsWith('"')) {
        //         const endQuoteIndex = remainingStatement.indexOf('"', 1);
        //         if (endQuoteIndex !== -1) {
        //             prompt = remainingStatement.substring(1, endQuoteIndex);
        //             remainingStatement = remainingStatement.substring(endQuoteIndex + 1).trim();
                    
        //             // Skip the semicolon if present
        //             if (remainingStatement.startsWith(';')) {
        //                 remainingStatement = remainingStatement.substring(1).trim();
        //             }
        //         }
        //     }
            
        //     // Parse variable names
        //     if (remainingStatement) {
        //         variables = remainingStatement.split(',').map(v => v.trim().toUpperCase());
        //     }
            
        //     if (variables.length === 0) {
        //         this.printToScreen('?SYNTAX ERROR');
        //         return;
        //     }
            
        //     // Print prompt using existing writeCharToScreen
        //     for (const char of prompt) {
        //         this.writeCharToScreen(char.charCodeAt(0));
        //     }
            
        //     // Set up input mode
        //     this.inputMode = {
        //         active: true,
        //         variables: variables,
        //         currentVarIndex: 0,
        //         buffer: ''
        //     };
            
        //     // Return 'PAUSE' to pause execution
        //     return 'PAUSE';
        // }


        // 3. Update executeINPUT to NOT force uppercase (for case sensitivity)
        executeINPUT(statement) {
            // Parse INPUT statement
            let prompt = "? ";
            let variables = [];
            let remainingStatement = statement.trim();
            
            // Check if there's a quoted prompt
            if (remainingStatement.startsWith('"')) {
                const endQuoteIndex = remainingStatement.indexOf('"', 1);
                if (endQuoteIndex !== -1) {
                    prompt = remainingStatement.substring(1, endQuoteIndex);
                    remainingStatement = remainingStatement.substring(endQuoteIndex + 1).trim();
                    
                    // Skip the semicolon if present
                    if (remainingStatement.startsWith(';')) {
                        remainingStatement = remainingStatement.substring(1).trim();
                    }
                }
            }
            
            // Parse variable names - DON'T force uppercase here
            if (remainingStatement) {
                variables = remainingStatement.split(',').map(v => v.trim());
            }
            
            if (variables.length === 0) {
                this.printToScreen('?SYNTAX ERROR');
                return;
            }
            
            // Print prompt using existing writeCharToScreen
            for (const char of prompt) {
                this.writeCharToScreen(char.charCodeAt(0));
            }
            
            // Set up input mode
            this.inputMode = {
                active: true,
                variables: variables,
                currentVarIndex: 0,
                buffer: ''
            };
            
            // Return 'PAUSE' to pause execution
            return 'PAUSE';
        }


        // 1. Fix executePRINT to handle semicolons properly
        // executePRINT(expr) {
        //     let output = '';
        //     let position = 0;
        //     let addSpace = false;
            
        //     // Parse the print expression properly
        //     while (position < expr.length) {
        //         // Skip whitespace
        //         while (position < expr.length && expr[position] === ' ') {
        //             position++;
        //         }
                
        //         if (position >= expr.length) break;
                
        //         // Check for semicolon or comma
        //         if (expr[position] === ';') {
        //             addSpace = false;
        //             position++;
        //             continue;
        //         }
                
        //         if (expr[position] === ',') {
        //             // Tab to next column (every 10 spaces in C64)
        //             const currentLen = output.length % 40;
        //             const nextTab = Math.floor(currentLen / 10) * 10 + 10;
        //             while (output.length % 40 < nextTab && output.length % 40 !== 0) {
        //                 output += ' ';
        //             }
        //             position++;
        //             continue;
        //         }
                
        //         // Parse next expression
        //         let endPos = position;
        //         let inQuotes = false;
                
        //         // Find the end of this expression
        //         while (endPos < expr.length) {
        //             if (expr[endPos] === '"') {
        //                 inQuotes = !inQuotes;
        //             } else if (!inQuotes && (expr[endPos] === ';' || expr[endPos] === ',')) {
        //                 break;
        //             }
        //             endPos++;
        //         }
                
        //         // Get the expression
        //         const subExpr = expr.substring(position, endPos).trim();
                
        //         if (subExpr) {
        //             // Add space before numeric values (C64 BASIC behavior)
        //             if (addSpace) {
        //                 output += ' ';
        //             }
                    
        //             const value = this.evaluateExpression(subExpr);
        //             output += value;
                    
        //             // Numeric values get space after them by default
        //             addSpace = !isNaN(value);
        //         }
                
        //         position = endPos;
        //     }
            
        //     // Print the output
        //     this.printToScreen(output);
            
        //     // Handle newline (unless expression ends with semicolon)
        //     if (!expr.trim().endsWith(';')) {
        //         this.vic.cursorX = 0;
        //         this.vic.cursorY++;
        //         if (this.vic.cursorY >= 25) {
        //             this.scrollScreen();
        //             this.vic.cursorY = 24;
        //         }
        //     }
        // }

        // Updated executePRINT to properly handle the parts
        executePRINT(expr) {
            console.log('executePRINT:', expr);
            
            // Split the expression properly
            const parts = this.splitPrintExpression(expr);
            console.log('Print parts:', parts);
            
            let output = '';
            let position = 0;
            
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                
                if (part === ',') {
                    // Tab to next column (every 10 spaces in C64)
                    const currentLen = position % 40;
                    const nextTab = Math.floor(currentLen / 10) * 10 + 10;
                    while (position % 40 < nextTab && position % 40 !== 0) {
                        output += ' ';
                        position++;
                    }
                    continue;
                }
                
                // Evaluate the expression
                const value = this.evaluateExpression(part);
                console.log(`Evaluated "${part}" to "${value}"`);
                
                // Add the value to output
                output += value;
                position += value.length;
                
                // Check if next part is not a comma (add space between items)
                if (i < parts.length - 1 && parts[i + 1] !== ',') {
                    // Don't add space after strings or if next is semicolon
                    if (!part.startsWith('"') && i + 1 < parts.length) {
                        output += ' ';
                        position++;
                    }
                }
            }
            
            this.printToScreen(output);
            
            // Handle newline (unless expression ends with semicolon)
            if (!expr.trim().endsWith(';')) {
                this.vic.cursorX = 0;
                this.vic.cursorY++;
                if (this.vic.cursorY >= 25) {
                    this.scrollScreen();
                    this.vic.cursorY = 24;
                }
            }
        }


        // Updated handleInputMode to support multiple variables
        handleInputMode(input) {
            if (!this.inputMode || !this.inputMode.active) return false;
            
            // Handle character input
            for (const char of input) {
                if (char === '\n' || char === '\r') {
                    // Process current input
                    const varName = this.inputMode.variables[this.inputMode.currentVarIndex];
                    const value = this.inputMode.buffer.trim();
                    
                    // Store the value
                    if (varName.endsWith('$')) {
                        // String variable
                        this.basicStrings.set(varName, value);
                    } else {
                        // Numeric variable
                        const numValue = parseFloat(value) || 0;
                        this.basicVariables.set(varName, numValue);
                    }
                    
                    console.log(`INPUT: ${varName} = "${value}"`);
                    
                    // Move to next variable or finish
                    this.inputMode.currentVarIndex++;
                    
                    if (this.inputMode.currentVarIndex < this.inputMode.variables.length) {
                        // More variables to input
                        this.inputMode.buffer = '';
                        
                        // Move to next line and print "?? " for next input
                        this.vic.cursorX = 0;
                        this.vic.cursorY++;
                        if (this.vic.cursorY >= 25) {
                            this.scrollScreen();
                            this.vic.cursorY = 24;
                        }
                        
                        // Print ?? prompt
                        this.printPrompt("?? ");
                        this.inputMode.startX = this.vic.cursorX;
                        this.inputMode.startY = this.vic.cursorY;
                    } else {
                        // All inputs complete
                        this.inputMode = null;
                        this.showInputCursor = false;
                        
                        // Move to next line
                        this.vic.cursorX = 0;
                        this.vic.cursorY++;
                        if (this.vic.cursorY >= 25) {
                            this.scrollScreen();
                            this.vic.cursorY = 24;
                        }
                        
                        // Continue program execution
                        if (this.executionContext) {
                            this.continueExecution();
                        }
                    }
                } else if (char === '\b' || char.charCodeAt(0) === 8) {
                    // Backspace
                    if (this.inputMode.buffer.length > 0) {
                        this.inputMode.buffer = this.inputMode.buffer.slice(0, -1);
                        
                        // Move cursor back and clear character
                        if (this.vic.cursorX > this.inputMode.startX) {
                            this.vic.cursorX--;
                        } else if (this.vic.cursorY > this.inputMode.startY) {
                            this.vic.cursorY--;
                            this.vic.cursorX = 39;
                        }
                        
                        const screenPos = this.vic.cursorY * 40 + this.vic.cursorX;
                        this.memory.write(0x0400 + screenPos, 0x20); // Space
                    }
                } else if (char.charCodeAt(0) >= 32 && char.charCodeAt(0) < 127) {
                    // Regular character
                    this.inputMode.buffer += char;
                    
                    // Display character
                    const screenPos = this.vic.cursorY * 40 + this.vic.cursorX;
                    const screenCode = this.asciiToScreenCode(char.charCodeAt(0));
                    this.memory.write(0x0400 + screenPos, screenCode);
                    
                    this.vic.cursorX++;
                    if (this.vic.cursorX >= 40) {
                        this.vic.cursorX = 0;
                        this.vic.cursorY++;
                        if (this.vic.cursorY >= 25) {
                            this.scrollScreen();
                            this.vic.cursorY = 24;
                        }
                    }
                }
            }
            
            this.vic.renderFrame();
            return true;
        }

        // Helper to print prompt without newline
        printPrompt(prompt) {
            for (const char of prompt) {
                const screenPos = this.vic.cursorY * 40 + this.vic.cursorX;
                const screenCode = this.asciiToScreenCode(char.charCodeAt(0));
                
                this.memory.write(0x0400 + screenPos, screenCode);
                this.memory.write(0xD800 + screenPos, 14);
                
                this.vic.cursorX++;
                if (this.vic.cursorX >= 40) {
                    this.vic.cursorX = 0;
                    this.vic.cursorY++;
                }
            }
        }

    // 2. GOSUB/RETURN - Subroutines
    executeGOSUB(statement) {
        const match = statement.match(/^GOSUB\s+(\d+)$/i);
        if (!match) {
            this.printToScreen('?SYNTAX ERROR');
            return null;
        }
        
        const targetLine = parseInt(match[1]);
        
        // Push return address onto call stack
        if (!this.basicCallStack) this.basicCallStack = [];
        
        this.basicCallStack.push({
            returnLine: this.currentExecutionLine,
            returnIndex: this.currentExecutionIndex
        });
        
        console.log(`GOSUB to ${targetLine}, stack depth: ${this.basicCallStack.length}`);
        
        // Jump to target line
        return { type: 'GOTO', target: targetLine };
    }

    executeRETURN(statement) {
        if (!this.basicCallStack || this.basicCallStack.length === 0) {
            this.printToScreen('?RETURN WITHOUT GOSUB ERROR');
            return 'END';
        }
        
        // Pop return address from stack
        const returnInfo = this.basicCallStack.pop();
        
        console.log(`RETURN to line after ${returnInfo.returnLine}`);
        
        // Return to line after GOSUB
        return { type: 'GOTO_INDEX', index: returnInfo.returnIndex + 1 };
    }

    // // 3. DIM - Array declaration
    // executeDIM(statement) {
    //     // Parse DIM A(10), B$(5,5), etc.
    //     const arrays = statement.substring(4).split(',');
        
    //     for (let arrayDef of arrays) {
    //         arrayDef = arrayDef.trim();
            
    //         // Match array name and dimensions
    //         const match = arrayDef.match(/^([A-Z]\$?)\s*\(\s*(.+)\s*\)$/i);
    //         if (!match) {
    //             this.printToScreen('?SYNTAX ERROR');
    //             return;
    //         }
            
    //         const arrayName = match[1].toUpperCase();
    //         const dimensions = match[2].split(',').map(d => {
    //             const size = this.evaluateNumericExpression(d.trim());
    //             return Math.floor(size) + 1; // BASIC arrays are 0-indexed but DIM specifies max index
    //         });
            
    //         // Initialize array storage
    //         if (!this.basicArrays) this.basicArrays = new Map();
            
    //         this.basicArrays.set(arrayName, {
    //             dimensions: dimensions,
    //             data: this.createMultiDimArray(dimensions, arrayName.endsWith('$') ? '' : 0)
    //         });
            
    //         console.log(`DIM ${arrayName}(${dimensions.join(',')})`);
    //     }
    // }

    // // Helper to create multi-dimensional array
    // createMultiDimArray(dimensions, defaultValue) {
    //     if (dimensions.length === 1) {
    //         return new Array(dimensions[0]).fill(defaultValue);
    //     }
        
    //     const array = new Array(dimensions[0]);
    //     for (let i = 0; i < dimensions[0]; i++) {
    //         array[i] = this.createMultiDimArray(dimensions.slice(1), defaultValue);
    //     }
    //     return array;
    // }

    // Fixed executeDIM to handle multiple arrays properly
    // executeDIM(statement) {
    //     console.log('executeDIM:', statement);
        
    //     // Remove 'DIM ' prefix
    //     const dimContent = statement.substring(4).trim();
        
    //     // Split by comma, but be careful with nested parentheses
    //     const arrays = [];
    //     let current = '';
    //     let parenCount = 0;
        
    //     for (let i = 0; i < dimContent.length; i++) {
    //         const char = dimContent[i];
    //         if (char === '(') parenCount++;
    //         if (char === ')') parenCount--;
            
    //         if (char === ',' && parenCount === 0) {
    //             arrays.push(current.trim());
    //             current = '';
    //         } else {
    //             current += char;
    //         }
    //     }
    //     if (current.trim()) {
    //         arrays.push(current.trim());
    //     }
        
    //     console.log('DIM arrays:', arrays);
        
    //     // Process each array declaration
    //     for (let arrayDef of arrays) {
    //         // Match array name and dimensions: A(5) or B$(3,3)
    //         const match = arrayDef.match(/^([A-Za-z][A-Za-z0-9]*\$?)\s*\(\s*(.+)\s*\)$/);
    //         if (!match) {
    //             this.printToScreen('?SYNTAX ERROR');
    //             return;
    //         }
            
    //         const arrayName = match[1].toUpperCase();
    //         const dimensionStr = match[2];
            
    //         // Parse dimensions
    //         const dimensions = dimensionStr.split(',').map(d => {
    //             const size = this.evaluateNumericExpression(d.trim());
    //             return Math.floor(size) + 1; // BASIC arrays are 0-indexed but DIM specifies max index
    //         });
            
    //         console.log(`Creating array ${arrayName} with dimensions [${dimensions.join(',')}]`);
            
    //         // Initialize array storage
    //         if (!this.basicArrays) this.basicArrays = new Map();
            
    //         this.basicArrays.set(arrayName, {
    //             dimensions: dimensions,
    //             data: this.createMultiDimArray(dimensions, arrayName.endsWith('$') ? '' : 0)
    //         });
    //     }
    // }
    // Updated executeDIM with better debugging
    executeDIM(statement) {
        console.log('executeDIM called with:', statement);
        
        // Remove 'DIM ' prefix (case insensitive)
        const dimContent = statement.substring(4).trim();
        console.log('DIM content:', dimContent);
        
        // Split by comma, but be careful with nested parentheses
        const arrays = [];
        let current = '';
        let parenCount = 0;
        
        for (let i = 0; i < dimContent.length; i++) {
            const char = dimContent[i];
            if (char === '(') parenCount++;
            if (char === ')') parenCount--;
            
            if (char === ',' && parenCount === 0) {
                arrays.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        if (current.trim()) {
            arrays.push(current.trim());
        }
        
        console.log('Arrays to dimension:', arrays);
        
        // Process each array declaration
        for (let arrayDef of arrays) {
            console.log('Processing array definition:', arrayDef);
            
            // Updated regex to better handle $ in array names
            const match = arrayDef.match(/^([A-Z][A-Z0-9]*\$?)\s*\(\s*([^)]+)\s*\)$/i);
            
            if (!match) {
                console.log('No match for array definition:', arrayDef);
                this.printToScreen('?SYNTAX ERROR');
                return;
            }
            
            console.log('Match result:', match);
            
            const arrayName = match[1].toUpperCase();
            const dimensionStr = match[2];
            
            console.log('Array name:', arrayName);
            console.log('Dimension string:', dimensionStr);
            
            // Parse dimensions
            const dimensions = dimensionStr.split(',').map(d => {
                const trimmed = d.trim();
                const size = this.evaluateNumericExpression(trimmed);
                console.log(`Dimension "${trimmed}" evaluates to ${size}`);
                return Math.floor(size) + 1; // BASIC arrays are 0-indexed but DIM specifies max index
            });
            
            console.log(`Creating array ${arrayName} with dimensions [${dimensions.join(',')}]`);
            
            // Initialize array storage
            if (!this.basicArrays) this.basicArrays = new Map();
            
            this.basicArrays.set(arrayName, {
                dimensions: dimensions,
                data: this.createMultiDimArray(dimensions, arrayName.endsWith('$') ? '' : 0)
            });
            
            console.log('Array created successfully');
            console.log('basicArrays now contains:', Array.from(this.basicArrays.keys()));
        }
    }


    // Make sure createMultiDimArray exists and works correctly
    createMultiDimArray(dimensions, defaultValue) {
        if (dimensions.length === 1) {
            return new Array(dimensions[0]).fill(defaultValue);
        }
        
        const array = new Array(dimensions[0]);
        for (let i = 0; i < dimensions[0]; i++) {
            array[i] = this.createMultiDimArray(dimensions.slice(1), defaultValue);
        }
        return array;
    }

    // 4. Array access in expressions
    evaluateArrayAccess(expr) {
        // Match A(5) or B$(2,3)
        const match = expr.match(/^([A-Z]\$?)\s*\(\s*(.+)\s*\)$/i);
        if (!match) return null;
        
        const arrayName = match[1].toUpperCase();
        const indices = match[2].split(',').map(idx => 
            Math.floor(this.evaluateNumericExpression(idx.trim()))
        );
        
        if (!this.basicArrays || !this.basicArrays.has(arrayName)) {
            // Auto-dimension array if not exists (C64 BASIC behavior)
            const dimensions = indices.map(() => 11); // Default size 11 (0-10)
            this.basicArrays = this.basicArrays || new Map();
            this.basicArrays.set(arrayName, {
                dimensions: dimensions,
                data: this.createMultiDimArray(dimensions, arrayName.endsWith('$') ? '' : 0)
            });
        }
        
        const array = this.basicArrays.get(arrayName);
        
        // Access array element
        let element = array.data;
        for (const idx of indices) {
            if (idx < 0 || idx >= element.length) {
                this.printToScreen('?SUBSCRIPT OUT OF RANGE ERROR');
                return arrayName.endsWith('$') ? '' : 0;
            }
            element = element[idx];
        }
        
        return element;
    }

    // 5. Update executeLine to handle new commands
    executeLine(lineNum, lineContent, sortedLines, currentIndex) {
        const upperLine = lineContent.toUpperCase();
        
        // Store current execution position for GOSUB/RETURN
        this.currentExecutionLine = lineNum;
        this.currentExecutionIndex = currentIndex;
        
        // Handle REM (remarks/comments)
        if (upperLine.startsWith('REM ') || upperLine.includes(': REM ')) {
            return null;
        }
        if (upperLine.startsWith('DIM ')) {
            this.executeDIM(lineContent);
            return null;
        }
        
        // Handle multiple statements separated by colon
        if (lineContent.includes(':') && !this.isInQuotes(lineContent, lineContent.indexOf(':'))) {
            const statements = this.splitStatements(lineContent);
            let result = null;
            for (const stmt of statements) {
                result = this.executeLine(lineNum, stmt.trim(), sortedLines, currentIndex);
                if (result === 'END' || (result && (result.type === 'GOTO' || result.type === 'GOTO_INDEX'))) {
                    return result;
                }
            }
            return result;
        }
        
        // Handle INPUT
        if (upperLine.startsWith('INPUT ')) {
            this.executeINPUT(lineContent.substring(6).trim());
            return 'PAUSE'; // Special return to pause execution
        }
        
        // Handle GOSUB
        if (upperLine.startsWith('GOSUB ')) {
            return this.executeGOSUB(lineContent);
        }
        
        // Handle RETURN
        if (upperLine === 'RETURN') {
            return this.executeRETURN(lineContent);
        }
        
        // Handle DIM
        if (upperLine.startsWith('DIM ')) {
            this.executeDIM(lineContent);
            return null;
        }
        
        // Handle PRINT
        if (upperLine.startsWith('PRINT ')) {
            this.executePRINT(lineContent.substring(6).trim());
            return null;
        }
        
        // Handle IF...THEN
        if (upperLine.startsWith('IF ')) {
            return this.executeIF(lineContent);
        }
        
        // Handle FOR...TO...STEP
        if (upperLine.startsWith('FOR ')) {
            this.executeFOR(lineNum, lineContent, currentIndex);
            return null;
        }
        
        // Handle NEXT
        if (upperLine.startsWith('NEXT')) {
            return this.executeNEXT(lineNum, lineContent, sortedLines);
        }
        
        // Handle GOTO
        if (upperLine.startsWith('GOTO ')) {
            const targetLine = parseInt(lineContent.substring(5).trim());
            return { type: 'GOTO', target: targetLine };
        }
        
        // Handle END
        if (upperLine === 'END') {
            return 'END';
        }
        
        // Handle variable assignment (including arrays)
        if (lineContent.includes('=') && !upperLine.startsWith('IF ')) {
            this.executeAssignment(lineContent);
            return null;
        }
        
        return null;
    }

    // Test programs for new features:
    /*
    Test INPUT:
    10 INPUT "What is your name"; N$
    20 PRINT "Hello, "; N$
    30 INPUT "Enter a number"; X
    40 PRINT "You entered"; X

    Test GOSUB/RETURN:
    10 PRINT "Main program start"
    20 GOSUB 100
    30 PRINT "Back in main"
    40 END
    100 PRINT "In subroutine"
    110 RETURN

    Test Arrays:
    10 DIM A(5), B$(3,3)
    20 FOR I = 0 TO 5
    30 A(I) = I * 10
    40 NEXT I
    50 B$(1,1) = "HELLO"
    60 PRINT A(3); " "; B$(1,1)
    */

}

// Export for use in browser or Node.js
if (typeof window !== 'undefined') {
    window.C64Emulator = C64Emulator;
}