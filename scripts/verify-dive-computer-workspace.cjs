const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadSourceModule } = require('./lib/load-source-module.cjs');

const projectRoot = path.join(__dirname, '..');
const uiRoot = path.join(projectRoot, 'src', 'features', 'diveComputer', 'ui');
const domainRoot = path.join(projectRoot, 'src', 'lib', 'diveSimulation');
const depthScale = loadSourceModule(path.join(uiRoot, 'depthScale.js'), uiRoot);
const workspaceLayout = loadSourceModule(path.join(uiRoot, 'workspaceLayout.js'), uiRoot);
const profileGeometry = loadSourceModule(path.join(uiRoot, 'profileGeometry.js'), uiRoot);
const simulation = loadSourceModule(path.join(domainRoot, 'index.js'), domainRoot);

const {
  depthToViewportFraction,
  selectDepthRange,
  selectDiverOrientation,
} = depthScale;
const { resolveSimulatorWorkspaceLayout } = workspaceLayout;
const { buildDiveProfileGeometry } = profileGeometry;
const {
  createSimulation,
  advanceSimulation,
  resumeSimulation,
  setSimulationSpeed,
  setTargetDepth,
  stepSimulation,
} = simulation;

// The vertical gauge maps authoritative engine depth downward through a discrete range.
assert.equal(selectDepthRange(0, 'ft').maximum, 60);
assert.equal(selectDepthRange(18, 'ft').maximum, 60);
assert.equal(selectDepthRange(20, 'ft').maximum, 100);
assert.equal(selectDepthRange(31, 'ft').maximum, 130);
assert.equal(selectDepthRange(45, 'ft').maximum, 200);
assert.equal(selectDepthRange(18, 'm').maximum, 20);
assert.equal(selectDepthRange(21, 'm').maximum, 30);
assert.equal(depthToViewportFraction(0, 20), 0);
assert.equal(depthToViewportFraction(10, 20), 0.5);
assert.equal(depthToViewportFraction(20, 20), 1);

// Orientation is a presentation of the engine-owned vertical rate, not a second rate calculation.
assert.equal(selectDiverOrientation(6), 'ascending');
assert.equal(selectDiverOrientation(-6), 'descending');
assert.equal(selectDiverOrientation(0), 'level');

// Small phones preserve the approved minimum instrument width and scroll the workspace instead.
const smallPhone = resolveSimulatorWorkspaceLayout(320);
const standardPhone = resolveSimulatorWorkspaceLayout(390);
const tablet = resolveSimulatorWorkspaceLayout(800);
assert.equal(smallPhone.instrument.width, 286);
assert.equal(smallPhone.requiresHorizontalScroll, true);
assert.ok(smallPhone.gaugeWidth / smallPhone.contentWidth >= 0.17);
assert.ok(smallPhone.gaugeWidth / smallPhone.contentWidth <= 0.25);
assert.ok(standardPhone.instrument.width > smallPhone.instrument.width);
assert.equal(tablet.instrument.width, 420);
assert.ok(tablet.contentWidth < 800, 'Tablet layout should cap and center the physical instrument cluster.');
for (const layout of [smallPhone, standardPhone, tablet]) {
  assert.equal(layout.instrument.width / layout.instrument.height, layout.instrument.aspectRatio);
}

// The profile projection is deterministic, grows in time horizontally, and grows in depth downward.
const sampleHistory = [
  { depthMeters: 0, simulationSeconds: 0 },
  { depthMeters: 10, simulationSeconds: 5 },
  { depthMeters: 20, simulationSeconds: 10 },
];
const profileA = buildDiveProfileGeometry(sampleHistory, 200, 100, 20);
const profileB = buildDiveProfileGeometry(sampleHistory, 200, 100, 20);
assert.deepEqual(profileA, profileB);
assert.deepEqual(profileA.points.map(({ x, y }) => [x, y]), [[0, 0], [100, 50], [200, 100]]);
assert.ok(profileA.timeTicks.length > 0, 'The profile must expose vertical time-grid geometry.');
assert.equal(profileA.contentWidth, 200, 'A short first dive expands to the viewport width.');
assert.equal(profileA.scrolling, false);

// Compression has a deterministic ceiling. A second canonical dive session
// locks the existing scale and subsequent history grows like a seismograph.
const repetitiveHistory = [
  { depthMeters: 0, diveSessionId: 0, simulationSeconds: 0 },
  { depthMeters: 20, diveSessionId: 1, simulationSeconds: 300 },
  { depthMeters: 0, diveSessionId: 1, simulationSeconds: 1800 },
  { depthMeters: 0, diveSessionId: 1, simulationSeconds: 2400 },
  { depthMeters: 18, diveSessionId: 2, simulationSeconds: 2405 },
  { depthMeters: 18, diveSessionId: 2, simulationSeconds: 3000 },
];
const repetitiveGeometry = buildDiveProfileGeometry(repetitiveHistory, 200, 100, 30);
assert.equal(repetitiveGeometry.diveStarts.length, 2);
assert.equal(repetitiveGeometry.secondsPerViewport, 2405);
assert.ok(repetitiveGeometry.contentWidth > 200, 'The second dive must grow past the viewport rather than re-condensing the first.');
assert.equal(repetitiveGeometry.scrolling, true);
assert.ok(repetitiveGeometry.timeTicks.every((tick) => Number.isFinite(tick.x)));

const longSingleDive = buildDiveProfileGeometry([
  { depthMeters: 0, diveSessionId: 0, simulationSeconds: 0 },
  { depthMeters: 20, diveSessionId: 1, simulationSeconds: 3600 },
  { depthMeters: 20, diveSessionId: 1, simulationSeconds: 4500 },
], 200, 100, 30);
assert.equal(longSingleDive.secondsPerViewport, 3600, 'No viewport may compress more than sixty minutes into its width.');
assert.equal(longSingleDive.contentWidth, 250);
assert.equal(longSingleDive.scrolling, true);

// Equivalent simulated time at 1x and 5x yields the same canonical profile data.
const divingBase = advanceSimulation(createSimulation(), { depthMeters: 18, elapsedSimulationSeconds: 5 });
const base = resumeSimulation(setTargetDepth(divingBase, 18, { descentRateMpm: 12 }));
const atOne = stepSimulation(setSimulationSpeed(base, 1), 50);
const atFive = stepSimulation(setSimulationSpeed(base, 5), 10);
assert.deepEqual(atOne.profile.samples, atFive.profile.samples);

const readUi = (filename) => fs.readFileSync(path.join(uiRoot, filename), 'utf8');
const waterSource = readUi('WaterColumnViewport.js');
const profileSource = readUi('DiveProfileViewport.js');
const workspaceSource = readUi('SimulatorWorkspace.js');
const virtualSource = readUi('VirtualDiveComputer.js');
const housingSource = readUi('ComputerHousing.js');
const screenSource = fs.readFileSync(path.join(projectRoot, 'src', 'screens', 'DiveComputerSimulatorScreen.js'), 'utf8');
const hookSource = fs.readFileSync(path.join(projectRoot, 'src', 'features', 'diveComputer', 'useDiveComputerSimulator.js'), 'utf8');

// Water column, profile, and display are synchronized views of the same public simulation state.
assert.match(waterSource, /simulation\.environment\.depthMeters/);
assert.match(waterSource, /simulation\.environment\.verticalRateMpm/);
assert.match(waterSource, /simulation\.safetyStop\.status/);
assert.match(waterSource, /simulation\.physiology\.decompression\.ceilingMeters/);
assert.match(profileSource, /simulation\.profile\.samples/);
assert.match(profileSource, /simulation\.environment\.depthMeters/);
assert.match(profileSource, /<ScrollView/);
assert.match(profileSource, /geometry\.timeTicks/);
assert.match(profileSource, /scrollToEnd/);
assert.match(workspaceSource, /simulation=\{simulation\}/);
assert.match(hookSource, /buildVirtualDiveComputerDisplay\(device, simulation\)/);
assert.equal((workspaceSource.match(/simulation=\{simulation\}/g) || []).length, 1, 'The water column should receive the public simulation exactly once.');

// Visualizations own neither depth, timing, physics, nor device navigation.
for (const [filename, source] of [
  ['WaterColumnViewport.js', waterSource],
  ['DiveProfileViewport.js', profileSource],
  ['SimulatorWorkspace.js', workspaceSource],
]) {
  for (const forbidden of [
    /__simulation/,
    /lesson/i,
    /training/i,
    /setInterval/,
    /setTimeout/,
    /tissues/,
    /calculateNdl/i,
    /Schreiner/i,
    /setScreen/i,
    /screenIndex/,
    /onNext/,
    /onReturnMain/,
  ]) assert.doesNotMatch(source, forbidden, `${filename} violates the Phase 4 visualization boundary.`);
}
assert.doesNotMatch(waterSource, /useState|useEffect/, 'The water column must not own an independent UI depth.');
assert.doesNotMatch(profileSource, /setInterval|elapsedReal|Date\.now/, 'The profile must consume canonical history without another timer.');

// The physical device remains stable and contains only physical-button navigation.
assert.match(workspaceSource, /instrumentWidth=\{layout\.instrument\.width\}/);
assert.match(workspaceSource, /height=\{layout\.instrument\.height\}/);
assert.equal((housingSource.match(/<PhysicalButton/g) || []).length, 2);
assert.match(virtualSource, /resolveInstrumentGeometry/);
assert.doesNotMatch(screenSource, /accessibilityRole="tablist"/);
assert.doesNotMatch(screenSource, /function ModeButton/);
assert.doesNotMatch(screenSource, /floatingGear|gearButton|setScreen/);
assert.doesNotMatch(workspaceSource, /onScreen|selectScreen|setScreen/);

console.log('Dive computer Phase 4 workspace checks passed.');
