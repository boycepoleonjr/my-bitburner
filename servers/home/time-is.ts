/**
 * Print current time to terminal
 * 
 * Usage:
 *   run time-is.ts
 */

export async function main(ns: NS): Promise<void> {
  const now = new Date();
  ns.tprint(`The time is: ${now.toLocaleTimeString()}`);
}

