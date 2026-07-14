var assert = require('assert');
var dictionary = require('./capability-semantic-dictionary');
var sourceContract = require('./game-semantic-source');
var feedback = require('./semantic-feedback-contract');

var index = dictionary.buildIndex();
var source = { schemaVersion: 2, documentKind: 'game-semantic-source', dictionarySource: index.source, game: { semanticId: 'demo', name: 'Demo' }, entities: [{ semanticId: 'player', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [] }], events: [], assetIntents: [], layoutIntents: [], tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } } };
var sourceHash = sourceContract.sourceHash(source);
var valid = feedback.validate({ schemaVersion: 2, documentKind: 'semantic-feedback-batch', baseSourceHash: sourceHash, baseStructureHash: 'structure.demo', entries: [{ feedbackId: 'jump_feel', kind: 'playtest-observation', subjectSemanticIds: ['player'], observation: { code: 'jump_feels_low', description: 'The player jump does not clear the first obstacle.', evidence: { attempts: 6, clears: 0 } } }] }, { source: source, sourceHash: sourceHash, structureHash: 'structure.demo' });
assert.strictEqual(valid.entries[0].observation.evidence.clears, 0, 'Feedback preserves observed values for LLM2.');
assert.throws(function() { feedback.validate({ schemaVersion: 2, documentKind: 'semantic-feedback-batch', baseSourceHash: sourceHash, baseStructureHash: 'structure.demo', entries: [{ feedbackId: 'bad_route', kind: 'runtime-observation', subjectSemanticIds: ['player'], owner: 'RuntimeLinker', observation: { code: 'jump_feels_low', description: 'bad', evidence: {} } }] }, { source: source, sourceHash: sourceHash, structureHash: 'structure.demo' }); }, function(error) { return error.code === 'SEMANTIC_FEEDBACK_UNKNOWN_FIELD'; });
assert.throws(function() { feedback.validate({ schemaVersion: 2, documentKind: 'semantic-feedback-batch', baseSourceHash: sourceHash, baseStructureHash: 'structure.demo', entries: [{ feedbackId: 'unknown_subject', kind: 'runtime-observation', subjectSemanticIds: ['ghost'], observation: { code: 'jump_feels_low', description: 'bad', evidence: {} } }] }, { source: source, sourceHash: sourceHash, structureHash: 'structure.demo' }); }, function(error) { return error.code === 'SEMANTIC_FEEDBACK_SUBJECT_UNKNOWN'; });
console.log('[SemanticFeedback] fact-only feedback is source-bound and cannot route its own repair');
