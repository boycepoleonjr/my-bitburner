/**
 * Early Game Bootstrap Module
 * VERSION: 1.0.0
 * LAST UPDATED: 2025-12-02
 *
 * Automates early game progression through three sequential phases:
 * 1. Training Phase - Attend university (free) until reaching level 50
 * 2. Hacking Phase - Farm money via hack/grow/weaken until $10M
 * 3. RAM Expansion Phase - Purchase 25 remote servers and upgrade home RAM
 *
 * Features:
 * - State machine architecture for phase management
 * - Singularity API integration for training and upgrades
 * - Smart target selection for money farming
 * - Safe spending thresholds (10-15% of money)
 * - Daemon-managed and standalone modes
 * - Comprehensive statistics and logging
 *
 * CHANGELOG:
 * - v1.0.0 (2025-12-02): Initial implementation
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
    LogLevel,
    LoggingConfig,
    log,
    formatDuration,
    formatNumber
} from '/ns-utils';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type Phase = 'training' | 'hacking' | 'ram_expansion' | 'completed';
type Operation = 'weaken' | 'grow' | 'hack';

interface HackTarget {
    hostname: string;
    moneyAvailable: number;
    moneyMax: number;
    securityLevel: number;
    minSecurityLevel: number;
    requiredHackLevel: number;
    hackChance: number;
    moneyPerSecond: number;
    priority: number;
}

interface PhaseTransition {
    from: string;
    to: string;
    timestamp: number;
    reason: string;
}

interface EarlyGameConfig {
    // Module metadata
    enabled: boolean;
    priority: number;
    minRamRequired: number;
    optimalRamRequired: number;
    controlPort?: number;
    statusPort?: number;
    updateInterval: number;

    // Training thresholds
    trainingMinLevel: number;
    trainingMaxLevel: number;
    trainingUniversity: string;
    trainingCourse: string;

    // Money farming thresholds
    moneyStartThreshold: number;
    moneyTargetAmount: number;
    moneyReserve: number;

    // Hacking config
    maxConcurrentTargets: number;
    minTargetMoney: number;
    securityThreshold: number;
    moneyThreshold: number;
    targetRefreshInterval: number;

    // RAM expansion config
    purchasedServerPrefix: string;
    purchasedServerStartRam: number;
    purchasedServerMaxCount: number;
    purchasedServerCostThreshold: number;
    homeRamUpgradeCostThreshold: number;
    homeRamUpgradePriority: boolean;

    // Logging
    enableComponentLogs: boolean;
    componentLogMaxEntries: number;
    logLevel: LogLevel;
}

interface TrainingState {
    isTraining: boolean;
    startingLevel: number;
    currentLevel: number;
    levelsGained: number;
    trainingStartTime: number;
    totalTrainingTime: number;
}

interface HackingState {
    activeTargets: HackTarget[];
    deployedPIDs: Record<string, number[]>;
    deployedGrowPIDs: Record<string, number[]>;
    deployedHackPIDs: Record<string, number[]>;
    lastTargetRefresh: number;
    moneyEarned: number;
    totalOperations: number;
    previousMoney: number;
}

interface RamExpansionState {
    purchasedServers: string[];
    lastPurchaseTime: number;
    totalServersOwned: number;
    totalRamPurchased: number;
    homeRamUpgrades: number;
    lastHomeUpgradeTime: number;
    totalMoneySpent: number;
}

interface EarlyGameState {
    isActive: boolean;
    startTime: number;
    lastUpdate: number;

    currentPhase: Phase;
    phaseStartTime: number;
    phaseTransitionHistory: PhaseTransition[];

    trainingState: TrainingState;
    hackingState: HackingState;
    ramExpansionState: RamExpansionState;

    currentAllocation: ResourceAllocation | null;

    statistics: {
        totalMoneyEarned: number;
        totalMoneySpent: number;
        totalLevelsGained: number;
        totalRamAcquired: number;
        phaseDurations: Record<string, number>;
        operationCounts: Record<string, number>;
        averageMoneyPerSecond: number;
    };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MODULE_NAME = 'early-game';
const CONFIG_FILE = '/state/module-configs/early-game-config.txt';
const STATE_FILE = '/state/module-configs/early-game-state.txt';
const WEAKEN_SCRIPT = '/weaken.ts';
const GROW_SCRIPT = '/grow.ts';
const HACK_SCRIPT = '/hack.ts';

const DEFAULT_CONFIG: EarlyGameConfig = {
    enabled: true,
    priority: 95,
    minRamRequired: 8,
    optimalRamRequired: 128,
    updateInterval: 15000,

    trainingMinLevel: 20,
    trainingMaxLevel: 50,
    trainingUniversity: "Rothman University",
    trainingCourse: "Study Computer Science",

    moneyStartThreshold: 1000000,      // $1M
    moneyTargetAmount: 10000000,       // $10M
    moneyReserve: 100000,              // $100k

    maxConcurrentTargets: 3,
    minTargetMoney: 100000,            // $100k
    securityThreshold: 5,
    moneyThreshold: 0.5,
    targetRefreshInterval: 300000,     // 5 minutes

    purchasedServerPrefix: "pserv-",
    purchasedServerStartRam: 8,
    purchasedServerMaxCount: 25,
    purchasedServerCostThreshold: 0.1,
    homeRamUpgradeCostThreshold: 0.15,
    homeRamUpgradePriority: false,

    enableComponentLogs: true,
    componentLogMaxEntries: 500,
    logLevel: LogLevel.INFO,
};

// Global logging config
let loggingConfig: LoggingConfig;

// ============================================================================
// LOGGING HELPER
// ============================================================================

function createLoggingConfig(config: EarlyGameConfig): LoggingConfig {
    return {
        logLevel: config.logLevel,
        enableComponentLogs: config.enableComponentLogs,
        componentLogMaxEntries: config.componentLogMaxEntries,
    };
}

function moduleLog(ns: NS, level: LogLevel, message: string): void {
    log(ns, level, MODULE_NAME, message, loggingConfig);
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

function initializeState(ns: NS): EarlyGameState {
    const existingState = readState(ns, STATE_FILE, null);

    if (existingState && existingState.isActive) {
        moduleLog(ns, LogLevel.INFO, `Restoring previous state from ${STATE_FILE}`);
        return existingState;
    }

    const currentLevel = ns.getHackingLevel();
    const initialState: EarlyGameState = {
        isActive: false,
        startTime: Date.now(),
        lastUpdate: Date.now(),

        currentPhase: 'training',
        phaseStartTime: Date.now(),
        phaseTransitionHistory: [],

        trainingState: {
            isTraining: false,
            startingLevel: currentLevel,
            currentLevel: currentLevel,
            levelsGained: 0,
            trainingStartTime: 0,
            totalTrainingTime: 0,
        },

        hackingState: {
            activeTargets: [],
            deployedPIDs: {},
            deployedGrowPIDs: {},
            deployedHackPIDs: {},
            lastTargetRefresh: 0,
            moneyEarned: 0,
            totalOperations: 0,
            previousMoney: ns.getServerMoneyAvailable('home'),
        },

        ramExpansionState: {
            purchasedServers: [],
            lastPurchaseTime: 0,
            totalServersOwned: 0,
            totalRamPurchased: 0,
            homeRamUpgrades: 0,
            lastHomeUpgradeTime: 0,
            totalMoneySpent: 0,
        },

        currentAllocation: null,

        statistics: {
            totalMoneyEarned: 0,
            totalMoneySpent: 0,
            totalLevelsGained: 0,
            totalRamAcquired: 0,
            phaseDurations: {},
            operationCounts: {},
            averageMoneyPerSecond: 0,
        },
    };

    writeState(ns, STATE_FILE, initialState);
    return initialState;
}

function saveState(ns: NS, state: EarlyGameState): void {
    writeState(ns, STATE_FILE, state);
}

// ============================================================================
// PHASE EVALUATION & TRANSITIONS
// ============================================================================

function evaluatePhase(ns: NS, state: EarlyGameState, config: EarlyGameConfig): Phase {
    const currentLevel = ns.getHackingLevel();
    const currentMoney = ns.getServerMoneyAvailable('home');
    const ownedServers = ns.getPurchasedServers();

    let homeUpgradeCost = Infinity;
    try {
        homeUpgradeCost = ns.singularity.getUpgradeHomeRamCost();
    } catch (e) {
        // Singularity API not available
    }

    const canUpgradeHome = homeUpgradeCost !== Infinity && homeUpgradeCost > 0;
    const canBuyServers = ownedServers.length < config.purchasedServerMaxCount;

    // Priority 1: Training if level too low
    if (currentLevel < config.trainingMinLevel) {
        return 'training';
    }

    // Priority 2: Hacking if money too low
    if (currentMoney < config.moneyStartThreshold) {
        return 'hacking';
    }

    // Priority 3: RAM expansion if available
    if (canBuyServers || canUpgradeHome) {
        return 'ram_expansion';
    }

    // Priority 4: Continue training if not maxed and money not at target
    if (currentLevel < config.trainingMaxLevel && currentMoney < config.moneyTargetAmount) {
        return 'training';
    }

    // All objectives met
    return 'completed';
}

function transitionPhase(ns: NS, state: EarlyGameState, newPhase: Phase, reason: string): void {
    if (state.currentPhase === newPhase) return;

    const now = Date.now();
    const oldPhase = state.currentPhase;

    // Record phase duration
    const phaseDuration = now - state.phaseStartTime;
    if (!state.statistics.phaseDurations[oldPhase]) {
        state.statistics.phaseDurations[oldPhase] = 0;
    }
    state.statistics.phaseDurations[oldPhase] += phaseDuration;

    // Record transition
    state.phaseTransitionHistory.push({
        from: oldPhase,
        to: newPhase,
        timestamp: now,
        reason,
    });

    // Cleanup old phase
    if (oldPhase === 'training' && state.trainingState.isTraining) {
        try {
            ns.singularity.stopAction();
            state.trainingState.isTraining = false;
            moduleLog(ns, LogLevel.INFO, 'Stopped university training');
        } catch (e) {
            moduleLog(ns, LogLevel.WARN, `Failed to stop training: ${e}`);
        }
    } else if (oldPhase === 'hacking') {
        killAllHackingOperations(ns, state);
    }

    state.currentPhase = newPhase;
    state.phaseStartTime = now;

    moduleLog(ns, LogLevel.INFO, `Phase transition: ${oldPhase} → ${newPhase} (${reason})`);
}

// ============================================================================
// TRAINING PHASE
// ============================================================================

async function executeTrainingPhase(ns: NS, config: EarlyGameConfig, state: EarlyGameState): Promise<void> {
    const currentLevel = ns.getHackingLevel();

    // Update current level
    state.trainingState.currentLevel = currentLevel;
    state.trainingState.levelsGained = currentLevel - state.trainingState.startingLevel;

    // Check if training complete
    if (currentLevel >= config.trainingMaxLevel) {
        if (state.trainingState.isTraining) {
            try {
                ns.singularity.stopAction();
                state.trainingState.isTraining = false;
                moduleLog(ns, LogLevel.INFO, `Training complete - reached level ${currentLevel}`);
            } catch (e) {
                moduleLog(ns, LogLevel.WARN, `Failed to stop training: ${e}`);
            }
        }
        return;
    }

    // Start training if needed
    if (!state.trainingState.isTraining) {
        try {
            const success = ns.singularity.universityCourse(
                config.trainingUniversity,
                config.trainingCourse,
                false  // don't require focus
            );

            if (success) {
                state.trainingState.isTraining = true;
                state.trainingState.trainingStartTime = Date.now();
                moduleLog(ns, LogLevel.INFO,
                    `Started training at ${config.trainingUniversity} (Level ${currentLevel} → ${config.trainingMaxLevel})`);
            } else {
                moduleLog(ns, LogLevel.ERROR,
                    'Failed to start university training - Singularity API may be unavailable');
            }
        } catch (e) {
            moduleLog(ns, LogLevel.ERROR, `Training error: ${e}`);
        }
    }

    // Update training time
    if (state.trainingState.isTraining) {
        state.trainingState.totalTrainingTime = Date.now() - state.trainingState.trainingStartTime;
    }
}

// ============================================================================
// HACKING PHASE - TARGET ANALYSIS
// ============================================================================

function analyzeMoneyTarget(ns: NS, hostname: string, config: EarlyGameConfig): HackTarget | null {
    try {
        const server = ns.getServer(hostname);
        const player = ns.getPlayer();

        // Filter criteria
        if (server.requiredHackingSkill === undefined || server.requiredHackingSkill > player.skills.hacking) {
            return null;
        }
        if (server.purchasedByPlayer || hostname === 'home') {
            return null;
        }
        if (!server.moneyMax || server.moneyMax < config.minTargetMoney) {
            return null;
        }

        // Calculate efficiency
        const hackTime = ns.getHackTime(hostname) / 1000; // seconds
        const hackChance = ns.hackAnalyzeChance(hostname);
        const hackPercent = ns.hackAnalyze(hostname);
        const expectedMoney = server.moneyMax * hackPercent * hackChance;
        const moneyPerSecond = hackTime > 0 ? expectedMoney / hackTime : 0;

        return {
            hostname,
            moneyAvailable: server.moneyAvailable || 0,
            moneyMax: server.moneyMax,
            securityLevel: server.hackDifficulty || server.minDifficulty || 0,
            minSecurityLevel: server.minDifficulty || 0,
            requiredHackLevel: server.requiredHackingSkill,
            hackChance,
            moneyPerSecond,
            priority: moneyPerSecond,
        };
    } catch (error) {
        return null;
    }
}

function selectMoneyTargets(ns: NS, config: EarlyGameConfig): HackTarget[] {
    const allServers = scanNetwork(ns);
    const targets: HackTarget[] = [];

    for (const hostname of allServers) {
        const target = analyzeMoneyTarget(ns, hostname, config);
        if (target) {
            targets.push(target);
        }
    }

    // Sort by priority (moneyPerSecond descending)
    targets.sort((a, b) => b.priority - a.priority);

    return targets.slice(0, config.maxConcurrentTargets);
}

function determineOperation(target: HackTarget, config: EarlyGameConfig): Operation {
    const securityDelta = target.securityLevel - target.minSecurityLevel;
    const moneyPercent = target.moneyMax > 0 ? target.moneyAvailable / target.moneyMax : 0;

    // Priority 1: Weaken if security too high
    if (securityDelta > config.securityThreshold) {
        return 'weaken';
    }

    // Priority 2: Grow if money too low
    if (moneyPercent < config.moneyThreshold) {
        return 'grow';
    }

    // Priority 3: Hack
    return 'hack';
}

// ============================================================================
// HACKING PHASE - DEPLOYMENT
// ============================================================================

function deployOperations(
    ns: NS,
    targets: HackTarget[],
    allocation: ResourceAllocation,
    config: EarlyGameConfig
): Record<string, number[]> {
    const operationPIDs: Record<string, number[]> = {};
    const scriptRam = ns.getScriptRam(WEAKEN_SCRIPT);

    if (scriptRam === 0) {
        moduleLog(ns, LogLevel.ERROR, 'Cannot find worker scripts');
        return operationPIDs;
    }

    // Get available servers
    const serverList = Object.entries(allocation.serverAllocations)
        .map(([hostname, ramGB]) => ({ hostname, ramGB }))
        .filter(s => s.ramGB >= scriptRam)
        .sort((a, b) => b.ramGB - a.ramGB);

    // Deploy operations for each target
    for (const target of targets) {
        const operation = determineOperation(target, config);
        const script = operation === 'weaken' ? WEAKEN_SCRIPT :
                      operation === 'grow' ? GROW_SCRIPT : HACK_SCRIPT;

        const scriptSize = ns.getScriptRam(script);
        const totalThreads = Math.floor(allocation.allocatedRam / (targets.length * scriptSize));

        if (totalThreads < 1) continue;

        let threadsRemaining = totalThreads;
        const pids: number[] = [];

        for (const server of serverList) {
            if (threadsRemaining <= 0) break;

            const maxThreads = Math.floor(server.ramGB / scriptSize);
            const threads = Math.min(threadsRemaining, maxThreads);

            if (threads < 1) continue;

            // Copy script if needed
            if (!ns.fileExists(script, server.hostname)) {
                ns.scp(script, server.hostname);
            }

            // Execute script
            const pid = ns.exec(script, server.hostname, threads, target.hostname);
            if (pid > 0) {
                pids.push(pid);
                threadsRemaining -= threads;
                server.ramGB -= threads * scriptSize;
            }
        }

        if (pids.length > 0) {
            operationPIDs[target.hostname] = pids;
            moduleLog(ns, LogLevel.DEBUG,
                `Deployed ${operation} for ${target.hostname}: ${totalThreads - threadsRemaining} threads`);
        }
    }

    return operationPIDs;
}

function killAllHackingOperations(ns: NS, state: EarlyGameState): void {
    let killedCount = 0;

    const allPIDs = [
        ...Object.values(state.hackingState.deployedPIDs).flat(),
        ...Object.values(state.hackingState.deployedGrowPIDs).flat(),
        ...Object.values(state.hackingState.deployedHackPIDs).flat(),
    ];

    for (const pid of allPIDs) {
        if (ns.kill(pid)) {
            killedCount++;
        }
    }

    state.hackingState.deployedPIDs = {};
    state.hackingState.deployedGrowPIDs = {};
    state.hackingState.deployedHackPIDs = {};

    if (killedCount > 0) {
        moduleLog(ns, LogLevel.INFO, `Killed ${killedCount} hacking operations`);
    }
}

// ============================================================================
// HACKING PHASE - EXECUTION
// ============================================================================

async function executeHackingPhase(ns: NS, config: EarlyGameConfig, state: EarlyGameState): Promise<void> {
    const now = Date.now();
    const currentMoney = ns.getServerMoneyAvailable('home');

    // Update money earned
    const moneyGained = Math.max(0, currentMoney - state.hackingState.previousMoney);
    if (moneyGained > 0) {
        state.hackingState.moneyEarned += moneyGained;
        state.statistics.totalMoneyEarned += moneyGained;
    }
    state.hackingState.previousMoney = currentMoney;

    // Check if we need to refresh targets
    const shouldRefreshTargets = (now - state.hackingState.lastTargetRefresh) > config.targetRefreshInterval ||
                                 state.hackingState.activeTargets.length === 0;

    if (shouldRefreshTargets) {
        moduleLog(ns, LogLevel.INFO, 'Refreshing hacking targets...');
        state.hackingState.activeTargets = selectMoneyTargets(ns, config);
        state.hackingState.lastTargetRefresh = now;

        if (state.hackingState.activeTargets.length === 0) {
            moduleLog(ns, LogLevel.WARN, 'No suitable hacking targets found');
            return;
        }

        moduleLog(ns, LogLevel.INFO,
            `Selected ${state.hackingState.activeTargets.length} targets: ${state.hackingState.activeTargets.map(t => t.hostname).join(', ')}`);
    }

    // Deploy operations if needed
    if (Object.keys(state.hackingState.deployedPIDs).length === 0 && state.currentAllocation) {
        killAllHackingOperations(ns, state);
        state.hackingState.deployedPIDs = deployOperations(
            ns,
            state.hackingState.activeTargets,
            state.currentAllocation,
            config
        );
        state.hackingState.totalOperations++;
    }
}

// ============================================================================
// RAM EXPANSION PHASE
// ============================================================================

async function purchaseRemoteServers(ns: NS, config: EarlyGameConfig, state: EarlyGameState): Promise<boolean> {
    const currentMoney = ns.getServerMoneyAvailable('home');
    const ownedServers = ns.getPurchasedServers();

    if (ownedServers.length >= config.purchasedServerMaxCount) {
        return false;
    }

    const ram = config.purchasedServerStartRam;
    const cost = ns.getPurchasedServerCost(ram);

    // Check affordability
    if (cost > currentMoney * config.purchasedServerCostThreshold) {
        return false;
    }

    // Check reserve
    if (currentMoney - cost < config.moneyReserve) {
        return false;
    }

    const serverName = `${config.purchasedServerPrefix}${ownedServers.length}`;
    const result = ns.purchaseServer(serverName, ram);

    if (result) {
        state.ramExpansionState.purchasedServers.push(result);
        state.ramExpansionState.totalServersOwned++;
        state.ramExpansionState.totalRamPurchased += ram;
        state.ramExpansionState.totalMoneySpent += cost;
        state.ramExpansionState.lastPurchaseTime = Date.now();
        state.statistics.totalMoneySpent += cost;
        state.statistics.totalRamAcquired += ram;

        moduleLog(ns, LogLevel.INFO,
            `Purchased server ${result} (${ram}GB) for $${formatNumber(cost)}`);
        return true;
    }

    return false;
}

async function upgradeHomeRam(ns: NS, config: EarlyGameConfig, state: EarlyGameState): Promise<boolean> {
    try {
        const currentMoney = ns.getServerMoneyAvailable('home');
        const upgradeCost = ns.singularity.getUpgradeHomeRamCost();

        if (upgradeCost === Infinity || upgradeCost <= 0) {
            return false;
        }

        // Check affordability
        if (upgradeCost > currentMoney * config.homeRamUpgradeCostThreshold) {
            return false;
        }

        // Check reserve
        if (currentMoney - upgradeCost < config.moneyReserve) {
            return false;
        }

        const oldRam = ns.getServerMaxRam('home');
        const success = ns.singularity.upgradeHomeRam();

        if (success) {
            const newRam = ns.getServerMaxRam('home');
            const ramGained = newRam - oldRam;

            state.ramExpansionState.homeRamUpgrades++;
            state.ramExpansionState.totalMoneySpent += upgradeCost;
            state.ramExpansionState.lastHomeUpgradeTime = Date.now();
            state.statistics.totalMoneySpent += upgradeCost;
            state.statistics.totalRamAcquired += ramGained;

            moduleLog(ns, LogLevel.INFO,
                `Upgraded home RAM to ${newRam}GB (+${ramGained}GB) for $${formatNumber(upgradeCost)}`);
            return true;
        }
    } catch (e) {
        // Singularity API not available
    }

    return false;
}

async function executeRamExpansionPhase(ns: NS, config: EarlyGameConfig, state: EarlyGameState): Promise<void> {
    const ownedServers = ns.getPurchasedServers();
    const canBuyServers = ownedServers.length < config.purchasedServerMaxCount;

    let canUpgradeHome = false;
    try {
        const upgradeCost = ns.singularity.getUpgradeHomeRamCost();
        canUpgradeHome = upgradeCost !== Infinity && upgradeCost > 0;
    } catch (e) {
        // Singularity API not available
    }

    // Purchase based on priority
    if (config.homeRamUpgradePriority) {
        if (canUpgradeHome) await upgradeHomeRam(ns, config, state);
        if (canBuyServers) await purchaseRemoteServers(ns, config, state);
    } else {
        if (canBuyServers) await purchaseRemoteServers(ns, config, state);
        if (canUpgradeHome) await upgradeHomeRam(ns, config, state);
    }
}

// ============================================================================
// STATISTICS
// ============================================================================

function updateStatistics(ns: NS, state: EarlyGameState): void {
    const uptime = (Date.now() - state.startTime) / 1000;
    state.statistics.totalLevelsGained = state.trainingState.levelsGained;

    if (uptime > 0) {
        state.statistics.averageMoneyPerSecond = state.statistics.totalMoneyEarned / uptime;
    }

    state.lastUpdate = Date.now();
}

// ============================================================================
// RESOURCE ALLOCATION
// ============================================================================

function calculateStandaloneAllocation(ns: NS): ResourceAllocation {
    const rootedServers = getRootedServers(ns);
    const serverAllocations: Record<string, number> = {};
    let totalAllocated = 0;

    for (const hostname of rootedServers) {
        const maxRam = ns.getServerMaxRam(hostname);
        const usedRam = ns.getServerUsedRam(hostname);
        const availableRam = maxRam - usedRam;

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
// DAEMON CONTROL MESSAGE HANDLING
// ============================================================================

function handleControlMessage(ns: NS, message: any, state: EarlyGameState, config: EarlyGameConfig): boolean {
    moduleLog(ns, LogLevel.INFO, `Received control message: ${message.type}`);

    switch (message.type) {
        case 'start':
            state.isActive = true;
            if (message.config) {
                Object.assign(config, message.config);
            }
            moduleLog(ns, LogLevel.INFO, 'Module started');
            return true;

        case 'stop':
            state.isActive = false;
            killAllHackingOperations(ns, state);
            if (state.trainingState.isTraining) {
                try {
                    ns.singularity.stopAction();
                    state.trainingState.isTraining = false;
                } catch (e) {
                    // Ignore
                }
            }
            moduleLog(ns, LogLevel.INFO, 'Module stopped');
            return true;

        case 'pause':
            state.isActive = false;
            killAllHackingOperations(ns, state);
            moduleLog(ns, LogLevel.INFO, 'Module paused');
            return true;

        case 'resume':
            state.isActive = true;
            moduleLog(ns, LogLevel.INFO, 'Module resumed');
            return true;

        case 'config_update':
            if (message.config) {
                Object.assign(config, message.config);
                writeState(ns, CONFIG_FILE, config);
                moduleLog(ns, LogLevel.INFO, 'Config updated');
            }
            return true;

        case 'resource_allocation':
            if (message.allocation) {
                state.currentAllocation = message.allocation;
                moduleLog(ns, LogLevel.INFO,
                    `Resource allocation updated: ${formatNumber(message.allocation.allocatedRam)}GB`);
            }
            return true;

        default:
            moduleLog(ns, LogLevel.WARN, `Unknown control message type: ${message.type}`);
            return false;
    }
}

// ============================================================================
// DAEMON STATUS REPORTING
// ============================================================================

function sendStatusUpdate(ns: NS, statusPort: number, state: EarlyGameState, config: EarlyGameConfig): void {
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
                uptime: (Date.now() - state.startTime) / 1000,
                operationCount: state.hackingState.totalOperations,
                successRate: 1.0,
                customMetrics: {
                    currentPhase: state.currentPhase,
                    currentLevel: state.trainingState.currentLevel,
                    levelsGained: state.trainingState.levelsGained,
                    moneyEarned: state.hackingState.moneyEarned,
                    serversOwned: state.ramExpansionState.totalServersOwned,
                    homeUpgrades: state.ramExpansionState.homeRamUpgrades,
                    totalMoneySpent: state.statistics.totalMoneySpent,
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

async function runStandaloneMode(ns: NS, config: EarlyGameConfig): Promise<void> {
    moduleLog(ns, LogLevel.INFO, 'Running in STANDALONE mode');

    const state = initializeState(ns);
    state.isActive = true;

    while (true) {
        try {
            if (state.isActive) {
                // Evaluate phase
                const targetPhase = evaluatePhase(ns, state, config);
                if (targetPhase !== state.currentPhase) {
                    transitionPhase(ns, state, targetPhase, 'Thresholds triggered phase change');
                }

                // Execute current phase
                switch (state.currentPhase) {
                    case 'training':
                        await executeTrainingPhase(ns, config, state);
                        break;
                    case 'hacking':
                        // Calculate allocation for standalone mode
                        state.currentAllocation = calculateStandaloneAllocation(ns);
                        await executeHackingPhase(ns, config, state);
                        break;
                    case 'ram_expansion':
                        await executeRamExpansionPhase(ns, config, state);
                        break;
                    case 'completed':
                        moduleLog(ns, LogLevel.INFO, 'All objectives completed - idling');
                        break;
                }

                // Update statistics
                updateStatistics(ns, state);
                saveState(ns, state);

                // Print status
                ns.print(`\n=== EARLY GAME BOOTSTRAP ===`);
                ns.print(`Phase: ${state.currentPhase.toUpperCase()}`);
                ns.print(`Level: ${state.trainingState.currentLevel} (+${state.trainingState.levelsGained})`);
                ns.print(`Money: $${formatNumber(state.hackingState.moneyEarned)} earned`);
                ns.print(`Servers: ${state.ramExpansionState.totalServersOwned}/25`);
                ns.print(`Home Upgrades: ${state.ramExpansionState.homeRamUpgrades}`);
                ns.print(`============================\n`);
            }

            await ns.sleep(config.updateInterval);

        } catch (error) {
            moduleLog(ns, LogLevel.ERROR, `Exception in main loop: ${error}`);
            await ns.sleep(5000);
        }
    }
}

async function runDaemonMode(
    ns: NS,
    config: EarlyGameConfig,
    controlPort: number,
    statusPort: number
): Promise<void> {
    moduleLog(ns, LogLevel.INFO, 'Running in DAEMON-MANAGED mode');
    moduleLog(ns, LogLevel.INFO, `Control port: ${controlPort}, Status port: ${statusPort}`);

    const state = initializeState(ns);

    while (true) {
        try {
            // Check for control messages
            while (hasMessages(ns, controlPort)) {
                const message = receiveMessage(ns, controlPort);
                if (message) {
                    handleControlMessage(ns, message, state, config);
                }
            }

            if (state.isActive) {
                // Evaluate phase
                const targetPhase = evaluatePhase(ns, state, config);
                if (targetPhase !== state.currentPhase) {
                    transitionPhase(ns, state, targetPhase, 'Thresholds triggered phase change');
                }

                // Execute current phase
                switch (state.currentPhase) {
                    case 'training':
                        await executeTrainingPhase(ns, config, state);
                        break;
                    case 'hacking':
                        // Use allocation from daemon, fallback to standalone calculation
                        if (!state.currentAllocation) {
                            state.currentAllocation = calculateStandaloneAllocation(ns);
                        }
                        await executeHackingPhase(ns, config, state);
                        break;
                    case 'ram_expansion':
                        await executeRamExpansionPhase(ns, config, state);
                        break;
                    case 'completed':
                        break;
                }

                // Update statistics
                updateStatistics(ns, state);
                saveState(ns, state);
            }

            // Send status update
            sendStatusUpdate(ns, statusPort, state, config);

            await ns.sleep(config.updateInterval);

        } catch (error) {
            moduleLog(ns, LogLevel.ERROR, `Exception in daemon loop: ${error}`);
            await ns.sleep(5000);
        }
    }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function main(ns: NS): Promise<void> {
    ns.disableLog('ALL');
    ns.print(`\n=== EARLY GAME BOOTSTRAP MODULE ===`);
    ns.print(`Starting up...`);

    // Load configuration
    const config = loadConfig(ns, CONFIG_FILE, DEFAULT_CONFIG);
    moduleLog(ns, LogLevel.INFO, `Config loaded from ${CONFIG_FILE}`);

    // Parse execution mode
    const context = parseModeFromArgs(ns.args);
    moduleLog(ns, LogLevel.INFO, `Execution mode: ${context.mode}`);

    // Merge context config
    if (context.config && Object.keys(context.config).length > 0) {
        Object.assign(config, context.config);
    }

    // Initialize logging
    loggingConfig = createLoggingConfig(config);

    // Run appropriate mode
    if (context.mode === 'daemon-managed' && context.controlPort && context.statusPort) {
        await runDaemonMode(ns, config, context.controlPort, context.statusPort);
    } else {
        await runStandaloneMode(ns, config);
    }
}
