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

// ANSI colors for better log formatting
const COLORS = {
  CYAN: '\x1b[36m',
  DIM: '\x1b[2m',
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m'
};

rl.on('line', (line) => {
  // 1. Always write raw line to output file for machine consumption
  outputStream.write(line + '\n');

  if (!line.trim()) return;

  try {
    const data = JSON.parse(line);
    
    // 2. Capture and print Session ID from the init message
    if (data.type === 'system' && data.subtype === 'init' && data.session_id) {
      process.stdout.write(`${COLORS.BOLD}Session ID:${COLORS.RESET} ${data.session_id}\n\n`);
    }
    
    // 3. Filter for human-readable logs: Only print Assistant's text content
    if (data.type === 'assistant' && data.subtype === 'stream') {
      if (data.message && Array.isArray(data.message.content)) {
        data.message.content.forEach(part => {
          // Handle standard text content
          if (part.type === 'text' && part.text) {
            process.stdout.write(part.text);
          }
          // Handle thinking content
          else if (part.thinking) {
            // Create a summary for the group title, removing newlines
            const summary = part.thinking.substring(0, 60).replace(/\r?\n/g, ' ') + (part.thinking.length > 60 ? '...' : '');
            
            // Use GitHub Actions group for collapsible thinking blocks
            process.stdout.write(`::group::${COLORS.CYAN}[Thinking]${COLORS.RESET} ${summary}\n`);
            process.stdout.write(part.thinking + '\n');
            process.stdout.write(`::endgroup::\n`);
          }
        });
        // Add a newline at the end of each JSON chunk to keep logs readable
        // process.stdout.write('\n'); // Removed to avoid too many newlines with the formatted blocks
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
