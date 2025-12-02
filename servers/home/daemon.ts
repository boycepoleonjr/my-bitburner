/**
 * Daemon Orchestrator
 * VERSION: 1.2.0
 * LAST UPDATED: 2025-12-02
 *
 * Central coordinator for the modular Bitburner automation system.
 * Manages module lifecycle, resource allocation, network discovery, and monitoring.
 *
 * CHANGELOG:
 * - v1.2.0 (2025-12-02): Added toggleable component logging, fixed port registration
 * - v1.1.0 (2025-12-02): Fixed worker script paths, added logging helpers
 * - v1.0.0 (2025-12-02): Initial daemon implementation
 */

import { PORT_ALLOCATION } from './modules/module-interface';
import {
  registerModule,
  unregisterModule,
  getAllModules,
  updateModuleStatus,
  updateModulePID,
  updateModulePorts,
  getModulesByPriority,
  isModuleRegistered,
  getModuleStatus
} from './core/module-registry';
import {
  updateNetworkState,
  loadNetworkState,
  distributeWorkerScripts
} from './core/network-manager';
import {
  buildResourcePool,
  allocateResources,
  saveAllocationState,
  performAllocation
} from './core/resource-allocator';
import {
  readState,
  writeState,
  loadConfig,
  log,
  LogLevel,
  LoggingConfig,
  formatDuration,
  formatRam,
  sendControlMessage,
  collectStatusMessages,
  startScript,
  killModuleEverywhere
} from './ns-utils';
import type {
  ControlMessage,
  StatusMessage,
  ResourceRequest,
  ResourceAllocation,
  ModuleConfig
} from './modules/module-interface';

// ============================================================================
// CONFIGURATION & STATE
// ============================================================================

interface DaemonConfig {
  updateInterval: number;
  networkScanInterval: number;
  moduleStatusTimeout: number;
  enableAutoRecovery: boolean;
  reserveHomeRam: number;
  logLevel: LogLevel;
  enableComponentLogs: boolean;          // Enable component-specific log files
  componentLogMaxEntries: number;        // Max entries per component log file
  autoLaunchDashboard: boolean;
}

interface DaemonState {
  isActive: boolean;
  startTime: number;
  lastUpdate: number;
  lastNetworkScan: number;
  statistics: {
    uptime: number;
    modulesManaged: number;
    totalOperations: number;
    networkResources: number;
    utilization: number;
    moduleRestarts: number;
  };
}

const DEFAULT_CONFIG: DaemonConfig = {
  updateInterval: 10000,              // Main loop every 10 seconds
  networkScanInterval: 60000,         // Network scan every 60 seconds
  moduleStatusTimeout: 30000,         // Module timeout after 30 seconds
  enableAutoRecovery: true,           // Auto-restart failed modules
  reserveHomeRam: 32,                 // Reserve 32GB on home server
  logLevel: LogLevel.INFO,            // INFO level logging
  enableComponentLogs: true,          // Enable component-specific log files
  componentLogMaxEntries: 500,        // Max 500 entries per component log file
  autoLaunchDashboard: false,         // Don't auto-launch UIs by default
};

const BUILTIN_MODULES = [
  {
    name: 'xp-farmer',
    scriptPath: '/modules/xp-farmer.ts',
    priority: 80,
    controlPort: PORT_ALLOCATION.XP_FARMER_CONTROL,
    statusPort: PORT_ALLOCATION.XP_FARMER_STATUS,
    enabled: true,
    config: {
      enabled: true,
      priority: 80,
      maxConcurrentTargets: 5,
      updateInterval: 30000,
      targetRefreshInterval: 300000,
      minWeakenTime: 60000,
      minRamRequired: 4,
      optimalRamRequired: 256,
    }
  },
];

// State file paths
const CONFIG_FILE = '/state/daemon-config.txt';
const STATE_FILE = '/state/daemon-state.txt';

// Cache for resource requests
const resourceRequestCache = new Map<string, ResourceRequest>();

// Global logging config (set during initialization)
let globalLoggingConfig: LoggingConfig | undefined;

// ============================================================================
// LOGGING HELPERS
// ============================================================================

/**
 * Helper function to log with daemon logging config
 */
function daemonLog(ns: NS, level: LogLevel, component: string, message: string): void {
  log(ns, level, component, message, globalLoggingConfig);
}

/**
 * Convert DaemonConfig to LoggingConfig
 */
function createLoggingConfig(config: DaemonConfig): LoggingConfig {
  return {
    logLevel: config.logLevel,
    enableComponentLogs: config.enableComponentLogs,
    componentLogMaxEntries: config.componentLogMaxEntries,
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function loadDaemonConfig(ns: NS): DaemonConfig {
  // Use basic log for initial loading (before config is loaded)
  daemonLog(ns, LogLevel.INFO, 'Daemon', 'Loading daemon configuration');
  const config = loadConfig(ns, CONFIG_FILE, DEFAULT_CONFIG);

  // Set global logging config for subsequent logs
  globalLoggingConfig = createLoggingConfig(config);

  return config;
}

function initializeDaemonState(ns: NS): DaemonState {
  daemonLog(ns, LogLevel.INFO, 'Daemon', 'Initializing daemon state');

  const existingState = readState(ns, STATE_FILE, null);

  if (existingState && existingState.isActive) {
    daemonLog(ns, LogLevel.INFO, 'Daemon', 'Restoring previous daemon state');
    return {
      ...existingState,
      isActive: true,
      lastUpdate: Date.now(),
    };
  }

  return {
    isActive: true,
    startTime: Date.now(),
    lastUpdate: Date.now(),
    lastNetworkScan: 0,
    statistics: {
      uptime: 0,
      modulesManaged: 0,
      totalOperations: 0,
      networkResources: 0,
      utilization: 0,
      moduleRestarts: 0,
    }
  };
}

function persistDaemonState(ns: NS, state: DaemonState): void {
  state.lastUpdate = Date.now();
  writeState(ns, STATE_FILE, state);
}

// ============================================================================
// DASHBOARD INTEGRATION
// ============================================================================

function launchDashboards(ns: NS): void {
  daemonLog(ns, LogLevel.INFO, 'Daemon', 'Launching React dashboards');

  const dashboards = [
    '/ui/daemon-dashboard.tsx',
    '/ui/xp-farmer-panel.tsx',
    '/ui/resource-visualizer.tsx',
  ];

  for (const dashboard of dashboards) {
    // Kill existing dashboard if running
    killModuleEverywhere(ns, dashboard);

    // Wait a bit for cleanup
    ns.sleep(100);

    // Launch dashboard
    const pid = startScript(ns, dashboard, 'home', 1);
    if (pid > 0) {
      daemonLog(ns, LogLevel.INFO, 'Daemon', `Launched dashboard: ${dashboard}`);
    } else {
      daemonLog(ns, LogLevel.WARN, 'Daemon', `Failed to launch dashboard: ${dashboard}`);
    }
  }
}

// ============================================================================
// NETWORK MANAGEMENT
// ============================================================================

async function discoverAndPrepareNetwork(ns: NS): Promise<void> {
  daemonLog(ns, LogLevel.INFO, 'Daemon', 'Discovering and preparing network');

  const networkState = updateNetworkState(ns);

  daemonLog(ns, LogLevel.INFO, 'Daemon',
    `Network discovered: ${networkState.allServers.length} servers, ` +
    `${networkState.rootedServers.length} rooted, ` +
    `${formatRam(networkState.totalRamAvailable)} total RAM`
  );

  // Distribute worker scripts to all rooted servers
  const scriptCount = distributeWorkerScripts(ns, networkState.rootedServers);
  daemonLog(ns, LogLevel.INFO, 'Daemon', `Distributed worker scripts to ${scriptCount} servers`);
}

async function updateNetworkStateInternal(ns: NS, state: DaemonState): Promise<void> {
  daemonLog(ns, LogLevel.DEBUG, 'Daemon', 'Updating network state');

  const networkState = updateNetworkState(ns);
  state.lastNetworkScan = Date.now();

  // Update statistics
  state.statistics.networkResources = networkState.totalRamAvailable;

  // Distribute worker scripts to any new rooted servers
  distributeWorkerScripts(ns, networkState.rootedServers);
}

// ============================================================================
// MODULE REGISTRATION
// ============================================================================

function registerBuiltInModules(ns: NS): void {
  daemonLog(ns, LogLevel.INFO, 'Daemon', 'Registering built-in modules');

  for (const module of BUILTIN_MODULES) {
    if (!isModuleRegistered(ns, module.name)) {
      const success = registerModule(
        ns,
        module.name,
        module.scriptPath,
        module.config,
        module.priority,
        module.controlPort,
        module.statusPort
      );

      if (success) {
        daemonLog(ns, LogLevel.INFO, 'Daemon', `Registered module: ${module.name}`);
      } else {
        daemonLog(ns, LogLevel.ERROR, 'Daemon', `Failed to register module: ${module.name}`);
      }
    } else {
      daemonLog(ns, LogLevel.INFO, 'Daemon', `Module already registered: ${module.name}`);
    }

    // Always update control and status ports for built-in modules
    updateModulePorts(ns, module.name, module.controlPort, module.statusPort);
  }
}

// ============================================================================
// MODULE LIFECYCLE
// ============================================================================

async function startModule(ns: NS, moduleName: string): Promise<boolean> {
  daemonLog(ns, LogLevel.INFO, 'Daemon', `Starting module: ${moduleName}`);

  const moduleData = getModuleStatus(ns, moduleName);
  if (!moduleData) {
    daemonLog(ns, LogLevel.ERROR, 'Daemon', `Module not found: ${moduleName}`);
    return false;
  }

  // Kill existing process if running
  if (moduleData.pid) {
    daemonLog(ns, LogLevel.INFO, 'Daemon', `Killing existing process for ${moduleName}: PID ${moduleData.pid}`);
    ns.kill(moduleData.pid);
    await ns.sleep(500);
  }

  // Prepare module config for daemon mode
  const daemonModeConfig = {
    ...moduleData.config,
    controlPort: moduleData.controlPort,
    statusPort: moduleData.statusPort,
  };

  // Start module in daemon-managed mode
  const args = ['daemon-mode', JSON.stringify(daemonModeConfig)];
  const pid = startScript(ns, moduleData.scriptPath, 'home', 1, ...args);

  if (pid > 0) {
    updateModulePID(ns, moduleName, pid);
    updateModuleStatus(ns, moduleName, 'starting');

    // Send start command via control port
    await ns.sleep(1000); // Wait for module to initialize
    const startMessage: ControlMessage = { type: 'start', config: daemonModeConfig };
    sendControlMessage(ns, moduleData.controlPort, startMessage);

    daemonLog(ns, LogLevel.INFO, 'Daemon', `Started module ${moduleName} with PID ${pid}`);
    return true;
  } else {
    daemonLog(ns, LogLevel.ERROR, 'Daemon', `Failed to start module: ${moduleName}`);
    updateModuleStatus(ns, moduleName, 'error');
    return false;
  }
}

async function stopModule(ns: NS, moduleName: string): Promise<boolean> {
  daemonLog(ns, LogLevel.INFO, 'Daemon', `Stopping module: ${moduleName}`);

  const moduleData = getModuleStatus(ns, moduleName);
  if (!moduleData) {
    daemonLog(ns, LogLevel.ERROR, 'Daemon', `Module not found: ${moduleName}`);
    return false;
  }

  // Send stop command
  if (moduleData.controlPort) {
    const stopMessage: ControlMessage = { type: 'stop' };
    sendControlMessage(ns, moduleData.controlPort, stopMessage);
    await ns.sleep(1000);
  }

  // Kill process
  if (moduleData.pid) {
    ns.kill(moduleData.pid);
    updateModulePID(ns, moduleName, undefined);
  }

  updateModuleStatus(ns, moduleName, 'stopped');
  daemonLog(ns, LogLevel.INFO, 'Daemon', `Stopped module: ${moduleName}`);
  return true;
}

async function pauseModule(ns: NS, moduleName: string): Promise<boolean> {
  const moduleData = getModuleStatus(ns, moduleName);
  if (!moduleData || !moduleData.controlPort) return false;

  const pauseMessage: ControlMessage = { type: 'pause' };
  sendControlMessage(ns, moduleData.controlPort, pauseMessage);
  updateModuleStatus(ns, moduleName, 'paused');

  daemonLog(ns, LogLevel.INFO, 'Daemon', `Paused module: ${moduleName}`);
  return true;
}

async function resumeModule(ns: NS, moduleName: string): Promise<boolean> {
  const moduleData = getModuleStatus(ns, moduleName);
  if (!moduleData || !moduleData.controlPort) return false;

  const resumeMessage: ControlMessage = { type: 'resume' };
  sendControlMessage(ns, moduleData.controlPort, resumeMessage);
  updateModuleStatus(ns, moduleName, 'running');

  daemonLog(ns, LogLevel.INFO, 'Daemon', `Resumed module: ${moduleName}`);
  return true;
}

async function startInitialModules(ns: NS): Promise<void> {
  daemonLog(ns, LogLevel.INFO, 'Daemon', 'Starting initial modules');

  const modules = getModulesByPriority(ns);

  for (const module of modules) {
    if (module.config.enabled) {
      await startModule(ns, module.name);
      await ns.sleep(2000); // Stagger starts
    }
  }
}

// ============================================================================
// STATUS MONITORING
// ============================================================================

async function collectModuleStatuses(ns: NS, config: DaemonConfig): Promise<void> {
  const modules = getAllModules(ns);
  if (!modules) return;

  for (const [moduleName, moduleData] of Object.entries(modules)) {
    if (!moduleData.statusPort) continue;

    try {
      // Collect all status messages from this module
      const messages = collectStatusMessages(ns, moduleData.statusPort);

      for (const message of messages) {
        if (message.type === 'status_update') {
          // Update module status
          const newStatus = message.data.isActive ? 'running' : 'paused';
          updateModuleStatus(ns, moduleName, newStatus);

          // Update last status timestamp
          moduleData.lastStatusUpdate = Date.now();

          // Cache resource request if present
          if (message.data.resourceRequest) {
            resourceRequestCache.set(moduleName, message.data.resourceRequest);
          }

          daemonLog(ns, LogLevel.DEBUG, 'Daemon',
            `Received status update from ${moduleName}: ${newStatus}`
          );
        }
      }

      // Check for timeout
      const timeSinceUpdate = Date.now() - (moduleData.lastStatusUpdate || 0);
      if (timeSinceUpdate > config.moduleStatusTimeout) {
        if (moduleData.status !== 'error' && moduleData.status !== 'stopped') {
          daemonLog(ns, LogLevel.WARN, 'Daemon',
            `Module ${moduleName} timed out (${Math.floor(timeSinceUpdate / 1000)}s since last update)`
          );
          updateModuleStatus(ns, moduleName, 'error');
        }
      }
    } catch (error) {
      daemonLog(ns, LogLevel.ERROR, 'Daemon',
        `Error collecting status from ${moduleName}: ${error}`
      );
    }
  }
}

// ============================================================================
// AUTO-RECOVERY
// ============================================================================

async function recoverFailedModules(ns: NS, config: DaemonConfig, state: DaemonState): Promise<void> {
  const modules = getAllModules(ns);
  if (!modules) return;

  for (const [moduleName, moduleData] of Object.entries(modules)) {
    if (moduleData.status === 'error' && moduleData.config.enabled) {
      // Check if process is actually dead
      const isRunning = moduleData.pid ? ns.isRunning(moduleData.pid) : false;

      if (!isRunning) {
        daemonLog(ns, LogLevel.WARN, 'Daemon',
          `Module ${moduleName} is not running. Attempting recovery...`
        );

        const success = await startModule(ns, moduleName);
        if (success) {
          state.statistics.moduleRestarts++;
          daemonLog(ns, LogLevel.INFO, 'Daemon',
            `Successfully recovered module: ${moduleName}`
          );
        } else {
          daemonLog(ns, LogLevel.ERROR, 'Daemon',
            `Failed to recover module: ${moduleName}`
          );
        }

        await ns.sleep(2000); // Delay between recovery attempts
      }
    }
  }
}

// ============================================================================
// RESOURCE ALLOCATION
// ============================================================================

function gatherResourceRequests(ns: NS): ResourceRequest[] {
  const requests: ResourceRequest[] = [];

  // Get cached resource requests from module status messages
  for (const [moduleName, request] of resourceRequestCache.entries()) {
    requests.push(request);
  }

  // If no cached requests, create default requests based on module config
  if (requests.length === 0) {
    const modules = getAllModules(ns);
    if (modules) {
      for (const [moduleName, moduleData] of Object.entries(modules)) {
        if (moduleData.status === 'running' || moduleData.status === 'starting') {
          requests.push({
            moduleName: moduleName,
            priority: moduleData.priority,
            minRam: moduleData.config.minRamRequired || 4,
            maxRam: moduleData.config.optimalRamRequired || 256,
          });
        }
      }
    }
  }

  return requests;
}

async function sendAllocationToModule(ns: NS, allocation: ResourceAllocation): Promise<void> {
  const moduleData = getModuleStatus(ns, allocation.moduleName);
  if (!moduleData || !moduleData.controlPort) return;

  const message: ControlMessage = {
    type: 'resource_allocation',
    allocation: allocation
  };

  sendControlMessage(ns, moduleData.controlPort, message);

  daemonLog(ns, LogLevel.DEBUG, 'Daemon',
    `Sent allocation to ${allocation.moduleName}: ${formatRam(allocation.allocatedRam)}`
  );
}

async function performResourceAllocation(ns: NS, config: DaemonConfig): Promise<void> {
  try {
    // Gather resource requests from modules
    const requests = gatherResourceRequests(ns);

    if (requests.length === 0) {
      daemonLog(ns, LogLevel.DEBUG, 'Daemon', 'No resource requests to allocate');
      return;
    }

    // Perform allocation
    const result = performAllocation(ns, requests, config.reserveHomeRam);

    // Send allocations to modules
    for (const allocation of result.allocations) {
      await sendAllocationToModule(ns, allocation);
    }

    daemonLog(ns, LogLevel.DEBUG, 'Daemon',
      `Allocated resources: ${formatRam(result.stats.usedRam)} / ${formatRam(result.stats.totalRam)} ` +
      `(${result.stats.utilizationPercent.toFixed(1)}%)`
    );
  } catch (error) {
    daemonLog(ns, LogLevel.ERROR, 'Daemon', `Error in resource allocation: ${error}`);
  }
}

// ============================================================================
// STATISTICS
// ============================================================================

function updateDaemonStatistics(ns: NS, state: DaemonState): void {
  const uptime = Date.now() - state.startTime;
  state.statistics.uptime = uptime;

  const modules = getAllModules(ns);
  state.statistics.modulesManaged = modules ? Object.keys(modules).length : 0;

  const networkState = loadNetworkState(ns);
  if (networkState) {
    state.statistics.networkResources = networkState.totalRamAvailable;
  }

  // Calculate utilization from resource allocation
  const allocations = readState(ns, '/state/resource-allocation.txt', []);
  if (allocations && allocations.length > 0 && networkState) {
    const totalAllocated = allocations.reduce((sum: number, alloc: ResourceAllocation) =>
      sum + alloc.allocatedRam, 0
    );
    state.statistics.utilization = networkState.totalRamAvailable > 0
      ? (totalAllocated / networkState.totalRamAvailable) * 100
      : 0;
  }
}

// ============================================================================
// MAIN LOOP
// ============================================================================

export async function main(ns: NS): Promise<void> {
  // Disable default logs for cleaner output
  ns.disableLog('ALL');
  ns.clearLog();

  // Print startup banner
  ns.print('═══════════════════════════════════════════════');
  ns.print('   DAEMON ORCHESTRATOR STARTING');
  ns.print('═══════════════════════════════════════════════');
  ns.print('');

  // Load configuration
  const config = loadDaemonConfig(ns);
  daemonLog(ns, LogLevel.INFO, 'Daemon', `Config loaded: ${JSON.stringify(config)}`);

  // Initialize state
  const state = initializeDaemonState(ns);
  daemonLog(ns, LogLevel.INFO, 'Daemon', 'Daemon state initialized');

  // Launch dashboards if configured
  if (config.autoLaunchDashboard) {
    launchDashboards(ns);
  }

  // Discover and prepare network
  await discoverAndPrepareNetwork(ns);

  // Register built-in modules
  registerBuiltInModules(ns);

  // Start initial modules
  await startInitialModules(ns);

  // Main daemon loop
  daemonLog(ns, LogLevel.INFO, 'Daemon', 'Entering main loop');
  let loopCount = 0;

  while (true) {
    try {
      loopCount++;

      // Update network state periodically
      if (Date.now() - state.lastNetworkScan > config.networkScanInterval) {
        await updateNetworkStateInternal(ns, state);
      }

      // Collect module status updates
      await collectModuleStatuses(ns, config);

      // Recover failed modules if enabled
      if (config.enableAutoRecovery) {
        await recoverFailedModules(ns, config, state);
      }

      // Allocate resources
      await performResourceAllocation(ns, config);

      // Update daemon statistics
      updateDaemonStatistics(ns, state);

      // Persist daemon state
      persistDaemonState(ns, state);

      // Log status every 10 loops
      if (loopCount % 10 === 0) {
        daemonLog(ns, LogLevel.INFO, 'Daemon',
          `Status: Uptime ${formatDuration(state.statistics.uptime)}, ` +
          `Modules ${state.statistics.modulesManaged}, ` +
          `RAM ${formatRam(state.statistics.networkResources)}, ` +
          `Util ${state.statistics.utilization.toFixed(1)}%`
        );
      }

      // Sleep until next cycle
      await ns.sleep(config.updateInterval);

    } catch (error) {
      daemonLog(ns, LogLevel.ERROR, 'Daemon', `Error in main loop: ${error}`);
      await ns.sleep(config.updateInterval);
    }
  }
}
