var crypto = require('crypto');
var sourceContract = require('./game-semantic-source');
var layoutDictionary = require('./semantic-layout-dictionary');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }

function compile(source, options) {
  var valid = sourceContract.validateSource(source, options);
  var intents = valid.layoutIntents.map(function(intent) {
    var relation = layoutDictionary.resolve(intent.relations[0].layoutRef);
    return { semanticId: intent.semanticId, subject: intent.subject, roles: clone(intent.roles), gdjsBindings: clone(intent.bindings), relation: { semanticId: intent.relations[0].semanticId, semanticRef: relation.semanticRef, title: relation.title, description: relation.description, placement: relation.placement } };
  });
  var document = {
    schemaVersion: 2,
    documentKind: 'semantic-layout-plan',
    compilerKind: 'semantic-source-to-layout-plan',
    sourceHash: sourceContract.sourceHash(valid),
    dictionarySource: clone(valid.dictionarySource),
    intents: intents
  };
  document.contentHash = 'layout.' + hash(document);
  return document;
}

module.exports = { compile: compile };
