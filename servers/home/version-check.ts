/**
 * Version Checker
 * VERSION: 1.0.0
 * LAST UPDATED: 2025-12-02
 *
 * Quick utility to check versions of all major scripts.
 * Run this in-game to verify your files are up to date.
 */

export async function main(ns: NS): Promise<void> {
    ns.tprint('');
    ns.tprint('='.repeat(80));
    ns.tprint('SCRIPT VERSION CHECK');
    ns.tprint('='.repeat(80));
    ns.tprint('');

    const files = [
        '/daemon.ts',
        '/ns-utils.ts',
        '/modules/xp-farmer.ts',
        '/modules/module-interface.ts',
        '/core/module-registry.ts',
        '/core/network-manager.ts',
        '/core/resource-allocator.ts',
        '/weaken.ts',
        '/hack.ts',
        '/grow.ts',
    ];

    for (const file of files) {
        if (ns.fileExists(file)) {
            const content = ns.read(file);
            const versionMatch = content.match(/VERSION:\s*([\d.]+)/);
            const dateMatch = content.match(/LAST UPDATED:\s*([\d-]+)/);

            const version = versionMatch ? versionMatch[1] : 'UNKNOWN';
            const date = dateMatch ? dateMatch[1] : 'UNKNOWN';

            ns.tprint(`${file.padEnd(40)} v${version.padEnd(10)} ${date}`);
        } else {
            ns.tprint(`${file.padEnd(40)} MISSING`);
        }
    }

    ns.tprint('');
    ns.tprint('='.repeat(80));
    ns.tprint('Expected versions (as of 2025-12-02):');
    ns.tprint('  daemon.ts               v1.2.0');
    ns.tprint('  ns-utils.ts             v1.3.0');
    ns.tprint('  xp-farmer.ts            v1.3.0');
    ns.tprint('  module-registry.ts      v1.1.0');
    ns.tprint('  network-manager.ts      v1.1.0');
    ns.tprint('  All others              v1.0.0');
    ns.tprint('='.repeat(80));
    ns.tprint('');
}
