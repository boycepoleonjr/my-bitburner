/**
 * Minimal Weaken Worker - ~1.70 GB RAM
 * @arg {string} target - Server hostname to weaken
 */
export async function main(ns: NS): Promise<void> {
  const target = ns.args[0] as string;
  
  while (true) {
    await ns.weaken(target);
  }
}
