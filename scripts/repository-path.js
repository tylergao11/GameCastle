var path = require('path');

var REPOSITORY_ROOT = path.resolve(__dirname, '..');

function fail(label, message) { throw new Error(label + ' ' + message); }
function relativeLocator(absolutePath, label) {
  var relative = path.relative(REPOSITORY_ROOT, path.resolve(absolutePath));
  if (!relative || relative === '..' || relative.indexOf('..' + path.sep) === 0 || path.isAbsolute(relative)) fail(label, 'must resolve to a file inside the GameCastle repository.');
  return relative.split(path.sep).join('/');
}
function fromCommandLine(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(label, 'requires a path.');
  var absolutePath = path.resolve(process.cwd(), value.trim());
  return { absolutePath: absolutePath, locator: relativeLocator(absolutePath, label) };
}
function fromLocator(locator, label) {
  if (typeof locator !== 'string' || !locator.trim()) fail(label, 'requires a repository-relative locator.');
  if (path.isAbsolute(locator) || locator.indexOf('\\') >= 0) fail(label, 'must use the canonical repository-relative forward-slash format.');
  var absolutePath = path.resolve(REPOSITORY_ROOT, locator);
  if (relativeLocator(absolutePath, label) !== locator) fail(label, 'is not a canonical repository-relative locator: ' + locator);
  return absolutePath;
}

module.exports = { root: REPOSITORY_ROOT, relativeLocator: relativeLocator, fromCommandLine: fromCommandLine, fromLocator: fromLocator };
