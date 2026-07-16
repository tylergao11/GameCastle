'use strict';

// Sole SemanticAssembly compiler owner. Public @gamecastle/semantic-module re-exports this.
// Implementation packages must require this module, not the public facade.

var crypto = require('crypto');
var dictionaryApi = require('./capability-semantic-dictionary');
var sourceContract = require('./game-semantic-source');
var componentExpander = require('./component-expander');
var semanticCompiler = require('./semantic-compiler');
var assetCompiler = require('./semantic-asset-compiler');
var layoutCompiler = require('./semantic-layout-compiler');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce(function(result, key) {
      result[key] = stable(value[key]);
      return result;
    }, Object.create(null));
  }
  return value;
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24);
}

function same(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.keys(value).forEach(function(key) { freeze(value[key]); });
  return Object.freeze(value);
}

// Pin the generated dictionary once per process so every assembly shares one fingerprint.
var canonicalIndex = dictionaryApi.loadIndex();
var dictionary = freeze(clone(canonicalIndex));

function validate(source) {
  return sourceContract.validateSource(source, { index: canonicalIndex });
}

function applyRevision(source, revision) {
  return sourceContract.applyRevision(source, revision, { index: canonicalIndex });
}

function bindCompilerOutput(output, name, sourceHash, realizedSourceHash, dictionarySource, contentHashPrefix) {
  if (output.sourceHash !== realizedSourceHash) {
    throw new Error('SemanticAssembly received ' + name + ' output from a different realized GameSemanticSource');
  }
  if (!same(output.dictionarySource, dictionarySource)) {
    throw new Error('SemanticAssembly received ' + name + ' output from a different GDJS Semantic Dictionary');
  }
  output.realizedSourceHash = realizedSourceHash;
  output.sourceHash = sourceHash;
  if (contentHashPrefix) {
    delete output.contentHash;
    output.contentHash = contentHashPrefix + hash(output);
  }
  return output;
}

function compileSemanticAssembly(source) {
  var valid = validate(source);
  var sourceHash = sourceContract.sourceHash(valid);
  var expansion = componentExpander.expand(valid, { index: canonicalIndex });
  var realized = componentExpander._compilationSource(expansion);
  var realizedSourceHash = sourceContract.sourceHash(realized);
  if (expansion.sourceHash !== sourceHash || expansion.realizedSourceHash !== realizedSourceHash) {
    throw new Error('SemanticAssembly received a mismatched component expansion');
  }

  var compilerOptions = { index: canonicalIndex };
  var eventGraph = bindCompilerOutput(
    semanticCompiler.compile(realized, compilerOptions),
    'event graph',
    sourceHash,
    realizedSourceHash,
    valid.dictionarySource,
    null
  );
  var assetRequirements = bindCompilerOutput(
    assetCompiler.compile(realized, compilerOptions),
    'asset requirements',
    sourceHash,
    realizedSourceHash,
    valid.dictionarySource,
    'asset.'
  );
  var layoutPlan = bindCompilerOutput(
    layoutCompiler.compile(realized, compilerOptions),
    'layout plan',
    sourceHash,
    realizedSourceHash,
    valid.dictionarySource,
    'layout.'
  );
  var assembly = {
    schemaVersion: 1,
    documentKind: 'semantic-assembly',
    compilerKind: 'game-semantic-source-to-semantic-assembly',
    sourceHash: sourceHash,
    realizedSourceHash: realizedSourceHash,
    dictionarySource: clone(valid.dictionarySource),
    source: clone(valid),
    realizedSource: clone(realized),
    componentExpansion: clone(expansion),
    eventGraph: eventGraph,
    assetRequirements: assetRequirements,
    layoutPlan: layoutPlan
  };
  assembly.contentHash = 'assembly.' + hash(assembly);
  return assembly;
}

module.exports = Object.freeze({
  dictionary: dictionary,
  validate: validate,
  applyRevision: applyRevision,
  compileSemanticAssembly: compileSemanticAssembly
});
