const { spawn } = require('child_process');
const fs = require('fs');
const readline = require('readline');

// Usage: node stream-filter.js <output_file> <command> [args...]
const outputFile = process.argv[2];
const command = process.argv[3];
const args = process.argv.slice(4);

if (!outputFile || !command) {
  console.error('Usage: node stream-filter.js <output_file> <command> [args...]');
  process.exit(1);
}

const outputStream = fs.createWriteStream(outputFile, { flags: 'a' });

// Spawn the child process
const child = spawn(command, args, {
  stdio: ['inherit', 'pipe', 'inherit'], // stdin: inherit, stdout: pipe, stderr: inherit
  shell: false
});

// Handle stdout line by line
const rl = readline.createInterface({
  input: child.stdout,
  terminal: false
});

rl.on('line', (line) => {
  // 1. Always write raw line to output file for machine consumption
  outputStream.write(line + '\n');

  if (!line.trim()) return;

  try {
    const data = JSON.parse(line);
    
    // 2. Capture and print Session ID from the init message
    if (data.type === 'system' && data.subtype === 'init' && data.session_id) {
      process.stdout.write(`Session ID: ${data.session_id}\n\n`);
    }
    
    // 3. Filter for human-readable logs: Only print Assistant's text content
    if (data.type === 'assistant' && data.subtype === 'stream') {
      if (data.message && Array.isArray(data.message.content)) {
        data.message.content.forEach(part => {
          if (part.type === 'text' && part.text) {
            process.stdout.write(part.text);
          }
        });
        process.stdout.write('\n');
      }
    }

  } catch (e) {
    // If it's not JSON, print it as is
    console.log(line);
  }
});

child.on('close', (code) => {
  outputStream.end();
  process.exit(code);
});

child.on('error', (err) => {
  console.error(`Failed to start subprocess: ${err}`);
  process.exit(1);
});
