#!/usr/bin/env node
/*
 * Stages the vendored libdivecomputer C sources into the native module so the
 * podspec can compile them.
 *
 * CocoaPods only builds `source_files` that live inside the pod root, so the
 * submodule at vendor/libdivecomputer/ (kept as the source of truth for
 * licensing + updates) is copied into
 *   modules/dive-computer-bridge/ios/libdivecomputer/{src,include}
 * which is gitignored. This runs from the withLibDiveComputer config plugin
 * during `expo prebuild`, and can also be run directly:
 *   node modules/dive-computer-bridge/scripts/stage-libdivecomputer.js
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const vendorRoot = path.join(repoRoot, 'vendor', 'libdivecomputer');
const stageRoot = path.join(repoRoot, 'modules', 'dive-computer-bridge', 'ios', 'libdivecomputer');

// Win32-only backend: pulls in <windows.h>. The rest of src/ is the POSIX build
// set (matches contrib/android/Android.mk).
const EXCLUDE = new Set(['serial_win32.c']);

function fail(message) {
  console.error(`[stage-libdivecomputer] ${message}`);
  process.exit(1);
}

function copyDir(from, to, filter) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dst, filter);
    } else if (!filter || filter(entry.name)) {
      fs.copyFileSync(src, dst);
    }
  }
}

function stage() {
  if (!fs.existsSync(path.join(vendorRoot, 'src', 'version.c'))) {
    fail(
      `vendor/libdivecomputer is missing or empty. Run:\n` +
      `  git submodule update --init vendor/libdivecomputer`,
    );
  }

  fs.rmSync(stageRoot, { recursive: true, force: true });

  copyDir(
    path.join(vendorRoot, 'src'),
    path.join(stageRoot, 'src'),
    (name) => (name.endsWith('.c') || name.endsWith('.h')) && !EXCLUDE.has(name),
  );
  copyDir(path.join(vendorRoot, 'include'), path.join(stageRoot, 'include'), (name) => name.endsWith('.h'));
  fs.copyFileSync(path.join(vendorRoot, 'COPYING'), path.join(stageRoot, 'COPYING'));

  const count = fs.readdirSync(path.join(stageRoot, 'src')).filter((n) => n.endsWith('.c')).length;
  console.log(`[stage-libdivecomputer] staged ${count} C sources -> modules/dive-computer-bridge/ios/libdivecomputer/`);
}

stage();
