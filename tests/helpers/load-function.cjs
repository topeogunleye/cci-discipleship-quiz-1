const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { transformSync } = require('esbuild');

// Transform the actual ESM endpoint instead of stripping import lines with a
// newline-sensitive regex. Tests may replace dependencies without real HTTP.
module.exports = function loadFunction(relativeFile, { modules = {}, ...globals } = {}) {
  const file = path.resolve(__dirname, '../..', relativeFile);
  const source = transformSync(fs.readFileSync(file, 'utf8'), { format: 'cjs', target: 'node18', sourcefile: file }).code;
  const localRequire = createRequire(file);
  const module = { exports: {} };
  vm.runInNewContext(source, {
    URL, URLSearchParams, Request, Response, Headers, AbortController, AbortSignal,
    setTimeout, clearTimeout, module, exports: module.exports,
    require: name => Object.prototype.hasOwnProperty.call(modules, name) ? modules[name] : localRequire(name),
    ...globals
  }, { filename: file });
  return module.exports;
};
