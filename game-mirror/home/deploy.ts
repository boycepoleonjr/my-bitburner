/**
 * Early Game Deploy Script
 * Scans network, roots all possible servers, deploys workers, and launches attacks
 * 
 * Usage:
 *   run deploy.ts [target] [--dry-run]
 * 
 * If no target is specified, automatically picks the best target for your hacking level.
 */

const WORKER_SCRIPTS = ['/hack.ts', '/grow.ts', '/weaken.ts'];

interface ServerInfo {
  hostname: string;
  hasRoot: boolean;
  maxRam: number;
  usedRam: number;
  availableRam: number;
  portsRequired: number;
  hackingRequired: number;
  maxMoney: number;
  minSecurity: number;
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog('ALL');
  
  const args = ns.flags([['dry-run', false]]);
  const targetArg = args._[0] as string | undefined;
  const dryRun = args['dry-run'] as boolean;
  
  ns.tprint('═══════════════════════════════════════════════════════');
  ns.tprint('         EARLY GAME DEPLOYMENT SYSTEM');
  ns.tprint('═══════════════════════════════════════════════════════');
  
  // Step 1: Scan the entire network
  ns.tprint('\n[1/5] Scanning network...');
  const allServers = scanNetwork(ns);
  ns.tprint(`  Found ${allServers.length} servers`);
  
  // Step 2: Gather info and root everything possible
  ns.tprint('\n[2/5] Analyzing and rooting servers...');
  const serverInfos = analyzeAndRoot(ns, allServers);
  
  const rootedServers = serverInfos.filter(s => s.hasRoot);
  const hackableServers = serverInfos.filter(s => 
    s.hasRoot && 
    s.maxMoney > 0 && 
    s.hackingRequired <= ns.getHackingLevel()
  );
  
  ns.tprint(`  Rooted: ${rootedServers.length}/${allServers.length} servers`);
  ns.tprint(`  Hackable: ${hackableServers.length} servers (with money, within hacking level)`);
  
  // Step 3: Select best target
  ns.tprint('\n[3/5] Selecting target...');
  const target = targetArg || selectBestTarget(ns, hackableServers);
  
  if (!target) {
    ns.tprint('  ERROR: No valid target found!');
    ns.tprint('  Your hacking level may be too low, or no servers are rooted yet.');
    return;
  }
  
  const targetInfo = ns.getServer(target);
  ns.tprint(`  Target: ${target}`);
  ns.tprint(`    Max Money: $${ns.formatNumber(targetInfo.moneyMax || 0)}`);
  ns.tprint(`    Min Security: ${targetInfo.minDifficulty}`);
  ns.tprint(`    Required Hacking: ${targetInfo.requiredHackingSkill}`);
  
  // Step 4: Deploy worker scripts to all rooted servers
  ns.tprint('\n[4/5] Deploying worker scripts...');
  const serversWithRam = rootedServers.filter(s => s.maxRam > 0);
  let deployCount = 0;
  
  for (const server of serversWithRam) {
    const copied = ns.scp(WORKER_SCRIPTS, server.hostname, 'home');
    if (copied) {
      deployCount++;
    }
  }
  ns.tprint(`  Deployed to ${deployCount} servers`);
  
  // Step 5: Launch workers on all servers
  ns.tprint('\n[5/5] Launching workers...');
  
  if (dryRun) {
    ns.tprint('  [DRY RUN] Would launch workers on:');
    for (const server of serversWithRam) {
      const availRam = server.maxRam - server.usedRam;
      ns.tprint(`    ${server.hostname}: ${availRam.toFixed(1)} GB available`);
    }
    return;
  }
  
  // Kill any existing workers first
  for (const server of serversWithRam) {
    for (const script of WORKER_SCRIPTS) {
      ns.scriptKill(script, server.hostname);
    }
  }
  
  // Calculate worker RAM cost
  const workerRam = ns.getScriptRam('/weaken.ts');
  
  // Launch balanced workers across network
  const stats = launchWorkers(ns, serversWithRam, target, workerRam);
  
  ns.tprint('\n═══════════════════════════════════════════════════════');
  ns.tprint('                DEPLOYMENT COMPLETE');
  ns.tprint('═══════════════════════════════════════════════════════');
  ns.tprint(`  Target: ${target}`);
  ns.tprint(`  Hack threads: ${stats.hackThreads}`);
  ns.tprint(`  Grow threads: ${stats.growThreads}`);
  ns.tprint(`  Weaken threads: ${stats.weakenThreads}`);
  ns.tprint(`  Total RAM used: ${stats.ramUsed.toFixed(1)} GB`);
  ns.tprint('═══════════════════════════════════════════════════════');
}

/** Recursively scan the entire network */
function scanNetwork(ns: NS): string[] {
  const servers = new Set<string>();
  const queue = ['home'];
  
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (!servers.has(current)) {
      servers.add(current);
      const neighbors = ns.scan(current);
      queue.push(...neighbors.filter(s => !servers.has(s)));
    }
  }
  
  return Array.from(servers);
}

/** Analyze servers and attempt to root them */
function analyzeAndRoot(ns: NS, servers: string[]): ServerInfo[] {
  const infos: ServerInfo[] = [];
  
  // Count available port crackers
  const crackers: Array<{ file: string; fn: (host: string) => void }> = [];
  if (ns.fileExists('BruteSSH.exe', 'home')) crackers.push({ file: 'BruteSSH.exe', fn: ns.brutessh });
  if (ns.fileExists('FTPCrack.exe', 'home')) crackers.push({ file: 'FTPCrack.exe', fn: ns.ftpcrack });
  if (ns.fileExists('relaySMTP.exe', 'home')) crackers.push({ file: 'relaySMTP.exe', fn: ns.relaysmtp });
  if (ns.fileExists('HTTPWorm.exe', 'home')) crackers.push({ file: 'HTTPWorm.exe', fn: ns.httpworm });
  if (ns.fileExists('SQLInject.exe', 'home')) crackers.push({ file: 'SQLInject.exe', fn: ns.sqlinject });
  
  ns.tprint(`  Port crackers available: ${crackers.length}`);
  
  for (const hostname of servers) {
    const server = ns.getServer(hostname);
    
    // Try to root if not already rooted
    if (!server.hasAdminRights && server.numOpenPortsRequired !== undefined) {
      if (crackers.length >= server.numOpenPortsRequired) {
        // Open ports
        for (let i = 0; i < server.numOpenPortsRequired && i < crackers.length; i++) {
          try {
            crackers[i].fn(hostname);
          } catch {
            // Port already open or cracker failed
          }
        }
        // Nuke
        try {
          ns.nuke(hostname);
          ns.tprint(`  [ROOT] ${hostname}`);
        } catch {
          // Failed to nuke
        }
      }
    }
    
    // Re-check server status after rooting attempt
    const updatedServer = ns.getServer(hostname);
    
    infos.push({
      hostname,
      hasRoot: updatedServer.hasAdminRights,
      maxRam: updatedServer.maxRam,
      usedRam: updatedServer.ramUsed,
      availableRam: updatedServer.maxRam - updatedServer.ramUsed,
      portsRequired: updatedServer.numOpenPortsRequired || 0,
      hackingRequired: updatedServer.requiredHackingSkill || 0,
      maxMoney: updatedServer.moneyMax || 0,
      minSecurity: updatedServer.minDifficulty || 1,
    });
  }
  
  return infos;
}

/** Select the best target based on hacking level and server stats */
function selectBestTarget(ns: NS, hackableServers: ServerInfo[]): string | null {
  if (hackableServers.length === 0) return null;
  
  const hackingLevel = ns.getHackingLevel();
  
  // Score servers: higher money and lower security is better
  // Also prefer servers where our hacking level is at least 2x the requirement
  const scored = hackableServers
    .filter(s => s.hostname !== 'home') // Don't target home
    .map(s => {
      const levelRatio = hackingLevel / Math.max(1, s.hackingRequired);
      const moneyScore = Math.log10(Math.max(1, s.maxMoney));
      const securityPenalty = s.minSecurity / 10;
      
      // Prefer servers we can hack efficiently (level ratio > 2)
      const efficiencyBonus = levelRatio >= 2 ? 2 : levelRatio >= 1.5 ? 1 : 0;
      
      return {
        ...s,
        score: moneyScore + efficiencyBonus - securityPenalty
      };
    })
    .sort((a, b) => b.score - a.score);
  
  return scored[0]?.hostname || null;
}

/** Launch workers across all available servers */
function launchWorkers(
  ns: NS, 
  servers: ServerInfo[], 
  target: string,
  workerRam: number
): { hackThreads: number; growThreads: number; weakenThreads: number; ramUsed: number } {
  let hackThreads = 0;
  let growThreads = 0;
  let weakenThreads = 0;
  let ramUsed = 0;
  
  for (const server of servers) {
    // Get fresh RAM info
    const availRam = ns.getServerMaxRam(server.hostname) - ns.getServerUsedRam(server.hostname);
    const maxThreads = Math.floor(availRam / workerRam);
    
    if (maxThreads < 1) continue;
    
    // For early game, use a simple ratio: 1 hack : 4 grow : 2 weaken
    // This helps build up money quickly
    const ratio = { hack: 1, grow: 4, weaken: 2 };
    const ratioTotal = ratio.hack + ratio.grow + ratio.weaken;
    
    const hThreads = Math.max(1, Math.floor(maxThreads * ratio.hack / ratioTotal));
    const gThreads = Math.max(1, Math.floor(maxThreads * ratio.grow / ratioTotal));
    const wThreads = Math.max(1, maxThreads - hThreads - gThreads);
    
    // Launch workers
    if (hThreads > 0) {
      const pid = ns.exec('/hack.ts', server.hostname, hThreads, target);
      if (pid > 0) hackThreads += hThreads;
    }
    
    if (gThreads > 0) {
      const pid = ns.exec('/grow.ts', server.hostname, gThreads, target);
      if (pid > 0) growThreads += gThreads;
    }
    
    if (wThreads > 0) {
      const pid = ns.exec('/weaken.ts', server.hostname, wThreads, target);
      if (pid > 0) weakenThreads += wThreads;
    }
    
    ramUsed += (hThreads + gThreads + wThreads) * workerRam;
  }
  
  return { hackThreads, growThreads, weakenThreads, ramUsed };
}
