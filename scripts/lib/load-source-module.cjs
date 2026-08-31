const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

function loadSourceModule(entryPath, sourceRoot) {
  const absoluteEntry = path.resolve(entryPath);
  const absoluteRoot = path.resolve(sourceRoot);
  const originalLoader = require.extensions['.js'];

  require.extensions['.js'] = (module, filename) => {
    if (!path.resolve(filename).startsWith(`${absoluteRoot}${path.sep}`) && path.resolve(filename) !== absoluteRoot) {
      originalLoader(module, filename);
      return;
    }
    const transformed = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
      babelrc: false,
      filename,
      plugins: ['@babel/plugin-transform-modules-commonjs'],
      sourceMaps: false,
    });
    module._compile(transformed.code, filename);
  };

  try {
    delete require.cache[absoluteEntry];
    return require(absoluteEntry);
  } finally {
    require.extensions['.js'] = originalLoader;
  }
}

module.exports = { loadSourceModule };
