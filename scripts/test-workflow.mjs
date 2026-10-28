import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const output = mkdtempSync(join(tmpdir(), 's-question-workflow-'));
writeFileSync(join(output, 'package.json'), '{"type":"module"}\n');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
execFileSync(pnpm, [
  'exec', 'tsc', '--ignoreConfig', 'src/workflow.ts', 'src/workflow.test.ts', 'src/data.ts', 'src/types.ts',
  '--outDir', output, '--module', 'esnext', '--moduleResolution', 'bundler',
  '--target', 'ES2022', '--skipLibCheck', '--strict',
], { cwd: resolve('.'), stdio: 'inherit', shell: process.platform === 'win32' });
// Bundler-style extensionless relative imports are made explicit only in temporary test output.
for (const file of readdirSync(output).filter((file) => file.endsWith('.js'))) {
  const path = join(output, file);
  const source = readFileSync(path, 'utf8');
  writeFileSync(path, source.replace(/(from\s+['"])(\.\.?\/[^'"]+)(['"])/g,
    (match, prefix, specifier, quote) => /\.[cm]?js$/.test(specifier) ? match : `${prefix}${specifier}.js${quote}`));
}
execFileSync(process.execPath, [join(output, 'workflow.test.js')], { stdio: 'inherit' });
