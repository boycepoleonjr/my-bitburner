/**
 * XP Farmer Module
 * VERSION: 1.4.0
 * LAST UPDATED: 2025-12-02
 *
 * A specialized module focused on maximizing hacking XP gains through
 * optimized weaken() and hack() operations across the entire network.
 *
 * Features:
 * - Dual operations: Hack operations (money + XP + raises security) and weaken operations (XP + lowers security)
 * - Smart targeting: Ranks servers by XP efficiency
 * - Dual mode: Standalone and daemon-managed operation
 * - Full network deployment: Uses all available RAM
 * - Statistics tracking: XP gained, money gained, operations, uptime, XP/sec
 * - State persistence: Config and state saved to files
 *
 * CHANGELOG:
 * - v1.4.0 (2025-12-02): Added hack operations for raising security and gaining money
 * - v1.3.0 (2025-12-02): Fixed premature script termination - only redeploy on target/allocation changes
 * - v1.2.0 (2025-12-02): Added component logging support
 * - v1.1.0 (2025-12-02): Fixed weaken script path from /tools/ to root
 * - v1.0.0 (2025-12-02): Initial XP farmer implementation
 */

import { ModuleExecutionContext, parseModeFromArgs, ResourceAllocation } from '/modules/module-interface';
import {
    readState,
    writeState,
    loadConfig,
    receiveMessage,
    sendMessage,
    hasMessages,
    scanNetwork,
    getRootedServers,
    startScript,
    hasFormulas,
    LogLevel,
    LoggingConfig,
    log,
    formatDuration,
    formatNumber
} from '/ns-utils';

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

interface XPFarmerConfig {
    enabled: boolean;
    priority: number;
    maxConcurrentTargets: number;
    updateInterval: number;
    targetRefreshInterval: number;
    minWeakenTime: number;
    hackRatio: number; // Percentage of threads to dedicate to hack operations (0.0 to 1.0)
    enableComponentLogs: boolean;
    componentLogMaxEntries: number;
    logLevel: LogLevel;
    controlPort?: number;
    statusPort?: number;
}

interface XPFarmerState {
    isActive: boolean;
    startTime: number;
    lastUpdate: number;
    lastTargetRefresh: number;
    activeTargets: XPTarget[];
    currentAllocation: ResourceAllocation | null;
    deployedPIDs: Record<string, number[]>;
    deployedHackPIDs: Record<string, number[]>;
    statistics: {
        totalXPGained: number;
        totalMoneyGained: number;
        totalOperations: number;
        averageXPPerSecond: number;
        uptimeSeconds: number;
        hackingLevelGained: number;
        startingHackingLevel: number;
    };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MODULE_NAME = 'xp-farmer';
const CONFIG_FILE = '/state/module-configs/xp-farmer-config.txt';
const STATE_FILE = '/state/module-configs/xp-farmer-state.txt';
const WEAKEN_SCRIPT = '/weaken.ts';
const HACK_SCRIPT = '/hack.ts';

const DEFAULT_CONFIG: XPFarmerConfig = {
    enabled: true,
    priority: 80,
    maxConcurrentTargets: 5,
    updateInterval: 30000,
    targetRefreshInterval: 300000,
    minWeakenTime: 60000,
    hackRatio: 0.3, // 30% hack operations, 70% weaken operations
    enableComponentLogs: true,
    componentLogMaxEntries: 500,
    logLevel: LogLevel.INFO,
};

// Global logging config
let loggingConfig: LoggingConfig;

// ============================================================================
// LOGGING HELPER
// ============================================================================

/**
 * Convert XPFarmerConfig to LoggingConfig
 */
function createLoggingConfig(config: XPFarmerConfig): LoggingConfig {
    return {
        logLevel: config.logLevel,
        enableComponentLogs: config.enableComponentLogs,
        componentLogMaxEntries: config.componentLogMaxEntries,
    };
}

/**
 * Helper function to log with module logging config
 */
function moduleLog(ns: NS, level: LogLevel, message: string): void {
    log(ns, level, MODULE_NAME, message, loggingConfig);
}

// ============================================================================
// XP TARGET ANALYSIS
// ============================================================================

/**
 * Analyze a single server for XP farming efficiency
 */
function analyzeXPTarget(ns: NS, hostname: string, useFormulas: boolean): XPTarget | null {
    try {
        const server = ns.getServer(hostname);
        const player = ns.getPlayer();

        // Skip servers we can't hack
        if (server.requiredHackingSkill > player.skills.hacking) {
            return null;
        }

        // Skip servers with special characteristics
        if (server.purchasedByPlayer || hostname === 'home') {
            return null;
        }

        let xpGain: number;
        let weakenTime: number;

        if (useFormulas) {
            // Precise calculation with formulas.exe
            xpGain = ns.formulas.hacking.hackExp(server, player);
            weakenTime = ns.formulas.hacking.weakenTime(server, player) / 1000; // Convert to seconds
        } else {
            // Fallback heuristic
            xpGain = server.requiredHackingSkill * 3;
            weakenTime = ns.getWeakenTime(hostname) / 1000; // Convert to seconds
        }

        // Filter out servers with weaken time too fast (often not worth it)
        if (weakenTime * 1000 < DEFAULT_CONFIG.minWeakenTime) {
            return null;
        }

        const xpPerSecond = xpGain / weakenTime;

        return {
            hostname,
            xpPerSecond,
            weakenTime,
            xpGain,
            requiredHackLevel: server.requiredHackingSkill
        };
    } catch (error) {
        ns.print(`ERROR: Failed to analyze XP target ${hostname}: ${error}`);
        return null;
    }
}

/**
 * Scan network and analyze all servers for XP efficiency
 */
function analyzeAllXPTargets(ns: NS): XPTarget[] {
    const useFormulas = hasFormulas(ns);
    const allServers = scanNetwork(ns);
    const targets: XPTarget[] = [];

    for (const hostname of allServers) {
        const target = analyzeXPTarget(ns, hostname, useFormulas);
        if (target !== null) {
            targets.push(target);
        }
    }

    // Sort by XP per second (descending)
    targets.sort((a, b) => b.xpPerSecond - a.xpPerSecond);

    return targets;
}

/**
 * Select the best N targets from analyzed list
 */
function selectBestXPTargets(ns: NS, targets: XPTarget[], maxCount: number): XPTarget[] {
    // Take top N targets
    const selected = targets.slice(0, Math.min(maxCount, targets.length));

    ns.print(`INFO: Selected ${selected.length} XP targets:`);
    for (let i = 0; i < selected.length; i++) {
        const target = selected[i];
        ns.print(`  ${i + 1}. ${target.hostname} - ${formatNumber(target.xpPerSecond)} XP/sec (${target.xpGain.toFixed(0)} XP in ${target.weakenTime.toFixed(0)}s)`);
    }

    return selected;
}

// ============================================================================
// DEPLOYMENT & THREAD ALLOCATION
// ============================================================================

/**
 * Calculate how to distribute threads across targets based on available RAM
 * Only used for weaken operations (hackRatio is subtracted from total)
 */
function calculateThreadAllocation(
    ns: NS,
    targets: XPTarget[],
    allocation: ResourceAllocation,
    hackRatio: number
): Map<XPTarget, number> {
    const scriptRam = ns.getScriptRam(WEAKEN_SCRIPT);
    if (scriptRam === 0) {
        ns.print(`ERROR: Cannot find ${WEAKEN_SCRIPT} or it has 0 RAM cost`);
        return new Map();
    }

    // Use only the weaken portion of RAM (1 - hackRatio)
    const totalAvailableRam = allocation.allocatedRam * (1 - hackRatio);
    const totalThreads = Math.floor(totalAvailableRam / scriptRam);

    if (totalThreads < 1) {
        ns.print(`WARN: Not enough RAM for even 1 weaken thread (need ${scriptRam}GB, have ${totalAvailableRam}GB)`);
        return new Map();
    }

    // Distribute threads proportionally based on XP efficiency
    const totalXPWeight = targets.reduce((sum, t) => sum + t.xpPerSecond, 0);
    const threadAllocation = new Map<XPTarget, number>();

    let threadsAssigned = 0;
    for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        let threads: number;

        if (i === targets.length - 1) {
            // Last target gets remaining threads
            threads = totalThreads - threadsAssigned;
        } else {
            // Proportional allocation
            const weight = target.xpPerSecond / totalXPWeight;
            threads = Math.floor(totalThreads * weight);
        }

        // Ensure at least 1 thread per target
        threads = Math.max(1, threads);
        threadAllocation.set(target, threads);
        threadsAssigned += threads;
    }

    ns.print(`INFO: Allocated ${totalThreads} weaken threads across ${targets.length} targets`);
    for (const [target, threads] of threadAllocation) {
        ns.print(`  ${target.hostname}: ${threads} weaken threads`);
    }

    return threadAllocation;
}

/**
 * Deploy weaken operations across the network
 * Only uses (1 - hackRatio) of available RAM
 */
function deployWeakenOperations(
    ns: NS,
    targets: XPTarget[],
    allocation: ResourceAllocation,
    hackRatio: number
): Record<string, number[]> {
    const threadAllocation = calculateThreadAllocation(ns, targets, allocation, hackRatio);
    const deployedPIDs: Record<string, number[]> = {};
    const scriptRam = ns.getScriptRam(WEAKEN_SCRIPT);

    // Get list of available servers with RAM (adjust for weaken portion only)
    const serverList = Object.entries(allocation.serverAllocations)
        .map(([hostname, ramGB]) => ({ hostname, ramGB: ramGB * (1 - hackRatio) }))
        .filter(s => s.ramGB >= scriptRam)
        .sort((a, b) => b.ramGB - a.ramGB); // Deploy to largest servers first

    // Deploy each target
    for (const [target, totalThreads] of threadAllocation) {
        let threadsRemaining = totalThreads;
        const pids: number[] = [];

        // Distribute threads across servers
        for (const server of serverList) {
            if (threadsRemaining <= 0) break;

            const maxThreadsOnServer = Math.floor(server.ramGB / scriptRam);
            const threadsToUse = Math.min(threadsRemaining, maxThreadsOnServer);

            if (threadsToUse < 1) continue;

            // Copy script to server if needed
            if (!ns.fileExists(WEAKEN_SCRIPT, server.hostname)) {
                ns.scp(WEAKEN_SCRIPT, server.hostname);
            }

            // Start the weaken script
            const pid = ns.exec(WEAKEN_SCRIPT, server.hostname, threadsToUse, target.hostname);
            if (pid > 0) {
                pids.push(pid);
                threadsRemaining -= threadsToUse;
                // Reduce available RAM on this server
                server.ramGB -= threadsToUse * scriptRam;
            }
        }

        if (pids.length > 0) {
            deployedPIDs[target.hostname] = pids;
            ns.print(`INFO: Deployed ${totalThreads - threadsRemaining} weaken threads for ${target.hostname} (${pids.length} processes)`);
        }
    }

    return deployedPIDs;
}

/**
 * Deploy hack operations across the network
 */
function deployHackOperations(
    ns: NS,
    targets: XPTarget[],
    allocation: ResourceAllocation,
    hackRatio: number
): Record<string, number[]> {
    const scriptRam = ns.getScriptRam(HACK_SCRIPT);
    if (scriptRam === 0) {
        ns.print(`ERROR: Cannot find ${HACK_SCRIPT} or it has 0 RAM cost`);
        return {};
    }

    const deployedPIDs: Record<string, number[]> = {};

    // Calculate total threads for hack operations based on ratio
    const totalAvailableRam = allocation.allocatedRam * hackRatio;
    const totalThreads = Math.floor(totalAvailableRam / scriptRam);

    if (totalThreads < 1) {
        ns.print(`WARN: Not enough RAM for hack operations`);
        return {};
    }

    // Distribute threads across targets
    const threadsPerTarget = Math.floor(totalThreads / targets.length);
    if (threadsPerTarget < 1) {
        ns.print(`WARN: Not enough threads for hack operations per target`);
        return {};
    }

    // Get list of available servers with RAM
    const serverList = Object.entries(allocation.serverAllocations)
        .map(([hostname, ramGB]) => ({ hostname, ramGB: ramGB * hackRatio }))
        .filter(s => s.ramGB >= scriptRam)
        .sort((a, b) => b.ramGB - a.ramGB);

    // Deploy hack operations to each target
    for (const target of targets) {
        let threadsRemaining = threadsPerTarget;
        const pids: number[] = [];

        for (const server of serverList) {
            if (threadsRemaining <= 0) break;

            const maxThreadsOnServer = Math.floor(server.ramGB / scriptRam);
            const threadsToUse = Math.min(threadsRemaining, maxThreadsOnServer);

            if (threadsToUse < 1) continue;

            // Copy script to server if needed
            if (!ns.fileExists(HACK_SCRIPT, server.hostname)) {
                ns.scp(HACK_SCRIPT, server.hostname);
            }

            // Start the hack script
            const pid = ns.exec(HACK_SCRIPT, server.hostname, threadsToUse, target.hostname);
            if (pid > 0) {
                pids.push(pid);
                threadsRemaining -= threadsToUse;
                server.ramGB -= threadsToUse * scriptRam;
            }
        }

        if (pids.length > 0) {
            deployedPIDs[target.hostname] = pids;
            ns.print(`INFO: Deployed ${threadsPerTarget - threadsRemaining} hack threads for ${target.hostname} (${pids.length} processes)`);
        }
    }

    return deployedPIDs;
}

/**
 * Kill all deployed operations (both weaken and hack)
 */
function killAllDeployedOperations(
    ns: NS,
    deployedPIDs: Record<string, number[]>,
    deployedHackPIDs?: Record<string, number[]>
): void {
    let killedCount = 0;

    // Kill weaken operations
    for (const [target, pids] of Object.entries(deployedPIDs)) {
        for (const pid of pids) {
            if (ns.kill(pid)) {
                killedCount++;
            }
        }
    }

    // Kill hack operations
    if (deployedHackPIDs) {
        for (const [target, pids] of Object.entries(deployedHackPIDs)) {
            for (const pid of pids) {
                if (ns.kill(pid)) {
                    killedCount++;
                }
            }
        }
    }

    ns.print(`INFO: Killed ${killedCount} deployed operations`);
}

// ============================================================================
// STATISTICS & STATE MANAGEMENT
// ============================================================================

/**
 * Update XP statistics based on current player level
 */
function updateXPStatistics(ns: NS, state: XPFarmerState): void {
    const currentLevel = ns.getPlayer().skills.hacking;
    const levelGain = currentLevel - state.statistics.startingHackingLevel;
    state.statistics.hackingLevelGained = levelGain;

    const uptimeSeconds = (Date.now() - state.startTime) / 1000;
    state.statistics.uptimeSeconds = uptimeSeconds;

    // Calculate average XP/sec based on level gains
    // Rough estimate: each level requires exponentially more XP
    // Using simplified formula: XP for level L ≈ L^2 * 25
    const xpGained = calculateTotalXPFromLevels(state.statistics.startingHackingLevel, currentLevel);
    state.statistics.totalXPGained = xpGained;

    if (uptimeSeconds > 0) {
        state.statistics.averageXPPerSecond = xpGained / uptimeSeconds;
    }

    state.lastUpdate = Date.now();
}

/**
 * Calculate total XP gained between two levels
 */
function calculateTotalXPFromLevels(startLevel: number, endLevel: number): number {
    let totalXP = 0;
    for (let level = startLevel + 1; level <= endLevel; level++) {
        totalXP += Math.pow(level - 1, 2) * 25;
    }
    return totalXP;
}

/**
 * Initialize module state
 */
function initializeState(ns: NS): XPFarmerState {
    const existingState = readState(ns, STATE_FILE, null);

    // If we have existing state and it's recent, restore it
    if (existingState && existingState.isActive) {
        ns.print(`INFO: Restoring previous state from ${STATE_FILE}`);
        // Ensure deployedHackPIDs exists for older states
        if (!existingState.deployedHackPIDs) {
            existingState.deployedHackPIDs = {};
        }
        if (existingState.statistics && !existingState.statistics.totalMoneyGained) {
            existingState.statistics.totalMoneyGained = 0;
        }
        return existingState;
    }

    // Create fresh state
    const initialState: XPFarmerState = {
        isActive: false,
        startTime: Date.now(),
        lastUpdate: Date.now(),
        lastTargetRefresh: 0,
        activeTargets: [],
        currentAllocation: null,
        deployedPIDs: {},
        deployedHackPIDs: {},
        statistics: {
            totalXPGained: 0,
            totalMoneyGained: 0,
            totalOperations: 0,
            averageXPPerSecond: 0,
            uptimeSeconds: 0,
            hackingLevelGained: 0,
            startingHackingLevel: ns.getPlayer().skills.hacking
        }
    };

    writeState(ns, STATE_FILE, initialState);
    return initialState;
}

/**
 * Save current state to file
 */
function saveState(ns: NS, state: XPFarmerState): void {
    writeState(ns, STATE_FILE, state);
}

// ============================================================================
// RESOURCE ALLOCATION
// ============================================================================

/**
 * Calculate available resources in standalone mode
 */
function calculateStandaloneAllocation(ns: NS): ResourceAllocation {
    const rootedServers = getRootedServers(ns);
    const serverAllocations: Record<string, number> = {};
    let totalAllocated = 0;

    for (const hostname of rootedServers) {
        const maxRam = ns.getServerMaxRam(hostname);
        const usedRam = ns.getServerUsedRam(hostname);
        const availableRam = maxRam - usedRam;

        // Reserve 32GB on home for other scripts
        const reservedRam = hostname === 'home' ? Math.min(32, maxRam * 0.2) : 0;
        const allocatableRam = Math.max(0, availableRam - reservedRam);

        if (allocatableRam > 0) {
            serverAllocations[hostname] = allocatableRam;
            totalAllocated += allocatableRam;
        }
    }

    return {
        moduleName: MODULE_NAME,
        allocatedRam: totalAllocated,
        serverAllocations
    };
}

// ============================================================================
// CONTROL MESSAGE HANDLING
// ============================================================================

/**
 * Handle control messages from daemon
 */
function handleControlMessage(ns: NS, message: any, state: XPFarmerState, config: XPFarmerConfig): boolean {
    ns.print(`INFO: Received control message: ${message.type}`);

    switch (message.type) {
        case 'start':
            state.isActive = true;
            if (message.config) {
                Object.assign(config, message.config);
            }
            ns.print(`INFO: Module started`);
            return true;

        case 'stop':
            state.isActive = false;
            killAllDeployedOperations(ns, state.deployedPIDs, state.deployedHackPIDs);
            state.deployedPIDs = {};
            state.deployedHackPIDs = {};
            ns.print(`INFO: Module stopped`);
            return true;

        case 'pause':
            state.isActive = false;
            killAllDeployedOperations(ns, state.deployedPIDs, state.deployedHackPIDs);
            state.deployedPIDs = {};
            state.deployedHackPIDs = {};
            ns.print(`INFO: Module paused`);
            return true;

        case 'resume':
            state.isActive = true;
            ns.print(`INFO: Module resumed`);
            return true;

        case 'config_update':
            if (message.config) {
                Object.assign(config, message.config);
                writeState(ns, CONFIG_FILE, config);
                ns.print(`INFO: Config updated`);
            }
            return true;

        case 'resource_allocation':
            if (message.allocation) {
                state.currentAllocation = message.allocation;
                ns.print(`INFO: Resource allocation updated: ${message.allocation.allocatedRam.toFixed(2)}GB`);
            }
            return true;

        default:
            ns.print(`WARN: Unknown control message type: ${message.type}`);
            return false;
    }
}

// ============================================================================
// STATUS REPORTING
// ============================================================================

/**
 * Send status update to daemon
 */
function sendStatusUpdate(ns: NS, statusPort: number, state: XPFarmerState, config: XPFarmerConfig): void {
    const statusMessage = {
        type: 'status_update',
        moduleName: MODULE_NAME,
        timestamp: Date.now(),
        data: {
            isActive: state.isActive,
            isHealthy: true,
            ramUsage: state.currentAllocation?.allocatedRam || 0,
            statistics: {
                moduleName: MODULE_NAME,
                uptime: state.statistics.uptimeSeconds,
                operationCount: state.statistics.totalOperations,
                successRate: 1.0,
                customMetrics: {
                    totalXPGained: state.statistics.totalXPGained,
                    averageXPPerSecond: state.statistics.averageXPPerSecond,
                    hackingLevelGained: state.statistics.hackingLevelGained,
                    activeTargets: state.activeTargets.length
                }
            },
            errors: []
        }
    };

    sendMessage(ns, statusPort, statusMessage);
}

// ============================================================================
// EXECUTION MODES
// ============================================================================

/**
 * Run in standalone mode (no daemon)
 */
async function runStandaloneMode(ns: NS, config: XPFarmerConfig): Promise<void> {
    ns.print(`INFO: Running in STANDALONE mode`);
    const state = initializeState(ns);
    state.isActive = true;

    const useFormulas = hasFormulas(ns);
    ns.print(`INFO: Formulas.exe ${useFormulas ? 'available' : 'not available'} - using ${useFormulas ? 'precise' : 'heuristic'} calculations`);

    let lastTargetRefresh = 0;
    let lastDeployment = 0;
    let allTargets: XPTarget[] = [];
    let previousTargetHostnames: string[] = [];

    while (true) {
        try {
            const now = Date.now();
            let shouldRedeploy = false;

            // Check if we need to refresh target list
            if (now - lastTargetRefresh > config.targetRefreshInterval || allTargets.length === 0) {
                ns.print(`INFO: Refreshing target list...`);
                allTargets = analyzeAllXPTargets(ns);
                lastTargetRefresh = now;
                ns.print(`INFO: Found ${allTargets.length} potential XP targets`);
            }

            // Select best targets
            const selectedTargets = selectBestXPTargets(ns, allTargets, config.maxConcurrentTargets);
            const currentTargetHostnames = selectedTargets.map(t => t.hostname);

            // Check if targets changed
            if (JSON.stringify(currentTargetHostnames) !== JSON.stringify(previousTargetHostnames)) {
                ns.print(`INFO: Target list changed, redeploying...`);
                shouldRedeploy = true;
                previousTargetHostnames = currentTargetHostnames;
            }

            // Check if we need to deploy (first run or targets changed)
            if (Object.keys(state.deployedPIDs).length === 0) {
                shouldRedeploy = true;
            }

            // Calculate resource allocation
            const allocation = calculateStandaloneAllocation(ns);
            state.currentAllocation = allocation;

            // Only redeploy if targets changed or no operations running
            if (shouldRedeploy) {
                ns.print(`INFO: Available RAM: ${allocation.allocatedRam.toFixed(2)}GB across ${Object.keys(allocation.serverAllocations).length} servers`);

                // Kill old operations only when redeploying
                if (Object.keys(state.deployedPIDs).length > 0) {
                    killAllDeployedOperations(ns, state.deployedPIDs);
                }

                // Deploy new operations
                state.activeTargets = selectedTargets;
                state.deployedPIDs = deployWeakenOperations(ns, selectedTargets, allocation);
                state.statistics.totalOperations++;
                lastDeployment = now;
            }

            // Update statistics
            updateXPStatistics(ns, state);

            // Save state
            saveState(ns, state);

            // Print statistics
            ns.print(`\n=== XP FARMER STATISTICS ===`);
            ns.print(`Uptime: ${formatDuration(state.statistics.uptimeSeconds * 1000)}`);
            ns.print(`Total XP Gained: ${formatNumber(state.statistics.totalXPGained)}`);
            ns.print(`Average XP/sec: ${formatNumber(state.statistics.averageXPPerSecond)}`);
            ns.print(`Hacking Levels Gained: ${state.statistics.hackingLevelGained}`);
            ns.print(`Active Targets: ${state.activeTargets.length}`);
            ns.print(`============================\n`);

            // Wait for next update
            await ns.sleep(config.updateInterval);

        } catch (error) {
            ns.print(`ERROR: Exception in main loop: ${error}`);
            await ns.sleep(5000);
        }
    }
}

/**
 * Run in daemon-managed mode
 */
async function runDaemonMode(
    ns: NS,
    config: XPFarmerConfig,
    controlPort: number,
    statusPort: number
): Promise<void> {
    ns.print(`INFO: Running in DAEMON-MANAGED mode`);
    ns.print(`INFO: Control port: ${controlPort}, Status port: ${statusPort}`);

    const state = initializeState(ns);
    const useFormulas = hasFormulas(ns);
    ns.print(`INFO: Formulas.exe ${useFormulas ? 'available' : 'not available'}`);

    let lastTargetRefresh = 0;
    let lastDeployment = 0;
    let allTargets: XPTarget[] = [];
    let previousTargetHostnames: string[] = [];
    let previousAllocationRam = 0;

    while (true) {
        try {
            // Check for control messages
            while (hasMessages(ns, controlPort)) {
                const message = receiveMessage(ns, controlPort);
                if (message) {
                    handleControlMessage(ns, message, state, config);
                }
            }

            // Only operate if active
            if (state.isActive) {
                const now = Date.now();
                let shouldRedeploy = false;

                // Refresh targets if needed
                if (now - lastTargetRefresh > config.targetRefreshInterval || allTargets.length === 0) {
                    allTargets = analyzeAllXPTargets(ns);
                    lastTargetRefresh = now;
                }

                // Select best targets
                const selectedTargets = selectBestXPTargets(ns, allTargets, config.maxConcurrentTargets);
                const currentTargetHostnames = selectedTargets.map(t => t.hostname);

                // Check if targets changed
                if (JSON.stringify(currentTargetHostnames) !== JSON.stringify(previousTargetHostnames)) {
                    shouldRedeploy = true;
                    previousTargetHostnames = currentTargetHostnames;
                }

                // Get allocation (from daemon or calculate ourselves)
                let allocation = state.currentAllocation;
                if (!allocation) {
                    allocation = calculateStandaloneAllocation(ns);
                    state.currentAllocation = allocation;
                }

                // Check if allocation changed significantly (more than 20%)
                const allocationChange = Math.abs(allocation.allocatedRam - previousAllocationRam) / Math.max(previousAllocationRam, 1);
                if (allocationChange > 0.2) {
                    shouldRedeploy = true;
                    previousAllocationRam = allocation.allocatedRam;
                }

                // Check if we need to deploy (first run)
                if (Object.keys(state.deployedPIDs).length === 0) {
                    shouldRedeploy = true;
                }

                // Only redeploy when necessary
                if (shouldRedeploy) {
                    // Kill old operations only when redeploying
                    if (Object.keys(state.deployedPIDs).length > 0) {
                        killAllDeployedOperations(ns, state.deployedPIDs);
                    }

                    // Deploy new operations
                    state.activeTargets = selectedTargets;
                    state.deployedPIDs = deployWeakenOperations(ns, selectedTargets, allocation);
                    state.statistics.totalOperations++;
                    lastDeployment = now;
                }

                // Update statistics
                updateXPStatistics(ns, state);

                // Save state
                saveState(ns, state);
            }

            // Send status update
            sendStatusUpdate(ns, statusPort, state, config);

            // Wait for next update
            await ns.sleep(config.updateInterval);

        } catch (error) {
            ns.print(`ERROR: Exception in daemon loop: ${error}`);
            await ns.sleep(5000);
        }
    }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function main(ns: NS): Promise<void> {
    ns.disableLog('ALL');
    ns.print(`\n=== XP FARMER MODULE ===`);
    ns.print(`Starting up...`);

    // Load configuration
    const config = loadConfig(ns, CONFIG_FILE, DEFAULT_CONFIG);
    ns.print(`INFO: Config loaded from ${CONFIG_FILE}`);

    // Parse execution mode from arguments
    const context = parseModeFromArgs(ns.args);
    ns.print(`INFO: Execution mode: ${context.mode}`);

    // Merge context config with loaded config
    if (context.config && Object.keys(context.config).length > 0) {
        Object.assign(config, context.config);
    }

    // Initialize logging config
    loggingConfig = createLoggingConfig(config);

    // Run appropriate mode
    if (context.mode === 'daemon-managed' && context.controlPort && context.statusPort) {
        await runDaemonMode(ns, config, context.controlPort, context.statusPort);
    } else {
        await runStandaloneMode(ns, config);
    }
}
