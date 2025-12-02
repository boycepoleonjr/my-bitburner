/**
 * Hack Worker Script
 * VERSION: 1.0.0
 * LAST UPDATED: 2025-12-02
 */

export async function main(ns: NS): Promise<void> {
    const target = ns.args[0] as string;
    if (!target) {
        ns.tprint('ERROR: No target specified');
        return;
    }
    await ns.hack(target);
}

export function autocomplete(data: any): string[] {
    return [...data.servers];
}
