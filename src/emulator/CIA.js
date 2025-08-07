// CIA.js - Complex Interface Adapter
// TODO: Implement CIA timers and I/O
export class CIA {
    constructor(chipNumber, memory) {
        this.chipNumber = chipNumber;
        this.memory = memory;
        this.registers = new Uint8Array(16);
    }
    
    reset() {
        this.registers.fill(0);
    }
    
    read(addr) {
        return this.registers[addr & 0x0F];
    }
    
    write(addr, value) {
        this.registers[addr & 0x0F] = value;
    }
    
    cycle(cycles) {
        // TODO: Update timers
    }
    
    setJoystick(state) {
        // TODO: Handle joystick input
    }
}
