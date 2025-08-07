// GamepadInput.js - Xbox controller support
export class GamepadInput {
    constructor(emulator) {
        this.emulator = emulator;
        this.gamepadIndex = null;
        
        window.addEventListener('gamepadconnected', (e) => {
            this.gamepadIndex = e.gamepad.index;
            console.log('Gamepad connected:', e.gamepad.id);
        });
    }
}
