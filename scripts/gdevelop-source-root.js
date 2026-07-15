var path = require('path');

var REPOSITORY_ROOT = path.resolve(__dirname, '..');
function resolveSourceRoot() { return path.resolve(process.env.GAMECASTLE_GDEVELOP_SOURCE_DIR || path.resolve(REPOSITORY_ROOT, '..', 'GDevelop-master')); }

module.exports = { resolveSourceRoot: resolveSourceRoot };
