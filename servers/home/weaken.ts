/**
 * Weaken Worker Script
 * VERSION: 1.0.0
 * LAST UPDATED: 2025-12-03
 * 
 * @arg {string} target - Target server hostname to weaken
 */

export async function main(ns: NS): Promise<void> {
  const target = ns.args[0] as string;
  if (!target) {
    ns.tprint('ERROR: No target specified');
    return;
  }

  while (true) {
    await ns.weaken(target);
  }
}

export function autocomplete(data: any): string[] {
  return [...data.servers];
}
