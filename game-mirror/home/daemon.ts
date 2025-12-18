export async function main(ns: NS) {
  ns.print('═══════════════════════════════════════════════════');
  ns.print('    BITBURNERS BEST FRIEND - AUTOMATION DAEMON     ');
  ns.print('═══════════════════════════════════════════════════');
  ns.print('');
  ns.print('...booting up...');
  ns.print('');
  ns.print('...intializing config...');
  ns.print('');
  executeNetworkRoot(ns);
}

function executeNetworkRoot(ns: NS): void {
  ns.print('...running module: net-root...');
  try {
    ns.fileExists('trojan.ts', 'n00dles') ?
      ns.exec('trojan.ts', 'n00dles', 1) :
      ns.scp('trojan.ts', 'n00dles', 'home');

    ns.print('[SUCCESS] trojan.ts securely copied and executing on n00dles.');
  } catch (error) {
    ns.print(`[ERROR] Problem with trojan.ts operations: ${error}`);
  }
}