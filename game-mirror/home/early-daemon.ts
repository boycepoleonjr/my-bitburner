/**
 * Early Game Daemon
 * Coordinates HGW (Hack/Grow/Weaken) batches against a single target
 * 
 * Usage:
 *   run early-daemon.ts <target> [--prepare-only]
 * 
 * Features:
 *   - Prepares target (weaken to min security, grow to max money)
 *   - Runs continuous batches of hack/grow/weaken
 *   - Distributes work across all rooted servers
 *   - Monitors and reports income
 */

const WORKER_SCRIPTS = {
  hack: '/hack.ts',
  grow: '/grow.ts',
  weaken: '/weaken.ts',
};

// How much security is added by hack/grow operations
const HACK_SEC_INCREASE = 0.002;
const GROW_SEC_INCREASE = 0.004;
const WEAKEN_SEC_DECREASE = 0.05;

interface BatchStats {
  totalHacked: number;
  batchCount: number;
  startTime: number;
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog('ALL');
  ns.tail();
  
  const args = ns.flags([['prepare-only', false]]);
  const target = args._[0] as string;
  const prepareOnly = args['prepare-only'] as boolean;
  
  if (!target) {
    ns.tprint('ERROR: No target specified');
    ns.tprint('Usage: run early-daemon.ts <target> [--prepare-only]');
    return;
  }
  
  // Verify target exists and we have root
  if (!ns.serverExists(target)) {
    ns.tprint(`ERROR: Server '${target}' does not exist`);
    return;
  }
  
  if (!ns.hasRootAccess(target)) {
    ns.tprint(`ERROR: No root access on '${target}'. Run deploy.ts first.`);
    return;
  }
  
  ns.print('═══════════════════════════════════════════════════════');
  ns.print(`  EARLY DAEMON - Target: ${target}`);
  ns.print('═══════════════════════════════════════════════════════');
  
  // Phase 1: Prepare the target
  ns.print('\n[PHASE 1] Preparing target...');
  await prepareTarget(ns, target);
  
  if (prepareOnly) {
    ns.print('\n[DONE] Target prepared. Exiting (--prepare-only mode).');
    return;
  }
  
  // Phase 2: Run continuous batches
  ns.print('\n[PHASE 2] Starting continuous batches...');
  const stats: BatchStats = {
    totalHacked: 0,
    batchCount: 0,
    startTime: Date.now(),
  };
  
  while (true) {
    await runBatch(ns, target, stats);
    stats.batchCount++;
    
    // Brief pause between batches to let things settle
    await ns.sleep(200);
  }
}

/** Prepare target: weaken to minimum security, grow to maximum money */
async function prepareTarget(ns: NS, target: string): Promise<void> {
  const server = ns.getServer(target);
  const minSec = server.minDifficulty || 1;
  const maxMoney = server.moneyMax || 0;
  
  ns.print(`  Target stats:`);
  ns.print(`    Min Security: ${minSec}`);
  ns.print(`    Max Money: $${ns.formatNumber(maxMoney)}`);
  
  // Get all available RAM
  const servers = getRootedServers(ns);
  const workerRam = ns.getScriptRam(WORKER_SCRIPTS.weaken);
  
  // Weaken phase
  let currentSec = ns.getServerSecurityLevel(target);
  while (currentSec > minSec + 0.5) {
    ns.print(`  Weakening: ${currentSec.toFixed(2)} -> ${minSec}`);
    
    const threadsNeeded = Math.ceil((currentSec - minSec) / WEAKEN_SEC_DECREASE);
    await distributeWork(ns, servers, WORKER_SCRIPTS.weaken, target, threadsNeeded, workerRam);
    
    // Wait for weaken to complete
    const weakenTime = ns.getWeakenTime(target);
    await ns.sleep(weakenTime + 500);
    
    currentSec = ns.getServerSecurityLevel(target);
  }
  ns.print(`  Security minimized: ${currentSec.toFixed(2)}`);
  
  // Grow phase
  let currentMoney = ns.getServerMoneyAvailable(target);
  while (currentMoney < maxMoney * 0.95) {
    ns.print(`  Growing: $${ns.formatNumber(currentMoney)} -> $${ns.formatNumber(maxMoney)}`);
    
    // Estimate grow threads needed (rough calculation)
    const growthMultiplier = maxMoney / Math.max(1, currentMoney);
    const threadsNeeded = Math.ceil(ns.growthAnalyze(target, growthMultiplier));
    
    // Also need weaken threads to counter grow security increase
    const weakenForGrow = Math.ceil(threadsNeeded * GROW_SEC_INCREASE / WEAKEN_SEC_DECREASE);
    
    await distributeWork(ns, servers, WORKER_SCRIPTS.grow, target, threadsNeeded, workerRam);
    await distributeWork(ns, servers, WORKER_SCRIPTS.weaken, target, weakenForGrow, workerRam);
    
    // Wait for operations to complete
    const growTime = ns.getGrowTime(target);
    await ns.sleep(growTime + 500);
    
    currentMoney = ns.getServerMoneyAvailable(target);
    
    // Re-weaken if security got too high
    currentSec = ns.getServerSecurityLevel(target);
    if (currentSec > minSec + 5) {
      const extraWeaken = Math.ceil((currentSec - minSec) / WEAKEN_SEC_DECREASE);
      await distributeWork(ns, servers, WORKER_SCRIPTS.weaken, target, extraWeaken, workerRam);
      await ns.sleep(ns.getWeakenTime(target) + 500);
    }
  }
  
  ns.print(`  Target prepared!`);
  ns.print(`    Security: ${ns.getServerSecurityLevel(target).toFixed(2)}`);
  ns.print(`    Money: $${ns.formatNumber(ns.getServerMoneyAvailable(target))}`);
}

/** Run a single batch of hack/grow/weaken */
async function runBatch(ns: NS, target: string, stats: BatchStats): Promise<void> {
  const server = ns.getServer(target);
  const currentMoney = ns.getServerMoneyAvailable(target);
  const maxMoney = server.moneyMax || 1;
  const currentSec = ns.getServerSecurityLevel(target);
  const minSec = server.minDifficulty || 1;
  
  const servers = getRootedServers(ns);
  const workerRam = ns.getScriptRam(WORKER_SCRIPTS.hack);
  const totalThreads = getTotalAvailableThreads(ns, servers, workerRam);
  
  // If security is too high, focus on weakening
  if (currentSec > minSec + 5) {
    ns.print(`[Batch ${stats.batchCount}] Security high (${currentSec.toFixed(1)}), weakening...`);
    await distributeWork(ns, servers, WORKER_SCRIPTS.weaken, target, totalThreads, workerRam);
    await ns.sleep(ns.getWeakenTime(target) + 200);
    return;
  }
  
  // If money is low, focus on growing
  if (currentMoney < maxMoney * 0.5) {
    ns.print(`[Batch ${stats.batchCount}] Money low ($${ns.formatNumber(currentMoney)}), growing...`);
    const growThreads = Math.floor(totalThreads * 0.7);
    const weakenThreads = totalThreads - growThreads;
    
    await distributeWork(ns, servers, WORKER_SCRIPTS.grow, target, growThreads, workerRam);
    await distributeWork(ns, servers, WORKER_SCRIPTS.weaken, target, weakenThreads, workerRam);
    await ns.sleep(ns.getGrowTime(target) + 200);
    return;
  }
  
  // Normal batch: hack some, grow to recover, weaken to maintain security
  // Ratio: 1 hack : 12 grow : 3 weaken (conservative to maintain server health)
  const ratio = { hack: 1, grow: 12, weaken: 3 };
  const ratioTotal = ratio.hack + ratio.grow + ratio.weaken;
  
  const hackThreads = Math.max(1, Math.floor(totalThreads * ratio.hack / ratioTotal));
  const growThreads = Math.floor(totalThreads * ratio.grow / ratioTotal);
  const weakenThreads = totalThreads - hackThreads - growThreads;
  
  // Calculate expected hack amount
  const hackPercent = ns.hackAnalyze(target);
  const expectedHack = currentMoney * hackPercent * hackThreads;
  
  ns.print(`[Batch ${stats.batchCount}] H:${hackThreads} G:${growThreads} W:${weakenThreads} | Est: $${ns.formatNumber(expectedHack)}`);
  
  // Deploy workers
  await distributeWork(ns, servers, WORKER_SCRIPTS.hack, target, hackThreads, workerRam);
  await distributeWork(ns, servers, WORKER_SCRIPTS.grow, target, growThreads, workerRam);
  await distributeWork(ns, servers, WORKER_SCRIPTS.weaken, target, weakenThreads, workerRam);
  
  // Wait for hack to complete (shortest operation usually)
  const hackTime = ns.getHackTime(target);
  await ns.sleep(hackTime + 200);
  
  // Track earnings
  const newMoney = ns.getServerMoneyAvailable(target);
  const actualHack = currentMoney - newMoney;
  if (actualHack > 0) {
    stats.totalHacked += actualHack;
    
    const runTime = (Date.now() - stats.startTime) / 1000 / 60; // minutes
    const incomePerMin = stats.totalHacked / Math.max(0.1, runTime);
    
    ns.print(`  Hacked: $${ns.formatNumber(actualHack)} | Total: $${ns.formatNumber(stats.totalHacked)} | Rate: $${ns.formatNumber(incomePerMin)}/min`);
  }
  
  // Wait for grow/weaken to finish before next batch
  const growTime = ns.getGrowTime(target);
  const weakenTime = ns.getWeakenTime(target);
  const longestWait = Math.max(growTime, weakenTime) - hackTime;
  
  if (longestWait > 0) {
    await ns.sleep(longestWait + 200);
  }
}

/** Get all servers we have root access to */
function getRootedServers(ns: NS): string[] {
  const servers = new Set<string>();
  const queue = ['home'];
  
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (!servers.has(current)) {
      servers.add(current);
      queue.push(...ns.scan(current).filter(s => !servers.has(s)));
    }
  }
  
  return Array.from(servers).filter(s => ns.hasRootAccess(s));
}

/** Calculate total available threads across all servers */
function getTotalAvailableThreads(ns: NS, servers: string[], workerRam: number): number {
  let total = 0;
  for (const server of servers) {
    const availRam = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
    total += Math.floor(availRam / workerRam);
  }
  return total;
}

/** Distribute work across available servers */
async function distributeWork(
  ns: NS,
  servers: string[],
  script: string,
  target: string,
  threadsNeeded: number,
  workerRam: number
): Promise<number> {
  let threadsLaunched = 0;
  
  for (const server of servers) {
    if (threadsLaunched >= threadsNeeded) break;
    
    const availRam = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
    const maxThreads = Math.floor(availRam / workerRam);
    const threads = Math.min(maxThreads, threadsNeeded - threadsLaunched);
    
    if (threads > 0) {
      // Ensure script is on server
      if (!ns.fileExists(script, server)) {
        ns.scp(script, server);
      }
      
      const pid = ns.exec(script, server, threads, target);
      if (pid > 0) {
        threadsLaunched += threads;
      }
    }
  }
  
  return threadsLaunched;
}

