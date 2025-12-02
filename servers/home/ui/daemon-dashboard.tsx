/**
 * Daemon Orchestrator Dashboard
 *
 * Real-time dashboard for monitoring the daemon orchestrator including:
 * - Daemon status and uptime
 * - Network resource summary
 * - Module registry with status indicators
 * - Resource allocation overview
 * - Quick actions and command reference
 *
 * Usage: run ui/daemon-dashboard.tsx
 */

// @ts-ignore import React from "react";
declare const React: any;

import { readState, formatRam, formatDuration, formatNumber } from '/ns-utils';

// ============================================================================
// CONSTANTS
// ============================================================================

const DAEMON_STATE_FILE = '/state/daemon-state.txt';
const MODULE_REGISTRY_FILE = '/state/module-registry.txt';
const NETWORK_STATE_FILE = '/state/network-state.txt';
const ALLOCATION_FILE = '/state/resource-allocation.txt';
const UPDATE_INTERVAL = 1000; // 1 second updates

// Color scheme
const COLORS = {
  background: '#111827',
  surface: '#1f2937',
  border: '#374151',
  text: '#e5e5e5',
  textMuted: '#9ca3af',
  textDim: '#6b7280',

  // Status colors
  running: '#16a34a',
  paused: '#f59e0b',
  error: '#dc2626',
  stopped: '#6b7280',
  starting: '#3b82f6',

  // Utilization colors
  utilizationLow: '#16a34a',
  utilizationMed: '#f59e0b',
  utilizationHigh: '#ea580c',
  utilizationCritical: '#dc2626',
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type ModuleLifecycleState = 'stopped' | 'starting' | 'running' | 'paused' | 'error';

interface RegisteredModule {
  name: string;
  scriptPath: string;
  config: any;
  priority: number;
  status: ModuleLifecycleState;
  pid?: number;
  controlPort: number;
  statusPort: number;
  lastStatusUpdate: number;
  ramAllocation: {
    requested: number;
    allocated: number;
    actual: number;
  };
}

interface ModuleRegistry {
  modules: Record<string, RegisteredModule>;
  lastUpdate: number;
}

interface DaemonState {
  isActive: boolean;
  startTime: number;
  lastUpdate: number;
  operationCount?: number;
}

interface NetworkState {
  servers: Array<{
    hostname: string;
    maxRam: number;
    usedRam: number;
    availableRam: number;
    rooted: boolean;
  }>;
  totalServers: number;
  rootedServers: number;
  totalRam: number;
  usedRam: number;
  availableRam: number;
}

interface ResourceAllocation {
  moduleName: string;
  priority: number;
  allocatedRam: number;
  servers: string[];
  serverAllocations: Record<string, number>;
}

// ============================================================================
// GLOBAL NS REFERENCE
// ============================================================================

let nsRef: NS;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get status icon for module lifecycle state
 */
function getStatusIcon(status: ModuleLifecycleState): string {
  switch (status) {
    case 'running': return '●';
    case 'starting': return '◐';
    case 'paused': return '◐';
    case 'error': return '⚠';
    case 'stopped': return '○';
    default: return '?';
  }
}

/**
 * Get color for module status
 */
function getStatusColor(status: ModuleLifecycleState): string {
  switch (status) {
    case 'running': return COLORS.running;
    case 'starting': return COLORS.starting;
    case 'paused': return COLORS.paused;
    case 'error': return COLORS.error;
    case 'stopped': return COLORS.stopped;
    default: return COLORS.textMuted;
  }
}

/**
 * Get status text (uppercase)
 */
function getStatusText(status: ModuleLifecycleState): string {
  return status.toUpperCase();
}

/**
 * Get utilization color based on percentage
 */
function getUtilizationColor(percent: number): string {
  if (percent < 50) return COLORS.utilizationLow;
  if (percent < 80) return COLORS.utilizationMed;
  if (percent < 95) return COLORS.utilizationHigh;
  return COLORS.utilizationCritical;
}

/**
 * Calculate time ago from timestamp
 */
function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ============================================================================
// REACT COMPONENTS
// ============================================================================

/**
 * Daemon Header - Shows daemon status, uptime, and quick stats
 */
function DaemonHeader({ state, moduleCount, networkRam }: {
  state: DaemonState | null;
  moduleCount: number;
  networkRam: number;
}) {
  const headerStyle: React.CSSProperties = {
    padding: '16px',
    borderBottom: `2px solid ${COLORS.border}`,
    backgroundColor: COLORS.surface,
  };

  const titleRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    letterSpacing: '1px',
  };

  const statusBadgeStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 12px',
    borderRadius: 4,
    backgroundColor: state?.isActive ? COLORS.running : COLORS.stopped,
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  };

  const statsRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 16,
    fontSize: 12,
    color: COLORS.textMuted,
  };

  const statStyle: React.CSSProperties = {
    display: 'flex',
    gap: 6,
  };

  const statValueStyle: React.CSSProperties = {
    color: COLORS.text,
    fontWeight: 'bold',
  };

  const uptime = state?.startTime ? formatDuration(Date.now() - state.startTime) : '-';

  return (
    <div style={headerStyle}>
      <div style={titleRowStyle}>
        <div style={titleStyle}>DAEMON ORCHESTRATOR</div>
        <div style={statusBadgeStyle}>
          {state?.isActive ? '● ACTIVE' : '○ STOPPED'}
        </div>
      </div>
      <div style={statsRowStyle}>
        <div style={statStyle}>
          <span>Uptime:</span>
          <span style={statValueStyle}>{uptime}</span>
        </div>
        <div style={statStyle}>
          <span>Modules:</span>
          <span style={statValueStyle}>{moduleCount}</span>
        </div>
        <div style={statStyle}>
          <span>Network RAM:</span>
          <span style={statValueStyle}>{formatRam(networkRam)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Network Summary - Grid showing network statistics
 */
function NetworkSummary({ network }: { network: NetworkState | null }) {
  const containerStyle: React.CSSProperties = {
    padding: '16px',
    borderBottom: `1px solid ${COLORS.border}`,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: 12,
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12,
  };

  const statBoxStyle: React.CSSProperties = {
    padding: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 4,
    border: `1px solid ${COLORS.border}`,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 4,
  };

  const valueStyle: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  };

  if (!network) {
    return (
      <div style={containerStyle}>
        <div style={titleStyle}>NETWORK</div>
        <div style={{ color: COLORS.textMuted, fontSize: 13 }}>No network data available</div>
      </div>
    );
  }

  const utilization = network.totalRam > 0 ? (network.usedRam / network.totalRam) * 100 : 0;
  const utilizationColor = getUtilizationColor(utilization);

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>NETWORK</div>
      <div style={gridStyle}>
        <div style={statBoxStyle}>
          <div style={labelStyle}>Servers</div>
          <div style={valueStyle}>
            {network.totalServers} ({network.rootedServers} rooted)
          </div>
        </div>
        <div style={statBoxStyle}>
          <div style={labelStyle}>Total RAM</div>
          <div style={valueStyle}>{formatRam(network.totalRam)}</div>
        </div>
        <div style={statBoxStyle}>
          <div style={labelStyle}>Used RAM</div>
          <div style={valueStyle}>{formatRam(network.usedRam)}</div>
        </div>
        <div style={statBoxStyle}>
          <div style={labelStyle}>Utilization</div>
          <div style={{ ...valueStyle, color: utilizationColor }}>
            {utilization.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Module Row - Single row in module table
 */
function ModuleRow({ module }: { module: RegisteredModule }) {
  const rowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '200px 80px 60px 100px 100px',
    gap: 12,
    padding: '10px 12px',
    borderBottom: `1px solid ${COLORS.border}`,
    alignItems: 'center',
    fontSize: 13,
  };

  const nameStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: COLORS.text,
    fontWeight: 600,
  };

  const iconStyle: React.CSSProperties = {
    color: getStatusColor(module.status),
    fontSize: 14,
  };

  const statusStyle: React.CSSProperties = {
    color: getStatusColor(module.status),
    fontSize: 11,
    fontWeight: 'bold',
  };

  const priorityStyle: React.CSSProperties = {
    color: COLORS.textMuted,
    textAlign: 'center',
  };

  const ramStyle: React.CSSProperties = {
    color: COLORS.text,
    fontWeight: 600,
  };

  const ageStyle: React.CSSProperties = {
    color: COLORS.textDim,
    fontSize: 11,
  };

  return (
    <div style={rowStyle}>
      <div style={nameStyle}>
        <span style={iconStyle}>{getStatusIcon(module.status)}</span>
        <span>{module.name}</span>
      </div>
      <div style={statusStyle}>{getStatusText(module.status)}</div>
      <div style={priorityStyle}>{module.priority}</div>
      <div style={ramStyle}>{formatRam(module.ramAllocation.allocated)}</div>
      <div style={ageStyle}>{timeAgo(module.lastStatusUpdate)}</div>
    </div>
  );
}

/**
 * Module List - Table of all registered modules
 */
function ModuleList({ registry }: { registry: ModuleRegistry | null }) {
  const containerStyle: React.CSSProperties = {
    padding: '16px',
    borderBottom: `1px solid ${COLORS.border}`,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: 12,
  };

  const tableStyle: React.CSSProperties = {
    backgroundColor: COLORS.surface,
    borderRadius: 4,
    border: `1px solid ${COLORS.border}`,
    overflow: 'hidden',
  };

  const headerStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '200px 80px 60px 100px 100px',
    gap: 12,
    padding: '10px 12px',
    backgroundColor: '#0f0f0f',
    borderBottom: `2px solid ${COLORS.border}`,
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  };

  const emptyStyle: React.CSSProperties = {
    padding: 24,
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  };

  if (!registry || !registry.modules || Object.keys(registry.modules).length === 0) {
    return (
      <div style={containerStyle}>
        <div style={titleStyle}>MODULES</div>
        <div style={tableStyle}>
          <div style={emptyStyle}>No modules registered</div>
        </div>
      </div>
    );
  }

  const modules = Object.values(registry.modules).sort((a, b) => b.priority - a.priority);

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>MODULES ({modules.length})</div>
      <div style={tableStyle}>
        <div style={headerStyle}>
          <div>Name</div>
          <div>Status</div>
          <div style={{ textAlign: 'center' }}>Priority</div>
          <div>RAM Allocated</div>
          <div>Last Update</div>
        </div>
        {modules.map((module) => (
          <ModuleRow key={module.name} module={module} />
        ))}
      </div>
    </div>
  );
}

/**
 * Resource Allocation Overview - Stacked bar chart
 */
function ResourceAllocationOverview({
  allocations,
  network
}: {
  allocations: ResourceAllocation[] | null;
  network: NetworkState | null;
}) {
  const containerStyle: React.CSSProperties = {
    padding: '16px',
    borderBottom: `1px solid ${COLORS.border}`,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: 12,
  };

  const barContainerStyle: React.CSSProperties = {
    width: '100%',
    height: 30,
    backgroundColor: COLORS.surface,
    borderRadius: 4,
    overflow: 'hidden',
    display: 'flex',
    border: `1px solid ${COLORS.border}`,
    marginBottom: 12,
  };

  const legendStyle: React.CSSProperties = {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap',
    fontSize: 12,
  };

  const legendItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  };

  const legendDotStyle = (color: string): React.CSSProperties => ({
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: color,
  });

  const legendLabelStyle: React.CSSProperties = {
    color: COLORS.textMuted,
  };

  const legendValueStyle: React.CSSProperties = {
    color: COLORS.text,
    fontWeight: 'bold',
  };

  const totalRam = network?.totalRam || 0;
  const allocArray = allocations || [];
  const totalAllocated = allocArray.reduce((sum, a) => sum + a.allocatedRam, 0);
  const freeRam = Math.max(0, totalRam - totalAllocated);
  const utilization = totalRam > 0 ? (totalAllocated / totalRam) * 100 : 0;
  const utilizationColor = getUtilizationColor(utilization);

  // Module colors (cycling through a palette)
  const moduleColors = [
    '#16a34a', '#2563eb', '#9333ea', '#ea580c', '#0891b2', '#65a30d', '#7c3aed', '#ec4899'
  ];

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>RESOURCE ALLOCATION</div>
      <div style={barContainerStyle}>
        {allocArray.map((alloc, idx) => {
          const percentage = totalRam > 0 ? (alloc.allocatedRam / totalRam) * 100 : 0;
          const color = moduleColors[idx % moduleColors.length];

          const segmentStyle: React.CSSProperties = {
            width: `${percentage}%`,
            height: '100%',
            backgroundColor: color,
            borderRight: idx < allocArray.length - 1 ? '1px solid #000' : 'none',
          };

          return <div key={alloc.moduleName} style={segmentStyle} />;
        })}
        {freeRam > 0 && totalRam > 0 && (
          <div style={{
            width: `${(freeRam / totalRam) * 100}%`,
            height: '100%',
            backgroundColor: COLORS.border,
          }} />
        )}
      </div>
      <div style={{
        marginBottom: 12,
        fontSize: 13,
        color: COLORS.text,
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>
          <span style={{ fontWeight: 'bold' }}>{formatRam(totalAllocated)}</span>
          <span style={{ color: COLORS.textMuted }}> / </span>
          <span style={{ fontWeight: 'bold' }}>{formatRam(totalRam)}</span>
        </span>
        <span style={{ color: utilizationColor, fontWeight: 'bold' }}>
          {utilization.toFixed(1)}%
        </span>
      </div>
      <div style={legendStyle}>
        {allocArray.map((alloc, idx) => {
          const color = moduleColors[idx % moduleColors.length];
          return (
            <div key={alloc.moduleName} style={legendItemStyle}>
              <div style={legendDotStyle(color)} />
              <span style={legendLabelStyle}>{alloc.moduleName}:</span>
              <span style={legendValueStyle}>{formatRam(alloc.allocatedRam)}</span>
            </div>
          );
        })}
        {freeRam > 0 && (
          <div style={legendItemStyle}>
            <div style={legendDotStyle(COLORS.border)} />
            <span style={legendLabelStyle}>Free:</span>
            <span style={legendValueStyle}>{formatRam(freeRam)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Quick Actions Info - Informational section
 */
function QuickActionsInfo() {
  const containerStyle: React.CSSProperties = {
    padding: '16px',
    borderBottom: `1px solid ${COLORS.border}`,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: 12,
  };

  const actionsStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    fontSize: 13,
  };

  const actionStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    color: COLORS.text,
  };

  const bulletStyle: React.CSSProperties = {
    color: COLORS.textMuted,
  };

  const commandStyle: React.CSSProperties = {
    color: COLORS.running,
    fontWeight: 600,
    fontFamily: 'monospace',
  };

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>QUICK ACTIONS</div>
      <div style={actionsStyle}>
        <div style={actionStyle}>
          <span style={bulletStyle}>•</span>
          <span>View XP Farmer: <span style={commandStyle}>run /ui/xp-farmer-panel.tsx</span></span>
        </div>
        <div style={actionStyle}>
          <span style={bulletStyle}>•</span>
          <span>View Resources: <span style={commandStyle}>run /ui/resource-visualizer.tsx</span></span>
        </div>
        <div style={actionStyle}>
          <span style={bulletStyle}>•</span>
          <span>View Registry: <span style={commandStyle}>cat /state/module-registry.txt</span></span>
        </div>
        <div style={actionStyle}>
          <span style={bulletStyle}>•</span>
          <span>View Allocations: <span style={commandStyle}>cat /state/resource-allocation.txt</span></span>
        </div>
      </div>
    </div>
  );
}

/**
 * Statistics Grid - Daemon statistics
 */
function StatsGrid({ state, registry }: { state: DaemonState | null; registry: ModuleRegistry | null }) {
  const containerStyle: React.CSSProperties = {
    padding: '16px',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: 12,
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12,
  };

  const statBoxStyle: React.CSSProperties = {
    padding: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 4,
    border: `1px solid ${COLORS.border}`,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 4,
  };

  const valueStyle: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  };

  const uptime = state?.startTime ? formatDuration(Date.now() - state.startTime) : '-';
  const operations = state?.operationCount ? formatNumber(state.operationCount) : '-';
  const moduleCount = registry?.modules ? Object.keys(registry.modules).length : 0;
  const runningCount = registry?.modules
    ? Object.values(registry.modules).filter(m => m.status === 'running').length
    : 0;

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>STATISTICS</div>
      <div style={gridStyle}>
        <div style={statBoxStyle}>
          <div style={labelStyle}>Daemon Uptime</div>
          <div style={valueStyle}>{uptime}</div>
        </div>
        <div style={statBoxStyle}>
          <div style={labelStyle}>Total Operations</div>
          <div style={valueStyle}>{operations}</div>
        </div>
        <div style={statBoxStyle}>
          <div style={labelStyle}>Modules Managed</div>
          <div style={valueStyle}>{moduleCount}</div>
        </div>
        <div style={statBoxStyle}>
          <div style={labelStyle}>Modules Running</div>
          <div style={valueStyle}>{runningCount}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Footer - Last update timestamp
 */
function Footer({ lastUpdate }: { lastUpdate: number }) {
  const footerStyle: React.CSSProperties = {
    padding: '8px 16px',
    borderTop: `1px solid ${COLORS.border}`,
    fontSize: 10,
    color: COLORS.textDim,
    textAlign: 'right',
  };

  return (
    <div style={footerStyle}>
      Last updated: {new Date(lastUpdate).toLocaleTimeString()}
    </div>
  );
}

/**
 * Main Daemon Dashboard Component
 */
function DaemonDashboard() {
  const [daemonState, setDaemonState] = React.useState<DaemonState | null>(null);
  const [moduleRegistry, setModuleRegistry] = React.useState<ModuleRegistry | null>(null);
  const [networkState, setNetworkState] = React.useState<NetworkState | null>(null);
  const [allocations, setAllocations] = React.useState<ResourceAllocation[] | null>(null);
  const [lastUpdate, setLastUpdate] = React.useState<number>(Date.now());
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const updateData = () => {
      try {
        // Load daemon state
        const daemon = readState(nsRef, DAEMON_STATE_FILE, null);

        // Load module registry
        const registry = readState(nsRef, MODULE_REGISTRY_FILE, null);

        // Load network state
        const network = readState(nsRef, NETWORK_STATE_FILE, null);

        // Load allocations
        const alloc = readState(nsRef, ALLOCATION_FILE, null);

        setDaemonState(daemon);
        setModuleRegistry(registry);
        setNetworkState(network);
        setAllocations(Array.isArray(alloc) ? alloc : []);
        setLastUpdate(Date.now());
        setError(null);
      } catch (e) {
        setError(`Error loading state: ${e}`);
      }
    };

    // Initial update
    updateData();

    // Update interval
    const interval = setInterval(updateData, UPDATE_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const containerStyle: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 14,
    lineHeight: 1.5,
    backgroundColor: COLORS.background,
    color: COLORS.text,
    border: `2px solid ${COLORS.border}`,
    borderRadius: 8,
    width: 800,
    maxHeight: '90vh',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
  };

  const loadingStyle: React.CSSProperties = {
    padding: 32,
    textAlign: 'center',
    color: COLORS.textMuted,
  };

  const errorStyle: React.CSSProperties = {
    padding: 24,
    margin: 16,
    backgroundColor: COLORS.surface,
    border: `1px solid ${COLORS.error}`,
    borderRadius: 4,
    color: COLORS.error,
    textAlign: 'center',
  };

  const moduleCount = moduleRegistry?.modules ? Object.keys(moduleRegistry.modules).length : 0;
  const networkRam = networkState?.totalRam || 0;

  return (
    <div style={containerStyle}>
      {error && (
        <div style={errorStyle}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <DaemonHeader
        state={daemonState}
        moduleCount={moduleCount}
        networkRam={networkRam}
      />

      <NetworkSummary network={networkState} />

      <ModuleList registry={moduleRegistry} />

      <ResourceAllocationOverview
        allocations={allocations}
        network={networkState}
      />

      <QuickActionsInfo />

      <StatsGrid state={daemonState} registry={moduleRegistry} />

      <Footer lastUpdate={lastUpdate} />
    </div>
  );
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function main(ns: NS): Promise<void> {
  nsRef = ns;
  ns.disableLog('ALL');
  ns.ui.openTail();
  ns.printRaw(<DaemonDashboard />);

  // Keep the script alive
  while (true) {
    await ns.asleep(60000); // 60 second sleep
  }
}
