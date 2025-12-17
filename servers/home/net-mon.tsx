/**
 * Network Monitor Display
 * React-based real-time network monitoring with black & green terminal aesthetic
 * 
 * Usage:
 *   run network-monitor.tsx [interval]  - Start monitor (default 5000ms interval)
 * 
 * @arg {number} interval - Refresh interval in ms (default: 5000)
 */

// @ts-ignore import React from "react";
declare const React: any;

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

let nsRef: NS;

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
        securityDelta,
      });
    } catch (error) {
      continue;
    }
  }

  monitorData.sort((a, b) => a.hostname.localeCompare(b.hostname));
  return monitorData;
}

/**
 * Format money value for display
 */
function formatMoney(amount: number): string {
  if (amount >= 1e12) return `$${(amount / 1e12).toFixed(2)}T`;
  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(2)}M`;
  if (amount >= 1e3) return `$${(amount / 1e3).toFixed(2)}K`;
  return `$${amount.toFixed(0)}`;
}

// ═══════════════════════════════════════════════════════════════
// THEME COLORS - Terminal Green on Black
// ═══════════════════════════════════════════════════════════════
const THEME = {
  bg: '#000000',
  bgDark: '#0a0a0a',
  bgPanel: '#001a00',
  primary: '#00ff41',      // Bright terminal green
  secondary: '#00cc33',    // Medium green
  tertiary: '#008822',     // Darker green
  dim: '#004411',          // Very dim green
  text: '#00ff41',
  textDim: '#00aa2a',
  border: '#00ff41',
  borderDim: '#004411',
  success: '#00ff41',
  warning: '#33ff33',
  danger: '#00aa00',
  scanline: 'rgba(0, 255, 65, 0.03)',
};

/**
 * Individual Server Card Component
 */
function ServerCard({ server }: { server: ServerMonitorData }) {
  const rootColor = server.hasRoot ? THEME.success : THEME.dim;
  const moneyColor =
    server.moneyPercent > 90
      ? THEME.primary
      : server.moneyPercent > 50
      ? THEME.secondary
      : THEME.tertiary;
  const securityColor =
    server.securityDelta > 5
      ? THEME.tertiary
      : server.securityDelta > 1
      ? THEME.secondary
      : THEME.primary;

  return (
    <div
      style={{
        border: `1px solid ${THEME.borderDim}`,
        backgroundColor: THEME.bgPanel,
        padding: '12px',
        marginBottom: '4px',
        boxShadow: `0 0 8px ${THEME.dim}`,
      }}
    >
      {/* Server Name Header */}
      <div
        style={{
          fontWeight: 'bold',
          fontSize: '14px',
          color: THEME.primary,
          marginBottom: '8px',
          borderBottom: `1px solid ${THEME.borderDim}`,
          paddingBottom: '6px',
          textShadow: `0 0 10px ${THEME.primary}`,
          letterSpacing: '1px',
        }}
      >
        {'> '}{server.hostname}
        <span style={{ color: rootColor, marginLeft: '12px', fontSize: '11px' }}>
          [{server.hasRoot ? 'ROOT' : 'LOCKED'}]
        </span>
      </div>

      {/* Stats Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '8px',
          fontSize: '11px',
          fontFamily: 'monospace',
        }}
      >
        {/* Hacking Level */}
        <div style={{ color: THEME.textDim }}>
          <span style={{ color: THEME.tertiary }}>HACK_LVL:</span>{' '}
          <span style={{ color: THEME.primary }}>{server.requiredHackLevel}</span>
        </div>

        {/* Money */}
        <div style={{ color: THEME.textDim }}>
          <span style={{ color: THEME.tertiary }}>FUNDS:</span>{' '}
          {server.moneyMax > 0 ? (
            <>
              <span style={{ color: THEME.secondary }}>
                {formatMoney(server.moneyAvailable)}
              </span>
              <span style={{ color: THEME.dim }}>/</span>
              <span style={{ color: THEME.tertiary }}>
                {formatMoney(server.moneyMax)}
              </span>{' '}
              <span style={{ color: moneyColor }}>
                [{server.moneyPercent.toFixed(1)}%]
              </span>
            </>
          ) : (
            <span style={{ color: THEME.dim }}>N/A</span>
          )}
        </div>

        {/* Security */}
        <div style={{ color: THEME.textDim }}>
          <span style={{ color: THEME.tertiary }}>SEC:</span>{' '}
          <span style={{ color: securityColor }}>
            {server.securityLevel.toFixed(1)}
          </span>
          <span style={{ color: THEME.dim }}>/</span>
          <span style={{ color: THEME.tertiary }}>{server.minSecurityLevel.toFixed(1)}</span>
          {server.securityDelta > 0.1 && (
            <span style={{ color: THEME.warning }}>
              {' '}+{server.securityDelta.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Network Monitor React Component
 */
function NetworkMonitorUI({ interval }: { interval: number }) {
  const [servers, setServers] = React.useState([] as ServerMonitorData[]);
  const [lastUpdate, setLastUpdate] = React.useState(new Date());
  const [playerMoney, setPlayerMoney] = React.useState(0);
  const [hackingLevel, setHackingLevel] = React.useState(0);

  React.useEffect(() => {
    const updateServers = () => {
      try {
        const allServers = scanNetwork(nsRef);
        const monitorData = collectMonitorData(nsRef, allServers);
        setServers(monitorData);
        setLastUpdate(new Date());
        setPlayerMoney(nsRef.getPlayer().money);
        setHackingLevel(nsRef.getHackingLevel());
      } catch (error) {
        // Silently handle errors
      }
    };

    updateServers();
    const updateInterval = setInterval(updateServers, interval);
    return () => clearInterval(updateInterval);
  }, [interval]);

  const rootedCount = servers.filter(s => s.hasRoot).length;
  const totalMoney = servers.reduce((sum, s) => sum + s.moneyAvailable, 0);

  return (
    <div
      style={{
        fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", monospace',
        fontSize: '12px',
        color: THEME.text,
        backgroundColor: THEME.bg,
        padding: '16px',
        minHeight: '100vh',
        position: 'relative',
        backgroundImage: `
          repeating-linear-gradient(
            0deg,
            ${THEME.scanline} 0px,
            ${THEME.scanline} 1px,
            transparent 1px,
            transparent 2px
          )
        `,
      }}
    >
      {/* ASCII Header */}
      <div
        style={{
          textAlign: 'center',
          marginBottom: '16px',
          color: THEME.primary,
          textShadow: `0 0 20px ${THEME.primary}, 0 0 40px ${THEME.secondary}`,
          whiteSpace: 'pre',
          fontFamily: 'monospace',
          fontSize: '10px',
          lineHeight: 1.2,
        }}
      >
{`
╔═══════════════════════════════════════════════════════════════════╗
║  ███╗   ██╗███████╗████████╗██╗    ██╗ ██████╗ ██████╗ ██╗  ██╗   ║
║  ████╗  ██║██╔════╝╚══██╔══╝██║    ██║██╔═══██╗██╔══██╗██║ ██╔╝   ║
║  ██╔██╗ ██║█████╗     ██║   ██║ █╗ ██║██║   ██║██████╔╝█████╔╝    ║
║  ██║╚██╗██║██╔══╝     ██║   ██║███╗██║██║   ██║██╔══██╗██╔═██╗    ║
║  ██║ ╚████║███████╗   ██║   ╚███╔███╔╝╚██████╔╝██║  ██║██║  ██╗   ║
║  ╚═╝  ╚═══╝╚══════╝   ╚═╝    ╚══╝╚══╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝   ║
║                     M O N I T O R                                 ║
╚═══════════════════════════════════════════════════════════════════╝
`}
      </div>

      {/* Status Bar */}
      <div
        style={{
          marginBottom: '16px',
          padding: '12px',
          border: `1px solid ${THEME.border}`,
          backgroundColor: THEME.bgPanel,
          boxShadow: `0 0 15px ${THEME.dim}, inset 0 0 30px ${THEME.bgDark}`,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          fontSize: '11px',
        }}
      >
        <div>
          <span style={{ color: THEME.tertiary }}>NODES_SCANNED:</span>{' '}
          <span style={{ color: THEME.primary, textShadow: `0 0 8px ${THEME.primary}` }}>
            {servers.length}
          </span>
        </div>
        <div>
          <span style={{ color: THEME.tertiary }}>ROOT_ACCESS:</span>{' '}
          <span style={{ color: THEME.primary, textShadow: `0 0 8px ${THEME.primary}` }}>
            {rootedCount}/{servers.length}
          </span>
        </div>
        <div>
          <span style={{ color: THEME.tertiary }}>PLAYER_FUNDS:</span>{' '}
          <span style={{ color: THEME.primary, textShadow: `0 0 8px ${THEME.primary}` }}>
            {formatMoney(playerMoney)}
          </span>
        </div>
        <div>
          <span style={{ color: THEME.tertiary }}>HACK_SKILL:</span>{' '}
          <span style={{ color: THEME.primary, textShadow: `0 0 8px ${THEME.primary}` }}>
            {hackingLevel}
          </span>
        </div>
        <div>
          <span style={{ color: THEME.tertiary }}>NETWORK_WEALTH:</span>{' '}
          <span style={{ color: THEME.secondary }}>
            {formatMoney(totalMoney)}
          </span>
        </div>
        <div>
          <span style={{ color: THEME.tertiary }}>LAST_SCAN:</span>{' '}
          <span style={{ color: THEME.textDim }}>
            {lastUpdate.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Refresh Indicator */}
      <div
        style={{
          marginBottom: '12px',
          fontSize: '10px',
          color: THEME.dim,
          textAlign: 'right',
        }}
      >
        [REFRESH_INTERVAL: {interval}ms] [STATUS: ACTIVE]
      </div>

      {/* Server List */}
      {servers.length === 0 ? (
        <div
          style={{
            border: `1px solid ${THEME.border}`,
            padding: '40px',
            textAlign: 'center',
            color: THEME.secondary,
            backgroundColor: THEME.bgPanel,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        >
          {'>>> SCANNING NETWORK...'}
        </div>
      ) : (
        <div>
          {servers.map((server, idx) => (
            <ServerCard key={`${server.hostname}-${idx}`} server={server} />
          ))}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          marginTop: '16px',
          padding: '8px',
          borderTop: `1px solid ${THEME.borderDim}`,
          fontSize: '10px',
          color: THEME.dim,
          textAlign: 'center',
        }}
      >
        [CTRL+C TO TERMINATE] [NETWORK MONITOR v1.0]
      </div>
    </div>
  );
}

/**
 * Main execution
 */
export async function main(ns: NS): Promise<void> {
  nsRef = ns;
  const interval = (ns.args[0] as number) || 5000;
  
  ns.disableLog('ALL');
  ns.clearLog();
  ns.ui.openTail();

  ns.printRaw(<NetworkMonitorUI interval={interval} />);

  // Keep the script alive so the React component remains mounted
  while (true) {
    await ns.asleep(60000);
  }
}
