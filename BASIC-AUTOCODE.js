// Function to send keyboard events for each character
function sendKey(key, keyCode) {
    ['keydown', 'keypress', 'keyup'].forEach(eventType => {
        document.dispatchEvent(new KeyboardEvent(eventType, {
            key: key,
            keyCode: keyCode || key.charCodeAt(0),
            which: keyCode || key.charCodeAt(0),
            charCode: key.charCodeAt(0),
            bubbles: true,
            cancelable: true
        }));
    });
}

// Function to type a complete line
function typeLine(text) {
    for(let char of text) {
        sendKey(char);
    }
    sendKey('Enter', 13);
}

// Your BASIC program
const basicProgram = [
    "10 DIM A(10)",
    "20 FOR I = 0 TO 5",
    "30 A(I) = I * I",
    "40 NEXT I",
    "50 J = 3",
    '60 PRINT "A("; J; ") = "; A(J)'
];

// Type each line with a delay to ensure proper processing
basicProgram.forEach((line, index) => {
    setTimeout(() => {
        console.log(`Typing line: ${line}`);
        typeLine(line);
    }, index * 300); // 300ms delay between lines
});

// After all lines are entered, you can run the program
setTimeout(() => {
    console.log("Program entered. Type 'RUN' to execute.");
}, basicProgram.length * 300 + 500);