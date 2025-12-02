// @ts-ignore import React from "react";
declare const React: any;

// Import utilities from parent directory
import { readState, formatRam, formatNumber } from '../ns-utils';

let nsRef: NS;

// ==========================================
// TYPE DEFINITIONS
// ==========================================

interface ModuleAllocation {
  moduleName: string;
  priority: number;
  allocatedRam: number;
  servers: string[];
  serverAllocations: Record<string, number>;
}

interface ServerInfo {
  hostname: string;
  maxRam: number;
  usedRam: number;
  availableRam: number;
  isHome: boolean;
  rooted: boolean;
}

interface NetworkState {
  servers: ServerInfo[];
  totalServers: number;
  rootedServers: number;
  totalRam: number;
  usedRam: number;
  availableRam: number;
}

// ==========================================
// COLOR SCHEME
// ==========================================

const MODULE_COLORS: Record<string, string> = {
  'xp-farmer': '#16a34a',      // Green
  'money-farmer': '#2563eb',   // Blue
  'faction-manager': '#9333ea', // Purple
  'batch-coordinator': '#ea580c', // Orange
  'hack-bot': '#0891b2',       // Cyan
  'grow-bot': '#65a30d',       // Lime
  'weaken-bot': '#7c3aed',     // Violet
  'default': '#6b7280'         // Gray
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function getUtilizationColor(utilization: number): string {
  if (utilization < 50) return '#16a34a';      // Green
  if (utilization < 80) return '#f59e0b';      // Yellow
  if (utilization < 95) return '#ea580c';      // Orange
  return '#dc2626';                             // Red
}

function getModuleColor(moduleName: string): string {
  return MODULE_COLORS[moduleName] || MODULE_COLORS['default'];
}

function calculateTotalAllocation(allocations: ModuleAllocation[]): number {
  return allocations.reduce((sum, alloc) => sum + alloc.allocatedRam, 0);
}

function calculateUtilization(used: number, total: number): number {
  return total > 0 ? (used / total) * 100 : 0;
}

function sortServersByRam(servers: ServerInfo[]): ServerInfo[] {
  return [...servers].sort((a, b) => b.maxRam - a.maxRam);
}

function buildNetworkState(ns: NS): NetworkState {
  try {
    // Scan all servers
    const allServers = new Set<string>();
    const scanQueue = ['home'];

    while (scanQueue.length > 0) {
      const current = scanQueue.pop()!;
      if (!allServers.has(current)) {
        allServers.add(current);
        const connected = ns.scan(current);
        scanQueue.push(...connected);
      }
    }

    const servers: ServerInfo[] = [];
    let totalRam = 0;
    let usedRam = 0;
    let rootedCount = 0;

    for (const hostname of allServers) {
      const maxRam = ns.getServerMaxRam(hostname);
      const used = ns.getServerUsedRam(hostname);
      const rooted = ns.hasRootAccess(hostname);

      if (rooted) {
        rootedCount++;
        totalRam += maxRam;
        usedRam += used;
      }

      servers.push({
        hostname,
        maxRam,
        usedRam: used,
        availableRam: maxRam - used,
        isHome: hostname === 'home',
        rooted
      });
    }

    return {
      servers,
      totalServers: allServers.size,
      rootedServers: rootedCount,
      totalRam,
      usedRam,
      availableRam: totalRam - usedRam
    };
  } catch (error) {
    return {
      servers: [],
      totalServers: 0,
      rootedServers: 0,
      totalRam: 0,
      usedRam: 0,
      availableRam: 0
    };
  }
}

// ==========================================
// COMPONENTS
// ==========================================

function ProgressBar({ value, max, color, height = 20 }: { value: number; max: number; color: string; height?: number }) {
  const percentage = max > 0 ? (value / max) * 100 : 0;

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height,
    backgroundColor: '#1f2937',
    borderRadius: 4,
    overflow: 'hidden',
    border: '1px solid #374151'
  };

  const barStyle: React.CSSProperties = {
    height: '100%',
    width: `${Math.min(percentage, 100)}%`,
    backgroundColor: color,
    transition: 'width 0.3s ease'
  };

  return (
    <div style={containerStyle}>
      <div style={barStyle}></div>
    </div>
  );
}

function AllocationBar({ allocations, totalRam }: { allocations: ModuleAllocation[]; totalRam: number }) {
  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: 30,
    backgroundColor: '#1f2937',
    borderRadius: 4,
    overflow: 'hidden',
    display: 'flex',
    border: '1px solid #374151',
    marginBottom: 8
  };

  const totalAllocated = calculateTotalAllocation(allocations);
  const unallocated = Math.max(0, totalRam - totalAllocated);

  return (
    <div>
      <div style={containerStyle}>
        {allocations.map((alloc, idx) => {
          const percentage = totalRam > 0 ? (alloc.allocatedRam / totalRam) * 100 : 0;
          const segmentStyle: React.CSSProperties = {
            width: `${percentage}%`,
            height: '100%',
            backgroundColor: getModuleColor(alloc.moduleName),
            borderRight: idx < allocations.length - 1 ? '1px solid #000' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 600,
            color: '#fff',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          };

          return (
            <div key={alloc.moduleName} style={segmentStyle} title={`${alloc.moduleName}: ${formatRam(alloc.allocatedRam)}`}>
              {percentage > 5 ? alloc.moduleName.substring(0, 8) : ''}
            </div>
          );
        })}
        {unallocated > 0 && totalRam > 0 && (
          <div style={{
            width: `${(unallocated / totalRam) * 100}%`,
            height: '100%',
            backgroundColor: '#374151',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            color: '#9ca3af'
          }}>
            Free
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8, fontSize: 12 }}>
        {allocations.map((alloc) => (
          <div key={alloc.moduleName} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 12,
              height: 12,
              backgroundColor: getModuleColor(alloc.moduleName),
              borderRadius: 2
            }}></div>
            <span style={{ color: '#9ca3af' }}>{alloc.moduleName}:</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>{formatRam(alloc.allocatedRam)}</span>
          </div>
        ))}
        {unallocated > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 12,
              height: 12,
              backgroundColor: '#374151',
              borderRadius: 2
            }}></div>
            <span style={{ color: '#9ca3af' }}>Free:</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>{formatRam(unallocated)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function NetworkSummary({ network }: { network: NetworkState }) {
  const utilization = calculateUtilization(network.usedRam, network.totalRam);
  const utilizationColor = getUtilizationColor(utilization);

  const summaryStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 16,
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#1f2937',
    borderRadius: 6,
    border: '1px solid #374151'
  };

  const statStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  };

  const labelStyle: React.CSSProperties = {
    color: '#9ca3af',
    fontSize: 12
  };

  const valueStyle: React.CSSProperties = {
    color: '#fff',
    fontSize: 18,
    fontWeight: 700
  };

  return (
    <div style={summaryStyle}>
      <div style={statStyle}>
        <div style={labelStyle}>Network</div>
        <div style={valueStyle}>
          {network.totalServers} servers ({network.rootedServers} rooted)
        </div>
      </div>
      <div style={statStyle}>
        <div style={labelStyle}>Total RAM</div>
        <div style={valueStyle}>{formatRam(network.totalRam)}</div>
      </div>
      <div style={statStyle}>
        <div style={labelStyle}>Used RAM</div>
        <div style={valueStyle}>{formatRam(network.usedRam)}</div>
      </div>
      <div style={statStyle}>
        <div style={labelStyle}>Utilization</div>
        <div style={{ ...valueStyle, color: utilizationColor }}>
          {utilization.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

function ModuleTable({ allocations }: { allocations: ModuleAllocation[] }) {
  const [sortBy, setSortBy] = React.useState<'name' | 'priority' | 'ram' | 'servers'>('priority');
  const [sortDesc, setSortDesc] = React.useState(true);

  const sortedAllocations = React.useMemo(() => {
    const sorted = [...allocations];
    sorted.sort((a, b) => {
      let aVal, bVal;
      switch (sortBy) {
        case 'name':
          aVal = a.moduleName;
          bVal = b.moduleName;
          break;
        case 'priority':
          aVal = a.priority;
          bVal = b.priority;
          break;
        case 'ram':
          aVal = a.allocatedRam;
          bVal = b.allocatedRam;
          break;
        case 'servers':
          aVal = a.servers.length;
          bVal = b.servers.length;
          break;
      }
      if (typeof aVal === 'string') {
        return sortDesc ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
      }
      return sortDesc ? bVal - aVal : aVal - bVal;
    });
    return sorted;
  }, [allocations, sortBy, sortDesc]);

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13
  };

  const headerStyle: React.CSSProperties = {
    backgroundColor: '#1f2937',
    color: '#9ca3af',
    textAlign: 'left',
    padding: 10,
    borderBottom: '2px solid #374151',
    fontWeight: 600,
    cursor: 'pointer',
    userSelect: 'none'
  };

  const cellStyle: React.CSSProperties = {
    padding: 10,
    borderBottom: '1px solid #374151',
    color: '#fff'
  };

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortDesc(!sortDesc);
    } else {
      setSortBy(column);
      setSortDesc(true);
    }
  };

  if (allocations.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>
        No module allocations found
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={headerStyle} onClick={() => handleSort('name')}>
              Module {sortBy === 'name' && (sortDesc ? '▼' : '▲')}
            </th>
            <th style={headerStyle} onClick={() => handleSort('priority')}>
              Priority {sortBy === 'priority' && (sortDesc ? '▼' : '▲')}
            </th>
            <th style={headerStyle} onClick={() => handleSort('ram')}>
              Allocated RAM {sortBy === 'ram' && (sortDesc ? '▼' : '▲')}
            </th>
            <th style={headerStyle} onClick={() => handleSort('servers')}>
              Servers {sortBy === 'servers' && (sortDesc ? '▼' : '▲')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedAllocations.map((alloc) => (
            <tr key={alloc.moduleName}>
              <td style={cellStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 10,
                    height: 10,
                    backgroundColor: getModuleColor(alloc.moduleName),
                    borderRadius: 2
                  }}></div>
                  <span style={{ fontWeight: 600 }}>{alloc.moduleName}</span>
                </div>
              </td>
              <td style={cellStyle}>{alloc.priority}</td>
              <td style={cellStyle}>{formatRam(alloc.allocatedRam)}</td>
              <td style={cellStyle}>{alloc.servers.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ServerList({ network }: { network: NetworkState }) {
  const [showAll, setShowAll] = React.useState(false);

  const rootedServers = network.servers.filter(s => s.rooted && s.maxRam > 0);
  const sorted = sortServersByRam(rootedServers);
  const displayed = showAll ? sorted : sorted.slice(0, 10);

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  };

  const serverRowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '200px 1fr 120px',
    gap: 12,
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#1f2937',
    borderRadius: 4,
    border: '1px solid #374151'
  };

  const serverNameStyle: React.CSSProperties = {
    color: '#fff',
    fontWeight: 600,
    fontSize: 13,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  };

  const statsStyle: React.CSSProperties = {
    color: '#9ca3af',
    fontSize: 12
  };

  const toggleStyle: React.CSSProperties = {
    marginTop: 8,
    padding: '8px 16px',
    backgroundColor: '#374151',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600
  };

  if (rootedServers.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>
        No rooted servers with RAM found
      </div>
    );
  }

  return (
    <div>
      <div style={containerStyle}>
        {displayed.map((server) => {
          const utilization = calculateUtilization(server.usedRam, server.maxRam);
          const color = getUtilizationColor(utilization);

          return (
            <div
              key={server.hostname}
              style={{
                ...serverRowStyle,
                border: server.isHome ? '2px solid #2563eb' : '1px solid #374151'
              }}
            >
              <div style={serverNameStyle}>
                {server.hostname}
                {server.isHome && <span style={{ marginLeft: 6, color: '#2563eb' }}>★</span>}
              </div>
              <div>
                <ProgressBar value={server.usedRam} max={server.maxRam} color={color} height={16} />
              </div>
              <div style={statsStyle}>
                {formatRam(server.usedRam)} / {formatRam(server.maxRam)}
                <span style={{ marginLeft: 6, color }}>{utilization.toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>
      {sorted.length > 10 && (
        <button style={toggleStyle} onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show Less' : `Show All (${sorted.length} servers)`}
        </button>
      )}
    </div>
  );
}

// ==========================================
// MAIN COMPONENT
// ==========================================

function ResourceVisualizer() {
  const [allocations, setAllocations] = React.useState<ModuleAllocation[]>([]);
  const [network, setNetwork] = React.useState<NetworkState | null>(null);
  const [lastUpdate, setLastUpdate] = React.useState<Date>(new Date());

  React.useEffect(() => {
    const updateData = () => {
      try {
        // Read allocation state
        const allocationState = readState(nsRef, '/state/resource-allocation.txt', []);
        const parsedAllocations: ModuleAllocation[] = Array.isArray(allocationState)
          ? allocationState
          : [];

        // Build network state from live data
        const networkState = buildNetworkState(nsRef);

        setAllocations(parsedAllocations);
        setNetwork(networkState);
        setLastUpdate(new Date());
      } catch (error) {
        // Silent fail to keep UI alive
      }
    };

    // Initial update
    updateData();

    // Update every second
    const interval = setInterval(updateData, 1000);
    return () => clearInterval(interval);
  }, []);

  const containerStyle: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 14,
    lineHeight: 1.6,
    padding: 16,
    backgroundColor: '#111827',
    color: '#fff',
    minWidth: 800
  };

  const headerStyle: React.CSSProperties = {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 16,
    color: '#fff',
    borderBottom: '2px solid #374151',
    paddingBottom: 8,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  };

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 700,
    marginTop: 20,
    marginBottom: 12,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 1
  };

  const timestampStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: 400
  };

  if (!network) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span>RESOURCE ALLOCATION</span>
        <span style={timestampStyle}>
          Last updated: {lastUpdate.toLocaleTimeString()}
        </span>
      </div>

      <NetworkSummary network={network} />

      <div style={sectionHeaderStyle}>Global Allocation</div>
      <AllocationBar allocations={allocations} totalRam={network.totalRam} />

      <div style={sectionHeaderStyle}>Module Allocations</div>
      <ModuleTable allocations={allocations} />

      <div style={sectionHeaderStyle}>Server Usage</div>
      <ServerList network={network} />
    </div>
  );
}

// ==========================================
// ENTRY POINT
// ==========================================

export async function main(ns: NS) {
  nsRef = ns;
  ns.disableLog('ALL');
  ns.ui.openTail();
  ns.printRaw(<ResourceVisualizer />);

  // Keep script alive
  while (true) {
    await ns.asleep(60000);
  }
}
