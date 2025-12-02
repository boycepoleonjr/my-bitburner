/**
 * Interactive server map scanner
 * @param ns - Netscript API
 */
export function main(ns: NS): void {
  const factionServers = new Set<string>([
    "CSEC",
    "avmnite-02h",
    "I.I.I.I",
    "run4theh111z",
    "w0r1d_d43m0n",
    "fulcrumassets"
  ]);

  const css = `    <style id="scanCSS">
        .serverscan {white-space:pre; color:#ccc; font:14px monospace; line-height: 16px; }
        .serverscan .server {color:#080;cursor:pointer;text-decoration:underline}
        .serverscan .faction {color:#088}
        .serverscan .rooted {color:#6f3}
        .serverscan .rooted.faction {color:#0ff}
        .serverscan .rooted::before {color:#6f3}
        .serverscan .hack {display:inline-block; font:12px monospace}
        .serverscan .red {color:red;}
        .serverscan .green {color:green;}
        .serverscan .backdoor {color:#6f3; font:12px monospace}
        .serverscan .backdoor > a {cursor:pointer; text-decoration:underline;}
        .serverscan .cct {color:#0ff;}
    </style>`;

  // DOM manipulation - game-specific document object
  const doc = eval("document") as Document;
  const terminalInsert = (html: string): void => {
    const terminal = doc.getElementById("terminal");
    if (terminal) {
      terminal.insertAdjacentHTML('beforeend', `<li>${html}</li>`);
    }
  };

  const terminalInput = doc.getElementById("terminal-input") as HTMLInputElement;
  if (!terminalInput) return;

  const terminalEventHandlerKey = Object.keys(terminalInput)[1] as string;
  const setNavCommand = async (inputValue: string): Promise<void> => {
    terminalInput.value = inputValue;
    const handler = (terminalInput as any)[terminalEventHandlerKey];
    if (handler?.onChange) {
      handler.onChange({ target: terminalInput });
    }
    terminalInput.focus();
    if (handler?.onKeyDown) {
      await handler.onKeyDown({ key: 'Enter', preventDefault: () => 0 });
    }
  };

  const myHackLevel = ns.getHackingLevel();

  // Cache server info to avoid repeated getServer calls
  const serverInfoCache = new Map<string, Server>();
  const getServerInfo = (serverName: string): Server => {
    if (!serverInfoCache.has(serverName)) {
      serverInfoCache.set(serverName, ns.getServer(serverName));
    }
    return serverInfoCache.get(serverName)!;
  };

  const createServerEntry = (serverName: string): string => {
    const server = getServerInfo(serverName);
    const requiredHackLevel = server.requiredHackingSkill;
    const rooted = server.hasAdminRights;
    const canHack = requiredHackLevel <= myHackLevel;
    const shouldBackdoor = !server.backdoorInstalled &&
      canHack &&
      serverName !== 'home' &&
      rooted &&
      !server.purchasedByPlayer;
    const contracts = ns.ls(serverName, ".cct");

    const serverClass = `server${factionServers.has(serverName) ? " faction" : ""}${rooted ? " rooted" : ""}`;
    const hackLevelDisplay = server.purchasedByPlayer
      ? ''
      : ` <span class="hack ${canHack ? 'green' : 'red'}">(${requiredHackLevel})</span>`;
    const backdoorDisplay = shouldBackdoor
      ? ' <span class="backdoor">[<a>backdoor</a>]</span>'
      : '';
    const contractDisplay = contracts.map(c => `<span class="cct" title="${c}">@</span>`).join('');

    return `<span id="${serverName}">` +
      `<a class="${serverClass}">${serverName}</a>` +
      hackLevelDisplay +
      backdoorDisplay +
      ` ${contractDisplay}` +
      "</span>";
  };

  const buildOutput = (parent: string = servers[0], prefix: string[] = ["\n"]): string => {
    let output = prefix.join("") + createServerEntry(parent);

    for (let i = 0; i < servers.length; i++) {
      if (parentByIndex[i] !== parent) continue;

      const newPrefix = [...prefix];
      const appearsAgain = parentByIndex.slice(i + 1).includes(parentByIndex[i]);
      const lastElementIndex = newPrefix.length - 1;

      newPrefix.push(appearsAgain ? "├╴" : "└╴");
      newPrefix[lastElementIndex] = newPrefix[lastElementIndex]
        .replace("├╴", "│ ")
        .replace("└╴", "  ");

      output += buildOutput(servers[i], newPrefix);
    }

    return output;
  };

  const ordering = (serverA: string, serverB: string): number => {
    // Sort servers with fewer connections towards the top
    const orderNumber = ns.scan(serverA).length - ns.scan(serverB).length;

    if (orderNumber !== 0) return orderNumber;

    // Purchased servers to the very top
    const purchasedDiff = getServerInfo(serverB).purchasedByPlayer
      ? (getServerInfo(serverA).purchasedByPlayer ? 0 : 1)
      : (getServerInfo(serverA).purchasedByPlayer ? -1 : 0);

    if (purchasedDiff !== 0) return purchasedDiff;

    // Hack: compare just the first 2 chars to keep purchased servers in order purchased
    return serverA.slice(0, 2).toLowerCase().localeCompare(serverB.slice(0, 2).toLowerCase());
  };

  // Refresh CSS (in case it changed)
  const existingCSS = doc.getElementById("scanCSS");
  if (existingCSS) {
    existingCSS.remove();
  }
  doc.head.insertAdjacentHTML('beforeend', css);

  // Build server network using BFS
  const servers: string[] = ["home"];
  const parentByIndex: string[] = [""];
  const routes: Record<string, string> = { home: "home" };
  const visited = new Set<string>(["home"]);

  for (let i = 0; i < servers.length; i++) {
    const currentServer = servers[i];
    const neighbors = ns.scan(currentServer).sort(ordering);

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        servers.push(neighbor);
        parentByIndex.push(currentServer);

        const serverInfo = getServerInfo(neighbor);
        const backdoored = serverInfo.backdoorInstalled;
        routes[neighbor] = backdoored
          ? `connect ${neighbor}`
          : `${routes[currentServer]};connect ${neighbor}`;
      }
    }
  }

  terminalInsert(`<div class="serverscan new">${buildOutput()}</div>`);

  // Add click handlers for server navigation
  doc.querySelectorAll(".serverscan.new .server").forEach(serverEntry => {
    const serverName = (serverEntry.childNodes[0] as Text)?.nodeValue;
    if (serverName && routes[serverName]) {
      serverEntry.addEventListener('click', () => setNavCommand(routes[serverName]));
    }
  });

  // Add click handlers for backdoor buttons
  doc.querySelectorAll(".serverscan.new .backdoor").forEach(backdoorButton => {
    const parentSpan = backdoorButton.parentElement;
    const serverSpan = parentSpan?.querySelector('.server');
    const serverName = (serverSpan?.childNodes[0] as Text)?.nodeValue;
    if (serverName && routes[serverName]) {
      backdoorButton.addEventListener('click', () =>
        setNavCommand(`${routes[serverName]};backdoor`));
    }
  });

  const scanElement = doc.querySelector(".serverscan.new");
  if (scanElement) {
    scanElement.classList.remove("new");
  }
}

