var crypto = require('crypto');
var sourceContract = require('./game-semantic-source');
var semanticCompiler = require('./semantic-compiler');
var assetCompiler = require('./semantic-asset-compiler');
var layoutCompiler = require('./semantic-layout-compiler');
var projectAssembler = require('./gdjs-project-assembler');

function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function same(left, right) { return JSON.stringify(stable(left)) === JSON.stringify(stable(right)); }

function assemble(source, options) {
  var valid = sourceContract.validateSource(source, options);
  var sourceHash = sourceContract.sourceHash(valid);
  var events = semanticCompiler.compile(valid, options);
  var assets = assetCompiler.compile(valid, options);
  var layout = layoutCompiler.compile(valid, options);
  if (events.sourceHash !== sourceHash || assets.sourceHash !== sourceHash || layout.sourceHash !== sourceHash) throw new Error('Semantic RuntimeLinker received compiler output from different GameSemanticSource values');
  if (!same(events.dictionarySource, valid.dictionarySource) || !same(assets.dictionarySource, valid.dictionarySource) || !same(layout.dictionarySource, valid.dictionarySource)) throw new Error('Semantic RuntimeLinker received compiler output from a different GDJS Semantic Dictionary');
  var build = {
    schemaVersion: 2,
    documentKind: 'semantic-runtime-assembly',
    linkerKind: 'semantic-runtime-linker',
    sourceHash: sourceHash,
    dictionarySource: valid.dictionarySource,
    eventGraph: events,
    assetRequirements: assets,
    layoutPlan: layout
  };
  build.contentHash = 'assembly.' + hash(build);
  build.projectSeed = projectAssembler.assemble(Object.assign({}, build, { source: valid }), options);
  return build;
}

module.exports = { assemble: assemble };
