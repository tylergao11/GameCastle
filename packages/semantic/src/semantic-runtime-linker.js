var crypto = require('crypto');
var sourceContract = require('./game-semantic-source');
var semanticCompiler = require('./semantic-compiler');
var assetCompiler = require('./semantic-asset-compiler');
var layoutCompiler = require('./semantic-layout-compiler');
var spatialEngine = require('../../spatial/src/runtime');
var projectAssembler = require('../../gdjs/src/gdjs-project-assembler');
var componentExpander = require('./component-expander');

function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, Object.create(null)); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function same(left, right) { return JSON.stringify(stable(left)) === JSON.stringify(stable(right)); }
function refreshContentHash(document, prefix) { delete document.contentHash; document.contentHash = prefix + hash(document); }

function assemble(source, options) {
  var valid = sourceContract.validateSource(source, options);
  var sourceHash = sourceContract.sourceHash(valid);
  var internalExpansion = componentExpander.expand(valid, options);
  var realized = componentExpander._compilationSource(internalExpansion);
  var realizedSourceHash = sourceContract.sourceHash(realized);
  if (realizedSourceHash !== internalExpansion.realizedSourceHash) throw new Error('Semantic RuntimeLinker received a mismatched internal component realization');
  var componentExpansion = JSON.parse(JSON.stringify(internalExpansion));
  var events = semanticCompiler.compile(realized, options);
  var assets = assetCompiler.compile(realized, options);
  var layout = layoutCompiler.compile(realized, options);
  [events, assets, layout].forEach(function(output) { output.realizedSourceHash = output.sourceHash; output.sourceHash = sourceHash; });
  refreshContentHash(assets, 'asset.');
  refreshContentHash(layout, 'layout.');
  if (events.sourceHash !== sourceHash || assets.sourceHash !== sourceHash || layout.sourceHash !== sourceHash) throw new Error('Semantic RuntimeLinker received compiler output from different GameSemanticSource values');
  if (!same(events.dictionarySource, valid.dictionarySource) || !same(assets.dictionarySource, valid.dictionarySource) || !same(layout.dictionarySource, valid.dictionarySource)) throw new Error('Semantic RuntimeLinker received compiler output from a different GDJS Semantic Dictionary');
  var spatialAssemblyRequest = spatialEngine.createAssemblyRequest(layout);
  if (spatialAssemblyRequest.sourceHash !== sourceHash || spatialAssemblyRequest.realizedSourceHash !== realizedSourceHash || !same(spatialAssemblyRequest.dictionarySource, valid.dictionarySource)) throw new Error('Semantic RuntimeLinker received a spatial assembly request from a different GameSemanticSource or dictionary');
  var build = {
    schemaVersion: 3,
    documentKind: 'semantic-runtime-assembly',
    linkerKind: 'semantic-runtime-linker',
    sourceHash: sourceHash,
    realizedSourceHash: realizedSourceHash,
    dictionarySource: valid.dictionarySource,
    componentExpansion: componentExpansion,
    eventGraph: events,
    assetRequirements: assets,
    layoutPlan: layout,
    spatialAssemblyRequest: spatialAssemblyRequest
  };
  build.contentHash = 'assembly.' + hash(build);
  build.projectSeed = projectAssembler.assemble(Object.assign({}, build, { source: valid, realizedSource: realized }), options);
  return build;
}

module.exports = { assemble: assemble };
