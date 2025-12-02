/**
 * Module Registry System
 * VERSION: 1.1.0
 * LAST UPDATED: 2025-12-02
 *
 * Central registry for managing daemon modules including their lifecycle state,
 * resource allocation, and metadata. Provides persistence through file-based
 * state management.
 *
 * State file: /state/module-registry.txt
 *
 * CHANGELOG:
 * - v1.1.0 (2025-12-02): Added updateModulePorts() function
 * - v1.0.0 (2025-12-02): Initial module registry implementation
 */

import { readState, writeState } from '/ns-utils';

// ============================================================================
// Type Definitions
// ============================================================================

export type ModuleLifecycleState = 'stopped' | 'starting' | 'running' | 'paused' | 'error';

export interface RegisteredModule {
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

export interface ModuleRegistry {
    modules: Record<string, RegisteredModule>;
    lastUpdate: number;
}

// ============================================================================
// Constants
// ============================================================================

const REGISTRY_FILE = '/state/module-registry.txt';

const DEFAULT_REGISTRY: ModuleRegistry = {
    modules: {},
    lastUpdate: Date.now(),
};

// ============================================================================
// Registry Core Functions
// ============================================================================

/**
 * Load the entire registry from disk
 */
function loadRegistry(ns: NS): ModuleRegistry {
    const registry = readState(ns, REGISTRY_FILE, DEFAULT_REGISTRY);
    return {
        modules: registry.modules || {},
        lastUpdate: registry.lastUpdate || Date.now(),
    };
}

/**
 * Save the entire registry to disk
 */
function saveRegistry(ns: NS, registry: ModuleRegistry): boolean {
    registry.lastUpdate = Date.now();
    return writeState(ns, REGISTRY_FILE, registry);
}

// ============================================================================
// Public API Functions
// ============================================================================

/**
 * Register a new module in the registry
 *
 * @param ns - NetScript environment
 * @param name - Unique module name
 * @param scriptPath - Path to the module script
 * @param config - Module configuration object
 * @param priority - Module priority (higher = more important)
 * @param controlPort - Port number for control messages
 * @param statusPort - Port number for status messages
 * @returns true if registration successful, false otherwise
 */
export function registerModule(
    ns: NS,
    name: string,
    scriptPath: string,
    config: any,
    priority: number,
    controlPort: number,
    statusPort: number
): boolean {
    try {
        const registry = loadRegistry(ns);

        // Check if module already registered
        if (registry.modules[name]) {
            ns.print(`WARN: Module '${name}' is already registered. Updating registration.`);
        }

        // Create module entry
        const module: RegisteredModule = {
            name,
            scriptPath,
            config,
            priority,
            status: 'stopped',
            pid: undefined,
            controlPort,
            statusPort,
            lastStatusUpdate: Date.now(),
            ramAllocation: {
                requested: config.minRamRequired || 0,
                allocated: 0,
                actual: 0,
            },
        };

        registry.modules[name] = module;

        const success = saveRegistry(ns, registry);
        if (success) {
            ns.print(`INFO: Successfully registered module '${name}'`);
        } else {
            ns.print(`ERROR: Failed to save registry after registering '${name}'`);
        }

        return success;
    } catch (error) {
        ns.print(`ERROR: Failed to register module '${name}': ${error}`);
        return false;
    }
}

/**
 * Unregister a module from the registry
 *
 * @param ns - NetScript environment
 * @param name - Module name to unregister
 * @returns true if unregistration successful, false otherwise
 */
export function unregisterModule(ns: NS, name: string): boolean {
    try {
        const registry = loadRegistry(ns);

        if (!registry.modules[name]) {
            ns.print(`WARN: Cannot unregister '${name}' - module not found in registry`);
            return false;
        }

        // Remove module from registry
        delete registry.modules[name];

        const success = saveRegistry(ns, registry);
        if (success) {
            ns.print(`INFO: Successfully unregistered module '${name}'`);
        } else {
            ns.print(`ERROR: Failed to save registry after unregistering '${name}'`);
        }

        return success;
    } catch (error) {
        ns.print(`ERROR: Failed to unregister module '${name}': ${error}`);
        return false;
    }
}

/**
 * Get a specific module's registration data
 *
 * @param ns - NetScript environment
 * @param name - Module name
 * @returns Module data or null if not found
 */
export function getModuleStatus(ns: NS, name: string): RegisteredModule | null {
    try {
        const registry = loadRegistry(ns);
        return registry.modules[name] || null;
    } catch (error) {
        ns.print(`ERROR: Failed to get module status for '${name}': ${error}`);
        return null;
    }
}

/**
 * Get all registered modules
 *
 * @param ns - NetScript environment
 * @returns Record of all registered modules
 */
export function getAllModules(ns: NS): Record<string, RegisteredModule> {
    try {
        const registry = loadRegistry(ns);
        return { ...registry.modules };
    } catch (error) {
        ns.print(`ERROR: Failed to get all modules: ${error}`);
        return {};
    }
}

/**
 * Update a module's lifecycle status
 *
 * @param ns - NetScript environment
 * @param name - Module name
 * @param status - New lifecycle status
 * @returns true if update successful, false otherwise
 */
export function updateModuleStatus(ns: NS, name: string, status: ModuleLifecycleState): boolean {
    try {
        const registry = loadRegistry(ns);

        if (!registry.modules[name]) {
            ns.print(`ERROR: Cannot update status for '${name}' - module not registered`);
            return false;
        }

        registry.modules[name].status = status;
        registry.modules[name].lastStatusUpdate = Date.now();

        const success = saveRegistry(ns, registry);
        if (success) {
            ns.print(`INFO: Updated status for '${name}' to '${status}'`);
        }

        return success;
    } catch (error) {
        ns.print(`ERROR: Failed to update module status for '${name}': ${error}`);
        return false;
    }
}

/**
 * Update a module's process ID
 *
 * @param ns - NetScript environment
 * @param name - Module name
 * @param pid - Process ID (or undefined to clear)
 * @returns true if update successful, false otherwise
 */
export function updateModulePID(ns: NS, name: string, pid: number | undefined): boolean {
    try {
        const registry = loadRegistry(ns);

        if (!registry.modules[name]) {
            ns.print(`ERROR: Cannot update PID for '${name}' - module not registered`);
            return false;
        }

        registry.modules[name].pid = pid;
        registry.modules[name].lastStatusUpdate = Date.now();

        const success = saveRegistry(ns, registry);
        if (success) {
            ns.print(`INFO: Updated PID for '${name}' to ${pid || 'undefined'}`);
        }

        return success;
    } catch (error) {
        ns.print(`ERROR: Failed to update module PID for '${name}': ${error}`);
        return false;
    }
}

/**
 * Update a module's RAM allocation
 *
 * @param ns - NetScript environment
 * @param name - Module name
 * @param allocation - RAM allocation object with requested/allocated/actual values
 * @returns true if update successful, false otherwise
 */
export function updateModuleAllocation(
    ns: NS,
    name: string,
    allocation: { requested?: number; allocated?: number; actual?: number }
): boolean {
    try {
        const registry = loadRegistry(ns);

        if (!registry.modules[name]) {
            ns.print(`ERROR: Cannot update allocation for '${name}' - module not registered`);
            return false;
        }

        // Update only provided fields
        if (allocation.requested !== undefined) {
            registry.modules[name].ramAllocation.requested = allocation.requested;
        }
        if (allocation.allocated !== undefined) {
            registry.modules[name].ramAllocation.allocated = allocation.allocated;
        }
        if (allocation.actual !== undefined) {
            registry.modules[name].ramAllocation.actual = allocation.actual;
        }

        registry.modules[name].lastStatusUpdate = Date.now();

        const success = saveRegistry(ns, registry);
        if (success) {
            ns.print(
                `INFO: Updated allocation for '${name}': ` +
                    `req=${registry.modules[name].ramAllocation.requested}GB, ` +
                    `alloc=${registry.modules[name].ramAllocation.allocated}GB, ` +
                    `actual=${registry.modules[name].ramAllocation.actual}GB`
            );
        }

        return success;
    } catch (error) {
        ns.print(`ERROR: Failed to update module allocation for '${name}': ${error}`);
        return false;
    }
}

/**
 * Update module ports
 *
 * @param ns - NetScript environment
 * @param name - Module name
 * @param controlPort - Control port number
 * @param statusPort - Status port number
 * @returns true if update successful, false otherwise
 */
export function updateModulePorts(ns: NS, name: string, controlPort: number, statusPort: number): boolean {
    try {
        const registry = loadRegistry(ns);

        if (!registry.modules[name]) {
            ns.print(`ERROR: Cannot update ports for '${name}' - module not registered`);
            return false;
        }

        registry.modules[name].controlPort = controlPort;
        registry.modules[name].statusPort = statusPort;
        registry.modules[name].lastStatusUpdate = Date.now();

        return saveRegistry(ns, registry);
    } catch (error) {
        ns.print(`ERROR: Failed to update module ports for '${name}': ${error}`);
        return false;
    }
}

/**
 * Get all modules sorted by priority (highest first)
 *
 * @param ns - NetScript environment
 * @returns Array of modules sorted by priority
 */
export function getModulesByPriority(ns: NS): RegisteredModule[] {
    try {
        const registry = loadRegistry(ns);
        const modules = Object.values(registry.modules);

        // Sort by priority (descending)
        modules.sort((a, b) => b.priority - a.priority);

        return modules;
    } catch (error) {
        ns.print(`ERROR: Failed to get modules by priority: ${error}`);
        return [];
    }
}

/**
 * Check if a module is registered
 *
 * @param ns - NetScript environment
 * @param name - Module name
 * @returns true if module is registered, false otherwise
 */
export function isModuleRegistered(ns: NS, name: string): boolean {
    try {
        const registry = loadRegistry(ns);
        return name in registry.modules;
    } catch (error) {
        ns.print(`ERROR: Failed to check if module '${name}' is registered: ${error}`);
        return false;
    }
}

// ============================================================================
// Additional Utility Functions
// ============================================================================

/**
 * Get all modules with a specific status
 *
 * @param ns - NetScript environment
 * @param status - Lifecycle status to filter by
 * @returns Array of modules with the specified status
 */
export function getModulesByStatus(ns: NS, status: ModuleLifecycleState): RegisteredModule[] {
    try {
        const registry = loadRegistry(ns);
        const modules = Object.values(registry.modules);

        return modules.filter((module) => module.status === status);
    } catch (error) {
        ns.print(`ERROR: Failed to get modules by status '${status}': ${error}`);
        return [];
    }
}

/**
 * Get all running modules (with PIDs)
 *
 * @param ns - NetScript environment
 * @returns Array of modules that are currently running
 */
export function getRunningModules(ns: NS): RegisteredModule[] {
    try {
        const registry = loadRegistry(ns);
        const modules = Object.values(registry.modules);

        return modules.filter((module) => module.pid !== undefined && module.status === 'running');
    } catch (error) {
        ns.print(`ERROR: Failed to get running modules: ${error}`);
        return [];
    }
}

/**
 * Get module by PID
 *
 * @param ns - NetScript environment
 * @param pid - Process ID
 * @returns Module with the specified PID or null if not found
 */
export function getModuleByPID(ns: NS, pid: number): RegisteredModule | null {
    try {
        const registry = loadRegistry(ns);
        const modules = Object.values(registry.modules);

        const module = modules.find((m) => m.pid === pid);
        return module || null;
    } catch (error) {
        ns.print(`ERROR: Failed to get module by PID ${pid}: ${error}`);
        return null;
    }
}

/**
 * Clear all modules from the registry (use with caution!)
 *
 * @param ns - NetScript environment
 * @returns true if registry cleared successfully, false otherwise
 */
export function clearRegistry(ns: NS): boolean {
    try {
        const registry: ModuleRegistry = {
            modules: {},
            lastUpdate: Date.now(),
        };

        const success = saveRegistry(ns, registry);
        if (success) {
            ns.print('INFO: Registry cleared successfully');
        }

        return success;
    } catch (error) {
        ns.print(`ERROR: Failed to clear registry: ${error}`);
        return false;
    }
}

/**
 * Get registry statistics
 *
 * @param ns - NetScript environment
 * @returns Statistics object with counts by status
 */
export function getRegistryStats(ns: NS): {
    total: number;
    byStatus: Record<ModuleLifecycleState, number>;
    totalRamRequested: number;
    totalRamAllocated: number;
    totalRamActual: number;
} {
    try {
        const registry = loadRegistry(ns);
        const modules = Object.values(registry.modules);

        const stats = {
            total: modules.length,
            byStatus: {
                stopped: 0,
                starting: 0,
                running: 0,
                paused: 0,
                error: 0,
            } as Record<ModuleLifecycleState, number>,
            totalRamRequested: 0,
            totalRamAllocated: 0,
            totalRamActual: 0,
        };

        modules.forEach((module) => {
            stats.byStatus[module.status]++;
            stats.totalRamRequested += module.ramAllocation.requested;
            stats.totalRamAllocated += module.ramAllocation.allocated;
            stats.totalRamActual += module.ramAllocation.actual;
        });

        return stats;
    } catch (error) {
        ns.print(`ERROR: Failed to get registry stats: ${error}`);
        return {
            total: 0,
            byStatus: { stopped: 0, starting: 0, running: 0, paused: 0, error: 0 },
            totalRamRequested: 0,
            totalRamAllocated: 0,
            totalRamActual: 0,
        };
    }
}
