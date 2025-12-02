export async function main(ns: NS): Promise<void> {
  const servers = scanNetwork(ns);
  for (const server of servers) {
    ns.killall(server, true);
  }
  await ns.sleep(1000); // Wait for a second to ensure all scripts are killed
  ns.alert("All servers have been cleared of scripts.");
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
