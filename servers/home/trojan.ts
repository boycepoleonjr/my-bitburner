// autoroot.ts - Automatically root all servers in the network
// ---------------------------------------------------------------
// This script will:
//  1. Gather all servers in the network using BFS (avoiding duplicates).
//  2. Attempt to open every port the server requires using available exploits.
//  3. Nuke the server if enough ports are opened, and repeat indefinitely.
//  4. Sleeps 1 second every iteration, allowing for new exploits or hacking levels.
//
// Usage: run autoroot.js [--help] [--debug]
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

  // Clear logs and keep this script’s tail window open
  ns.disableLog("ALL");
  ns.clearLog();
  if (flags.debug) ns.ui.openTail();

  // Prepare port openers
  let portOpeners = [
    { file: "BruteSSH.exe", exists: ns.fileExists("BruteSSH.exe", "home"), fn: ns.brutessh },
    { file: "FTPCrack.exe", exists: ns.fileExists("FTPCrack.exe", "home"), fn: ns.ftpcrack },
    { file: "relaySMTP.exe", exists: ns.fileExists("relaySMTP.exe", "home"), fn: ns.relaysmtp },
    { file: "HTTPWorm.exe", exists: ns.fileExists("HTTPWorm.exe", "home"), fn: ns.httpworm },
    { file: "SQLInject.exe", exists: ns.fileExists("SQLInject.exe", "home"), fn: ns.sqlinject }
  ];

  let loopCount = 0;
  // Run until all servers are rooted then kill script
  while (true) {
    if (flags.debug) ns.print(`\n[DEBUG] Loop ${++loopCount}`)
    // Warn if any openers are missing
    for (let { file, exists } of portOpeners) {
      // refresh exists
      exists = ns.fileExists(file, "home");

      if (!exists) {
        ns.print(`[INFO] Missing exploit: ${file}.`);
      } else {
        ns.print(`[INFO] Found exploit: ${file}.`);
        // update portOpeners
        portOpeners = portOpeners.map(opener => opener.file === file ? { ...opener, exists } : opener);
      }
    }

    // Gather a list of all servers in the network
    const allNodes: string[] = [...scanNetwork(ns)];
    ns.print(`[INFO] Total Node Count: ${allNodes.length}\n`);

    // Identify servers that don’t have root
    let unrootedNodes = allNodes.filter(node => !ns.hasRootAccess(node));
    ns.print(`[INFO] Unrooted: ${unrootedNodes.length} nodes of ${allNodes.length}`);
    let rootedAny = false; // Track if we root anything this pass

    for (const node of [...unrootedNodes]) {
      const portsRequired = ns.getServerNumPortsRequired(node);

      // Open as many ports as possible with available exploits
      let portsOpened = 0;
      for (const opener of portOpeners) {
        if (opener.exists) {
          try {
            opener.fn(node);
            portsOpened++;
          } catch (err) {
            // If an exploit fails for some reason, just log it in debug mode
            if (flags.debug) ns.print(`[DEBUG] Exploit error on ${node}: ${err}`);
          }
        }
      }

      if (flags.debug) {
        ns.print(`[DEBUG] ${node}: ${portsOpened} of ${portsRequired}`);
      }

      // Nuke if enough ports are opened
      if (portsOpened >= portsRequired) {
        try {
          ns.nuke(node);
          ns.print(`[INFO] Rooted ${node}`);
          ns.toast(`Rooted ${node}`, "success", 5000);
          // Remove from the unrooted list
          unrootedNodes = unrootedNodes.filter(n => n !== node);
          rootedAny = true;
          // deploy tools to the newly rooted node
          if (ns.getServerMaxRam(node) > 0) {
            ns.scp(["hack.js", "grow.js", "weaken.js"], node, "home");
          }
        } catch (err) {
          ns.print(`[WARN] Failed to NUKE ${node}: ${err}`);
        }
      }
    }

    // Sleep 1 second every loop iteration before retrying
    await ns.sleep(1000);

    // Update unrooted node list in case root access changed outside this script
    unrootedNodes = unrootedNodes.filter(n => !ns.hasRootAccess(n));

    if (flags.debug) {
      ns.print(`[DEBUG] Still unrooted: ${unrootedNodes.join(", ") || "None"}`);
    }

    if (unrootedNodes.length === 0) {
      break;
    }
  }

  ns.print("[INFO] ✅ All nodes have been rooted! 🎉");
  await ns.sleep(500);
  ns.ui.closeTail();
  ns.alert("[INFO] ✅ Trojan execution loop complete.");
  ns.toast("✅ All nodes have been rooted! 🎉", "success", 5000);
}

/** Scan the network and collect all servers using a BFS approach to avoid duplicates */
function scanNetwork(ns: NS): Set<string> {
  const visited: Set<string> = new Set();
  const queue: string[] = ["home"]; // Start scanning from "home"

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (!visited.has(current)) {
      visited.add(current);
      // Scan neighbors, excluding the current server to reduce duplicates
      const neighbors = ns.scan(current).filter(n => n !== current);
      queue.push(...neighbors);
    }
  }
  return visited;
}
