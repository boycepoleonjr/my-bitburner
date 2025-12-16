/**
 * Script Deployment Utility
 * Deploys an array of scripts to all servers on the network
 * VERSION: 1.0.0
 * LAST UPDATED: 2025-12-03
 */

import { scanNetwork } from './ns-utils';

export async function main(ns: NS): Promise<void> {
  // Scripts to deploy
  const scriptsToDeploy = ['/hack.ts', '/weaken.ts', '/grow.ts'];
  
  // Get all servers on the network (regardless of root status)
  const servers = scanNetwork(ns);
  
  if (servers.length === 0) {
    ns.tprint('❌ ERROR: No servers found on network');
    return;
  }
  
  ns.tprint(`🚀 Deploying ${scriptsToDeploy.length} scripts to ${servers.length} servers...`);
  
  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;
  
  for (const server of servers) {
    let serverSuccess = true;
    let hasAnySuccess = false;
    
    for (const script of scriptsToDeploy) {
      // Check if script exists locally
      if (!ns.fileExists(script)) {
        ns.print(`⚠️  Script ${script} not found on home`);
        continue;
      }
      
      // Try to copy script to server (will fail if no root access)
      try {
        const copied = ns.scp(script, server);
        
        if (copied) {
          ns.print(`✅ Deployed ${script} to ${server}`);
          hasAnySuccess = true;
        } else {
          // Failed silently - likely no root access
        }
      } catch (error) {
        // Failed to deploy - likely no root access or other error
      }
    }
    
    if (hasAnySuccess) {
      successCount++;
    } else {
      // Check if server has root access to determine if it was skipped or failed
      if (ns.hasRootAccess(server)) {
        failCount++;
      } else {
        skippedCount++;
      }
    }
  }
  
  ns.tprint(`\n📦 Deployment complete:`);
  ns.tprint(`  ✅ Successfully deployed to ${successCount} servers`);
  if (failCount > 0) {
    ns.tprint(`  ❌ Failed to deploy to ${failCount} servers (with root access)`);
  }
  if (skippedCount > 0) {
    ns.tprint(`  ⏭️  Skipped ${skippedCount} servers (no root access)`);
  }
}
