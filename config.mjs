import { context } from 'esbuild';
import { BitburnerPlugin } from 'esbuild-bitburner-plugin';

const createContext = async () => await context({
  entryPoints: [
    'servers/**/*.js',
    'servers/**/*.jsx',
    'servers/**/*.ts',
    'servers/**/*.tsx',
  ],
  outbase: "./servers",
  outdir: "./build",
  plugins: [
    BitburnerPlugin({
      port: 12525,
      types: 'NetscriptDefinitions.d.ts',
      mirror: {
        'servers': ['home'],
      },
      distribute: {
      },
      // Add file filter to ignore temp files
      includeFilter: (filename) => {
        // Ignore temp files created by editors
        if (filename.includes('.tmp.')) return false;
        if (filename.startsWith('.')) return false;
        if (filename.endsWith('~')) return false;
        return true;
      },
    })
  ],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  logLevel: 'info', // Changed from debug to reduce noise
});

const ctx = await createContext();

// Add error handling for watch mode
try {
  await ctx.watch();
  console.log('✅ Build watcher started successfully');
} catch (error) {
  console.error('⚠️ Watch error:', error);
  // Don't exit on errors, just log them
}
