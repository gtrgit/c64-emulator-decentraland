// SID.js - Sound Interface Device (Minimal Stub)
// This is just enough to get the emulator running

export class SID {
    constructor(memory) {
        this.memory = memory;
        this.registers = new Uint8Array(32);
        
        // Audio context (not implemented yet)
        this.audioContext = null;
        
        // Voice states (3 voices)
        this.voices = [
            { frequency: 0, pulse: 0, waveform: 0, adsr: 0, gate: false },
            { frequency: 0, pulse: 0, waveform: 0, adsr: 0, gate: false },
            { frequency: 0, pulse: 0, waveform: 0, adsr: 0, gate: false }
        ];
        
        // Filter
        this.filterFreq = 0;
        this.filterResonance = 0;
        this.filterMode = 0;
        
        // Master volume
        this.volume = 0;
    }
    
    reset() {
        this.registers.fill(0);
        this.voices.forEach(v => {
            v.frequency = 0;
            v.pulse = 0;
            v.waveform = 0;
            v.gate = false;
        });
        this.volume = 0;
    }
    
    read(address) {
        const reg = address & 0x1F;
        
        // Readable registers
        if (reg === 0x1B) { // Voice 3 oscillator output
            return Math.floor(Math.random() * 256); // Random for now
        }
        if (reg === 0x1C) { // Voice 3 envelope output
            return Math.floor(Math.random() * 256);
        }
        
        // Potentiometer readings (paddle/mouse)
        if (reg === 0x19) return 0xFF; // POT X
        if (reg === 0x1A) return 0xFF; // POT Y
        
        return this.registers[reg];
    }
    
    write(address, value) {
        const reg = address & 0x1F;
        this.registers[reg] = value;
        
        // Voice 1 (registers 0x00-0x06)
        if (reg <= 0x06) {
            const voice = 0;
            if (reg === 0x00) this.voices[voice].frequency = (this.voices[voice].frequency & 0xFF00) | value;
            if (reg === 0x01) this.voices[voice].frequency = (this.voices[voice].frequency & 0x00FF) | (value << 8);
            if (reg === 0x04) {
                this.voices[voice].waveform = (value >> 4) & 0x0F;
                this.voices[voice].gate = !!(value & 0x01);
            }
        }
        
        // Voice 2 (registers 0x07-0x0D)
        if (reg >= 0x07 && reg <= 0x0D) {
            const voice = 1;
            if (reg === 0x07) this.voices[voice].frequency = (this.voices[voice].frequency & 0xFF00) | value;
            if (reg === 0x08) this.voices[voice].frequency = (this.voices[voice].frequency & 0x00FF) | (value << 8);
            if (reg === 0x0B) {
                this.voices[voice].waveform = (value >> 4) & 0x0F;
                this.voices[voice].gate = !!(value & 0x01);
            }
        }
        
        // Voice 3 (registers 0x0E-0x14)
        if (reg >= 0x0E && reg <= 0x14) {
            const voice = 2;
            if (reg === 0x0E) this.voices[voice].frequency = (this.voices[voice].frequency & 0xFF00) | value;
            if (reg === 0x0F) this.voices[voice].frequency = (this.voices[voice].frequency & 0x00FF) | (value << 8);
            if (reg === 0x12) {
                this.voices[voice].waveform = (value >> 4) & 0x0F;
                this.voices[voice].gate = !!(value & 0x01);
            }
        }
        
        // Filter and volume
        if (reg === 0x18) {
            this.filterMode = (value >> 4) & 0x0F;
            this.volume = value & 0x0F;
        }
    }
    
    cycle(cycles) {
        // Audio generation would go here
        // For now, this is just a stub
    }
    
    // Helper to check if any sound is playing
    isPlaying() {
        return this.voices.some(v => v.gate);
    }
}