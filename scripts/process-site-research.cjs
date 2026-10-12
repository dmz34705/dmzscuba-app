#!/usr/bin/env node
/*
 * One step after research agents finish: verify the quotes of every evidence file changed since the last run,
 * rebuild siteProfiles.json and run the site-profile checks. Prints one line per step.
 *
 *   npm run research:process
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const dir = path.join(__dirname, 'data/site-research');
const stamp = path.join(dir, '.processed');
const since = fs.existsSync(stamp) ? fs.statSync(stamp).mtimeMs : 0;
const run = (args) => execFileSync(process.execPath, args, { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim().split('\n');

const changed = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !['queue.json', 'verified.json'].includes(f) && fs.statSync(path.join(dir, f)).mtimeMs > since);
for (const file of changed) console.log(`${file}: ${run([path.join(__dirname, 'verify-research-quotes.cjs'), file.replace(/\.json$/, '')]).pop()}`);
console.log(run([path.join(__dirname, 'build-site-research.cjs')]).slice(-2).join('\n'));
console.log(run([path.join(__dirname, 'verify-site-profiles.cjs')]).pop());
// Yield: what each new batch put on the map (full profiles, depths, hidden pins) — the stop signal when a tier runs
// dry (see docs/HANDOFF.md: stop a tier when batches average under 5 accepted sites).
const rows = Object.values(JSON.parse(fs.readFileSync(path.join(__dirname, '../src/features/oceanAtlas/data/siteProfiles.json'), 'utf8')).sites);
for (const file of changed) {
  const name = file.replace(/\.json$/, ''), mine = rows.filter(r => r.researchBatch === name);
  if (!mine.length && !/^(popular|logged|notable|verified)/.test(name)) continue;
  console.log(`yield ${name}: ${mine.filter(r => r.summary).length} profiles, ${mine.filter(r => r.depth).length} depths, ${mine.filter(r => r.status !== 'dive').length} hidden — ${mine.length} sites accepted`);
}
console.log(run([path.join(__dirname, 'plan-site-research.cjs'), '--next']).pop());
fs.writeFileSync(stamp, new Date().toISOString() + '\n');
