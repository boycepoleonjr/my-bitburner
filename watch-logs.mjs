/**
 * Log File Watcher for IDE
 *
 * Watches all Bitburner log files and displays them in real-time
 * with color coding and filtering.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

// Log file paths
const LOG_DIR = path.join(__dirname, 'servers/home/logs');
const DAEMON_LOG = path.join(__dirname, 'servers/home/daemon-log.txt');

// Track file sizes to detect new content
const fileSizes = new Map();

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function formatLogEntry(entry, source) {
  const timestamp = new Date(entry.timestamp).toLocaleTimeString();
  const level = entry.level || 'INFO';
  const component = (entry.component || source).padEnd(15);
  const message = entry.message || '';

  let levelColor;
  switch (level) {
    case 'ERROR': levelColor = 'red'; break;
    case 'WARN': levelColor = 'yellow'; break;
    case 'INFO': levelColor = 'green'; break;
    case 'DEBUG': levelColor = 'gray'; break;
    default: levelColor = 'white';
  }

  const levelStr = colorize(level.padEnd(5), levelColor);
  const timeStr = colorize(timestamp, 'dim');
  const compStr = colorize(component, 'cyan');

  return `${timeStr} ${levelStr} [${compStr}] ${message}`;
}

function readLogFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) {
      return [];
    }

    return JSON.parse(content);
  } catch (error) {
    return [];
  }
}

function watchLogFile(filePath, source) {
  const checkForUpdates = () => {
    try {
      if (!fs.existsSync(filePath)) {
        return;
      }

      const stats = fs.statSync(filePath);
      const currentSize = stats.size;
      const lastSize = fileSizes.get(filePath) || 0;

      if (currentSize > lastSize) {
        const logs = readLogFile(filePath);
        const lastIndex = Math.max(0, logs.length - 10); // Show last 10 new entries

        for (let i = lastIndex; i < logs.length; i++) {
          console.log(formatLogEntry(logs[i], source));
        }

        fileSizes.set(filePath, currentSize);
      }
    } catch (error) {
      // File might be being written to, ignore
    }
  };

  // Initial read
  const logs = readLogFile(filePath);
  if (logs.length > 0) {
    const lastIndex = Math.max(0, logs.length - 5);
    for (let i = lastIndex; i < logs.length; i++) {
      console.log(formatLogEntry(logs[i], source));
    }
  }

  const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
  fileSizes.set(filePath, stats ? stats.size : 0);

  // Watch for changes
  fs.watchFile(filePath, { interval: 500 }, checkForUpdates);
}

function discoverLogFiles() {
  const logFiles = new Map();

  // Main daemon log
  if (fs.existsSync(DAEMON_LOG)) {
    logFiles.set(DAEMON_LOG, 'daemon');
  }

  // Component logs in /logs/ directory
  if (fs.existsSync(LOG_DIR)) {
    const files = fs.readdirSync(LOG_DIR);
    for (const file of files) {
      if (file.endsWith('.txt')) {
        const filePath = path.join(LOG_DIR, file);
        const component = file.replace('.txt', '');
        logFiles.set(filePath, component);
      }
    }
  }

  return logFiles;
}

function printHeader() {
  console.clear();
  console.log(colorize('═'.repeat(80), 'bright'));
  console.log(colorize('  BITBURNER LOG MONITOR', 'bright'));
  console.log(colorize('═'.repeat(80), 'bright'));
  console.log(colorize('  Watching: servers/home/daemon-log.txt and servers/home/logs/*.txt', 'dim'));
  console.log(colorize('  Press Ctrl+C to exit', 'dim'));
  console.log(colorize('═'.repeat(80), 'bright'));
  console.log('');
}

function printStatus() {
  const stateDir = path.join(__dirname, 'servers/home/state');

  // Check daemon state
  const daemonStatePath = path.join(stateDir, 'daemon-state.txt');
  if (fs.existsSync(daemonStatePath)) {
    try {
      const content = fs.readFileSync(daemonStatePath, 'utf8');
      const state = JSON.parse(content);

      if (state.isActive) {
        const uptime = Date.now() - (state.startTime || Date.now());
        const minutes = Math.floor(uptime / 60000);
        console.log(colorize(`✓ Daemon Active`, 'green') + colorize(` (uptime: ${minutes}m)`, 'dim'));
      } else {
        console.log(colorize('○ Daemon Inactive', 'yellow'));
      }
    } catch (e) {
      // Ignore
    }
  }

  // Check module registry
  const registryPath = path.join(stateDir, 'module-registry.txt');
  if (fs.existsSync(registryPath)) {
    try {
      const content = fs.readFileSync(registryPath, 'utf8');
      const registry = JSON.parse(content);
      const moduleCount = Object.keys(registry.modules || {}).length;
      const runningCount = Object.values(registry.modules || {})
        .filter(m => m.status === 'running').length;

      console.log(colorize(`📊 Modules: ${runningCount}/${moduleCount} running`, 'cyan'));
    } catch (e) {
      // Ignore
    }
  }

  console.log('');
  console.log(colorize('─'.repeat(80), 'dim'));
  console.log('');
}

async function main() {
  printHeader();
  printStatus();

  // Discover and watch all log files
  const logFiles = discoverLogFiles();

  if (logFiles.size === 0) {
    console.log(colorize('⚠ No log files found yet. Waiting...', 'yellow'));
    console.log(colorize('  Make sure the daemon is running in-game', 'dim'));
    console.log('');
  } else {
    console.log(colorize(`Found ${logFiles.size} log file(s):`, 'bright'));
    for (const [filePath, source] of logFiles) {
      console.log(colorize(`  - ${source}`, 'dim'));
    }
    console.log('');
  }

  // Watch existing files
  for (const [filePath, source] of logFiles) {
    watchLogFile(filePath, source);
  }

  // Watch for new log files
  if (fs.existsSync(LOG_DIR)) {
    fs.watch(LOG_DIR, (eventType, filename) => {
      if (filename && filename.endsWith('.txt')) {
        const filePath = path.join(LOG_DIR, filename);
        const source = filename.replace('.txt', '');

        if (!fileSizes.has(filePath)) {
          console.log(colorize(`\n📝 New log file detected: ${source}`, 'magenta'));
          watchLogFile(filePath, source);
        }
      }
    });
  }

  // Refresh status every 30 seconds
  setInterval(() => {
    printHeader();
    printStatus();
  }, 30000);

  console.log(colorize('Monitoring logs...', 'dim'));
  console.log('');
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n');
  console.log(colorize('Monitoring stopped', 'yellow'));
  process.exit(0);
});

main().catch(console.error);
