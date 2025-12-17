/**
 * Repository Scanner
 * Scans home directory and writes file metadata to dir-home.json.txt
 * 
 * Usage:
 *   run repo.ts
 */

interface FileInfo {
  filename: string;
  type: 'script' | 'text' | 'contract' | 'program' | 'other';
  extension: string;
  executable: boolean;
  ramUsage: number | null;
}

interface RepoState {
  timestamp: string;
  server: string;
  fileCount: number;
  files: FileInfo[];
}

function getFileType(filename: string): { type: FileInfo['type']; extension: string } {
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
  
  if (['js', 'ts', 'tsx', 'jsx'].includes(ext)) {
    return { type: 'script', extension: ext };
  }
  if (ext === 'txt') {
    return { type: 'text', extension: ext };
  }
  if (ext === 'cct') {
    return { type: 'contract', extension: ext };
  }
  if (ext === 'exe') {
    return { type: 'program', extension: ext };
  }
  
  return { type: 'other', extension: ext || 'none' };
}

function isExecutable(type: FileInfo['type']): boolean {
  return type === 'script' || type === 'program';
}

export async function main(ns: NS): Promise<void> {
  const server = 'home';
  const outputFile = 'dir-home.json.txt';
  
  // Get all files on home
  const allFiles = ns.ls(server);
  
  const files: FileInfo[] = [];
  
  for (const filename of allFiles) {
    const { type, extension } = getFileType(filename);
    const executable = isExecutable(type);
    
    // Get RAM usage for scripts
    let ramUsage: number | null = null;
    if (type === 'script') {
      try {
        ramUsage = ns.getScriptRam(filename, server);
      } catch {
        ramUsage = null;
      }
    }
    
    files.push({
      filename,
      type,
      extension,
      executable,
      ramUsage,
    });
  }
  
  // Sort by type, then by name
  files.sort((a, b) => {
    if (a.type !== b.type) {
      const typeOrder = { script: 0, program: 1, text: 2, contract: 3, other: 4 };
      return typeOrder[a.type] - typeOrder[b.type];
    }
    return a.filename.localeCompare(b.filename);
  });
  
  const repoState: RepoState = {
    timestamp: new Date().toISOString(),
    server,
    fileCount: files.length,
    files,
  };
  
  // Write to file
  const json = JSON.stringify(repoState, null, 2);
  ns.write(outputFile, json, 'w');
  
  ns.tprint(`SUCCESS: Scanned ${files.length} files, wrote to ${outputFile}`);
  
  // Summary
  const scripts = files.filter(f => f.type === 'script').length;
  const texts = files.filter(f => f.type === 'text').length;
  const programs = files.filter(f => f.type === 'program').length;
  const contracts = files.filter(f => f.type === 'contract').length;
  
  ns.tprint(`  Scripts: ${scripts} | Texts: ${texts} | Programs: ${programs} | Contracts: ${contracts}`);
}

