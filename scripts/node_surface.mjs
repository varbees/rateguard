// Emits the Node SDK's full public surface (values AND types) as JSON.
//
// Object.keys() on the built module only sees RUNTIME exports, so every
// `export interface` / `export type` vanishes — TypeScript erases them. That
// made ~half the parity guard's output noise: EnforcementEvent and friends
// looked "missing from node" when they are exported, just not at runtime.
//
// The TypeScript checker resolves the `export *` graph and reports types and
// values alike, which is the surface a Node USER actually sees.
//
// Run from packages/sdk-node. Emits a JSON array of names on stdout.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const sdk = path.resolve(here, '..', 'packages', 'sdk-node');
const entry = path.join(sdk, 'src', 'index.ts');

// This script lives in scripts/, which has no node_modules of its own, so a
// bare `import 'typescript'` resolves from the wrong place. Load it from the
// SDK's own install instead.
const ts = createRequire(path.join(sdk, 'package.json'))('typescript');

const program = ts.createProgram([entry], {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  noEmit: true,
});

const checker = program.getTypeChecker();
const source = program.getSourceFile(entry);
if (!source) {
  console.error(`node_surface: could not load ${entry}`);
  process.exit(1);
}

const moduleSymbol = checker.getSymbolAtLocation(source);
if (!moduleSymbol) {
  console.error('node_surface: index.ts has no module symbol');
  process.exit(1);
}

const names = checker
  .getExportsOfModule(moduleSymbol)
  .map((s) => s.getName())
  .filter((n) => n && n !== 'default' && !n.startsWith('_'));

console.log(JSON.stringify([...new Set(names)].sort()));
