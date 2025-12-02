# Bitburner System Monitoring Guide

## Overview

This system provides comprehensive logging and monitoring capabilities for debugging and observing your automation scripts.

## Log Monitoring from IDE

### Quick Start

In a separate terminal from your build watcher, run:

```bash
npm run logs
```

This will display real-time logs from all components with color coding:

- 🔴 **ERROR** - Critical issues requiring attention
- 🟡 **WARN** - Warnings and non-critical issues
- 🟢 **INFO** - General information
- ⚪ **DEBUG** - Detailed debugging information

### What It Monitors

The log watcher monitors:

1. **Main daemon log**: `servers/home/daemon-log.txt`
   - All system-level events
   - Module lifecycle events
   - Resource allocation

2. **Component logs**: `servers/home/logs/*.txt`
   - `daemon.txt` - Daemon-specific detailed logs
   - `xp-farmer.txt` - XP Farmer module logs
   - Additional modules as you add them

### Features

- ✅ **Auto-discovery**: Automatically detects new log files
- ✅ **Color-coded**: Different colors for different log levels
- ✅ **Live updates**: Updates in real-time as logs are written
- ✅ **Status display**: Shows daemon status and module count
- ✅ **Filtering**: Focus on specific components

## In-Game Monitoring

### System Monitor

Run the comprehensive monitor in-game:

```bash
run monitor.ts         # Monitor everything
run monitor.ts state   # State files only
run monitor.ts logs    # Logs only
run monitor.ts xp      # XP Farmer specifically
```

The monitor displays:

- **Daemon State**: Active status, uptime, modules, RAM usage, utilization
- **Module Registry**: All registered modules and their status
- **Network State**: Total servers, rooted servers, available RAM
- **XP Farmer**: Active status, XP/sec, targets, levels gained
- **Recent Logs**: Last 10 log entries from all components

### Quick Logs Viewer

Read component logs directly in-game:

```bash
run read-logs.ts daemon        # Show all daemon logs
run read-logs.ts xp-farmer 50  # Show last 50 XP farmer logs
run read-logs.ts daemon ERROR  # Show only errors
```

### Version Checker

Verify your scripts are up-to-date:

```bash
run version-check.ts
```

This shows version numbers for all major scripts so you can verify files are syncing properly.

## Log File Structure

### Location

All logs are stored in `servers/home/`:

```
servers/home/
├── daemon-log.txt              # Main system log (all components)
├── logs/
│   ├── daemon.txt              # Daemon-specific logs
│   ├── xp-farmer.txt           # XP Farmer logs
│   └── [module-name].txt       # Other module logs
└── state/
    ├── daemon-state.txt        # Daemon runtime state
    ├── module-registry.txt     # Module registry
    ├── network-state.txt       # Network scan results
    └── module-configs/         # Module-specific state
```

### Log Format

Each log entry contains:

```json
{
  "timestamp": 1701234567890,
  "level": "INFO",
  "component": "xp-farmer",
  "message": "Deployed 1000 threads across 5 targets"
}
```

## Configuration

### Enable/Disable Component Logs

Edit the daemon config file in-game or locally:

**In-game**: Edit `/state/daemon-config.txt`

**Locally**: Edit `servers/home/state/daemon-config.txt`

```json
{
  "enableComponentLogs": true,      // Enable separate component logs
  "componentLogMaxEntries": 500,    // Max entries per component log
  "logLevel": 1                     // 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR
}
```

### Module-Specific Logging

Each module can have its own logging configuration:

**XP Farmer Config**: `/state/module-configs/xp-farmer-config.txt`

```json
{
  "enableComponentLogs": true,
  "componentLogMaxEntries": 500,
  "logLevel": 1
}
```

## Troubleshooting

### Logs Not Appearing

1. **Check daemon is running**: `run monitor.ts daemon`
2. **Check component logging is enabled**: View config files
3. **Check file permissions**: Ensure logs directory exists
4. **Restart build watcher**: Stop and `npm start` again

### IDE Log Watcher Not Updating

1. **Check build watcher is running**: `npm start` in another terminal
2. **Check log files exist**: `ls servers/home/logs/`
3. **Restart log watcher**: `npm run logs`

### Too Many Logs

Reduce log level in config:

```json
{
  "logLevel": 2  // Only WARN and ERROR
}
```

Or reduce max entries:

```json
{
  "componentLogMaxEntries": 100
}
```

## Best Practices

### Development Workflow

1. **Terminal 1**: Run `npm start` (build watcher)
2. **Terminal 2**: Run `npm run logs` (log monitor)
3. **In-Game**: Run `run monitor.ts` for real-time state

### Debugging Issues

1. Check version numbers: `run version-check.ts`
2. Check daemon status: `run monitor.ts daemon`
3. Check recent errors: `run read-logs.ts daemon ERROR`
4. Check component logs in IDE: `npm run logs`

### Log Management

- Logs auto-rotate to prevent file size issues
- Main daemon log: max 1000 entries
- Component logs: configurable (default 500)
- Oldest entries are automatically removed

## Example: Debugging XP Farmer

If XP farmer isn't working:

```bash
# In-game
run monitor.ts xp              # Check XP farmer status
run read-logs.ts xp-farmer 100 # Check last 100 logs

# In IDE
npm run logs                   # Watch live logs
```

Look for:
- ✅ "Target list changed, redeploying..." (good - only on target changes)
- ❌ "Cannot find /weaken.ts" (bad - worker script missing)
- ❌ Errors about RAM allocation
- ✅ "Deployed X threads across Y targets" (good - operations deployed)

## Advanced: Custom Filters

You can pipe the IDE log watcher output:

```bash
# Only show errors
npm run logs | grep ERROR

# Only show xp-farmer logs
npm run logs | grep xp-farmer

# Save to file
npm run logs > debug-session.log
```
