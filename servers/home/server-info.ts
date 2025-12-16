/**
 * Server Information Utility
 * VERSION: 1.0.0
 * LAST UPDATED: 2025-12-15
 * 
 * Provides server ranking and classification functionality.
 * Distinguishes between utility nodes (can run scripts) and target nodes (can only be hacked).
 * 
 * Exports:
 *   - getServerRankings(ns): Returns ranked list of all servers with utility classification
 * 
 * Usage: 
 *   run server-info.ts        - Display ranked list of all servers
 *   run server-info.ts [N]    - Show top N servers (default: all)
 */

export interface ServerInfo {
  name: string;
  maxRam: number;
  rank: number;
  isUtilityNode: boolean;
}

interface ServerRanking {
  hostname: string;
  maxRam: number;
  usedRam: number;
  availableRam: number;
  hasRoot: boolean;
  isPurchased: boolean;
  ramUtilization: number;
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
 * Get ranked server information for all servers in the network.
 * Returns array of ServerInfo objects sorted by max RAM (descending).
 * 
 * @param ns - Netscript API instance
 * @returns Array of ServerInfo objects with name, maxRam, rank, and isUtilityNode
 */
export function getServerRankings(ns: NS): ServerInfo[] {
  const allServers = scanNetwork(ns);
  const rankings: ServerRanking[] = [];

  // Collect server information
  for (const hostname of allServers) {
    try {
      const server = ns.getServer(hostname);
      const maxRam = server.maxRam || 0;
      const usedRam = server.ramUsed || 0;
      const availableRam = maxRam - usedRam;
      const hasRoot = server.hasAdminRights || false;
      const isPurchased = server.purchasedByPlayer || false;
      const ramUtilization = maxRam > 0 ? (usedRam / maxRam) * 100 : 0;

      rankings.push({
        hostname,
        maxRam,
        usedRam,
        availableRam,
        hasRoot,
        isPurchased,
        ramUtilization
      });
    } catch (error) {
      // Skip servers we can't access
      continue;
    }
  }

  // Sort by max RAM (descending), then by available RAM (descending)
  rankings.sort((a, b) => {
    if (b.maxRam !== a.maxRam) {
      return b.maxRam - a.maxRam;
    }
    return b.availableRam - a.availableRam;
  });

  // Convert to ServerInfo format
  return rankings.map((ranking, index) => ({
    name: ranking.hostname,
    maxRam: ranking.maxRam,
    rank: index + 1,
    isUtilityNode: ranking.hasRoot && ranking.maxRam > 0 // Utility node = can run scripts
  }));
}

/**
 * Format RAM value for display
 */
function formatRam(gb: number): string {
  if (gb >= 1000) {
    return `${(gb / 1000).toFixed(2)}TB`;
  } else if (gb >= 1) {
    return `${gb.toFixed(2)}GB`;
  } else {
    return `${(gb * 1024).toFixed(0)}MB`;
  }
}

/**
 * Display ranked server list (for standalone execution)
 */
function displayRankings(ns: NS, rankings: ServerRanking[], limit?: number): void {
  ns.clearLog();
  
  const displayRankings = limit ? rankings.slice(0, limit) : rankings;
  const totalServers = rankings.length;
  const totalMaxRam = rankings.reduce((sum, r) => sum + r.maxRam, 0);
  const totalAvailableRam = rankings.reduce((sum, r) => sum + r.availableRam, 0);
  const utilityNodes = rankings.filter(r => r.hasRoot && r.maxRam > 0).length;
  const targetNodes = rankings.filter(r => !(r.hasRoot && r.maxRam > 0)).length;

  ns.print('═══════════════════════════════════════════════════════════════════════════════');
  ns.print('   SERVER RAM RANKING - NETWORK-WIDE RESOURCE ANALYSIS');
  ns.print('═══════════════════════════════════════════════════════════════════════════════');
  ns.print('');
  ns.print(`Total Servers: ${totalServers} | Utility Nodes: ${utilityNodes} | Target Nodes: ${targetNodes}`);
  ns.print(`Total Max RAM: ${formatRam(totalMaxRam)} | Available RAM: ${formatRam(totalAvailableRam)}`);
  ns.print('');

  if (displayRankings.length === 0) {
    ns.print('No servers found.');
    return;
  }

  // Header
  ns.print('Rank | Server Name'.padEnd(25) + ' | Max RAM'.padEnd(12) + ' | Available'.padEnd(12) + ' | Used %'.padEnd(10) + ' | Type');
  ns.print('─'.repeat(90));

  // Display each server
  displayRankings.forEach((server, index) => {
    const rank = (index + 1).toString().padStart(4);
    const hostname = server.hostname.padEnd(23);
    const maxRamStr = formatRam(server.maxRam).padEnd(10);
    const availRamStr = formatRam(server.availableRam).padEnd(10);
    const utilizationStr = server.maxRam > 0 
      ? `${server.ramUtilization.toFixed(1)}%`.padEnd(8)
      : 'N/A'.padEnd(8);
    
    const isUtilityNode = server.hasRoot && server.maxRam > 0;
    let type = '';
    if (server.isPurchased) {
      type = '🛒 PURCHASED';
    } else if (isUtilityNode) {
      type = '⚙️ UTILITY';
    } else if (server.maxRam === 0) {
      type = '🎯 TARGET (NO RAM)';
    } else if (!server.hasRoot) {
      type = '🎯 TARGET (NEEDS ROOT)';
    } else {
      type = '🎯 TARGET';
    }

    ns.print(`${rank} | ${hostname} | ${maxRamStr} | ${availRamStr} | ${utilizationStr} | ${type}`);
  });

  if (limit && rankings.length > limit) {
    ns.print('');
    ns.print(`... and ${rankings.length - limit} more servers (run without limit to see all)`);
  }

  ns.print('');
  ns.print('═══════════════════════════════════════════════════════════════════════════════');
  ns.print('LEGEND:');
  ns.print('═══════════════════════════════════════════════════════════════════════════════');
  ns.print('⚙️ UTILITY NODE: Can run scripts (has RAM + root access)');
  ns.print('🎯 TARGET NODE: Can only be hacked/grown/weakened (no RAM or no root)');
  ns.print('🛒 PURCHASED: Player-purchased server');
}

/**
 * Collect detailed server rankings for display (internal use)
 */
function collectServerRankings(ns: NS, allServers: string[]): ServerRanking[] {
  const rankings: ServerRanking[] = [];

  for (const hostname of allServers) {
    try {
      const server = ns.getServer(hostname);
      const maxRam = server.maxRam || 0;
      const usedRam = server.ramUsed || 0;
      const availableRam = maxRam - usedRam;
      const hasRoot = server.hasAdminRights || false;
      const isPurchased = server.purchasedByPlayer || false;
      const ramUtilization = maxRam > 0 ? (usedRam / maxRam) * 100 : 0;

      rankings.push({
        hostname,
        maxRam,
        usedRam,
        availableRam,
        hasRoot,
        isPurchased,
        ramUtilization
      });
    } catch (error) {
      // Skip servers we can't access
      continue;
    }
  }

  // Sort by max RAM (descending), then by available RAM (descending)
  rankings.sort((a, b) => {
    if (b.maxRam !== a.maxRam) {
      return b.maxRam - a.maxRam;
    }
    return b.availableRam - a.availableRam;
  });

  return rankings;
}

/**
 * Main execution (for standalone use)
 */
export async function main(ns: NS): Promise<void> {
  ns.disableLog("scan");
  ns.disableLog("getServer");
  ns.clearLog();
  ns.ui.openTail();

  // Get limit from args if provided
  const limitArg = ns.args[0] as number | undefined;
  const limit = limitArg && limitArg > 0 ? Math.floor(limitArg) : undefined;

  ns.print('Scanning network...');
  
  // Step 1: Scan network
  const allServers = scanNetwork(ns);
  ns.print(`Found ${allServers.length} servers`);

  // Step 2: Collect rankings
  ns.print('Collecting server information...');
  const rankings = collectServerRankings(ns, allServers);

  // Step 3: Display results
  displayRankings(ns, rankings, limit);
}

