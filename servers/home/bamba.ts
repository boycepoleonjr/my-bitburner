/**
 * Main Daemon Script
 * VERSION: 1.0.0
 * LAST UPDATED: 2025-12-03
 * 
 * Manages scripts to do the following:
 * - Monitor and root all nodes in the net
 * - Deploy grow/weaken/hack scripts to all nodes in the net
 * - Maximize thread allocation for grow/weaken/hack operations
 *
 * Usage: 
 *   run bamba.ts [target]        - Deploy grow operations (or target specific server)
 *   run bamba.ts monitor [ms]    - Monitor all servers (default 5000ms interval)
 * 
 * @arg {string} target - Target server hostname or "monitor" for monitor mode (optional)
 * @arg {number} interval - Monitor refresh interval in ms (default: 5000, only with monitor mode)
 */

import { getServerRankings, ServerInfo } from './server-info';

const WORKER_SCRIPTS = ['/grow.ts', '/weaken.ts', '/hack.ts'];
const GROW_SCRIPT = '/grow.ts';
const WEAKEN_SCRIPT = '/weaken.ts';
const HACK_SCRIPT = '/hack.ts';

interface ServerResource {
  hostname: string;
  maxRam: number;
  availableRam: number;
  hasRoot: boolean;
}

interface ServerMonitorData {
  hostname: string;
  requiredHackLevel: number;
  hasRoot: boolean;
  moneyAvailable: number;
  moneyMax: number;
  moneyPercent: number;
  securityLevel: number;
  minSecurityLevel: number;
  securityDelta: number;
}

/**
 * Recursively scan entire network
 */
function scanNetwork(ns: NS): string[] {
  const discovered = new Set<string>();
  const queue: string[] = ['home'];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (discovered.has(current)) continue;

    discovered.add(current);
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
 * Attempt to gain root access on a server
 */
function getRootAccess(ns: NS, hostname: string): boolean {
  if (ns.hasRootAccess(hostname)) return true;

  try {
    const server = ns.getServer(hostname);
    const requiredPorts = server.numOpenPortsRequired || 0;
    let openedPorts = 0;

    // Try all available port crackers
    if (ns.fileExists('BruteSSH.exe', 'home')) {
      ns.brutessh(hostname);
      openedPorts++;
    }
    if (ns.fileExists('FTPCrack.exe', 'home')) {
      ns.ftpcrack(hostname);
      openedPorts++;
    }
    if (ns.fileExists('relaySMTP.exe', 'home')) {
      ns.relaysmtp(hostname);
      openedPorts++;
    }
    if (ns.fileExists('HTTPWorm.exe', 'home')) {
      ns.httpworm(hostname);
      openedPorts++;
    }
    if (ns.fileExists('SQLInject.exe', 'home')) {
      ns.sqlinject(hostname);
      openedPorts++;
    }

    // Try to nuke if we opened enough ports
    if (openedPorts >= requiredPorts) {
      ns.nuke(hostname);
      return ns.hasRootAccess(hostname);
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Deploy worker scripts to a server
 */
function deployScripts(ns: NS, hostname: string): boolean {
  try {
    for (const script of WORKER_SCRIPTS) {
      ns.scp(script, hostname, 'home');
    }
    return true;
  } catch (error) {
    ns.print(`ERROR: Failed to deploy scripts to ${hostname}: ${error}`);
    return false;
  }
}

/**
 * Get all servers that can execute scripts (have RAM and root access)
 */
function getAvailableServers(ns: NS, allServers: string[]): ServerResource[] {
  const resources: ServerResource[] = [];

  for (const hostname of allServers) {
    const server = ns.getServer(hostname);
    const hasRoot = server.hasAdminRights;
    const maxRam = server.maxRam;
    const usedRam = server.ramUsed;

    if (hasRoot && maxRam > 0) {
      resources.push({
        hostname,
        maxRam,
        availableRam: maxRam - usedRam,
        hasRoot: true
      });
    }
  }

  return resources;
}

/**
 * Get all servers that have money and can be grown
 */
function getGrowTargets(ns: NS, allServers: string[]): string[] {
  const targets: string[] = [];

  for (const hostname of allServers) {
    const server = ns.getServer(hostname);
    const moneyMax = server.moneyMax || 0;
    const requiredHackLevel = server.requiredHackingSkill || 0;
    const playerLevel = ns.getHackingLevel();

    // Only target servers with money that we can hack
    if (moneyMax > 0 && requiredHackLevel <= playerLevel) {
      targets.push(hostname);
    }
  }

  // Sort by max money (descending) - prioritize high value targets
  targets.sort((a, b) => {
    const moneyA = ns.getServer(a).moneyMax || 0;
    const moneyB = ns.getServer(b).moneyMax || 0;
    return moneyB - moneyA;
  });

  return targets;
}

/**
 * Deploy grow operations across all available servers
 */
function deployGrowOperations(ns: NS, resources: ServerResource[], targets: string[]): number {
  let totalThreads = 0;
  const growRam = ns.getScriptRam(GROW_SCRIPT);
  const weakenRam = ns.getScriptRam(WEAKEN_SCRIPT);

  ns.print(`INFO: Deploying grow operations across ${resources.length} servers`);
  ns.print(`INFO: Targeting ${targets.length} servers for growth`);

  // Deploy to each resource server
  for (const resource of resources) {
    const availableRam = resource.availableRam;

    // Reserve some RAM on home server
    const reservedRam = resource.hostname === 'home' ? 32 : 0;
    const usableRam = Math.max(0, availableRam - reservedRam);

    if (usableRam < growRam) continue;

    // Calculate max threads we can run
    const maxGrowThreads = Math.floor(usableRam / growRam);

    // Calculate optimal ratio with weaken threads
    const totalRam = growRam + weakenRam;
    const threadsPerBatch = Math.floor(usableRam / totalRam);

    if (threadsPerBatch < 1) {
      // Not enough RAM for balanced operation, just use grow
      for (const target of targets) {
        if (maxGrowThreads > 0) {
          const pid = ns.exec(GROW_SCRIPT, resource.hostname, maxGrowThreads, target);
          if (pid > 0) {
            totalThreads += maxGrowThreads;
            ns.print(`  Deployed ${maxGrowThreads} grow threads on ${resource.hostname} → ${target}`);
            break; // One target per server
          }
        }
      }
    } else {
      // Deploy balanced grow + weaken
      // Ensure we always have at least 1 thread for each operation
      const growThreads = Math.max(1, Math.floor(threadsPerBatch * 0.9)); // 90% grow, min 1
      const weakenThreads = Math.max(1, Math.floor(threadsPerBatch * 0.1)); // 10% weaken, min 1

      for (const target of targets) {
        const server = ns.getServer(target);
        const currentSecurity = server.hackDifficulty || 1;
        const minSecurity = server.minDifficulty || 1;

        // If security is high, use more weaken threads
        if (currentSecurity > minSecurity + 5) {
          const pid = ns.exec(WEAKEN_SCRIPT, resource.hostname, threadsPerBatch, target);
          if (pid > 0) {
            totalThreads += threadsPerBatch;
            ns.print(`  Deployed ${threadsPerBatch} weaken threads on ${resource.hostname} → ${target}`);
            break;
          }
        } else {
          // Deploy grow and weaken (only if we have enough RAM for both)
          const totalNeeded = (growThreads * growRam) + (weakenThreads * weakenRam);
          if (totalNeeded <= usableRam) {
            const growPid = ns.exec(GROW_SCRIPT, resource.hostname, growThreads, target);
            const weakenPid = ns.exec(WEAKEN_SCRIPT, resource.hostname, weakenThreads, target);

            if (growPid > 0 || weakenPid > 0) {
              totalThreads += (growPid > 0 ? growThreads : 0) + (weakenPid > 0 ? weakenThreads : 0);
              ns.print(`  Deployed ${growThreads} grow + ${weakenThreads} weaken on ${resource.hostname} → ${target}`);
              break;
            }
          } else {
            // Not enough RAM for both, just deploy grow
            if (maxGrowThreads > 0) {
              const pid = ns.exec(GROW_SCRIPT, resource.hostname, maxGrowThreads, target);
              if (pid > 0) {
                totalThreads += maxGrowThreads;
                ns.print(`  Deployed ${maxGrowThreads} grow threads on ${resource.hostname} → ${target}`);
                break;
              }
            }
          }
        }
      }
    }
  }

  return totalThreads;
}

/**
 * Collect monitoring data for all servers
 */
function collectMonitorData(ns: NS, allServers: string[]): ServerMonitorData[] {
  const monitorData: ServerMonitorData[] = [];

  for (const hostname of allServers) {
    try {
      const server = ns.getServer(hostname);
      const requiredHackLevel = server.requiredHackingSkill || 0;
      const hasRoot = server.hasAdminRights || false;
      const moneyAvailable = server.moneyAvailable || 0;
      const moneyMax = server.moneyMax || 0;
      const moneyPercent = moneyMax > 0 ? (moneyAvailable / moneyMax) * 100 : 0;
      const securityLevel = server.hackDifficulty || server.minDifficulty || 0;
      const minSecurityLevel = server.minDifficulty || 0;
      const securityDelta = securityLevel - minSecurityLevel;

      monitorData.push({
        hostname,
        requiredHackLevel,
        hasRoot,
        moneyAvailable,
        moneyMax,
        moneyPercent,
        securityLevel,
        minSecurityLevel,
        securityDelta
      });
    } catch (error) {
      // Skip servers we can't access
      continue;
    }
  }

  // Sort by hostname for consistent display
  monitorData.sort((a, b) => a.hostname.localeCompare(b.hostname));

  return monitorData;
}

/**
 * Format money value for display
 */
function formatMoney(ns: NS, amount: number): string {
  if (amount >= 1e12) return `$${(amount / 1e12).toFixed(2)}T`;
  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(2)}M`;
  if (amount >= 1e3) return `$${(amount / 1e3).toFixed(2)}K`;
  return `$${amount.toFixed(2)}`;
}

/**
 * Display monitoring data for all servers
 */
function displayMonitorData(ns: NS, data: ServerMonitorData[]): void {
  ns.clearLog();
  
  ns.print('═══════════════════════════════════════════════════════════════════════════════');
  ns.print('   NETWORK MONITOR - ALL SERVERS');
  ns.print('═══════════════════════════════════════════════════════════════════════════════');
  ns.print('');

  if (data.length === 0) {
    ns.print('No servers found.');
    return;
  }

  // Display each server's data
  for (const server of data) {
    const rootStatus = server.hasRoot ? '☠️ ROOTED' : '☠️ NO ROOT';
    const moneyStr = server.moneyMax > 0 
      ? `${formatMoney(ns, server.moneyAvailable)} / ${formatMoney(ns, server.moneyMax)} (${server.moneyPercent.toFixed(1)}%)`
      : 'No Money';
    const securityStr = server.securityDelta > 0
      ? `${server.securityLevel.toFixed(2)} (+${server.securityDelta.toFixed(2)})`
      : `${server.securityLevel.toFixed(2)}`;

    ns.print(`${server.hostname.padEnd(20)} | 📊: ${String(server.requiredHackLevel).padStart(4)} (${rootStatus}) | 💰: ${moneyStr.padEnd(30)} | 🔒: ${securityStr}`);
  }

  ns.print('');
  ns.print('═══════════════════════════════════════════════════════════════════════════════');
  ns.print(`Total Servers: ${data.length} | Press Ctrl+C to exit`);
  ns.print('═══════════════════════════════════════════════════════════════════════════════');
}

/**
 * Monitor mode - continuously track all servers
 */
async function monitorMode(ns: NS, interval: number): Promise<void> {
  ns.disableLog("ALL");
  ns.clearLog();
  ns.ui.openTail();

  ns.print('Starting network monitor...');
  ns.print(`Update interval: ${interval}ms`);
  await ns.asleep(1000);

  while (true) {
    try {
      const allServers = scanNetwork(ns);
      const monitorData = collectMonitorData(ns, allServers);
      displayMonitorData(ns, monitorData);
      await ns.asleep(interval);
    } catch (error) {
      ns.print(`ERROR: ${error}`);
      await ns.asleep(interval);
    }
  }
}

/**
 * Main execution
 */
export async function main(ns: NS): Promise<void> {
  // Check if monitor mode is requested
  const monitorArg = ns.args[0] as string | undefined;
  if (monitorArg === 'monitor' || monitorArg === 'm') {
    const interval = (ns.args[1] as number) || 5000; // Default 5 seconds
    await monitorMode(ns, interval);
    return;
  }

  ns.disableLog("scan");
  ns.disableLog("brutessh");
  ns.disableLog("relaysmtp");
  ns.disableLog("scp");
  ns.disableLog("getHackingLevel");
  ns.clearLog();
  ns.ui.openTail();

  ns.print('═══════════════════════════════════════════════');
  ns.print('   MASS GROW - NETWORK-WIDE GROWTH OPERATIONS');
  ns.print('═══════════════════════════════════════════════');
  ns.print('');

  // Get target from args or grow all
  const specificTarget = ns.args[0] as string | undefined;

  // Step 1: Scan network
  ns.print('INFO: Scanning network...');
  const allServers = scanNetwork(ns);
  ns.print(`INFO: Found ${allServers.length} servers`);

  // Step 2: Attempt to root all servers
  ns.print('INFO: Attempting to gain root access...');
  let rootedCount = 0;
  for (const hostname of allServers) {
    if (getRootAccess(ns, hostname)) {
      rootedCount++;
    }
  }
  ns.print(`INFO: Rooted ${rootedCount} servers`);

  // Step 3: Deploy worker scripts
  ns.print('INFO: Deploying worker scripts...');
  let deployedCount = 0;
  for (const hostname of allServers) {
    if (ns.hasRootAccess(hostname)) {
      if (deployScripts(ns, hostname)) {
        deployedCount++;
      }
    }
  }
  ns.print(`INFO: Deployed scripts to ${deployedCount} servers`);

  // Step 4: Get server rankings and filter utility nodes
  const serverRankings = getServerRankings(ns);
  const utilityNodes = serverRankings.filter(s => s.isUtilityNode);
  const resources = utilityNodes.map(node => {
    const server = ns.getServer(node.name);
    return {
      hostname: node.name,
      maxRam: node.maxRam,
      availableRam: node.maxRam - (server.ramUsed || 0),
      hasRoot: true
    };
  });
  const totalRam = resources.reduce((sum, r) => sum + r.maxRam, 0);
  const availableRam = resources.reduce((sum, r) => sum + r.availableRam, 0);
  ns.print(`INFO: Available resources: ${resources.length} utility nodes, ${availableRam.toFixed(2)}GB / ${totalRam.toFixed(2)}GB RAM`);

  // Step 5: Get grow targets
  const targets = specificTarget ? [specificTarget] : getGrowTargets(ns, allServers);

  if (targets.length === 0) {
    ns.print('ERROR: No valid targets found!');
    return;
  }

  ns.print(`INFO: Targeting ${targets.length} servers for growth:`);
  for (let i = 0; i < Math.min(5, targets.length); i++) {
    const target = targets[i];
    const server = ns.getServer(target);
    const money = server.moneyAvailable || 0;
    const maxMoney = server.moneyMax || 0;
    const percent = maxMoney > 0 ? (money / maxMoney * 100).toFixed(1) : 0;
    ns.print(`  ${i + 1}. ${target} - $${(maxMoney / 1e6).toFixed(2)}M (${percent}% full)`);
  }
  if (targets.length > 5) {
    ns.print(`  ... and ${targets.length - 5} more`);
  }

  // Step 6: Deploy grow operations
  ns.print('');
  ns.print('INFO: Deploying grow operations...');
  const totalThreads = deployGrowOperations(ns, resources, targets);

  ns.print('');
  ns.print('═══════════════════════════════════════════════');
  ns.print(`✓ Deployment complete!`);
  ns.print(`  Total threads deployed: ${totalThreads}`);
  ns.print(`  Servers executing: ${resources.length}`);
  ns.print(`  Targets being grown: ${targets.length}`);
  ns.print('═══════════════════════════════════════════════');
  ns.print('');
  ns.print('TIP: Use "run bamba.ts monitor [interval]" to track all servers');
  ns.print('TIP: Scripts will run continuously until killed');
}

