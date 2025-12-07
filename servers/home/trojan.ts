// autoroot.ts - Automatically root all servers in the network
// ---------------------------------------------------------------
// This script will:
//  1. Gather all servers in the network using BFS (avoiding duplicates).
//  2. Attempt to open every port the server requires using available exploits.
//  3. Nuke the server if enough ports are opened, and repeat indefinitely.
//  4. Sleeps 1 second every iteration, allowing for new exploits or hacking levels.
//
// Usage: run autoroot.js [--help] [--debug]
// VERSION: 2.0.0
// LAST UPDATED: 2025-12-03
//
// CHANGELOG:
// - v2.0.0: Performance optimizations - reduced memory allocations, optimized port opener checks,
//           track deployed workers to avoid redundant scp operations, check hacking level requirements
// ---------------------------------------------------------------
export async function main(ns: NS): Promise<void> {
  const flags = ns.flags([
    ["help", false],
    ["debug", false],
  ]);

  if (flags.help) {
    ns.tprint("This script automatically tries to root all servers in the network.");
    ns.tprint(`Usage: run ${ns.getScriptName()} [--help] [--debug]`);
    return;
  }

  // Clear logs and keep this script's tail window open
  ns.disableLog("ALL");
  ns.clearLog();
  if (flags.debug) ns.ui.openTail();

  // Prepare port openers
  const portOpeners = [
    { file: "BruteSSH.exe", fn: ns.brutessh },
    { file: "FTPCrack.exe", fn: ns.ftpcrack },
    { file: "relaySMTP.exe", fn: ns.relaysmtp },
    { file: "HTTPWorm.exe", fn: ns.httpworm },
    { file: "SQLInject.exe", fn: ns.sqlinject }
  ];

  // Track which servers have worker scripts deployed
  const deployedWorkers = new Set<string>();
  const workerScripts = ["hack.js", "grow.js", "weaken.js"];

  let loopCount = 0;
  // Run until all servers are rooted then kill script
  while (true) {
    if (flags.debug) ns.print(`\n[DEBUG] Loop ${++loopCount}`)

    // Check available exploits once per loop
    const availableOpeners = portOpeners.filter(opener => ns.fileExists(opener.file, "home"));

    if (flags.debug) {
      for (const opener of portOpeners) {
        const exists = availableOpeners.some(o => o.file === opener.file);
        ns.print(`[INFO] ${exists ? "Found" : "Missing"} exploit: ${opener.file}`);
      }
    }

    // Gather a list of all servers in the network
    const allNodes = scanNetwork(ns);
    ns.print(`[INFO] Total Node Count: ${allNodes.size}\n`);

    // Identify servers that don't have root
    const unrootedNodes: string[] = [];
    for (const node of allNodes) {
      if (!ns.hasRootAccess(node)) {
        unrootedNodes.push(node);
      }
    }

    ns.print(`[INFO] Unrooted: ${unrootedNodes.length} nodes of ${allNodes.size}`);

    if (unrootedNodes.length === 0) {
      break;
    }

    const playerHackLevel = ns.getHackingLevel();

    for (const node of unrootedNodes) {
      const requiredHackLevel = ns.getServerRequiredHackingLevel(node);

      // Skip if we don't meet hacking level requirement
      if (playerHackLevel < requiredHackLevel) {
        if (flags.debug) {
          ns.print(`[DEBUG] ${node}: Requires hack level ${requiredHackLevel} (current: ${playerHackLevel})`);
        }
        continue;
      }

      const portsRequired = ns.getServerNumPortsRequired(node);

      // Open as many ports as possible with available exploits
      let portsOpened = 0;
      for (const opener of availableOpeners) {
        try {
          opener.fn(node);
          portsOpened++;
        } catch (err) {
          // If an exploit fails for some reason, just log it in debug mode
          if (flags.debug) ns.print(`[DEBUG] Exploit error on ${node}: ${err}`);
        }
      }

      if (flags.debug) {
        ns.print(`[DEBUG] ${node}: ${portsOpened} of ${portsRequired} ports`);
      }

      // Nuke if enough ports are opened
      if (portsOpened >= portsRequired) {
        try {
          ns.nuke(node);
          ns.print(`[INFO] Rooted ${node}`);
          ns.toast(`Rooted ${node}`, "success", 5000);

          // Deploy worker scripts to newly rooted node (only if not already deployed)
          if (!deployedWorkers.has(node) && ns.getServerMaxRam(node) > 0) {
            await ns.scp(workerScripts, node, "home");
            deployedWorkers.add(node);
          }
        } catch (err) {
          ns.print(`[WARN] Failed to NUKE ${node}: ${err}`);
        }
      }
    }

    // Sleep 1 second every loop iteration before retrying
    await ns.sleep(1000);
  }

  ns.print("[INFO] ✅ All nodes have been rooted! 🎉");
  await ns.sleep(500);
  ns.ui.closeTail();
  ns.alert("[INFO] ✅ Trojan execution loop complete.");
  ns.toast("✅ All nodes have been rooted! 🎉", "success", 5000);
}

/** Scan the network and collect all servers using a BFS approach to avoid duplicates */
function scanNetwork(ns: NS): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = ["home"]; // Start scanning from "home"

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (!visited.has(current)) {
      visited.add(current);
      // Scan neighbors and add unvisited ones to queue
      const neighbors = ns.scan(current);
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }
  }
  return visited;
}
