// NS type is globally available in Bitburner - no import needed

/**
 * NS-Compatible Utility Functions
 * VERSION: 1.3.0
 * LAST UPDATED: 2025-12-02
 *
 * These utilities work within Bitburner's script execution model where:
 * - Scripts run in isolation without shared memory
 * - Communication happens via files and ports
 * - Each script must be self-contained
 * - State persistence requires file operations
 *
 * CHANGELOG:
 * - v1.3.0 (2025-12-02): Added LoggingConfig interface and component-specific logging
 * - v1.2.0 (2025-12-02): Added readComponentLogs and clearComponentLogs helpers
 * - v1.1.0 (2025-12-02): Enhanced log() function with optional logging config
 * - v1.0.0 (2025-12-02): Initial utility functions
 */

// ==========================================
// FILE-BASED STATE MANAGEMENT
// ==========================================

/**
 * Read state from a JSON file, with error handling and defaults
 */
export function readState(ns: NS, filename: string, defaultValue: any = {}): any {
  try {
    if (!ns.fileExists(filename)) {
      return defaultValue;
    }
    const content = ns.read(filename);
    if (!content || content.trim() === '') {
      return defaultValue;
    }
    return JSON.parse(content);
  } catch (error) {
    ns.print(`ERROR: Failed to read state from ${filename}: ${error}`);
    return defaultValue;
  }
}

/**
 * Write state to a JSON file with atomic operation simulation
 */
export function writeState(ns: NS, filename: string, data: any): boolean {
  try {
    const jsonData = JSON.stringify(data, null, 2);
    ns.write(filename, jsonData, 'w');
    return true;
  } catch (error) {
    ns.print(`ERROR: Failed to write state to ${filename}: ${error}`);
    return false;
  }
}

/**
 * Update specific keys in a state file without overwriting everything
 */
export function updateState(ns: NS, filename: string, updates: any): boolean {
  try {
    const currentState = readState(ns, filename, {});
    const newState = { ...currentState, ...updates };
    return writeState(ns, filename, newState);
  } catch (error) {
    ns.print(`ERROR: Failed to update state in ${filename}: ${error}`);
    return false;
  }
}

// ==========================================
// PORT-BASED COMMUNICATION
// ==========================================

/**
 * Send a message to another script via port
 */
export function sendMessage(ns: NS, port: number, message: any): boolean {
  try {
    const portHandle = ns.getPortHandle(port);
    const messageData = {
      timestamp: Date.now(),
      data: message
    };
    if (portHandle.full()) {
      // Clear old messages if port is full
      portHandle.clear();
    }
    portHandle.write(JSON.stringify(messageData));
    return true;
  } catch (error) {
    ns.print(`ERROR: Failed to send message to port ${port}: ${error}`);
    return false;
  }
}

/**
 * Receive a message from a port (non-blocking)
 */
export function receiveMessage(ns: NS, port: number): any | null {
  try {
    const portHandle = ns.getPortHandle(port);
    if (portHandle.empty()) {
      return null;
    }
    const messageStr = portHandle.read() as string;
    const messageData = JSON.parse(messageStr);
    return messageData.data;
  } catch (error) {
    ns.print(`ERROR: Failed to receive message from port ${port}: ${error}`);
    return null;
  }
}

/**
 * Check if there are messages waiting on a port
 */
export function hasMessages(ns: NS, port: number): boolean {
  try {
    const portHandle = ns.getPortHandle(port);
    return !portHandle.empty();
  } catch (error) {
    return false;
  }
}

// ==========================================
// SCRIPT COORDINATION
// ==========================================

/**
 * Start a script with arguments and track its PID
 */
export function startScript(ns: NS, script: string, hostname: string, threads: number, ...args: any[]): number {
  try {
    // Ensure script exists on target server
    if (!ns.fileExists(script, hostname)) {
      ns.scp(script, hostname);
    }

    const pid = ns.exec(script, hostname, threads, ...args);
    if (pid === 0) {
      ns.print(`ERROR: Failed to start ${script} on ${hostname}`);
      return 0;
    }

    ns.print(`INFO: Started ${script} on ${hostname} with PID ${pid}`);
    return pid;
  } catch (error) {
    ns.print(`ERROR: Exception starting ${script}: ${error}`);
    return 0;
  }
}

/**
 * Stop a script by PID or script name
 */
export function stopScript(ns: NS, identifier: string | number, hostname: string = 'home'): boolean {
  try {
    if (typeof identifier === 'number') {
      // Stop by PID
      return ns.kill(identifier);
    } else {
      // Stop by script name
      return ns.kill(identifier, hostname);
    }
  } catch (error) {
    ns.print(`ERROR: Failed to stop script ${identifier}: ${error}`);
    return false;
  }
}

/**
 * Check if a script is currently running
 */
export function isScriptRunning(ns: NS, script: string, hostname: string): boolean {
  try {
    return ns.isRunning(script, hostname);
  } catch (error) {
    return false;
  }
}

/**
 * Get list of all running scripts on a server
 */
export function getRunningScripts(ns: NS, hostname: string): any[] {
  try {
    return ns.ps(hostname);
  } catch (error) {
    ns.print(`ERROR: Failed to get running scripts on ${hostname}: ${error}`);
    return [];
  }
}

// ==========================================
// CONFIGURATION MANAGEMENT
// ==========================================

/**
 * Load configuration from a file with validation
 */
export function loadConfig(ns: NS, configFile: string, defaultConfig: any): any {
  try {
    if (!ns.fileExists(configFile)) {
      // Create default config file
      writeState(ns, configFile, defaultConfig);
      ns.print(`INFO: Created default config file: ${configFile}`);
      return defaultConfig;
    }

    const config = readState(ns, configFile, defaultConfig);

    // Merge with defaults to ensure all required keys exist
    const mergedConfig = mergeDeep(defaultConfig, config);

    // Write back merged config to ensure consistency
    writeState(ns, configFile, mergedConfig);

    return mergedConfig;
  } catch (error) {
    ns.print(`ERROR: Failed to load config from ${configFile}: ${error}`);
    return defaultConfig;
  }
}

/**
 * Deep merge two objects (for config merging)
 */
function mergeDeep(target: any, source: any): any {
  const output = { ...target };

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = mergeDeep(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }

  return output;
}

function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item);
}

// ==========================================
// LOGGING UTILITIES
// ==========================================

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LoggingConfig {
  logLevel: LogLevel;
  enableComponentLogs: boolean;  // Enable component-specific log files
  componentLogMaxEntries: number; // Max entries per component log file
}

const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  logLevel: LogLevel.INFO,
  enableComponentLogs: false,
  componentLogMaxEntries: 500
};

/**
 * Simple logging function that respects log levels and supports component-specific file logging
 */
export function log(ns: NS, level: LogLevel, component: string, message: string, loggingConfig?: LoggingConfig): void {
  const config = loggingConfig || DEFAULT_LOGGING_CONFIG;
  const currentLogLevel = config.logLevel;

  if (level < currentLogLevel) {
    return; // Don't log below current level
  }

  const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
  const timestamp = new Date().toISOString().substr(11, 8); // HH:MM:SS
  const logMessage = `[${timestamp}] [${levelNames[level]}] [${component}] ${message}`;

  ns.print(logMessage);

  // Create log entry
  const logEntry = {
    timestamp: Date.now(),
    level: levelNames[level],
    component,
    message
  };

  // Always write to main daemon log
  appendToLogFile(ns, '/daemon-log.txt', logEntry);

  // Optionally write to component-specific log file
  if (config.enableComponentLogs) {
    const componentLogFile = `/logs/${component.toLowerCase().replace(/\s+/g, '-')}.txt`;
    appendToLogFile(ns, componentLogFile, logEntry, config.componentLogMaxEntries);
  }
}

/**
 * Append log entry to persistent log file
 */
function appendToLogFile(ns: NS, logFile: string, entry: any, maxEntries: number = 1000): void {
  try {
    const existingLogs = readState(ns, logFile, []);
    existingLogs.push(entry);

    // Keep only last N log entries to prevent file size issues
    if (existingLogs.length > maxEntries) {
      existingLogs.splice(0, existingLogs.length - maxEntries);
    }

    writeState(ns, logFile, existingLogs);
  } catch (error) {
    // Silent fail to prevent log recursion
  }
}

/**
 * Read logs from a specific component log file
 */
export function readComponentLogs(ns: NS, component: string, maxEntries: number = 100): any[] {
  const componentLogFile = `/logs/${component.toLowerCase().replace(/\s+/g, '-')}.txt`;
  const logs = readState(ns, componentLogFile, []);
  return logs.slice(-maxEntries);
}

/**
 * Clear logs for a specific component
 */
export function clearComponentLogs(ns: NS, component: string): boolean {
  const componentLogFile = `/logs/${component.toLowerCase().replace(/\s+/g, '-')}.txt`;
  return writeState(ns, componentLogFile, []);
}

// ==========================================
// NETWORK UTILITIES
// ==========================================

/**
 * Scan entire network and return all discoverable servers
 */
export function scanNetwork(ns: NS): string[] {
  const servers = new Set<string>();
  const scanQueue = ['home'];

  while (scanQueue.length > 0) {
    const current = scanQueue.pop()!;
    if (!servers.has(current)) {
      servers.add(current);
      const connected = ns.scan(current);
      scanQueue.push(...connected);
    }
  }

  return Array.from(servers);
}

/**
 * Get all servers that we have root access to
 */
export function getRootedServers(ns: NS): string[] {
  const allServers = scanNetwork(ns);
  return allServers.filter(hostname => ns.hasRootAccess(hostname));
}

/**
 * Calculate total available RAM across all rooted servers
 */
export function getTotalAvailableRam(ns: NS): number {
  const rootedServers = getRootedServers(ns);
  let totalRam = 0;

  for (const hostname of rootedServers) {
    const maxRam = ns.getServerMaxRam(hostname);
    const usedRam = ns.getServerUsedRam(hostname);
    totalRam += maxRam - usedRam;
  }

  return totalRam;
}

// ==========================================
// DAEMON COORDINATION
// ==========================================

/**
 * Register a module with the daemon coordination system
 */
export function registerModule(ns: NS, moduleName: string, config: any): boolean {
  try {
    const daemonState = readState(ns, '/daemon-state.txt', { modules: {} });
    daemonState.modules[moduleName] = {
      ...config,
      lastRegistered: Date.now(),
      isActive: false
    };
    return writeState(ns, '/daemon-state.txt', daemonState);
  } catch (error) {
    log(ns, LogLevel.ERROR, 'Utils', `Failed to register module ${moduleName}: ${error}`);
    return false;
  }
}

/**
 * Update module status in daemon coordination
 */
export function updateModuleStatus(ns: NS, moduleName: string, status: any): boolean {
  try {
    const daemonState = readState(ns, '/daemon-state.txt', { modules: {} });
    if (daemonState.modules[moduleName]) {
      daemonState.modules[moduleName] = {
        ...daemonState.modules[moduleName],
        ...status,
        lastUpdate: Date.now()
      };
      return writeState(ns, '/daemon-state.txt', daemonState);
    }
    return false;
  } catch (error) {
    log(ns, LogLevel.ERROR, 'Utils', `Failed to update module status ${moduleName}: ${error}`);
    return false;
  }
}

/**
 * Get current daemon state
 */
export function getDaemonState(ns: NS): any {
  return readState(ns, '/daemon-state.txt', {
    modules: {},
    globalState: {},
    lastUpdated: Date.now()
  });
}

// ==========================================
// MODULE COMMUNICATION HELPERS
// ==========================================

/**
 * Send a control message to a module via its control port
 */
export function sendControlMessage(ns: NS, controlPort: number, message: any): boolean {
  return sendMessage(ns, controlPort, message);
}

/**
 * Collect all status messages from a module's status port
 */
export function collectStatusMessages(ns: NS, statusPort: number): any[] {
  const messages: any[] = [];

  try {
    while (hasMessages(ns, statusPort)) {
      const message = receiveMessage(ns, statusPort);
      if (message !== null) {
        messages.push(message);
      }
    }
  } catch (error) {
    ns.print(`ERROR: Failed to collect status messages from port ${statusPort}: ${error}`);
  }

  return messages;
}

/**
 * Check if daemon is currently running
 */
export function isDaemonRunning(ns: NS): boolean {
  return isScriptRunning(ns, '/daemon.ts', 'home');
}

// ==========================================
// FORMATTING UTILITIES
// ==========================================

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format RAM in GB to human-readable string
 */
export function formatRam(gb: number): string {
  if (gb >= 1000) {
    return `${(gb / 1000).toFixed(2)}TB`;
  } else if (gb >= 1) {
    return `${gb.toFixed(2)}GB`;
  } else {
    return `${(gb * 1024).toFixed(0)}MB`;
  }
}

/**
 * Format money to human-readable string
 */
export function formatMoney(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1e12) return `$${(amount / 1e12).toFixed(2)}t`;
  if (abs >= 1e9) return `$${(amount / 1e9).toFixed(2)}b`;
  if (abs >= 1e6) return `$${(amount / 1e6).toFixed(2)}m`;
  if (abs >= 1e3) return `$${(amount / 1e3).toFixed(2)}k`;
  return `$${Math.round(amount)}`;
}

/**
 * Format number to human-readable string with suffix
 */
export function formatNumber(num: number): string {
  const abs = Math.abs(num);
  if (abs >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(2);
}

// ==========================================
// MODULE DEPLOYMENT HELPERS
// ==========================================

/**
 * Deploy a module across network with resource allocation
 */
export function deployModule(
  ns: NS,
  modulePath: string,
  serverAllocations: Record<string, number>,
  args: any[]
): Map<string, number> {
  const deployedPIDs = new Map<string, number>();

  for (const [hostname, ramGB] of Object.entries(serverAllocations)) {
    const scriptRam = ns.getScriptRam(modulePath);
    if (scriptRam === 0) {
      ns.print(`ERROR: Script ${modulePath} not found or has 0 RAM cost`);
      continue;
    }

    const threads = Math.floor(ramGB / scriptRam);
    if (threads < 1) {
      ns.print(`WARN: Not enough RAM on ${hostname} for ${modulePath} (need ${scriptRam}GB, have ${ramGB}GB)`);
      continue;
    }

    const pid = startScript(ns, modulePath, hostname, threads, ...args);
    if (pid > 0) {
      deployedPIDs.set(hostname, pid);
    }
  }

  return deployedPIDs;
}

/**
 * Kill all instances of a module across the network
 */
export function killModuleEverywhere(ns: NS, modulePath: string): number {
  const allServers = scanNetwork(ns);
  let killedCount = 0;

  for (const hostname of allServers) {
    const processes = getRunningScripts(ns, hostname);
    for (const proc of processes) {
      if (proc.filename === modulePath) {
        if (ns.kill(proc.pid)) {
          killedCount++;
        }
      }
    }
  }

  return killedCount;
}

// ==========================================
// VALIDATION HELPERS
// ==========================================

/**
 * Check if formulas.exe is available
 */
export function hasFormulas(ns: NS): boolean {
  try {
    const server = ns.getServer('home');
    const player = ns.getPlayer();
    ns.formulas.hacking.hackTime(server, player);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate module configuration has required fields
 */
export function validateModuleConfig(config: any, requiredFields: string[]): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const field of requiredFields) {
    if (!(field in config)) {
      missing.push(field);
    }
  }

  return {
    valid: missing.length === 0,
    missing
  };
}