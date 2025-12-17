/**
 * Triumph Display
 * React-based display with black & green terminal aesthetic
 * 
 * Usage:
 *   run triumph.tsx
 */

// @ts-ignore import React from "react";
declare const React: any;

let nsRef: NS;

interface ExecutionLog {
  script: string;
  args: (string | number | boolean)[];
  timestamp: Date;
}

interface FileInfo {
  filename: string;
  type: 'script' | 'text' | 'contract' | 'program' | 'other';
  extension: string;
  executable: boolean;
  ramUsage: number | null;
}

interface RepoState {
  timestamp: string;
  server: string;
  fileCount: number;
  files: FileInfo[];
}

function loadRepo(): RepoState | null {
  try {
    const content = nsRef.read('dir-home.json.txt');
    if (!content) return null;
    return JSON.parse(content) as RepoState;
  } catch {
    return null;
  }
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
 * Triumph React Component
 */
function TriumphUI({ interval }: { interval: number }) {
  const [lastUpdate, setLastUpdate] = React.useState(new Date());
  const [execLog, setExecLog] = React.useState([] as ExecutionLog[]);
  const [repoState, setRepoState] = React.useState(null as RepoState | null);

  React.useEffect(() => {
    const update = () => {
      try {
        setLastUpdate(new Date());
        // Reload repo state on each update
        const repo = loadRepo();
        setRepoState(repo);
      } catch (error) {
        // Silently handle errors
      }
    };

    update();
    const updateInterval = setInterval(update, interval);
    return () => clearInterval(updateInterval);
  }, [interval]);

  const runScript = (script: string, ...args: (string | number | boolean)[]) => {
    nsRef.exec(script, 'home', ...args);
    setExecLog(prev => {
      const newLog = [{ script, args, timestamp: new Date() }, ...prev];
      return newLog.slice(0, 5); // Keep last 5
    });
  };

  // Get executable scripts (excluding triumph.tsx itself)
  const executableScripts = repoState?.files.filter(
    f => f.executable && f.type === 'script' && f.filename !== 'triumph.tsx'
  ) || [];

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
║  ████████╗██████╗ ██╗██╗   ██╗███╗   ███╗██████╗ ██╗  ██╗         ║
║  ╚══██╔══╝██╔══██╗██║██║   ██║████╗ ████║██╔══██╗██║  ██║         ║
║     ██║   ██████╔╝██║██║   ██║██╔████╔██║██████╔╝███████║         ║
║     ██║   ██╔══██╗██║██║   ██║██║╚██╔╝██║██╔═══╝ ██╔══██║         ║
║     ██║   ██║  ██║██║╚██████╔╝██║ ╚═╝ ██║██║     ██║  ██║         ║
║     ╚═╝   ╚═╝  ╚═╝╚═╝ ╚═════╝ ╚═╝     ╚═╝╚═╝     ╚═╝  ╚═╝         ║
║                   C o m m a n d   P a n e l                       ║
╚═══════════════════════════════════════════════════════════════════╝
`}
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

      {/* Status */}
      <div
        style={{
          border: `1px solid ${THEME.border}`,
          padding: '12px',
          backgroundColor: THEME.bgPanel,
          boxShadow: `0 0 15px ${THEME.dim}, inset 0 0 30px ${THEME.bgDark}`,
          fontSize: '11px',
        }}
      >
        <div>
          <span style={{ color: THEME.tertiary }}>LAST_UPDATE:</span>{' '}
          <span style={{ color: THEME.textDim }}>
            {lastUpdate.toLocaleTimeString()}
          </span>
        </div>

        {/* Commands Grid */}
        <div
          style={{
            marginTop: '12px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: '8px',
          }}
        >
          {executableScripts.length === 0 ? (
            <div style={{ color: THEME.dim, fontSize: '10px', fontStyle: 'italic' }}>
              Loading scripts... (run repo.ts first)
            </div>
          ) : (
            executableScripts.map((file) => (
              <button
                key={file.filename}
                onClick={() => runScript(file.filename)}
                style={{
                  backgroundColor: THEME.bgDark,
                  color: THEME.primary,
                  border: `1px solid ${THEME.border}`,
                  padding: '8px 12px',
                  fontFamily: 'monospace',
                  fontSize: '10px',
                  cursor: 'pointer',
                  textShadow: `0 0 8px ${THEME.primary}`,
                  boxShadow: `0 0 10px ${THEME.dim}`,
                  textAlign: 'left',
                }}
              >
                <div>{'> '}{file.filename.replace(/\.[^.]+$/, '')}</div>
                {file.ramUsage !== null && (
                  <div style={{ color: THEME.tertiary, fontSize: '9px', marginTop: '2px' }}>
                    RAM: {file.ramUsage.toFixed(2)} GB
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Execution Log - fixed to bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: '40px',
          left: '16px',
          right: '16px',
          border: `1px solid ${THEME.borderDim}`,
          backgroundColor: THEME.bgPanel,
          padding: '12px',
          boxShadow: `0 0 10px ${THEME.dim}`,
        }}
      >
        <div
          style={{
            color: THEME.tertiary,
            fontSize: '10px',
            marginBottom: '8px',
            borderBottom: `1px solid ${THEME.borderDim}`,
            paddingBottom: '4px',
          }}
        >
          {'>>> EXECUTION LOG (LAST 5)'}
        </div>
        {execLog.length === 0 ? (
          <div style={{ color: THEME.dim, fontSize: '10px', fontStyle: 'italic' }}>
            No executions yet...
          </div>
        ) : (
          execLog.map((entry, idx) => (
            <div
              key={idx}
              style={{
                fontSize: '10px',
                color: THEME.textDim,
                marginBottom: '4px',
                fontFamily: 'monospace',
              }}
            >
              <span style={{ color: THEME.dim }}>
                [{entry.timestamp.toLocaleTimeString()}]
              </span>{' '}
              <span style={{ color: THEME.secondary }}>{entry.script}</span>
              {entry.args.length > 0 && (
                <span style={{ color: THEME.tertiary }}>
                  {' '}({entry.args.join(', ')})
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          position: 'absolute',
          bottom: '0',
          left: '16px',
          right: '16px',
          padding: '8px',
          borderTop: `1px solid ${THEME.borderDim}`,
          fontSize: '10px',
          color: THEME.dim,
          textAlign: 'center',
          backgroundColor: THEME.bg,
        }}
      >
        [CTRL+C TO TERMINATE] [TRIUMPH v1.0]
      </div>
    </div>
  );
}

/**
 * Main execution
 */
export async function main(ns: NS): Promise<void> {
  nsRef = ns;
  const interval = (ns.args[0] as number) || 500;
  
  ns.disableLog('ALL');
  ns.clearLog();
  ns.ui.openTail();

  // Run repo.ts on startup to generate dir-home.json.txt
  const repoPid = ns.exec('repo.ts', 'home');
  if (repoPid > 0) {
    // Wait for repo.ts to finish
    while (ns.isRunning(repoPid)) {
      await ns.asleep(50);
    }
  }

  ns.printRaw(<TriumphUI interval={interval} />);

  // Keep the script alive so the React component remains mounted
  while (true) {
    await ns.asleep(60000);
  }
}
