#!/usr/bin/env node
// One entry point for release verification: every `test:*` package script plus
// the standalone checks that are not in that list. Runs each in turn, keeps
// going after a failure, and exits non-zero if anything failed.
//
//   npm run verify:release            all checks
//   npm run verify:release -- planner  only checks whose name contains "planner"
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const { scripts } = require(path.join(root, 'package.json'));

const EXTRA_CHECKS = {
  'account-data-sync': 'node scripts/verify-account-data-sync.cjs',
  'account-data-vault': 'node scripts/verify-account-data-vault.cjs',
  'atlas-weather': 'node scripts/verify-atlas-weather.cjs',
};

const filter = process.argv[2] || '';
const checks = [
  ...Object.keys(scripts).filter((name) => name.startsWith('test:')).map((name) => [name.slice(5), `npm run --silent ${name}`]),
  ...Object.entries(EXTRA_CHECKS),
].filter(([name]) => name.includes(filter));

const results = [];
for (const [name, command] of checks) {
  const startedAt = Date.now();
  const run = spawnSync(command, { cwd: root, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const ok = run.status === 0;
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  results.push({ name, ok, seconds });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(28)} ${seconds}s`);
  if (!ok) {
    const output = `${run.stdout || ''}${run.stderr || ''}`.trim().split('\n').slice(-25).join('\n');
    console.log(output.replace(/^/gm, '      '));
  }
}

const failed = results.filter((result) => !result.ok);
const commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout.trim() ? ' (uncommitted changes)' : '';
console.log(`\n${results.length - failed.length}/${results.length} checks passed at ${commit || 'unknown commit'}${dirty}.`);
if (failed.length) {
  console.log(`Failed: ${failed.map((result) => result.name).join(', ')}`);
  process.exitCode = 1;
}
