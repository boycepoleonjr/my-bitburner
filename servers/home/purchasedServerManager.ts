import { readState, writeState, updateState, log, LogLevel, sendMessage, receiveMessage } from './ns-utils';

interface ManagerConfig {
    interval?: number;
    priority?: number;
    controlPort?: number;
    statusPort?: number;
    maxServers: number;
    targetRamPerServer: number; // in GB
    upgradePriority: 'balanced' | 'aggressive' | 'conservative';
    costThreshold: number; // fraction of available money to spend
    autoUpgrade: boolean;
    namePrefix: string;
    minRamForPurchase: number; // GB
}

const DEFAULT_CONFIG: ManagerConfig = {
    interval: 120000,
    priority: 5,
    maxServers: 25,
    targetRamPerServer: 1024,
    upgradePriority: 'balanced',
    costThreshold: 0.05,
    autoUpgrade: true,
    namePrefix: 'daemon-',
    minRamForPurchase: 8
};

const STATE_FILE = '/purchased-server-manager-state.txt';

export async function main(ns: NS): Promise<void> {
    const isDaemonMode = ns.args[0]?.toString() === 'daemon-mode';
    const daemonConfig = isDaemonMode && ns.args[1] ? JSON.parse(ns.args[1].toString()) : {};
    const config: ManagerConfig = { ...DEFAULT_CONFIG, ...daemonConfig };

    // Initialize state
    writeState(ns, STATE_FILE, {
        isActive: true,
        startTime: Date.now(),
        lastExecution: 0,
        managedServers: [] as string[],
        totals: { count: 0, totalRam: 0 }
    });

    log(ns, LogLevel.INFO, 'PurchasedServerManager', '🖥️ Starting Purchased Server Manager...');

    while (true) {
        const state = readState(ns, STATE_FILE, {});
        if (!state.isActive) {
            log(ns, LogLevel.INFO, 'PurchasedServerManager', 'Module deactivated, stopping...');
            break;
        }

        try {
            await managePurchasedServers(ns, config);
            state.lastExecution = Date.now();
            writeState(ns, STATE_FILE, state);

            if (isDaemonMode && config.statusPort) {
                reportStatusToDaemon(ns, config.statusPort);
            }

            if (isDaemonMode && config.controlPort) {
                await processControlCommands(ns, config.controlPort);
            }
        } catch (error) {
            log(ns, LogLevel.ERROR, 'PurchasedServerManager', `Error: ${error}`);
        }

        await ns.sleep(config.interval || 120000);
    }
}

async function managePurchasedServers(ns: NS, config: ManagerConfig): Promise<void> {
    try {
        const owned = ns.getPurchasedServers();
        const money = ns.getServerMoneyAvailable('home');
        const canBuyMore = owned.length < config.maxServers;

        // Purchase new server if allowed and affordable
        if (canBuyMore) {
            const name = `${config.namePrefix}${owned.length}`;
            const ram = Math.max(config.minRamForPurchase, Math.min(config.targetRamPerServer, 1048576));
            const cost = ns.getPurchasedServerCost(ram);
            if (cost <= money * config.costThreshold) {
                const newName = ns.purchaseServer(name, ram);
                if (newName) {
                    log(ns, LogLevel.INFO, 'PurchasedServerManager', `🛒 Purchased server ${newName} (${ram}GB)`);
                }
            }
        }

        // Track totals
        const totals = owned.reduce((acc, s) => {
            acc.count += 1;
            acc.totalRam += ns.getServerMaxRam(s);
            return acc;
        }, { count: 0, totalRam: 0 });

        updateState(ns, STATE_FILE, { managedServers: owned, totals });
    } catch (e) {
        // No-op
    }
}

function reportStatusToDaemon(ns: NS, statusPort: number): void {
    try {
        const state = readState(ns, STATE_FILE, {});
        sendMessage(ns, statusPort, {
            type: 'status_update',
            module: 'purchasedServerManager',
            data: {
                isActive: state.isActive,
                servers: (state.managedServers || []).length,
                totalRam: state.totals?.totalRam || 0,
                lastExecution: state.lastExecution || 0
            },
            timestamp: Date.now()
        });
    } catch (e) {
        // ignore
    }
}

async function processControlCommands(ns: NS, controlPort: number): Promise<void> {
    try {
        const cmd = receiveMessage(ns, controlPort);
        if (cmd) {
            switch (cmd.type) {
                case 'pause':
                    updateState(ns, STATE_FILE, { isActive: false });
                    log(ns, LogLevel.INFO, 'PurchasedServerManager', 'Paused by daemon');
                    break;
                case 'resume':
                    updateState(ns, STATE_FILE, { isActive: true });
                    log(ns, LogLevel.INFO, 'PurchasedServerManager', 'Resumed by daemon');
                    break;
            }
        }
    } catch (e) {
        // ignore
    }
}


