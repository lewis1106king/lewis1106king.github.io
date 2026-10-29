import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const output = mkdtempSync(join(tmpdir(), 's-question-workflow-'));
writeFileSync(join(output, 'package.json'), '{"type":"module"}\n');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
execFileSync(pnpm, [
  'exec', 'tsc', '--ignoreConfig',
  'src/workflow.ts', 'src/workflow.test.ts', 'src/data.ts', 'src/types.ts',
  'src/offline/model.ts', 'src/offline/validation.ts', 'src/offline/report.ts', 'src/offline/offline.test.ts',
  '--outDir', output, '--module', 'esnext', '--moduleResolution', 'bundler',
  '--target', 'ES2022', '--skipLibCheck', '--strict',
], { cwd: resolve('.'), stdio: 'inherit', shell: process.platform === 'win32' });

// Bundler-style extensionless relative imports are made explicit only in temporary test output.
function rewriteImports(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      rewriteImports(path);
      continue;
    }
    if (!entry.name.endsWith('.js')) continue;
    const source = readFileSync(path, 'utf8');
    writeFileSync(path, source.replace(/(from\s+['"])(\.\.?\/[^'"]+)(['"])/g,
      (match, prefix, specifier, quote) => /\.[cm]?js$/.test(specifier) ? match : `${prefix}${specifier}.js${quote}`));
  }
}
rewriteImports(output);
execFileSync(process.execPath, [join(output, 'workflow.test.js')], { stdio: 'inherit' });
execFileSync(process.execPath, [join(output, 'offline', 'offline.test.js')], { stdio: 'inherit' });
