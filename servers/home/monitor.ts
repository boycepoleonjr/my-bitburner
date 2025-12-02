/**
 * State and Log Monitor
 * VERSION: 1.0.0
 * LAST UPDATED: 2025-12-02
 *
 * Real-time monitoring of daemon state, module states, and component logs.
 * Useful for debugging and observing system behavior.
 *
 * Usage:
 *   run monitor.ts           - Monitor all (daemon + modules + logs)
 *   run monitor.ts state     - Monitor state files only
 *   run monitor.ts logs      - Monitor log files only
 *   run monitor.ts xp        - Monitor XP farmer specifically
 */

import { readState, formatDuration, formatRam, formatNumber } from '/ns-utils';

export async function main(ns: NS): Promise<void> {
    const mode = (ns.args[0] as string || 'all').toLowerCase();

    ns.disableLog('ALL');
    ns.clearLog();
    ns.tail();

    ns.print('╔' + '═'.repeat(78) + '╗');
    ns.print('║' + ' '.repeat(28) + 'SYSTEM MONITOR' + ' '.repeat(36) + '║');
    ns.print('╚' + '═'.repeat(78) + '╝');
    ns.print('');

    while (true) {
        ns.clearLog();

        const timestamp = new Date().toLocaleTimeString();
        ns.print(`[${timestamp}] Monitoring: ${mode}`);
        ns.print('─'.repeat(80));
        ns.print('');

        // Monitor daemon state
        if (mode === 'all' || mode === 'state' || mode === 'daemon') {
            monitorDaemonState(ns);
        }

        // Monitor module registry
        if (mode === 'all' || mode === 'state') {
            monitorModuleRegistry(ns);
        }

        // Monitor network state
        if (mode === 'all' || mode === 'state') {
            monitorNetworkState(ns);
        }

        // Monitor XP farmer
        if (mode === 'all' || mode === 'xp') {
            monitorXPFarmer(ns);
        }

        // Monitor logs
        if (mode === 'all' || mode === 'logs') {
            monitorRecentLogs(ns);
        }

        await ns.sleep(2000);
    }
}

function monitorDaemonState(ns: NS): void {
    const daemonState = readState(ns, '/state/daemon-state.txt', null);

    ns.print('┌─ DAEMON STATE ───────────────────────────────────────────────────────┐');

    if (!daemonState) {
        ns.print('│ No daemon state found                                                │');
        ns.print('└──────────────────────────────────────────────────────────────────────┘');
        ns.print('');
        return;
    }

    const uptime = Date.now() - (daemonState.startTime || Date.now());
    const stats = daemonState.statistics || {};

    ns.print(`│ Active: ${daemonState.isActive ? '✓' : '✗'}                                                            │`);
    ns.print(`│ Uptime: ${formatDuration(uptime).padEnd(63)}│`);
    ns.print(`│ Modules: ${(stats.modulesManaged || 0).toString().padEnd(62)}│`);
    ns.print(`│ RAM: ${formatRam(stats.networkResources || 0).padEnd(67)}│`);
    ns.print(`│ Utilization: ${(stats.utilization || 0).toFixed(1)}%`.padEnd(74) + '│');
    ns.print(`│ Restarts: ${(stats.moduleRestarts || 0).toString().padEnd(62)}│`);

    ns.print('└──────────────────────────────────────────────────────────────────────┘');
    ns.print('');
}

function monitorModuleRegistry(ns: NS): void {
    const registry = readState(ns, '/state/module-registry.txt', null);

    ns.print('┌─ MODULE REGISTRY ────────────────────────────────────────────────────┐');

    if (!registry || !registry.modules) {
        ns.print('│ No modules registered                                                │');
        ns.print('└──────────────────────────────────────────────────────────────────────┘');
        ns.print('');
        return;
    }

    for (const [name, module] of Object.entries(registry.modules) as any) {
        const statusColor = module.status === 'running' ? '✓' :
                          module.status === 'error' ? '✗' : '○';
        const ramAlloc = module.ramAllocation?.allocated || 0;

        ns.print(`│ ${statusColor} ${name.padEnd(20)} ${module.status.padEnd(10)} ${formatRam(ramAlloc).padEnd(15)}│`);
    }

    ns.print('└──────────────────────────────────────────────────────────────────────┘');
    ns.print('');
}

function monitorNetworkState(ns: NS): void {
    const networkState = readState(ns, '/state/network-state.txt', null);

    ns.print('┌─ NETWORK STATE ──────────────────────────────────────────────────────┐');

    if (!networkState) {
        ns.print('│ No network state found                                               │');
        ns.print('└──────────────────────────────────────────────────────────────────────┘');
        ns.print('');
        return;
    }

    ns.print(`│ Total Servers: ${(networkState.allServers?.length || 0).toString().padEnd(54)}│`);
    ns.print(`│ Rooted: ${(networkState.rootedServers?.length || 0).toString().padEnd(61)}│`);
    ns.print(`│ Total RAM: ${formatRam(networkState.totalRamAvailable || 0).padEnd(58)}│`);

    const scanAge = Date.now() - (networkState.lastScan || Date.now());
    ns.print(`│ Last Scan: ${formatDuration(scanAge) + ' ago'.padEnd(58)}│`);

    ns.print('└──────────────────────────────────────────────────────────────────────┘');
    ns.print('');
}

function monitorXPFarmer(ns: NS): void {
    const xpState = readState(ns, '/state/module-configs/xp-farmer-state.txt', null);

    ns.print('┌─ XP FARMER ──────────────────────────────────────────────────────────┐');

    if (!xpState) {
        ns.print('│ No XP farmer state found                                             │');
        ns.print('└──────────────────────────────────────────────────────────────────────┘');
        ns.print('');
        return;
    }

    const stats = xpState.statistics || {};
    const uptime = Date.now() - (xpState.startTime || Date.now());

    ns.print(`│ Active: ${xpState.isActive ? '✓' : '✗'}                                                            │`);
    ns.print(`│ Uptime: ${formatDuration(uptime).padEnd(63)}│`);
    ns.print(`│ XP/sec: ${formatNumber(stats.averageXPPerSecond || 0).padEnd(63)}│`);
    ns.print(`│ Total XP: ${formatNumber(stats.totalXPGained || 0).padEnd(61)}│`);
    ns.print(`│ Levels Gained: ${(stats.hackingLevelGained || 0).toString().padEnd(56)}│`);
    ns.print(`│ Active Targets: ${(xpState.activeTargets?.length || 0).toString().padEnd(55)}│`);

    if (xpState.activeTargets && xpState.activeTargets.length > 0) {
        ns.print('│                                                                      │');
        ns.print('│ Targets:                                                             │');
        for (let i = 0; i < Math.min(3, xpState.activeTargets.length); i++) {
            const target = xpState.activeTargets[i];
            const xpPerSec = formatNumber(target.xpPerSecond || 0);
            ns.print(`│   ${(i + 1)}. ${target.hostname.padEnd(30)} ${xpPerSec.padEnd(20)}XP/s │`);
        }
    }

    ns.print('└──────────────────────────────────────────────────────────────────────┘');
    ns.print('');
}

function monitorRecentLogs(ns: NS): void {
    const daemonLogs = readState(ns, '/daemon-log.txt', []);
    const xpLogs = readState(ns, '/logs/xp-farmer.txt', []);

    ns.print('┌─ RECENT LOGS ────────────────────────────────────────────────────────┐');

    // Combine and sort logs
    const allLogs = [...daemonLogs, ...xpLogs]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10);

    if (allLogs.length === 0) {
        ns.print('│ No logs found                                                        │');
    } else {
        for (const log of allLogs) {
            const time = new Date(log.timestamp).toLocaleTimeString();
            const levelColor = log.level === 'ERROR' ? '✗' :
                             log.level === 'WARN' ? '⚠' :
                             log.level === 'INFO' ? 'ℹ' : '·';
            const component = (log.component || 'Unknown').substring(0, 10).padEnd(10);
            const message = (log.message || '').substring(0, 45);

            ns.print(`│ ${time} ${levelColor} ${component} ${message.padEnd(45)}│`);
        }
    }

    ns.print('└──────────────────────────────────────────────────────────────────────┘');
    ns.print('');
}

export function autocomplete(): string[][] {
    return [
        ['all', 'state', 'logs', 'xp', 'daemon']
    ];
}
