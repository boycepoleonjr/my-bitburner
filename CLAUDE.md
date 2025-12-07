# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Bitburner automation system** using an external editor setup with TypeScript/TSX, React, and esbuild. It implements a modular daemon architecture for managing game automation scripts.

## Development Commands

### Build & Deploy
```bash
npm start           # Start esbuild watcher and RemoteAPI server (port 12525)
npm run logs        # Watch log files in real-time with color coding
```

### In-Game Commands
```bash
run daemon.ts                    # Start the daemon orchestrator
run monitor.ts                   # System monitor (all components)
run monitor.ts state             # State files only
run monitor.ts logs              # Logs only
run monitor.ts xp                # XP Farmer specifically
run target-monitor.tsx           # React UI for detailed target server stats (all modules)
run target-monitor.tsx xp        # Target stats from XP Farmer only
run target-monitor.tsx early     # Target stats from Early Game module only
```

## Architecture

### Daemon System (Central Orchestrator)

The system uses a **daemon orchestrator pattern** (`servers/home/daemon.ts`) that manages modular automation scripts. The daemon is responsible for:

- **Module lifecycle**: Starting, stopping, pausing, resuming modules
- **Resource allocation**: Distributing RAM across the network to modules based on priority
- **Network management**: Discovering servers, distributing worker scripts, tracking available RAM
- **Auto-recovery**: Restarting failed modules automatically
- **Status monitoring**: Collecting status updates from modules via NetScript ports

### Core Components

#### 1. Module Registry (`core/module-registry.ts`)
- Central registry for all daemon-managed modules
- Tracks module lifecycle state (`stopped`, `starting`, `running`, `paused`, `error`)
- Persists module state to `/state/module-registry.txt`
- Manages module PIDs, ports, RAM allocations, and priorities

#### 2. Resource Allocator (`core/resource-allocator.ts`)
- Builds resource pools from network servers
- Allocates RAM to modules based on priority and requirements
- Reserves RAM on home server (default 32GB)
- Uses priority-based allocation algorithm
- Persists allocations to `/state/resource-allocation.txt`

#### 3. Network Manager (`core/network-manager.ts`)
- Discovers all servers in the network via recursive scanning
- Tracks rooted servers and available RAM
- Distributes worker scripts (`hack.ts`, `grow.ts`, `weaken.ts`) to rooted servers
- Persists network state to `/state/network-state.txt`

#### 4. Module Interface (`modules/module-interface.ts`)
- Contract that all daemon-managed modules must implement
- Defines port allocations for inter-process communication
- Supports two execution modes: `standalone` and `daemon-managed`
- Uses NetScript ports for control messages (daemon→module) and status messages (module→daemon)

### Module Communication

Modules communicate with the daemon via **NetScript ports**:

- **Control Port**: Daemon sends commands to modules (`start`, `stop`, `pause`, `resume`, `resource_allocation`)
- **Status Port**: Modules send status updates to daemon (`status_update` with health, RAM usage, resource requests)

Port assignments are defined in `PORT_ALLOCATION` constant in `modules/module-interface.ts`.

### File Structure

```
servers/home/
├── daemon.ts                    # Main daemon orchestrator
├── core/                        # Core subsystems
│   ├── module-registry.ts       # Module lifecycle management
│   ├── resource-allocator.ts    # RAM allocation system
│   └── network-manager.ts       # Network discovery & management
├── modules/                     # Daemon-managed modules
│   ├── module-interface.ts      # Module contract & types
│   └── xp-farmer.ts             # XP farming module (example)
├── ui/                          # React dashboards
│   ├── daemon-dashboard.tsx     # Daemon status UI
│   ├── xp-farmer-panel.tsx      # XP farmer metrics UI
│   └── resource-visualizer.tsx  # Resource allocation UI
├── state/                       # Persistent state files (in-game)
│   ├── daemon-state.txt
│   ├── module-registry.txt
│   ├── network-state.txt
│   ├── resource-allocation.txt
│   └── module-configs/          # Per-module config & state
├── logs/                        # Component logs (in-game)
│   ├── daemon.txt
│   └── [module-name].txt
├── ns-utils.ts                  # Shared utilities (logging, state I/O, ports)
├── hack.ts, grow.ts, weaken.ts  # Worker scripts (distributed to servers)
└── monitor.ts                   # In-game monitoring tool
```

### State & Configuration Files

All state files are stored in `servers/home/state/` (in-game: `/state/`):

- `daemon-config.txt`: Daemon configuration (intervals, log levels, auto-recovery)
- `daemon-state.txt`: Daemon runtime state (uptime, statistics)
- `module-registry.txt`: All registered modules and their status
- `network-state.txt`: Discovered servers and RAM availability
- `resource-allocation.txt`: Current RAM allocations to modules
- `module-configs/[module-name]-config.txt`: Per-module configuration
- `module-configs/[module-name]-state.txt`: Per-module runtime state

State files use **JSON format** and are read/written using `readState()` and `writeState()` from `ns-utils.ts`.

## Building New Modules

When creating a new daemon-managed module:

1. **Implement the module interface** from `modules/module-interface.ts`
2. **Use parseModeFromArgs()** to detect execution mode (`standalone` vs `daemon-managed`)
3. **In daemon-managed mode**:
   - Listen for control messages on `controlPort`
   - Send status updates to `statusPort` periodically
   - Include resource requests in status messages
   - Handle `resource_allocation` messages from daemon
4. **Register the module** in `daemon.ts` in the `BUILTIN_MODULES` array
5. **Allocate ports** in `PORT_ALLOCATION` constant
6. **Create module config** with required fields: `minRamRequired`, `optimalRamRequired`, `priority`, `enabled`

Example module structure:
```typescript
import { parseModeFromArgs, ControlMessage, StatusMessage } from './modules/module-interface';

export async function main(ns: NS) {
  const context = parseModeFromArgs(ns.args);

  if (context.mode === 'daemon-managed') {
    // Daemon-managed mode: listen to control port, send status updates
    await runDaemonMode(ns, context);
  } else {
    // Standalone mode: run independently
    await runStandaloneMode(ns);
  }
}
```

## React UI Development

React UIs are rendered using `ns.printRaw()` in the game:

- Import React from `"react"` (uses in-game instance)
- Use `.tsx` extension for TSX files
- UIs update via React state and `setInterval()`
- Read state files using `ns.read()` and parse JSON
- UIs are typically launched by the daemon or run manually

Example:
```tsx
import React, { useState, useEffect } from "react";

export function main(ns: NS) {
  ns.tail();
  ns.printRaw(<Dashboard ns={ns} />);
}

function Dashboard({ ns }: { ns: NS }) {
  const [state, setState] = useState({});

  useEffect(() => {
    const interval = setInterval(() => {
      const data = JSON.parse(ns.read('/state/daemon-state.txt'));
      setState(data);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return <div>Status: {state.isActive ? 'Active' : 'Inactive'}</div>;
}
```

## Logging System

The codebase uses a **structured logging system** (`ns-utils.ts`):

- **Log Levels**: `DEBUG` (0), `INFO` (1), `WARN` (2), `ERROR` (3)
- **Main log**: `daemon-log.txt` (all components, max 1000 entries)
- **Component logs**: `logs/[component].txt` (per-component, max 500 entries by default)
- **Log format**: JSON array with `{ timestamp, level, component, message }`

Use the `log()` helper function:
```typescript
import { log, LogLevel } from './ns-utils';

log(ns, LogLevel.INFO, 'MyModule', 'Module started successfully');
log(ns, LogLevel.ERROR, 'MyModule', 'Failed to allocate resources');
```

Component logging can be enabled/disabled in daemon config:
```json
{
  "enableComponentLogs": true,
  "componentLogMaxEntries": 500,
  "logLevel": 1
}
```

## Worker Scripts

Worker scripts (`hack.ts`, `grow.ts`, `weaken.ts`) are **minimal** and designed for RAM efficiency:

```typescript
export async function main(ns: NS) {
  const target = ns.args[0] as string;
  while (true) {
    await ns.hack(target); // or grow/weaken
  }
}
```

These scripts are distributed to all rooted servers by the Network Manager and executed by modules via `ns.exec()`.

## Build System

Uses **esbuild** with **esbuild-bitburner-plugin**:

- `config.mjs`: Build configuration
- **Mirroring**: Bidirectional sync between local files and game (`mirror: { 'servers': ['home'] }`)
- **Distribution**: Automatically copy files to multiple servers
- **File filtering**: Ignores temp files, dotfiles, and backup files
- **Bundle**: All scripts are bundled as ESM for browser platform
- **Auto-upload**: Changes are automatically uploaded to Bitburner via RemoteAPI (port 12525)

File hierarchy determines destination server: `servers/home/script.ts` → `home/script.js` in-game

## NetScript API Patterns

### Reading State Files
```typescript
const state = readState(ns, '/state/daemon-state.txt', defaultValue);
```

### Writing State Files
```typescript
writeState(ns, '/state/daemon-state.txt', stateObject);
```

### Loading Config Files
```typescript
const config = loadConfig(ns, '/state/daemon-config.txt', defaultConfig);
```

### Port Communication
```typescript
// Send message
sendControlMessage(ns, portNumber, { type: 'start', config: {...} });

// Receive messages
const messages = collectStatusMessages(ns, portNumber);
```

### Starting Scripts
```typescript
const pid = startScript(ns, scriptPath, hostname, threads, ...args);
```

### Killing Scripts
```typescript
killModuleEverywhere(ns, scriptPath); // Kill on all servers
```

## Hacking Algorithms

This codebase primarily uses **loop algorithms** (see `game-docs/hacking-alogrithms.md`):

- Separate scripts for `hack`, `grow`, `weaken`
- RAM-efficient (no status checks in worker scripts)
- Modules calculate thread ratios and deploy workers via `ns.exec()`
- XP Farmer uses this pattern for leveling up hacking skill

Future modules may implement **batch algorithms (HWGW)** for maximum income.

## Common Development Workflow

1. **Terminal 1**: `npm start` (build watcher)
2. **Terminal 2**: `npm run logs` (log monitor)
3. **In-Game**: `run daemon.ts` (start automation)
4. **In-Game**: `run monitor.ts` (check status)
5. Edit files locally → auto-syncs to game → daemon detects changes

## Bitburner-Specific Notes

- **RAM costs**: Every NetScript function has a RAM cost. Minimize function calls in worker scripts.
- **Threading**: Scripts can run with multiple threads. More threads = more RAM usage but faster execution.
- **Ports**: NetScript ports (1-20) are used for inter-script communication. Use `ns.writePort()` and `ns.readPort()`.
- **Tailing**: Use `ns.tail()` to open a log window for the current script.
- **Remote API**: Game must have RemoteAPI enabled (port 12525) for file sync to work.

## Version Tracking

Scripts include version headers:
```typescript
/**
 * Script Name
 * VERSION: 1.2.0
 * LAST UPDATED: 2025-12-02
 *
 * CHANGELOG:
 * - v1.2.0: Feature description
 * - v1.1.0: Feature description
 */
```

Update version numbers when making significant changes to daemon, core systems, or modules.
