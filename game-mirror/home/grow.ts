/**
 * Minimal Grow Worker - ~1.70 GB RAM
 * @arg {string} target - Server hostname to grow
 */
export async function main(ns: NS): Promise<void> {
  await ns.grow(ns.args[0] as string);
}
