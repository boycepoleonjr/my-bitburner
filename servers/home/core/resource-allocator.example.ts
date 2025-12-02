/**
 * Resource Allocator Usage Examples
 *
 * This file demonstrates various ways to use the resource allocator.
 */

import { NS } from '@ns';
import {
    buildResourcePool,
    allocateResources,
    performAllocation,
    getAllocationStats,
    calculateTotalAllocated,
    loadAllocationState,
    saveAllocationState,
} from '/core/resource-allocator';
import { ResourceRequest } from '/modules/module-interface';

// ============================================================================
// Example 1: Basic Usage
// ============================================================================

/** @param {NS} ns */
export async function example1_basic(ns: NS): Promise<void> {
    ns.print('=== Example 1: Basic Usage ===\n');

    // Step 1: Build resource pool (reserve 64GB on home)
    const pool = buildResourcePool(ns, 64);
    ns.print(`Found ${pool.length} servers with available RAM\n`);

    // Step 2: Create resource requests
    const requests: ResourceRequest[] = [
        {
            moduleName: 'high-priority-module',
            priority: 100,
            minRam: 32,
            maxRam: 512,
        },
        {
            moduleName: 'low-priority-module',
            priority: 50,
            minRam: 8,
            maxRam: 128,
        },
    ];

    // Step 3: Allocate resources
    const allocations = allocateResources(pool, requests);

    // Step 4: Display results
    for (const allocation of allocations) {
        ns.print(`${allocation.moduleName}: ${ns.formatRam(allocation.allocatedRam)}`);
        for (const [server, ram] of Object.entries(allocation.serverAllocations)) {
            ns.print(`  - ${server}: ${ns.formatRam(ram)}`);
        }
        ns.print('');
    }
}

// ============================================================================
// Example 2: Using performAllocation (All-in-One)
// ============================================================================

/** @param {NS} ns */
export async function example2_performAllocation(ns: NS): Promise<void> {
    ns.print('=== Example 2: Using performAllocation ===\n');

    const requests: ResourceRequest[] = [
        {
            moduleName: 'money-farmer',
            priority: 100,
            minRam: 16,
            maxRam: 1024,
        },
        {
            moduleName: 'xp-farmer',
            priority: 90,
            minRam: 8,
            maxRam: 512,
        },
    ];

    // One-liner to do everything
    const result = performAllocation(ns, requests, 32);

    // Display stats
    ns.print('Allocation Stats:');
    ns.print(`  Total Servers: ${result.stats.totalServers}`);
    ns.print(`  Total RAM: ${ns.formatRam(result.stats.totalRam)}`);
    ns.print(`  Available: ${ns.formatRam(result.stats.availableRam)}`);
    ns.print(`  Utilization: ${result.stats.utilizationPercent.toFixed(2)}%\n`);

    // Display allocations
    ns.print('Allocations:');
    for (const allocation of result.allocations) {
        ns.print(`  ${allocation.moduleName}: ${ns.formatRam(allocation.allocatedRam)}`);
    }
}

// ============================================================================
// Example 3: Preferred Servers
// ============================================================================

/** @param {NS} ns */
export async function example3_preferredServers(ns: NS): Promise<void> {
    ns.print('=== Example 3: Preferred Servers ===\n');

    const pool = buildResourcePool(ns);

    // Module prefers certain servers
    const requests: ResourceRequest[] = [
        {
            moduleName: 'dedicated-module',
            priority: 95,
            minRam: 64,
            maxRam: 512,
            preferredServers: ['pserv-0', 'pserv-1', 'pserv-2'], // Prefer these
        },
    ];

    const allocations = allocateResources(pool, requests);

    for (const allocation of allocations) {
        ns.print(`${allocation.moduleName}:`);
        for (const [server, ram] of Object.entries(allocation.serverAllocations)) {
            ns.print(`  ${server}: ${ns.formatRam(ram)}`);
        }
    }
}

// ============================================================================
// Example 4: Loading and Saving State
// ============================================================================

/** @param {NS} ns */
export async function example4_stateManagement(ns: NS): Promise<void> {
    ns.print('=== Example 4: State Management ===\n');

    // Load previous allocations
    const previousAllocations = loadAllocationState(ns);
    ns.print(`Loaded ${previousAllocations.length} previous allocations\n`);

    // Create new allocations
    const requests: ResourceRequest[] = [
        {
            moduleName: 'test-module',
            priority: 80,
            minRam: 4,
            maxRam: 64,
        },
    ];

    const pool = buildResourcePool(ns);
    const allocations = allocateResources(pool, requests);

    // Save state
    saveAllocationState(ns, allocations);
    ns.print('State saved successfully');
}

// ============================================================================
// Example 5: Dynamic Reallocation
// ============================================================================

/** @param {NS} ns */
export async function example5_dynamicReallocation(ns: NS): Promise<void> {
    ns.print('=== Example 5: Dynamic Reallocation ===\n');

    // Initial allocation
    let requests: ResourceRequest[] = [
        {
            moduleName: 'dynamic-module',
            priority: 85,
            minRam: 8,
            maxRam: 128,
        },
    ];

    let result = performAllocation(ns, requests);
    ns.print('Initial Allocation:');
    ns.print(`  Allocated: ${ns.formatRam(result.allocations[0].allocatedRam)}\n`);

    // Module needs more RAM
    await ns.sleep(1000);

    requests = [
        {
            moduleName: 'dynamic-module',
            priority: 85,
            minRam: 16, // Increased minimum
            maxRam: 256, // Increased maximum
        },
    ];

    result = performAllocation(ns, requests);
    ns.print('After Reallocation:');
    ns.print(`  Allocated: ${ns.formatRam(result.allocations[0].allocatedRam)}`);
}

// ============================================================================
// Example 6: Handling Allocation Failures
// ============================================================================

/** @param {NS} ns */
export async function example6_allocationFailure(ns: NS): Promise<void> {
    ns.print('=== Example 6: Handling Allocation Failures ===\n');

    const pool = buildResourcePool(ns);
    const totalAvailable = pool.reduce((sum, s) => sum + s.availableRam, 0);
    ns.print(`Total available RAM: ${ns.formatRam(totalAvailable)}\n`);

    // Request more than available
    const requests: ResourceRequest[] = [
        {
            moduleName: 'greedy-module',
            priority: 100,
            minRam: totalAvailable + 100, // More than available!
            maxRam: totalAvailable + 1000,
        },
    ];

    const allocations = allocateResources(pool, requests);

    if (allocations.length === 0) {
        ns.print('⚠️ No allocations made - insufficient resources');
        ns.print('Module will be paused until resources become available');
    } else {
        ns.print('Allocations succeeded');
    }
}

// ============================================================================
// Example 7: Multi-Module Priority-Based Allocation
// ============================================================================

/** @param {NS} ns */
export async function example7_multiModule(ns: NS): Promise<void> {
    ns.print('=== Example 7: Multi-Module Priority Allocation ===\n');

    const requests: ResourceRequest[] = [
        {
            moduleName: 'critical-module',
            priority: 100,
            minRam: 64,
            maxRam: 512,
        },
        {
            moduleName: 'important-module',
            priority: 80,
            minRam: 32,
            maxRam: 256,
        },
        {
            moduleName: 'normal-module',
            priority: 60,
            minRam: 16,
            maxRam: 128,
        },
        {
            moduleName: 'low-priority-module',
            priority: 40,
            minRam: 8,
            maxRam: 64,
        },
    ];

    const result = performAllocation(ns, requests);

    ns.print('Allocations by Priority:');
    // Sort by priority for display
    const sorted = [...result.allocations].sort(
        (a, b) => {
            const aPriority = requests.find(r => r.moduleName === a.moduleName)?.priority || 0;
            const bPriority = requests.find(r => r.moduleName === b.moduleName)?.priority || 0;
            return bPriority - aPriority;
        }
    );

    for (const allocation of sorted) {
        const request = requests.find(r => r.moduleName === allocation.moduleName)!;
        const percentage = (allocation.allocatedRam / request.maxRam) * 100;
        ns.print(
            `  [P:${request.priority}] ${allocation.moduleName.padEnd(20)}: ` +
            `${ns.formatRam(allocation.allocatedRam).padEnd(10)} ` +
            `(${percentage.toFixed(1)}% of max)`
        );
    }

    const totalAllocated = calculateTotalAllocated(result.allocations);
    ns.print(`\nTotal Allocated: ${ns.formatRam(totalAllocated)}`);
}

// ============================================================================
// Example 8: Server Utilization Monitoring
// ============================================================================

/** @param {NS} ns */
export async function example8_monitoring(ns: NS): Promise<void> {
    ns.print('=== Example 8: Server Utilization Monitoring ===\n');

    const pool = buildResourcePool(ns);
    const stats = getAllocationStats(pool);

    ns.print('Network Statistics:');
    ns.print(`  Total Servers: ${stats.totalServers}`);
    ns.print(`  Rooted Servers: ${stats.rootedServers}`);
    ns.print(`  Total RAM: ${ns.formatRam(stats.totalRam)}`);
    ns.print(`  Used RAM: ${ns.formatRam(stats.usedRam)}`);
    ns.print(`  Available RAM: ${ns.formatRam(stats.availableRam)}`);
    ns.print(`  Utilization: ${stats.utilizationPercent.toFixed(2)}%\n`);

    // Show top servers by available RAM
    const topServers = [...pool]
        .sort((a, b) => b.availableRam - a.availableRam)
        .slice(0, 5);

    ns.print('Top 5 Servers by Available RAM:');
    for (const server of topServers) {
        const util = server.totalRam > 0
            ? ((server.usedRam / server.totalRam) * 100).toFixed(1)
            : '0.0';
        ns.print(
            `  ${server.hostname.padEnd(20)}: ` +
            `${ns.formatRam(server.availableRam).padEnd(10)} ` +
            `(${util}% used)`
        );
    }
}

// ============================================================================
// Main - Run All Examples
// ============================================================================

/** @param {NS} ns */
export async function main(ns: NS): Promise<void> {
    ns.disableLog('ALL');
    ns.clearLog();

    const examples = [
        { name: 'Basic Usage', fn: example1_basic },
        { name: 'performAllocation', fn: example2_performAllocation },
        { name: 'Preferred Servers', fn: example3_preferredServers },
        { name: 'State Management', fn: example4_stateManagement },
        { name: 'Dynamic Reallocation', fn: example5_dynamicReallocation },
        { name: 'Allocation Failure', fn: example6_allocationFailure },
        { name: 'Multi-Module Priority', fn: example7_multiModule },
        { name: 'Monitoring', fn: example8_monitoring },
    ];

    for (const example of examples) {
        ns.print('\n' + '='.repeat(60));
        await example.fn(ns);
        ns.print('='.repeat(60) + '\n');
        await ns.sleep(500);
    }
}
