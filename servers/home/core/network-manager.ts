/**
 * Network Manager Module
 * VERSION: 1.1.0
 * LAST UPDATED: 2025-12-02
 *
 * Manages network discovery, root access attempts, script distribution,
 * and network state tracking for the Bitburner automation system.
 *
 * CHANGELOG:
 * - v1.1.0 (2025-12-02): Fixed worker script paths from /tools/ to root /
 * - v1.0.0 (2025-12-02): Initial network manager implementation
 */

import { readState, writeState, scanNetwork, getRootedServers } from '/ns-utils';

// ==========================================
// TYPES AND INTERFACES
// ==========================================

export interface NetworkState {
  allServers: string[];
  rootedServers: string[];
  hackableServers: string[];
  purchasedServers: string[];
  totalRamAvailable: number;
  lastScan: number;
}

export interface ServerInfo {
  hostname: string;
  hasRoot: boolean;
  canHack: boolean;
  isPurchased: boolean;
  maxRam: number;
  availableRam: number;
  requiredHackLevel: number;
  requiredPorts: number;
  moneyMax: number;
}

export interface NetworkChanges {
  newServers: string[];
  newlyRooted: string[];
  newlyPurchased: string[];
  leveledUp: boolean;
  totalChanges: number;
}

// ==========================================
// CONSTANTS
// ==========================================

const STATE_FILE = '/state/network-state.txt';
const WORKER_SCRIPTS = [
  '/weaken.ts',
  '/hack.ts',
  '/grow.ts'
];

// ==========================================
// NETWORK SCANNING
// ==========================================

/**
 * Recursively scan the entire network and return all discoverable servers
 */
export function scanEntireNetwork(ns: NS): string[] {
  const discovered = new Set<string>();
  const queue: string[] = ['home'];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (discovered.has(current)) {
      continue;
    }

    discovered.add(current);

    // Get all directly connected servers
    const neighbors = ns.scan(current);
    for (const neighbor of neighbors) {
      if (!discovered.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  return Array.from(discovered);
}

/**
 * Get detailed information about a specific server
 */
export function getServerInfo(ns: NS, hostname: string): ServerInfo {
  const server = ns.getServer(hostname);
  const playerLevel = ns.getHackingLevel();

  return {
    hostname,
    hasRoot: server.hasAdminRights,
    canHack: server.requiredHackingSkill !== undefined && server.requiredHackingSkill <= playerLevel,
    isPurchased: server.purchasedByPlayer || false,
    maxRam: server.maxRam,
    availableRam: server.maxRam - server.usedRam,
    requiredHackLevel: server.requiredHackingSkill || 0,
    requiredPorts: server.numOpenPortsRequired || 0,
    moneyMax: server.moneyMax || 0
  };
}

// ==========================================
// ROOT ACCESS ATTEMPTS
// ==========================================

/**
 * Attempt to gain root access on a server using available port crackers
 * Returns true if root was gained (either newly or already had)
 */
export function attemptRootAccess(ns: NS, hostname: string): boolean {
  try {
    // Check if we already have root
    if (ns.hasRootAccess(hostname)) {
      return true;
    }

    const server = ns.getServer(hostname);
    const requiredPorts = server.numOpenPortsRequired || 0;
    let openedPorts = 0;

    // Try to open ports with available programs
    const portCrackers = [
      { fn: 'brutessh', name: 'BruteSSH.exe' },
      { fn: 'ftpcrack', name: 'FTPCrack.exe' },
      { fn: 'relaysmtp', name: 'relaySMTP.exe' },
      { fn: 'httpworm', name: 'HTTPWorm.exe' },
      { fn: 'sqlinject', name: 'SQLInject.exe' }
    ];

    for (const cracker of portCrackers) {
      if (ns.fileExists(cracker.name, 'home')) {
        try {
          // Call the port cracking function
          switch (cracker.fn) {
            case 'brutessh':
              ns.brutessh(hostname);
              openedPorts++;
              break;
            case 'ftpcrack':
              ns.ftpcrack(hostname);
              openedPorts++;
              break;
            case 'relaysmtp':
              ns.relaysmtp(hostname);
              openedPorts++;
              break;
            case 'httpworm':
              ns.httpworm(hostname);
              openedPorts++;
              break;
            case 'sqlinject':
              ns.sqlinject(hostname);
              openedPorts++;
              break;
          }
        } catch (e) {
          // Port cracker may have already been used, continue
        }
      }
    }

    // Check if we have enough ports open
    if (openedPorts >= requiredPorts) {
      try {
        ns.nuke(hostname);
        ns.print(`SUCCESS: Gained root access on ${hostname}`);
        return true;
      } catch (e) {
        ns.print(`WARN: Failed to nuke ${hostname}: ${e}`);
        return false;
      }
    } else {
      ns.print(`INFO: ${hostname} requires ${requiredPorts} ports, only opened ${openedPorts}`);
      return false;
    }
  } catch (error) {
    ns.print(`ERROR: Exception in attemptRootAccess for ${hostname}: ${error}`);
    return false;
  }
}

/**
 * Attempt to gain root on all servers in the network
 * Returns list of newly rooted servers
 */
export function rootAllServers(ns: NS, servers: string[]): string[] {
  const newlyRooted: string[] = [];

  for (const hostname of servers) {
    // Skip home server
    if (hostname === 'home') {
      continue;
    }

    const hadRoot = ns.hasRootAccess(hostname);
    const gotRoot = attemptRootAccess(ns, hostname);

    if (gotRoot && !hadRoot) {
      newlyRooted.push(hostname);
    }
  }

  return newlyRooted;
}

// ==========================================
// SCRIPT DISTRIBUTION
// ==========================================

/**
 * Distribute worker scripts to all rooted servers
 * Returns the number of servers that received the scripts
 */
export function distributeWorkerScripts(ns: NS, servers: string[]): number {
  let distributedCount = 0;

  for (const hostname of servers) {
    // Skip servers without root access
    if (!ns.hasRootAccess(hostname)) {
      continue;
    }

    // Skip home server (already has scripts)
    if (hostname === 'home') {
      continue;
    }

    // Skip servers with no RAM
    const maxRam = ns.getServerMaxRam(hostname);
    if (maxRam === 0) {
      continue;
    }

    let allScriptsCopied = true;

    // Copy each worker script to the server
    for (const script of WORKER_SCRIPTS) {
      try {
        // Check if script already exists
        if (!ns.fileExists(script, hostname)) {
          const success = ns.scp(script, hostname, 'home');
          if (!success) {
            ns.print(`WARN: Failed to copy ${script} to ${hostname}`);
            allScriptsCopied = false;
          }
        }
      } catch (error) {
        ns.print(`ERROR: Exception copying ${script} to ${hostname}: ${error}`);
        allScriptsCopied = false;
      }
    }

    if (allScriptsCopied) {
      distributedCount++;
    }
  }

  return distributedCount;
}

// ==========================================
// NETWORK CAPABILITIES
// ==========================================

/**
 * Calculate total network capabilities (RAM, servers, etc.)
 */
export function calculateNetworkCapabilities(ns: NS): {
  totalRamAvailable: number;
  totalMaxRam: number;
  totalUsedRam: number;
  serverCount: number;
  rootedCount: number;
  hackableCount: number;
} {
  const allServers = scanEntireNetwork(ns);
  const rootedServers = allServers.filter(h => ns.hasRootAccess(h));
  const playerLevel = ns.getHackingLevel();

  let totalMaxRam = 0;
  let totalUsedRam = 0;
  let hackableCount = 0;

  for (const hostname of rootedServers) {
    const maxRam = ns.getServerMaxRam(hostname);
    const usedRam = ns.getServerUsedRam(hostname);

    totalMaxRam += maxRam;
    totalUsedRam += usedRam;

    // Check if server is hackable
    const server = ns.getServer(hostname);
    if (server.moneyMax && server.moneyMax > 0 &&
        server.requiredHackingSkill !== undefined &&
        server.requiredHackingSkill <= playerLevel) {
      hackableCount++;
    }
  }

  return {
    totalRamAvailable: totalMaxRam - totalUsedRam,
    totalMaxRam,
    totalUsedRam,
    serverCount: allServers.length,
    rootedCount: rootedServers.length,
    hackableCount
  };
}

/**
 * Get list of hackable servers (have money and player has required level)
 */
export function getHackableServers(ns: NS): string[] {
  const allServers = scanEntireNetwork(ns);
  const playerLevel = ns.getHackingLevel();
  const hackable: string[] = [];

  for (const hostname of allServers) {
    const server = ns.getServer(hostname);

    // Server must have money and be within player's skill level
    if (server.moneyMax && server.moneyMax > 0 &&
        server.requiredHackingSkill !== undefined &&
        server.requiredHackingSkill <= playerLevel) {
      hackable.push(hostname);
    }
  }

  return hackable;
}

/**
 * Get list of purchased servers
 */
export function getPurchasedServers(ns: NS): string[] {
  const allServers = scanEntireNetwork(ns);
  const purchased: string[] = [];

  for (const hostname of allServers) {
    const server = ns.getServer(hostname);
    if (server.purchasedByPlayer) {
      purchased.push(hostname);
    }
  }

  return purchased;
}

// ==========================================
// CHANGE DETECTION
// ==========================================

/**
 * Detect changes in the network since the last scan
 */
export function detectNetworkChanges(ns: NS, oldState: NetworkState | null): NetworkChanges {
  const currentServers = scanEntireNetwork(ns);
  const currentRooted = currentServers.filter(h => ns.hasRootAccess(h));
  const currentPurchased = getPurchasedServers(ns);

  if (!oldState) {
    // First scan - everything is "new"
    return {
      newServers: currentServers,
      newlyRooted: currentRooted,
      newlyPurchased: currentPurchased,
      leveledUp: false,
      totalChanges: currentServers.length
    };
  }

  // Find new servers
  const newServers = currentServers.filter(h => !oldState.allServers.includes(h));

  // Find newly rooted servers
  const newlyRooted = currentRooted.filter(h => !oldState.rootedServers.includes(h));

  // Find newly purchased servers
  const newlyPurchased = currentPurchased.filter(h => !oldState.purchasedServers.includes(h));

  // Detect level-up (more servers became hackable)
  const currentHackable = getHackableServers(ns);
  const leveledUp = currentHackable.length > oldState.hackableServers.length;

  const totalChanges = newServers.length + newlyRooted.length + newlyPurchased.length + (leveledUp ? 1 : 0);

  return {
    newServers,
    newlyRooted,
    newlyPurchased,
    leveledUp,
    totalChanges
  };
}

// ==========================================
// STATE PERSISTENCE
// ==========================================

/**
 * Load network state from file
 */
export function loadNetworkState(ns: NS): NetworkState | null {
  try {
    const state = readState(ns, STATE_FILE, null);

    if (!state) {
      return null;
    }

    // Validate state structure
    if (!state.allServers || !Array.isArray(state.allServers)) {
      ns.print('WARN: Invalid network state structure, ignoring');
      return null;
    }

    return state as NetworkState;
  } catch (error) {
    ns.print(`ERROR: Failed to load network state: ${error}`);
    return null;
  }
}

/**
 * Save network state to file
 */
export function saveNetworkState(ns: NS, state: NetworkState): boolean {
  try {
    return writeState(ns, STATE_FILE, state);
  } catch (error) {
    ns.print(`ERROR: Failed to save network state: ${error}`);
    return false;
  }
}

// ==========================================
// MAIN UPDATE FUNCTION
// ==========================================

/**
 * Perform a full network rescan and update
 * This is the main entry point for network management
 */
export function updateNetworkState(ns: NS): NetworkState {
  // Load previous state
  const oldState = loadNetworkState(ns);

  // Scan entire network
  ns.print('INFO: Scanning entire network...');
  const allServers = scanEntireNetwork(ns);
  ns.print(`INFO: Found ${allServers.length} total servers`);

  // Attempt to root all servers
  ns.print('INFO: Attempting to gain root access...');
  const newlyRooted = rootAllServers(ns, allServers);
  if (newlyRooted.length > 0) {
    ns.print(`SUCCESS: Gained root on ${newlyRooted.length} new servers: ${newlyRooted.join(', ')}`);
  }

  // Get current rooted servers
  const rootedServers = allServers.filter(h => ns.hasRootAccess(h));
  ns.print(`INFO: Total rooted servers: ${rootedServers.length}/${allServers.length}`);

  // Distribute worker scripts
  ns.print('INFO: Distributing worker scripts...');
  const distributedCount = distributeWorkerScripts(ns, rootedServers);
  ns.print(`INFO: Worker scripts deployed to ${distributedCount} servers`);

  // Get hackable and purchased servers
  const hackableServers = getHackableServers(ns);
  const purchasedServers = getPurchasedServers(ns);

  // Calculate network capabilities
  const capabilities = calculateNetworkCapabilities(ns);

  ns.print(`INFO: Network capabilities:`);
  ns.print(`  - Total RAM: ${capabilities.totalMaxRam.toFixed(2)} GB`);
  ns.print(`  - Available RAM: ${capabilities.totalRamAvailable.toFixed(2)} GB`);
  ns.print(`  - Hackable servers: ${hackableServers.length}`);
  ns.print(`  - Purchased servers: ${purchasedServers.length}`);

  // Build new state
  const newState: NetworkState = {
    allServers,
    rootedServers,
    hackableServers,
    purchasedServers,
    totalRamAvailable: capabilities.totalRamAvailable,
    lastScan: Date.now()
  };

  // Detect and report changes
  const changes = detectNetworkChanges(ns, oldState);
  if (changes.totalChanges > 0) {
    ns.print(`INFO: Network changes detected:`);
    if (changes.newServers.length > 0) {
      ns.print(`  - New servers: ${changes.newServers.join(', ')}`);
    }
    if (changes.newlyRooted.length > 0) {
      ns.print(`  - Newly rooted: ${changes.newlyRooted.join(', ')}`);
    }
    if (changes.newlyPurchased.length > 0) {
      ns.print(`  - Newly purchased: ${changes.newlyPurchased.join(', ')}`);
    }
    if (changes.leveledUp) {
      ns.print(`  - Hacking level increased! ${hackableServers.length - oldState!.hackableServers.length} more servers hackable`);
    }
  }

  // Save state to file
  saveNetworkState(ns, newState);
  ns.print('INFO: Network state saved');

  return newState;
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Get a formatted summary of the current network state
 */
export function getNetworkSummary(ns: NS, state?: NetworkState): string {
  const currentState = state || loadNetworkState(ns);

  if (!currentState) {
    return 'No network state available. Run updateNetworkState() first.';
  }

  const age = Date.now() - currentState.lastScan;
  const ageMinutes = Math.floor(age / 60000);

  const lines = [
    '=== Network Summary ===',
    `Last scan: ${ageMinutes} minutes ago`,
    `Total servers: ${currentState.allServers.length}`,
    `Rooted servers: ${currentState.rootedServers.length}`,
    `Hackable servers: ${currentState.hackableServers.length}`,
    `Purchased servers: ${currentState.purchasedServers.length}`,
    `Available RAM: ${currentState.totalRamAvailable.toFixed(2)} GB`,
    '======================'
  ];

  return lines.join('\n');
}

/**
 * Quick function to check if a network update is needed
 * Returns true if state is stale or missing
 */
export function needsUpdate(ns: NS, maxAgeMs: number = 60000): boolean {
  const state = loadNetworkState(ns);

  if (!state) {
    return true;
  }

  const age = Date.now() - state.lastScan;
  return age > maxAgeMs;
}

// ==========================================
// STANDALONE SCRIPT SUPPORT
// ==========================================

/**
 * Main function for running as standalone script
 */
export async function main(ns: NS): Promise<void> {
  ns.disableLog('ALL');
  ns.clearLog();

  ns.print('='.repeat(50));
  ns.print('NETWORK MANAGER');
  ns.print('='.repeat(50));

  // Update network state
  const state = updateNetworkState(ns);

  // Print summary
  ns.tprint('\n' + getNetworkSummary(ns, state));

  ns.print('='.repeat(50));
  ns.print('Network management complete!');
  ns.print('='.repeat(50));
}
