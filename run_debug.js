const { spawn } = require('child_process');
const server = spawn('node', ['http-server.js'], {
    stdio: ['inherit', 'pipe', 'pipe']
});

server.stdout.on('data', (data) => {
    process.stdout.write(data);
});

server.stderr.on('data', (data) => {
    const msg = data.toString();
    if (msg.includes('PC at 0') || msg.includes('WARNING')) {
        console.error('\n⚠️ DEBUG:', msg);
    } else {
        process.stderr.write(data);
    }
});
