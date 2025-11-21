const { spawn } = require('child_process');
const fs = require('fs');
const readline = require('readline');
const path = require('path');

// ANSI colors
const COLORS = {
  CYAN: '\x1b[36m',
  DIM: '\x1b[2m',
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m'
};

const isCI = process.env.GITHUB_ACTIONS === 'true';

// Helper functions for CI logging
function printGroupStart(title) {
  if (isCI) {
    process.stdout.write(`::group::${title}\n`);
  } else {
    process.stdout.write(`\n${COLORS.DIM}--- ${title} ---${COLORS.RESET}\n`);
  }
}

function printGroupEnd() {
  if (isCI) {
    process.stdout.write(`::endgroup::\n`);
  } else {
    process.stdout.write(`${COLORS.DIM}-----------------------${COLORS.RESET}\n`);
  }
}

// --- 1. Environment & Arguments Preparation ---

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const prompt = process.env.INPUT_PROMPT || '';
const flagsInput = process.env.INPUT_FLAGS || '';
const githubOutput = process.env.GITHUB_OUTPUT;

// Generate unique file paths
const timestamp = Math.floor(Date.now() / 1000);
const outputFile = `/tmp/qoder-output-${timestamp}.log`;
const errorFile = `/tmp/qoder-error-${timestamp}.log`;

const outputStream = fs.createWriteStream(outputFile, { flags: 'a' });
const errorStream = fs.createWriteStream(errorFile, { flags: 'a' });

// Parse flags using regex logic (migrated from shell script)
const args = ['-w', workspace];

// Add prompt if exists
if (prompt) {
  args.push('-p', prompt);
}

// Parse additional flags
if (flagsInput) {
  const lines = flagsInput.split('\n');
  // Match non-whitespace OR double-quoted content OR single-quoted content
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    
    let match;
    while ((match = regex.exec(line)) !== null) {
      if (match[1] !== undefined) {
        args.push(match[1]);
      } else if (match[2] !== undefined) {
        args.push(match[2]);
      } else {
        args.push(match[0]);
      }
    }
  }
}

// Ensure output format is stream-json
if (!args.includes('-f') && !args.includes('--output-format')) {
  args.push('-f', 'stream-json');
}

// Print Arguments Group
printGroupStart('qodercli arguments');
args.forEach((arg, index) => {
  if (arg === '-p' || arg === '--prompt') {
    console.log(`  ${arg}`);
    console.log(`  (content hidden)`);
    // Note: In the loop below we can't skip next easily without manual index handling,
    // but for display purposes, this is tricky if we just iterate.
    // Let's iterate manually for logging to hide prompt value.
  } 
});
// Re-logging with proper loop for hiding prompt values
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '-p' || arg === '--prompt') {
    console.log(`  ${arg}`);
    console.log(`  (content hidden)`);
    i++; // Skip next arg (the prompt content)
  } else {
    console.log(`  ${arg}`);
  }
}
printGroupEnd();


// --- 2. Execution & Stream Processing ---

const child = spawn('qodercli', args, {
  stdio: ['inherit', 'pipe', 'pipe'], // Capture stdout and stderr
  shell: false,
  env: process.env // Pass through environment variables
});

// Handle stdout (Main output stream)
const rlOut = readline.createInterface({
  input: child.stdout,
  terminal: false
});

let lastThinking = '';
const processedToolIds = new Set();
let sessionIdPrinted = false;

rlOut.on('line', (line) => {
  // Write raw line to output file
  outputStream.write(line + '\n');

  if (!line.trim()) return;

  try {
    const data = JSON.parse(line);
    
    // Session ID (Only print the first one)
    if (data.type === 'system' && data.subtype === 'init' && data.session_id && !sessionIdPrinted) {
      process.stdout.write(`${COLORS.BOLD}Session ID:${COLORS.RESET} ${data.session_id}\n\n`);
      sessionIdPrinted = true;
    }
    
    // Stream Content
    if (data.type === 'assistant' && data.subtype === 'stream') {
      if (data.message && Array.isArray(data.message.content)) {
        data.message.content.forEach(part => {
          // Text
          if (part.type === 'text' && part.text) {
            process.stdout.write(part.text);
          }
          // Thinking
          else if (part.thinking) {
            if (part.thinking === lastThinking) return;
            lastThinking = part.thinking;
            const summary = part.thinking.substring(0, 60).replace(/\r?\n/g, ' ') + (part.thinking.length > 60 ? '...' : '');
            printGroupStart(`${COLORS.CYAN}[Thinking]${COLORS.RESET} ${summary}`);
            process.stdout.write(part.thinking + '\n');
            printGroupEnd();
          }
          // Tool Calls
          else if (part.type === 'function' && part.id && part.name) {
            if (processedToolIds.has(part.id)) return;
            processedToolIds.add(part.id);

            let inputStr = part.input;
            try {
                const inputObj = JSON.parse(part.input);
                inputStr = JSON.stringify(inputObj, null, 2);
            } catch (e) {}

            const argsSummary = inputStr.replace(/\s+/g, ' ').substring(0, 50) + (inputStr.length > 50 ? '...' : '');
            printGroupStart(`${COLORS.CYAN}[Tool Call]${COLORS.RESET} ${part.name} ${argsSummary}`);
            process.stdout.write(inputStr + '\n');
            printGroupEnd();
          }
        });
      }
    }

  } catch (e) {
    console.log(line);
  }
});

// Handle stderr (Error logging)
child.stderr.on('data', (chunk) => {
  errorStream.write(chunk);
  process.stderr.write(chunk); // Also print to console stderr
});

// --- 3. Cleanup & Output ---

child.on('close', (code) => {
  outputStream.end();
  errorStream.end(() => {
    // After streams close, write to GITHUB_OUTPUT
    if (githubOutput) {
        try {
            fs.appendFileSync(githubOutput, `output_file=${outputFile}\n`);
            
            // Check if error file has content
            const errorStats = fs.statSync(errorFile);
            if (errorStats.size > 0) {
                const errorContent = fs.readFileSync(errorFile, 'utf8');
                fs.appendFileSync(githubOutput, `error<<QODER_ERROR_EOF\n${errorContent}\nQODER_ERROR_EOF\n`);
            } else {
                fs.appendFileSync(githubOutput, `error=\n`);
            }
        } catch (err) {
            console.error('Failed to write to GITHUB_OUTPUT:', err);
        }
    }
    
    if (code !== 0) {
        console.log(`::error::qodercli failed with exit code ${code}`);
    } else {
        console.log('✓ qodercli executed successfully');
    }

    process.exit(code);
  });
});

child.on('error', (err) => {
  console.error(`Failed to start qodercli: ${err}`);
  process.exit(1);
});
