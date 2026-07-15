var dictionary = require('../shared/gdjs-asset-binding-dictionary.json');
function resolve(configurationType) { var adapter = dictionary.adapters[configurationType]; if (!adapter) return null; return JSON.parse(JSON.stringify(adapter)); }
function resolveFrameSet(configurationType) { var adapter = dictionary.frameSetAdapters && dictionary.frameSetAdapters[configurationType]; if (!adapter) return null; return JSON.parse(JSON.stringify(adapter)); }
module.exports = { dictionary: dictionary, resolve: resolve, resolveFrameSet: resolveFrameSet };
