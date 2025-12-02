/**
 * XP Farmer Real-Time UI Panel
 *
 * Displays live statistics and status for the XP Farmer module including:
 * - Current XP/sec rate
 * - Total XP gained and hacking levels gained
 * - Progress bar to next level
 * - Active targets with XP efficiency
 * - Operation statistics
 *
 * Usage: run ui/xp-farmer-panel.tsx
 */

// @ts-ignore import React from "react";
declare const React: any;

import { readState, formatMoney, formatRam, formatDuration, formatNumber } from '/ns-utils';

// ============================================================================
// CONSTANTS
// ============================================================================

const STATE_FILE = '/state/module-configs/xp-farmer-state.txt';
const UPDATE_INTERVAL = 500; // 500ms for smooth updates

// Color scheme
const COLORS = {
  background: '#1a1a1a',
  text: '#e5e5e5',
  textMuted: '#9ca3af',
  accent: '#16a34a',
  warning: '#f59e0b',
  error: '#dc2626',
  border: '#404040',
  progressBg: '#333333',
  progressFill: '#16a34a',
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface XPTarget {
  hostname: string;
  xpPerSecond: number;
  weakenTime: number;
  xpGain: number;
  requiredHackLevel: number;
}

interface XPFarmerState {
  isActive: boolean;
  startTime: number;
  lastUpdate: number;
  lastTargetRefresh: number;
  activeTargets: XPTarget[];
  currentAllocation: {
    moduleName: string;
    allocatedRam: number;
    serverAllocations: Record<string, number>;
  } | null;
  deployedPIDs: Record<string, number[]>;
  statistics: {
    totalXPGained: number;
    totalOperations: number;
    averageXPPerSecond: number;
    uptimeSeconds: number;
    hackingLevelGained: number;
    startingHackingLevel: number;
  };
}

// ============================================================================
// GLOBAL NS REFERENCE
// ============================================================================

let nsRef: NS;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate XP needed for next level using formulas or fallback
 */
function calculateNextLevelXP(ns: NS, currentLevel: number): number {
  try {
    return ns.formulas.skills.calculateExp(currentLevel + 1);
  } catch {
    // Fallback heuristic if formulas.exe not available
    return Math.pow(currentLevel, 2) * 25;
  }
}

/**
 * Calculate XP for current level
 */
function calculateCurrentLevelXP(ns: NS, currentLevel: number): number {
  try {
    return ns.formulas.skills.calculateExp(currentLevel);
  } catch {
    // Fallback heuristic
    return Math.pow(currentLevel - 1, 2) * 25;
  }
}

/**
 * Format XP per second with color coding
 */
function formatXPPerSec(xpPerSec: number): string {
  if (xpPerSec >= 1000) {
    return formatNumber(xpPerSec);
  }
  return xpPerSec.toFixed(2);
}

/**
 * Get status color based on module state
 */
function getStatusColor(isActive: boolean): string {
  return isActive ? COLORS.accent : COLORS.textMuted;
}

/**
 * Get status text
 */
function getStatusText(isActive: boolean): string {
  return isActive ? 'ACTIVE' : 'STOPPED';
}

// ============================================================================
// REACT COMPONENTS
// ============================================================================

/**
 * Header Component - Module name and status indicator
 */
function Header({ isActive }: { isActive: boolean }) {
  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: `1px solid ${COLORS.border}`,
    backgroundColor: '#0f0f0f',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    letterSpacing: '0.5px',
  };

  const statusStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    fontSize: 12,
    fontWeight: 'bold',
    color: getStatusColor(isActive),
  };

  const indicatorStyle: React.CSSProperties = {
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: getStatusColor(isActive),
    marginRight: 6,
    animation: isActive ? 'pulse 2s infinite' : 'none',
  };

  return (
    <div style={headerStyle}>
      <div style={titleStyle}>XP FARMER</div>
      <div style={statusStyle}>
        <div style={indicatorStyle} />
        {getStatusText(isActive)}
      </div>
    </div>
  );
}

/**
 * Big XP/sec Display Component
 */
function BigStat({ xpPerSec }: { xpPerSec: number }) {
  const containerStyle: React.CSSProperties = {
    padding: '24px 16px',
    textAlign: 'center',
    borderBottom: `1px solid ${COLORS.border}`,
    backgroundColor: '#0f0f0f',
  };

  const valueStyle: React.CSSProperties = {
    fontSize: 42,
    fontWeight: 'bold',
    color: COLORS.accent,
    marginBottom: 4,
    fontVariantNumeric: 'tabular-nums',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 14,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '1px',
  };

  return (
    <div style={containerStyle}>
      <div style={valueStyle}>{formatXPPerSec(xpPerSec)}</div>
      <div style={labelStyle}>XP/sec</div>
    </div>
  );
}

/**
 * Progress Bar Component - Shows progress to next level
 */
function ProgressBar({ player }: { player: any }) {
  const currentLevel = player.skills.hacking;
  const currentXP = player.exp.hacking;
  const currentLevelXP = calculateCurrentLevelXP(nsRef, currentLevel);
  const nextLevelXP = calculateNextLevelXP(nsRef, currentLevel);
  const xpIntoLevel = currentXP - currentLevelXP;
  const xpNeededForLevel = nextLevelXP - currentLevelXP;
  const progressPercent = Math.min(100, Math.max(0, (xpIntoLevel / xpNeededForLevel) * 100));

  const containerStyle: React.CSSProperties = {
    padding: '16px',
    borderBottom: `1px solid ${COLORS.border}`,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 8,
    display: 'flex',
    justifyContent: 'space-between',
  };

  const barContainerStyle: React.CSSProperties = {
    width: '100%',
    height: 24,
    backgroundColor: COLORS.progressBg,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
    border: `1px solid ${COLORS.border}`,
  };

  const barFillStyle: React.CSSProperties = {
    width: `${progressPercent}%`,
    height: '100%',
    backgroundColor: COLORS.progressFill,
    transition: 'width 0.3s ease',
  };

  const barTextStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.text,
    textShadow: '0 0 4px rgba(0,0,0,0.8)',
  };

  const levelInfoStyle: React.CSSProperties = {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 6,
  };

  return (
    <div style={containerStyle}>
      <div style={labelStyle}>
        <span>Level Progress</span>
        <span>{progressPercent.toFixed(1)}%</span>
      </div>
      <div style={barContainerStyle}>
        <div style={barFillStyle} />
        <div style={barTextStyle}>
          Level {currentLevel} → {currentLevel + 1}
        </div>
      </div>
      <div style={levelInfoStyle}>
        {formatNumber(xpIntoLevel)} / {formatNumber(xpNeededForLevel)} XP
      </div>
    </div>
  );
}

/**
 * Stats Grid Component - Shows key statistics
 */
function StatsGrid({ state }: { state: XPFarmerState }) {
  const containerStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    padding: '16px',
    borderBottom: `1px solid ${COLORS.border}`,
  };

  const statItemStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
  };

  const statLabelStyle: React.CSSProperties = {
    fontSize: 11,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 4,
  };

  const statValueStyle: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    fontVariantNumeric: 'tabular-nums',
  };

  const uptime = (Date.now() - state.startTime) / 1000;
  const totalXP = state.statistics.totalXPGained;
  const levelsGained = state.statistics.hackingLevelGained;
  const operations = state.statistics.totalOperations;

  return (
    <div style={containerStyle}>
      <div style={statItemStyle}>
        <div style={statLabelStyle}>Uptime</div>
        <div style={statValueStyle}>{formatDuration(uptime * 1000)}</div>
      </div>
      <div style={statItemStyle}>
        <div style={statLabelStyle}>XP Gained</div>
        <div style={statValueStyle}>{formatNumber(totalXP)}</div>
      </div>
      <div style={statItemStyle}>
        <div style={statLabelStyle}>Levels Gained</div>
        <div style={statValueStyle}>{levelsGained}</div>
      </div>
      <div style={statItemStyle}>
        <div style={statLabelStyle}>Operations</div>
        <div style={statValueStyle}>{formatNumber(operations)}</div>
      </div>
    </div>
  );
}

/**
 * Targets List Component - Shows active targets with XP efficiency
 */
function TargetsList({ targets }: { targets: XPTarget[] }) {
  const containerStyle: React.CSSProperties = {
    padding: '16px',
    maxHeight: '300px',
    overflowY: 'auto',
  };

  const headerStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 12,
  };

  const targetItemStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: `1px solid ${COLORS.border}`,
  };

  const targetNameStyle: React.CSSProperties = {
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
  };

  const targetXPStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.accent,
    fontVariantNumeric: 'tabular-nums',
  };

  const bulletStyle: React.CSSProperties = {
    color: COLORS.accent,
    marginRight: 8,
  };

  const emptyStyle: React.CSSProperties = {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    padding: '24px 0',
    fontStyle: 'italic',
  };

  if (!targets || targets.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>ACTIVE TARGETS</div>
        <div style={emptyStyle}>No active targets</div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>ACTIVE TARGETS ({targets.length})</div>
      {targets.map((target, index) => (
        <div key={index} style={targetItemStyle}>
          <div style={targetNameStyle}>
            <span style={bulletStyle}>•</span>
            {target.hostname}
          </div>
          <div style={targetXPStyle}>
            {formatXPPerSec(target.xpPerSecond)} XP/s
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Footer Component - Last update timestamp
 */
function Footer({ lastUpdate }: { lastUpdate: number }) {
  const footerStyle: React.CSSProperties = {
    padding: '8px 16px',
    borderTop: `1px solid ${COLORS.border}`,
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: 'right',
  };

  const updateTime = new Date(lastUpdate).toLocaleTimeString();

  return (
    <div style={footerStyle}>
      Last update: {updateTime}
    </div>
  );
}

/**
 * Main XP Farmer Panel Component
 */
function XPFarmerPanel() {
  const [state, setState] = React.useState<XPFarmerState | null>(null);
  const [player, setPlayer] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const interval = setInterval(() => {
      try {
        // Load XP farmer state
        const xpState = readState(nsRef, STATE_FILE, null);
        const p = nsRef.getPlayer();

        if (!xpState) {
          setError('XP Farmer state not found. Is the module running?');
          setState(null);
          setPlayer(null);
        } else {
          setError(null);
          setState(xpState);
          setPlayer(p);
        }
      } catch (e) {
        setError(`Error loading state: ${e}`);
      }
    }, UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  const containerStyle: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 14,
    lineHeight: 1.4,
    backgroundColor: COLORS.background,
    color: COLORS.text,
    border: `2px solid ${COLORS.border}`,
    borderRadius: 8,
    width: 400,
    maxHeight: '90vh',
    overflow: 'hidden',
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
    textAlign: 'center',
    color: COLORS.error,
  };

  const errorTitleStyle: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  };

  const errorMessageStyle: React.CSSProperties = {
    fontSize: 12,
    color: COLORS.textMuted,
  };

  // Add CSS animations via style tag
  const styleTag = (
    <style>{`
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `}</style>
  );

  // Loading state
  if (!state && !error) {
    return (
      <div style={containerStyle}>
        {styleTag}
        <Header isActive={false} />
        <div style={loadingStyle}>
          Loading XP Farmer...
        </div>
      </div>
    );
  }

  // Error state
  if (error || !state || !player) {
    return (
      <div style={containerStyle}>
        {styleTag}
        <Header isActive={false} />
        <div style={errorStyle}>
          <div style={errorTitleStyle}>Error</div>
          <div style={errorMessageStyle}>{error || 'Failed to load state'}</div>
        </div>
      </div>
    );
  }

  // Calculate current XP/sec
  const currentXPPerSec = state.statistics.averageXPPerSecond || 0;

  return (
    <div style={containerStyle}>
      {styleTag}
      <Header isActive={state.isActive} />
      <BigStat xpPerSec={currentXPPerSec} />
      <ProgressBar player={player} />
      <StatsGrid state={state} />
      <TargetsList targets={state.activeTargets} />
      <Footer lastUpdate={state.lastUpdate} />
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
  ns.printRaw(<XPFarmerPanel />);

  // Keep the script alive
  while (true) {
    await ns.asleep(60000); // 60 second sleep
  }
}
