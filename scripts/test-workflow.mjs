import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const output = mkdtempSync(join(tmpdir(), 'suseak-domain-'));
writeFileSync(join(output, 'package.json'), '{"type":"module"}\n');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
execFileSync(pnpm, [
  'exec', 'tsc', '--ignoreConfig',
  'src/domain/rules.ts', 'src/domain/rules.test.ts', 'src/domain/report.ts',
  'src/mission/types.ts', 'src/sync/merge.ts', 'src/sync/edit.ts', 'src/sync/merge.test.ts',
  'src/sync/handover.ts', 'src/sync/handover.test.ts',
  'src/map/geo.ts', 'src/map/geo.test.ts',
  'src/drone/survey.ts', 'src/drone/survey.test.ts',
  '--rootDir', 'src', '--outDir', output, '--module', 'esnext', '--moduleResolution', 'bundler',
  '--target', 'ES2022', '--skipLibCheck', '--strict',
], { cwd: resolve('.'), stdio: 'inherit', shell: process.platform === 'win32' });

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
execFileSync(process.execPath, [join(output, 'domain', 'rules.test.js')], { stdio: 'inherit' });
execFileSync(process.execPath, [join(output, 'sync', 'merge.test.js')], { stdio: 'inherit' });
execFileSync(process.execPath, [join(output, 'sync', 'handover.test.js')], { stdio: 'inherit' });
execFileSync(process.execPath, [join(output, 'map', 'geo.test.js')], { stdio: 'inherit' });
execFileSync(process.execPath, [join(output, 'drone', 'survey.test.js')], { stdio: 'inherit' });
