/**
 * Network Manager Usage Examples
 *
 * This file demonstrates how to use the network-manager module
 * in various scenarios.
 */

import {
  updateNetworkState,
  loadNetworkState,
  getNetworkSummary,
  needsUpdate,
  scanEntireNetwork,
  attemptRootAccess,
  distributeWorkerScripts,
  getHackableServers,
  getPurchasedServers,
  calculateNetworkCapabilities,
  detectNetworkChanges
} from '/core/network-manager';

/**
 * Example 1: Basic network scan and update
 */
export async function example1_basicScan(ns: NS): Promise<void> {
  ns.tprint('=== Example 1: Basic Network Scan ===');

  // Perform a complete network update
  const state = updateNetworkState(ns);

  // Print summary
  ns.tprint(getNetworkSummary(ns, state));
}

/**
 * Example 2: Check if update is needed before scanning
 */
export async function example2_conditionalUpdate(ns: NS): Promise<void> {
  ns.tprint('=== Example 2: Conditional Update ===');

  // Only update if state is older than 5 minutes
  if (needsUpdate(ns, 5 * 60 * 1000)) {
    ns.tprint('Network state is stale, updating...');
    updateNetworkState(ns);
  } else {
    ns.tprint('Network state is fresh, using cached data');
  }

  const state = loadNetworkState(ns);
  if (state) {
    ns.tprint(`Rooted: ${state.rootedServers.length}/${state.allServers.length} servers`);
    ns.tprint(`Available RAM: ${state.totalRamAvailable.toFixed(2)} GB`);
  }
}

/**
 * Example 3: Manual root attempts on specific servers
 */
export async function example3_manualRoot(ns: NS): Promise<void> {
  ns.tprint('=== Example 3: Manual Root Attempts ===');

  const allServers = scanEntireNetwork(ns);
  let rootedCount = 0;

  for (const hostname of allServers) {
    if (hostname === 'home') continue;

    if (!ns.hasRootAccess(hostname)) {
      const success = attemptRootAccess(ns, hostname);
      if (success) {
        ns.tprint(`Successfully rooted: ${hostname}`);
        rootedCount++;
      }
    }
  }

  ns.tprint(`Total newly rooted: ${rootedCount}`);
}

/**
 * Example 4: Distribute scripts only to new servers
 */
export async function example4_scriptDistribution(ns: NS): Promise<void> {
  ns.tprint('=== Example 4: Script Distribution ===');

  const rootedServers = scanEntireNetwork(ns).filter(h => ns.hasRootAccess(h));

  ns.tprint(`Distributing worker scripts to ${rootedServers.length} servers...`);
  const count = distributeWorkerScripts(ns, rootedServers);

  ns.tprint(`Successfully distributed to ${count} servers`);
}

/**
 * Example 5: Find best targets for hacking
 */
export async function example5_findTargets(ns: NS): Promise<void> {
  ns.tprint('=== Example 5: Find Hack Targets ===');

  const hackable = getHackableServers(ns);

  // Sort by max money (descending)
  const targets = hackable
    .map(hostname => ({
      hostname,
      money: ns.getServerMaxMoney(hostname),
      security: ns.getServerMinSecurityLevel(hostname),
      level: ns.getServerRequiredHackingLevel(hostname)
    }))
    .sort((a, b) => b.money - a.money)
    .slice(0, 10);

  ns.tprint(`Top 10 hack targets:`);
  for (const target of targets) {
    ns.tprint(`  ${target.hostname}: $${ns.formatNumber(target.money)} (Lv${target.level}, Sec${target.security})`);
  }
}

/**
 * Example 6: Monitor network changes over time
 */
export async function example6_monitorChanges(ns: NS): Promise<void> {
  ns.tprint('=== Example 6: Monitor Network Changes ===');

  const oldState = loadNetworkState(ns);

  // Wait a bit (in real scenario, this would be between scans)
  await ns.sleep(1000);

  // Scan again
  const allServers = scanEntireNetwork(ns);
  const changes = detectNetworkChanges(ns, oldState);

  if (changes.totalChanges === 0) {
    ns.tprint('No changes detected in network');
  } else {
    ns.tprint(`Detected ${changes.totalChanges} changes:`);
    if (changes.newServers.length > 0) {
      ns.tprint(`  New servers: ${changes.newServers.join(', ')}`);
    }
    if (changes.newlyRooted.length > 0) {
      ns.tprint(`  Newly rooted: ${changes.newlyRooted.join(', ')}`);
    }
    if (changes.newlyPurchased.length > 0) {
      ns.tprint(`  Newly purchased: ${changes.newlyPurchased.join(', ')}`);
    }
    if (changes.leveledUp) {
      ns.tprint('  Player leveled up! More servers hackable');
    }
  }
}

/**
 * Example 7: Get detailed network statistics
 */
export async function example7_networkStats(ns: NS): Promise<void> {
  ns.tprint('=== Example 7: Network Statistics ===');

  const capabilities = calculateNetworkCapabilities(ns);
  const purchased = getPurchasedServers(ns);

  ns.tprint('Network Overview:');
  ns.tprint(`  Total servers discovered: ${capabilities.serverCount}`);
  ns.tprint(`  Servers with root: ${capabilities.rootedCount} (${(capabilities.rootedCount/capabilities.serverCount*100).toFixed(1)}%)`);
  ns.tprint(`  Hackable servers: ${capabilities.hackableCount}`);
  ns.tprint(`  Purchased servers: ${purchased.length}`);
  ns.tprint('');
  ns.tprint('RAM Statistics:');
  ns.tprint(`  Total RAM: ${capabilities.totalMaxRam.toFixed(2)} GB`);
  ns.tprint(`  Used RAM: ${capabilities.totalUsedRam.toFixed(2)} GB`);
  ns.tprint(`  Available RAM: ${capabilities.totalRamAvailable.toFixed(2)} GB`);
  ns.tprint(`  Utilization: ${(capabilities.totalUsedRam/capabilities.totalMaxRam*100).toFixed(1)}%`);
}

/**
 * Example 8: Daemon integration - periodic network updates
 */
export async function example8_daemonMode(ns: NS): Promise<void> {
  ns.tprint('=== Example 8: Daemon Mode ===');
  ns.tprint('Running network manager in daemon mode...');
  ns.tprint('Press Ctrl+C to stop');

  const UPDATE_INTERVAL = 60000; // 1 minute

  while (true) {
    try {
      // Perform network update
      const state = updateNetworkState(ns);

      // Log summary
      ns.print(`[${new Date().toLocaleTimeString()}] Network update complete`);
      ns.print(`  Servers: ${state.rootedServers.length}/${state.allServers.length} rooted`);
      ns.print(`  RAM: ${state.totalRamAvailable.toFixed(2)} GB available`);

      // Wait before next update
      await ns.sleep(UPDATE_INTERVAL);

    } catch (error) {
      ns.tprint(`ERROR in daemon loop: ${error}`);
      await ns.sleep(5000);
    }
  }
}

/**
 * Main function - run all examples
 */
export async function main(ns: NS): Promise<void> {
  const args = ns.args;

  if (args.length === 0) {
    ns.tprint('Network Manager Examples');
    ns.tprint('');
    ns.tprint('Usage: run network-manager-example.ts [example_number]');
    ns.tprint('');
    ns.tprint('Available examples:');
    ns.tprint('  1 - Basic network scan and update');
    ns.tprint('  2 - Conditional update (check if needed)');
    ns.tprint('  3 - Manual root attempts');
    ns.tprint('  4 - Script distribution');
    ns.tprint('  5 - Find best hack targets');
    ns.tprint('  6 - Monitor network changes');
    ns.tprint('  7 - Network statistics');
    ns.tprint('  8 - Daemon mode (continuous monitoring)');
    return;
  }

  const exampleNum = args[0] as number;

  switch (exampleNum) {
    case 1:
      await example1_basicScan(ns);
      break;
    case 2:
      await example2_conditionalUpdate(ns);
      break;
    case 3:
      await example3_manualRoot(ns);
      break;
    case 4:
      await example4_scriptDistribution(ns);
      break;
    case 5:
      await example5_findTargets(ns);
      break;
    case 6:
      await example6_monitorChanges(ns);
      break;
    case 7:
      await example7_networkStats(ns);
      break;
    case 8:
      await example8_daemonMode(ns);
      break;
    default:
      ns.tprint(`Unknown example: ${exampleNum}`);
  }
}
