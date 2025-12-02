/**
 * Module Interface Definitions
 * VERSION: 1.0.0
 * LAST UPDATED: 2025-12-02
 *
 * This file defines the contract that all daemon-managed modules must implement.
 * It provides type definitions for module configuration, status, statistics, and communication.
 *
 * CHANGELOG:
 * - v1.0.0 (2025-12-02): Initial module interface definition
 */

// ============================================================================
// Resource Management
// ============================================================================

export interface ServerResource {
    hostname: string;
    totalRam: number;
    usedRam: number;
    availableRam: number;
    isHome: boolean;
    isPurchased: boolean;
}

export interface ResourceRequest {
    moduleName: string;
    priority: number;
    minRam: number;
    maxRam: number;
    preferredServers?: string[];
}

export interface ResourceAllocation {
    moduleName: string;
    allocatedRam: number;
    serverAllocations: Record<string, number>;
}

// ============================================================================
// Module Status & Statistics
// ============================================================================

export interface ModuleStatus {
    moduleName: string;
    isActive: boolean;
    isHealthy: boolean;
    currentRamUsage: number;
    lastUpdate: number;
    errors?: string[];
}

export interface ModuleStatistics {
    moduleName: string;
    uptime: number;
    operationCount: number;
    successRate: number;
    customMetrics: Record<string, number>;
}

// ============================================================================
// Module Communication
// ============================================================================

export type ControlMessage =
    | { type: 'start'; config: any }
    | { type: 'stop' }
    | { type: 'pause' }
    | { type: 'resume' }
    | { type: 'config_update'; config: any }
    | { type: 'resource_allocation'; allocation: ResourceAllocation };

export interface StatusMessage {
    type: 'status_update';
    moduleName: string;
    timestamp: number;
    data: {
        isActive: boolean;
        isHealthy: boolean;
        ramUsage: number;
        statistics: ModuleStatistics;
        resourceRequest?: ResourceRequest;
        errors?: string[];
    };
}

// ============================================================================
// Module Configuration
// ============================================================================

export interface ModuleConfig {
    name: string;
    version: string;
    description: string;
    priority: number;
    minRamRequired: number;
    optimalRamRequired: number;
    controlPort: number;
    statusPort: number;
    enabled: boolean;
    updateInterval: number;
}

// ============================================================================
// Module Interface (Contract)
// ============================================================================

export interface ModuleInterface {
    name: string;
    version: string;
    description: string;
    priority: number;
    minRamRequired: number;
    optimalRamRequired: number;
    controlPort: number;
    statusPort: number;

    initialize(ns: NS, config: any): Promise<boolean>;
    start(ns: NS): Promise<void>;
    stop(ns: NS): Promise<void>;
    pause(ns: NS): Promise<void>;
    resume(ns: NS): Promise<void>;
    getStatus(ns: NS): ModuleStatus;
    getStatistics(ns: NS): ModuleStatistics;
}

// ============================================================================
// Port Allocation Constants
// ============================================================================

export const PORT_ALLOCATION = {
    DAEMON_CONTROL: 1,
    DAEMON_STATUS: 2,

    MODULE_CONTROL_BASE: 10,
    MODULE_STATUS_BASE: 30,

    XP_FARMER_CONTROL: 10,
    XP_FARMER_STATUS: 30,
    MONEY_FARMER_CONTROL: 11,
    MONEY_FARMER_STATUS: 31,
    FACTION_MANAGER_CONTROL: 12,
    FACTION_MANAGER_STATUS: 32,
    SINGULARITY_AUTOMATION_CONTROL: 13,
    SINGULARITY_AUTOMATION_STATUS: 33,
} as const;

// ============================================================================
// Module Execution Modes
// ============================================================================

export interface ModuleExecutionContext {
    mode: 'standalone' | 'daemon-managed';
    config: any;
    controlPort?: number;
    statusPort?: number;
}

export function parseModeFromArgs(args: (string | number | boolean)[]): ModuleExecutionContext {
    const isDaemonMode = args[0] === 'daemon-mode';

    if (isDaemonMode && typeof args[1] === 'string') {
        const config = JSON.parse(args[1]);
        return {
            mode: 'daemon-managed',
            config,
            controlPort: config.controlPort,
            statusPort: config.statusPort,
        };
    }

    return {
        mode: 'standalone',
        config: {},
    };
}
