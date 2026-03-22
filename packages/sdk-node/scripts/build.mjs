import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const rootDir = fileURLToPath(new URL('..', import.meta.url));

function runTsc(project) {
  execFileSync('tsc', ['-p', project], { cwd: rootDir, stdio: 'inherit' });
}

runTsc('tsconfig.esm.json');
runTsc('tsconfig.cjs.json');
runTsc('tsconfig.types.json');

function ensurePackageJson(dir, type) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ type }, null, 2) + '\n',
  );
}

ensurePackageJson(join(rootDir, 'dist', 'esm'), 'module');
ensurePackageJson(join(rootDir, 'dist', 'cjs'), 'commonjs');
