const assert = require('node:assert/strict');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.join(__dirname, '..', 'src');
const { DEFAULT_LAYOUT, sanitizeLayout, moveLayoutItem, orderedFeatures } = loadSourceModule(path.join(root, 'features/layout/layoutPreferences.js'), root);
assert.deepEqual(moveLayoutItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
assert.deepEqual(moveLayoutItem(['a', 'b', 'c'], 2, -10), ['c', 'a', 'b']);
assert.deepEqual(moveLayoutItem(['a', 'b', 'c'], 0, 20), ['b', 'c', 'a']);
assert.deepEqual(moveLayoutItem(['a'], -1, 0), ['a']);
assert.deepEqual(sanitizeLayout(null), DEFAULT_LAYOUT);
assert.deepEqual(sanitizeLayout({ quickAccess: ['dive-log', 'dive-log', 'unknown', 'gear-setup'] }).quickAccess, ['dive-log']);
assert.deepEqual(sanitizeLayout({ quickAccess: [] }).quickAccess, []);
const custom = sanitizeLayout({ tools: ['dive-lens'], learn: ['compass-nav'], home: ['learning'] });
assert.equal(orderedFeatures('tools', custom)[0].id, 'dive-lens');
assert.equal(orderedFeatures('learn', custom)[0].id, 'compass-nav');
assert.equal(custom.home[0], 'learning');
assert.equal(custom.tools.length, DEFAULT_LAYOUT.tools.length);
const original = ['a', 'b'];
moveLayoutItem(original, 0, 1);
assert.deepEqual(original, ['a', 'b'], 'Cancel can retain the original saved layout.');
console.log('Layout checks passed: drag ordering, bounds, defaults, removed shortcuts, unknown IDs and new features.');

// Run the real drag responder callbacks with native rendering stubbed out.
{
  const fs = require('node:fs'), vm = require('node:vm');
  const babel = require('@babel/core'), parser = require('@babel/parser'), generate = require('@babel/generator').default;
  const file = path.join(root, 'features/layout/LayoutEditor.js');
  const tree = parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  const row = tree.program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'DraggableRow');
  const code = babel.transformSync(generate(row).code, { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-react-jsx'] }).code;
  let responder, offset, moving = [], dragStates = [];
  const sandbox = vm.createContext({
    ROW_HEIGHT: 64, useMemo: fn => fn(), useRef: value => ({ current: value }), useState: () => [false, () => {}],
    Animated: { Value: class { constructor() { offset = this; } setValue(value) { this.value = value; } }, View: 'view' },
    PanResponder: { create: config => { responder = config; return { panHandlers: {} }; } },
    React: { createElement: (type, props, ...children) => ({ type, props, children }) }, View: 'view', Text: 'text', Pressable: 'pressable',
    styles: {}, props: { item: { title: 'Atlas' }, index: 1, count: 4, onMove: (from, to) => moving.push([from, to]), onDragging: value => dragStates.push(value) },
  });
  vm.runInContext(`${code}\nDraggableRow(props);`, sandbox);
  responder.onPanResponderGrant();
  responder.onPanResponderMove(null, { dy: 130 });
  assert.equal(offset.value, 128, 'Dragging stays inside the list.');
  responder.onPanResponderRelease(null, { dy: 130 });
  assert.deepEqual(moving, [[1, 3]]);
  assert.deepEqual(dragStates, [true, false]);
  assert.equal(offset.value, 0);
  responder.onPanResponderGrant();
  responder.onPanResponderTerminate();
  assert.equal(moving.length, 1, 'Cancelled drags do not change the order.');
  console.log('Layout drag responder checks passed.');
}
