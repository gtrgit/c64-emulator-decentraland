#!/bin/bash

# Fix all readMemory and writeMemory calls in MOS6502.js
# The opcodes use wrong function names - should be memory.read and memory.write

echo "Backing up MOS6502.js..."
cp src/emulator/MOS6502.js src/emulator/MOS6502.js.backup-memory

echo "Fixing memory function calls..."

# Replace readMemory with memory.read
sed -i 's/self\.readMemory(/self.memory.read(/g' src/emulator/MOS6502.js

# Replace writeMemory with memory.write  
sed -i 's/self\.writeMemory(/self.memory.write(/g' src/emulator/MOS6502.js

# Count the replacements made
echo "Replacements made:"
echo "  memory.read:  $(grep -c 'self.memory.read(' src/emulator/MOS6502.js)"
echo "  memory.write: $(grep -c 'self.memory.write(' src/emulator/MOS6502.js)"

# Verify no readMemory/writeMemory calls remain
echo ""
echo "Checking for any remaining incorrect calls..."
grep -n "readMemory\|writeMemory" src/emulator/MOS6502.js | head -5 || echo "✓ All memory calls fixed!"

echo ""
echo "Fix complete! Now restart the server:"
echo "pkill -f 'node http-server.js' 2>/dev/null; node http-server.js"