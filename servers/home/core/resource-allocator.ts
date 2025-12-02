/**
 * Resource Allocator
 * VERSION: 1.0.0
 * LAST UPDATED: 2025-12-02
 *
 * Manages RAM allocation across all rooted servers in the network.
 * Implements priority-based allocation with efficient distribution.
 *
 * CHANGELOG:
 * - v1.0.0 (2025-12-02): Initial resource allocator implementation
 */

import { NS } from '@ns';
import {
    ServerResource,
    ResourceRequest,
    ResourceAllocation,
} from '/modules/module-interface';

// ============================================================================
// Constants
// ============================================================================

const STATE_FILE = '/state/resource-allocation.txt';
const DEFAULT_RESERVE_HOME_RAM = 32; // GB to reserve on home server

// ============================================================================
// Resource Pool Management
// ============================================================================

/**
 * Build a pool of available server resources by scanning the network
 * @param ns - Netscript instance
 * @param reserveHomeRam - Amount of RAM to reserve on home server (default 32GB)
 * @returns Array of server resources with available RAM
 */
export function buildResourcePool(
    ns: NS,
    reserveHomeRam: number = DEFAULT_RESERVE_HOME_RAM
): ServerResource[] {
    const pool: ServerResource[] = [];
    const visited = new Set<string>();
    const queue: string[] = ['home'];
    const purchasedServers = new Set(ns.getPurchasedServers());

    // BFS network scan
    while (queue.length > 0) {
        const hostname = queue.shift()!;

        if (visited.has(hostname)) {
            continue;
        }
        visited.add(hostname);

        // Only include rooted servers
        if (!ns.hasRootAccess(hostname)) {
            // Still scan neighbors
            const neighbors = ns.scan(hostname);
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    queue.push(neighbor);
                }
            }
            continue;
        }

        const totalRam = ns.getServerMaxRam(hostname);
        const usedRam = ns.getServerUsedRam(hostname);
        const isHome = hostname === 'home';
        const isPurchased = purchasedServers.has(hostname);

        // Calculate available RAM
        let availableRam = totalRam - usedRam;

        // Reserve RAM on home server
        if (isHome) {
            availableRam = Math.max(0, availableRam - reserveHomeRam);
        }

        // Only include servers with RAM
        if (totalRam > 0) {
            pool.push({
                hostname,
                totalRam,
                usedRam,
                availableRam,
                isHome,
                isPurchased,
            });
        }

        // Add neighbors to queue
        const neighbors = ns.scan(hostname);
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                queue.push(neighbor);
            }
        }
    }

    // Sort by available RAM (descending) for efficient allocation
    pool.sort((a, b) => b.availableRam - a.availableRam);

    return pool;
}

// ============================================================================
// Allocation Algorithm
// ============================================================================

/**
 * Allocate resources to modules based on priority
 * @param pool - Available server resources
 * @param requests - Resource requests from modules
 * @returns Array of resource allocations
 */
export function allocateResources(
    pool: ServerResource[],
    requests: ResourceRequest[]
): ResourceAllocation[] {
    const allocations: ResourceAllocation[] = [];

    // Create a working copy of the pool to track remaining resources
    const remainingPool = pool.map(server => ({ ...server }));

    // Sort requests by priority (descending - higher priority first)
    const sortedRequests = [...requests].sort((a, b) => b.priority - a.priority);

    // Allocate to each module in priority order
    for (const request of sortedRequests) {
        const allocation = allocateToModule(request, remainingPool);

        if (allocation) {
            allocations.push(allocation);
        }
    }

    // Optimize allocations for better packing
    return optimizeAllocation(allocations);
}

/**
 * Allocate RAM to a single module
 * @param request - Resource request from module
 * @param remainingPool - Pool of remaining server resources
 * @returns Resource allocation or null if cannot meet minimum requirements
 */
export function allocateToModule(
    request: ResourceRequest,
    remainingPool: ServerResource[]
): ResourceAllocation | null {
    const serverAllocations: Record<string, number> = {};
    let totalAllocated = 0;
    const targetRam = request.maxRam;

    // Prefer servers in preferredServers list if specified
    const sortedPool = [...remainingPool];
    if (request.preferredServers && request.preferredServers.length > 0) {
        const preferredSet = new Set(request.preferredServers);
        sortedPool.sort((a, b) => {
            const aPreferred = preferredSet.has(a.hostname) ? 1 : 0;
            const bPreferred = preferredSet.has(b.hostname) ? 1 : 0;

            if (aPreferred !== bPreferred) {
                return bPreferred - aPreferred; // Preferred first
            }

            // Then by available RAM (descending)
            // Prefer non-home servers over home
            if (a.isHome !== b.isHome) {
                return a.isHome ? 1 : -1; // Non-home first
            }

            return b.availableRam - a.availableRam;
        });
    } else {
        // Default sorting: prefer non-home servers, then by available RAM
        sortedPool.sort((a, b) => {
            if (a.isHome !== b.isHome) {
                return a.isHome ? 1 : -1; // Non-home first
            }
            return b.availableRam - a.availableRam;
        });
    }

    // Distribute allocation across servers
    for (const server of sortedPool) {
        if (totalAllocated >= targetRam) {
            break;
        }

        if (server.availableRam <= 0) {
            continue;
        }

        const needed = targetRam - totalAllocated;
        const toAllocate = Math.min(needed, server.availableRam);

        if (toAllocate > 0) {
            serverAllocations[server.hostname] = toAllocate;
            server.availableRam -= toAllocate;
            totalAllocated += toAllocate;
        }
    }

    // Check if we met minimum requirements
    if (totalAllocated < request.minRam) {
        // Rollback allocations
        for (const [hostname, allocated] of Object.entries(serverAllocations)) {
            const server = remainingPool.find(s => s.hostname === hostname);
            if (server) {
                server.availableRam += allocated;
            }
        }
        return null; // Cannot meet minimum requirements
    }

    return {
        moduleName: request.moduleName,
        allocatedRam: totalAllocated,
        serverAllocations,
    };
}

/**
 * Optimize allocation by packing resources more efficiently
 * This consolidates small allocations where possible
 * @param allocations - Current allocations
 * @returns Optimized allocations
 */
export function optimizeAllocation(
    allocations: ResourceAllocation[]
): ResourceAllocation[] {
    // For now, return as-is. Future optimization could include:
    // - Consolidating small allocations into fewer servers
    // - Balancing load across servers
    // - Minimizing fragmentation
    return allocations;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate total allocated RAM across all allocations
 * @param allocations - Resource allocations
 * @returns Total RAM allocated
 */
export function calculateTotalAllocated(allocations: ResourceAllocation[]): number {
    return allocations.reduce((total, allocation) => total + allocation.allocatedRam, 0);
}

/**
 * Calculate server utilization percentage
 * @param pool - Server resource pool
 * @returns Utilization percentage (0-100)
 */
export function getServerUtilization(pool: ServerResource[]): number {
    const totalRam = pool.reduce((sum, server) => sum + server.totalRam, 0);
    const usedRam = pool.reduce((sum, server) => sum + server.usedRam, 0);

    if (totalRam === 0) {
        return 0;
    }

    return (usedRam / totalRam) * 100;
}

/**
 * Get allocation statistics for a pool
 * @param pool - Server resource pool
 * @returns Object with allocation statistics
 */
export function getAllocationStats(pool: ServerResource[]): {
    totalServers: number;
    rootedServers: number;
    totalRam: number;
    usedRam: number;
    availableRam: number;
    utilizationPercent: number;
} {
    const totalServers = pool.length;
    const rootedServers = pool.length; // All in pool are rooted
    const totalRam = pool.reduce((sum, s) => sum + s.totalRam, 0);
    const usedRam = pool.reduce((sum, s) => sum + s.usedRam, 0);
    const availableRam = pool.reduce((sum, s) => sum + s.availableRam, 0);
    const utilizationPercent = totalRam > 0 ? (usedRam / totalRam) * 100 : 0;

    return {
        totalServers,
        rootedServers,
        totalRam,
        usedRam,
        availableRam,
        utilizationPercent,
    };
}

// ============================================================================
// State Persistence
// ============================================================================

/**
 * Load allocation state from file
 * @param ns - Netscript instance
 * @returns Array of persisted allocations
 */
export function loadAllocationState(ns: NS): ResourceAllocation[] {
    try {
        if (!ns.fileExists(STATE_FILE)) {
            return [];
        }

        const data = ns.read(STATE_FILE);
        if (!data) {
            return [];
        }

        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        ns.print(`WARN: Failed to load allocation state: ${error}`);
        return [];
    }
}

/**
 * Save allocation state to file
 * @param ns - Netscript instance
 * @param allocations - Current allocations
 */
export function saveAllocationState(
    ns: NS,
    allocations: ResourceAllocation[]
): void {
    try {
        const data = JSON.stringify(allocations, null, 2);
        ns.write(STATE_FILE, data, 'w');
    } catch (error) {
        ns.print(`ERROR: Failed to save allocation state: ${error}`);
    }
}

// ============================================================================
// Main Allocator Function
// ============================================================================

/**
 * Main resource allocation function
 * Builds resource pool, allocates to modules, and persists state
 * @param ns - Netscript instance
 * @param requests - Resource requests from modules
 * @param reserveHomeRam - RAM to reserve on home server
 * @returns Object with allocations and pool stats
 */
export function performAllocation(
    ns: NS,
    requests: ResourceRequest[],
    reserveHomeRam: number = DEFAULT_RESERVE_HOME_RAM
): {
    allocations: ResourceAllocation[];
    pool: ServerResource[];
    stats: ReturnType<typeof getAllocationStats>;
} {
    // Build resource pool
    const pool = buildResourcePool(ns, reserveHomeRam);

    // Allocate resources
    const allocations = allocateResources(pool, requests);

    // Save state
    saveAllocationState(ns, allocations);

    // Get stats
    const stats = getAllocationStats(pool);

    return {
        allocations,
        pool,
        stats,
    };
}

// ============================================================================
// Standalone Test/Debug Function
// ============================================================================

/** @param {NS} ns */
export async function main(ns: NS): Promise<void> {
    ns.disableLog('ALL');
    ns.clearLog();

    ns.print('=== Resource Allocator Test ===');

    // Build resource pool
    const pool = buildResourcePool(ns, DEFAULT_RESERVE_HOME_RAM);
    ns.print(`\nFound ${pool.length} rooted servers with RAM`);

    // Display pool
    ns.print('\nResource Pool:');
    for (const server of pool) {
        ns.print(
            `  ${server.hostname.padEnd(20)} | ` +
            `Total: ${ns.formatRam(server.totalRam).padEnd(10)} | ` +
            `Used: ${ns.formatRam(server.usedRam).padEnd(10)} | ` +
            `Available: ${ns.formatRam(server.availableRam).padEnd(10)} | ` +
            `${server.isHome ? '[HOME]' : ''} ${server.isPurchased ? '[PURCHASED]' : ''}`
        );
    }

    // Create test requests
    const testRequests: ResourceRequest[] = [
        {
            moduleName: 'money-farmer',
            priority: 100,
            minRam: 8,
            maxRam: 512,
        },
        {
            moduleName: 'xp-farmer',
            priority: 90,
            minRam: 4,
            maxRam: 256,
        },
        {
            moduleName: 'faction-manager',
            priority: 80,
            minRam: 2,
            maxRam: 64,
        },
    ];

    ns.print('\n--- Test Requests ---');
    for (const req of testRequests) {
        ns.print(
            `  ${req.moduleName.padEnd(20)} | ` +
            `Priority: ${req.priority.toString().padEnd(3)} | ` +
            `Min: ${ns.formatRam(req.minRam).padEnd(10)} | ` +
            `Max: ${ns.formatRam(req.maxRam)}`
        );
    }

    // Allocate resources
    const allocations = allocateResources(pool, testRequests);

    ns.print('\n--- Allocations ---');
    for (const allocation of allocations) {
        ns.print(`\n${allocation.moduleName}:`);
        ns.print(`  Total Allocated: ${ns.formatRam(allocation.allocatedRam)}`);
        ns.print('  Server Allocations:');
        for (const [hostname, ram] of Object.entries(allocation.serverAllocations)) {
            ns.print(`    ${hostname.padEnd(20)}: ${ns.formatRam(ram)}`);
        }
    }

    // Display stats
    const stats = getAllocationStats(pool);
    ns.print('\n--- Statistics ---');
    ns.print(`  Total Servers: ${stats.totalServers}`);
    ns.print(`  Total RAM: ${ns.formatRam(stats.totalRam)}`);
    ns.print(`  Used RAM: ${ns.formatRam(stats.usedRam)}`);
    ns.print(`  Available RAM: ${ns.formatRam(stats.availableRam)}`);
    ns.print(`  Utilization: ${stats.utilizationPercent.toFixed(2)}%`);

    const totalAllocated = calculateTotalAllocated(allocations);
    ns.print(`  Allocated in Test: ${ns.formatRam(totalAllocated)}`);

    // Save state
    saveAllocationState(ns, allocations);
    ns.print('\n--- State saved to ' + STATE_FILE + ' ---');
}
