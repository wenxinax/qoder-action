const fs = require('fs');
const readline = require('readline');

// The first argument is the path to the output file where RAW JSON should be saved
const outputFile = process.argv[2];

if (!outputFile) {
  console.error('Error: Output file path required');
  process.exit(1);
}

const outputStream = fs.createWriteStream(outputFile, { flags: 'a' });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  // 1. Always write raw line to output file for machine consumption
  outputStream.write(line + '\n');

  if (!line.trim()) return;

  try {
    const data = JSON.parse(line);
    
    // 2. Filter for human-readable logs: Only print Assistant's text content
    if (data.type === 'assistant' && data.subtype === 'stream') {
      if (data.message && Array.isArray(data.message.content)) {
        data.message.content.forEach(part => {
          if (part.type === 'text' && part.text) {
            // Print directly to stdout without newlines to maintain flow, 
            // or with newlines if line-buffered.
            // Since input is line-based JSON, we print text + newline.
            process.stdout.write(part.text);
          }
        });
        // Add a newline at the end of each JSON chunk to keep logs readable
        process.stdout.write('\n');
      }
    }
    
    // Intentionally ignoring other types (tool calls, system messages, etc.)
    // to keep the logs clean as requested.

  } catch (e) {
    // If it's not JSON (e.g. an error message or debug output), print it as is
    console.log(line);
  }
});

rl.on('close', () => {
  outputStream.end();
});

