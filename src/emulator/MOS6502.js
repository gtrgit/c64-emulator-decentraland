// MOS6502.js - Minimal 6502 CPU Implementation
// Just enough to get BASIC prompt working

export class MOS6502 {
    constructor(memory) {
        this.memory = memory;
        
        // Registers
        this.A = 0;      // Accumulator
        this.X = 0;      // X register
        this.Y = 0;      // Y register
        this.SP = 0xFD;  // Stack pointer
        this.PC = 0;     // Program counter
        
        // Status flags
        this.N = false;  // Negative
        this.V = false;  // Overflow
        this.B = false;  // Break
        this.D = false;  // Decimal
        this.I = false;  // Interrupt disable
        this.Z = false;  // Zero
        this.C = false;  // Carry
        
        // Cycle counter
        this.cycles = 0;
        
        // Build instruction table
        this.buildInstructionTable();
    }
    
    reset() {
        // Read reset vector from $FFFC-$FFFD
        this.PC = this.memory.read16(0xFFFC);
        this.SP = 0xFD;
        this.A = 0;
        this.X = 0;
        this.Y = 0;
        this.I = true;
        console.log(`CPU Reset - PC set to $${this.PC.toString(16).padStart(4, '0')}`);
    }
    
    step() {
        const opcode = this.memory.read(this.PC);
        const instruction = this.instructions[opcode];
        
        if (!instruction) {
            console.warn(`Unknown opcode $${opcode.toString(16).padStart(2, '0')} at $${this.PC.toString(16).padStart(4, '0')}`);
            this.PC = (this.PC + 1) & 0xFFFF;
            return 2;
        }
        
        this.PC = (this.PC + 1) & 0xFFFF;
        const cycles = instruction.call(this);
        this.cycles += cycles;
        return cycles;
    }
    
    // Status register helpers
    getP() {
        let p = 0x20; // Unused bit always set
        if (this.N) p |= 0x80;
        if (this.V) p |= 0x40;
        if (this.B) p |= 0x10;
        if (this.D) p |= 0x08;
        if (this.I) p |= 0x04;
        if (this.Z) p |= 0x02;
        if (this.C) p |= 0x01;
        return p;
    }
    
    setP(value) {
        this.N = (value & 0x80) !== 0;
        this.V = (value & 0x40) !== 0;
        this.B = (value & 0x10) !== 0;
        this.D = (value & 0x08) !== 0;
        this.I = (value & 0x04) !== 0;
        this.Z = (value & 0x02) !== 0;
        this.C = (value & 0x01) !== 0;
    }
    
    // Flag setting helpers
    setNZ(value) {
        this.N = (value & 0x80) !== 0;
        this.Z = value === 0;
    }
    
    // Stack operations
    push(value) {
        this.memory.write(0x0100 + this.SP, value);
        this.SP = (this.SP - 1) & 0xFF;
    }
    
    pull() {
        this.SP = (this.SP + 1) & 0xFF;
        return this.memory.read(0x0100 + this.SP);
    }
    
    push16(value) {
        this.push((value >> 8) & 0xFF);
        this.push(value & 0xFF);
    }
    
    pull16() {
        const lo = this.pull();
        const hi = this.pull();
        return (hi << 8) | lo;
    }
    
    // Addressing modes
    immediate() {
        const addr = this.PC;
        this.PC = (this.PC + 1) & 0xFFFF;
        return addr;
    }
    
    zeroPage() {
        const addr = this.memory.read(this.PC);
        this.PC = (this.PC + 1) & 0xFFFF;
        return addr;
    }
    
    zeroPageX() {
        const addr = (this.memory.read(this.PC) + this.X) & 0xFF;
        this.PC = (this.PC + 1) & 0xFFFF;
        return addr;
    }
    
    zeroPageY() {
        const addr = (this.memory.read(this.PC) + this.Y) & 0xFF;
        this.PC = (this.PC + 1) & 0xFFFF;
        return addr;
    }
    
    absolute() {
        const addr = this.memory.read16(this.PC);
        this.PC = (this.PC + 2) & 0xFFFF;
        return addr;
    }
    
    absoluteX() {
        const addr = (this.memory.read16(this.PC) + this.X) & 0xFFFF;
        this.PC = (this.PC + 2) & 0xFFFF;
        return addr;
    }
    
    absoluteY() {
        const addr = (this.memory.read16(this.PC) + this.Y) & 0xFFFF;
        this.PC = (this.PC + 2) & 0xFFFF;
        return addr;
    }
    
    indirect() {
        const ptr = this.memory.read16(this.PC);
        this.PC = (this.PC + 2) & 0xFFFF;
        // 6502 bug: page boundary wrap
        if ((ptr & 0xFF) === 0xFF) {
            const lo = this.memory.read(ptr);
            const hi = this.memory.read(ptr & 0xFF00);
            return (hi << 8) | lo;
        }
        return this.memory.read16(ptr);
    }
    
    indirectX() {
        const ptr = (this.memory.read(this.PC) + this.X) & 0xFF;
        this.PC = (this.PC + 1) & 0xFFFF;
        return this.memory.read16(ptr);
    }
    
    indirectY() {
        const ptr = this.memory.read(this.PC);
        this.PC = (this.PC + 1) & 0xFFFF;
        return (this.memory.read16(ptr) + this.Y) & 0xFFFF;
    }
    
    relative() {
        const offset = this.memory.read(this.PC);
        this.PC = (this.PC + 1) & 0xFFFF;
        // Sign extend
        return offset < 0x80 ? offset : offset - 256;
    }
    
    // Build instruction table
    buildInstructionTable() {
        this.instructions = new Array(256);
        
        // NOP
        this.instructions[0xEA] = function() { return 2; };
        
        // LDA - Load Accumulator
        this.instructions[0xA9] = function() { // Immediate
            this.A = this.memory.read(this.immediate());
            this.setNZ(this.A);
            return 2;
        };
        this.instructions[0xA5] = function() { // Zero Page
            this.A = this.memory.read(this.zeroPage());
            this.setNZ(this.A);
            return 3;
        };
        this.instructions[0xAD] = function() { // Absolute
            this.A = this.memory.read(this.absolute());
            this.setNZ(this.A);
            return 4;
        };
        
        // LDX - Load X
        this.instructions[0xA2] = function() { // Immediate
            this.X = this.memory.read(this.immediate());
            this.setNZ(this.X);
            return 2;
        };
        this.instructions[0xA6] = function() { // Zero Page
            this.X = this.memory.read(this.zeroPage());
            this.setNZ(this.X);
            return 3;
        };
        
        // LDY - Load Y
        this.instructions[0xA0] = function() { // Immediate
            this.Y = this.memory.read(this.immediate());
            this.setNZ(this.Y);
            return 2;
        };
        
        // STA - Store Accumulator
        this.instructions[0x85] = function() { // Zero Page
            this.memory.write(this.zeroPage(), this.A);
            return 3;
        };
        this.instructions[0x8D] = function() { // Absolute
            this.memory.write(this.absolute(), this.A);
            return 4;
        };
        this.instructions[0x95] = function() { // Zero Page,X
            this.memory.write(this.zeroPageX(), this.A);
            return 4;
        };
        this.instructions[0x9D] = function() { // Absolute,X
            this.memory.write(this.absoluteX(), this.A);
            return 5;
        };
        
        // STX - Store X
        this.instructions[0x86] = function() { // Zero Page
            this.memory.write(this.zeroPage(), this.X);
            return 3;
        };
        
        // STY - Store Y
        this.instructions[0x84] = function() { // Zero Page
            this.memory.write(this.zeroPage(), this.Y);
            return 3;
        };
        
        // Transfer instructions
        this.instructions[0xAA] = function() { // TAX
            this.X = this.A;
            this.setNZ(this.X);
            return 2;
        };
        this.instructions[0xA8] = function() { // TAY
            this.Y = this.A;
            this.setNZ(this.Y);
            return 2;
        };
        this.instructions[0x8A] = function() { // TXA
            this.A = this.X;
            this.setNZ(this.A);
            return 2;
        };
        this.instructions[0x98] = function() { // TYA
            this.A = this.Y;
            this.setNZ(this.A);
            return 2;
        };
        this.instructions[0x9A] = function() { // TXS
            this.SP = this.X;
            return 2;
        };
        this.instructions[0xBA] = function() { // TSX
            this.X = this.SP;
            this.setNZ(this.X);
            return 2;
        };
        
        // INC/DEC
        this.instructions[0xE8] = function() { // INX
            this.X = (this.X + 1) & 0xFF;
            this.setNZ(this.X);
            return 2;
        };
        this.instructions[0xC8] = function() { // INY
            this.Y = (this.Y + 1) & 0xFF;
            this.setNZ(this.Y);
            return 2;
        };
        this.instructions[0xCA] = function() { // DEX
            this.X = (this.X - 1) & 0xFF;
            this.setNZ(this.X);
            return 2;
        };
        this.instructions[0x88] = function() { // DEY
            this.Y = (this.Y - 1) & 0xFF;
            this.setNZ(this.Y);
            return 2;
        };
        
        // Branches
        this.instructions[0xD0] = function() { // BNE
            const offset = this.relative();
            if (!this.Z) {
                this.PC = (this.PC + offset) & 0xFFFF;
                return 3;
            }
            return 2;
        };
        this.instructions[0xF0] = function() { // BEQ
            const offset = this.relative();
            if (this.Z) {
                this.PC = (this.PC + offset) & 0xFFFF;
                return 3;
            }
            return 2;
        };
        this.instructions[0x10] = function() { // BPL
            const offset = this.relative();
            if (!this.N) {
                this.PC = (this.PC + offset) & 0xFFFF;
                return 3;
            }
            return 2;
        };
        this.instructions[0x30] = function() { // BMI
            const offset = this.relative();
            if (this.N) {
                this.PC = (this.PC + offset) & 0xFFFF;
                return 3;
            }
            return 2;
        };
        
        // Jumps
        this.instructions[0x4C] = function() { // JMP Absolute
            this.PC = this.absolute();
            return 3;
        };
        this.instructions[0x6C] = function() { // JMP Indirect
            this.PC = this.indirect();
            return 5;
        };
        this.instructions[0x20] = function() { // JSR
            const addr = this.absolute();
            this.push16(this.PC - 1);
            this.PC = addr;
            return 6;
        };
        this.instructions[0x60] = function() { // RTS
            this.PC = (this.pull16() + 1) & 0xFFFF;
            return 6;
        };
        
        // Stack
        this.instructions[0x48] = function() { // PHA
            this.push(this.A);
            return 3;
        };
        this.instructions[0x68] = function() { // PLA
            this.A = this.pull();
            this.setNZ(this.A);
            return 4;
        };
        
        // Flags
        this.instructions[0x78] = function() { // SEI
            this.I = true;
            return 2;
        };
        this.instructions[0x58] = function() { // CLI
            this.I = false;
            return 2;
        };
        this.instructions[0xD8] = function() { // CLD
            this.D = false;
            return 2;
        };
        this.instructions[0x38] = function() { // SEC
            this.C = true;
            return 2;
        };
        this.instructions[0x18] = function() { // CLC
            this.C = false;
            return 2;
        };
        
        // Compare
        this.instructions[0xC9] = function() { // CMP Immediate
            const value = this.memory.read(this.immediate());
            const result = this.A - value;
            this.C = this.A >= value;
            this.setNZ(result & 0xFF);
            return 2;
        };
        this.instructions[0xE0] = function() { // CPX Immediate
            const value = this.memory.read(this.immediate());
            const result = this.X - value;
            this.C = this.X >= value;
            this.setNZ(result & 0xFF);
            return 2;
        };
        
        // Interrupts
        this.instructions[0x40] = function() { // RTI
            this.setP(this.pull());
            this.PC = this.pull16();
            return 6;
        };
        
        // Fill remaining with illegal opcodes (treated as NOP)
        for (let i = 0; i < 256; i++) {
            if (!this.instructions[i]) {
                this.instructions[i] = function() {
                    console.log(`Illegal opcode $${i.toString(16).padStart(2, '0')} at $${this.PC.toString(16).padStart(4, '0')}`);
                    return 2;
                };
            }
        }
    }
    
    // Handle interrupts
    irq() {
        if (!this.I) {
            this.push16(this.PC);
            this.push(this.getP() | 0x20);
            this.I = true;
            this.PC = this.memory.read16(0xFFFE);
        }
    }
    
    nmi() {
        this.push16(this.PC);
        this.push(this.getP() | 0x20);
        this.I = true;
        this.PC = this.memory.read16(0xFFFA);
    }
    
    // Disassembler for debugging
    disassemble(address, lines = 10) {
        const result = [];
        let addr = address;
        
        for (let i = 0; i < lines; i++) {
            const opcode = this.memory.read(addr);
            result.push(`$${addr.toString(16).padStart(4, '0')}: ${opcode.toString(16).padStart(2, '0')} (${this.getOpcodeName(opcode)})`);
            addr++;
        }
        
        return result.join('\n');
    }
    
    getOpcodeName(opcode) {
        const names = {
            0xEA: 'NOP',
            0xA9: 'LDA #',
            0xA5: 'LDA zp',
            0xAD: 'LDA abs',
            0xA2: 'LDX #',
            0x78: 'SEI',
            0xD8: 'CLD',
            0x9A: 'TXS',
            0x4C: 'JMP abs',
            0x20: 'JSR',
            0x60: 'RTS',
            0x40: 'RTI'
        };
        return names[opcode] || '???';
    }
}