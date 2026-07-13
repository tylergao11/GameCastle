var assert = require('assert');
var validator = require('./playable-runtime-validator');
var blocked = validator.validate({});
assert.strictEqual(blocked.pass, false);
assert.strictEqual(blocked.ownerRoute.owner, 'RuntimeViewportCoordinator');
var acceptance = { productionSetId: 'production.test', decision: 'accepted', requiredSlotCoverage: { complete: true }, workItemAcceptanceReceiptIds: ['work.accepted.1'], acceptedRevisionByTargetVisualSlotId: { 'game.player.visual': 'revision.hero' } };
var production = { pass: true, productionSetAcceptanceReceipt: acceptance };
var binding = { pass: true, productionSetId: 'production.test', receipts: [{ productionSetId: 'production.test', assetRevisionId: 'revision.hero', targetVisualSlotId: 'game.player.visual', boundInstanceCount: 1, preservationChecks: { behaviors: true, collisionMask: true, variables: true, instanceIdentity: true, layer: true, zOrderPolicy: true }, runtimeChecks: { resourceInstalled: true, targetObjectIsSprite: true, detachedOverlay: false } }] };
function evidence(overrides) { return Object.assign({ viewportMatrixReport: { pass: true }, assetProductionReport: production, assetBindingReport: binding, tickPerformanceReport: { pass: true, profile: 'local-interactive', observedSimulationHz: 60 }, tickReplayReceipt: { pass: true, finalStateHash: 'abc' }, browserPlaytestReport: { pass: true, origin: 'http://127.0.0.1:4193' } }, overrides || {}); }
assert.strictEqual(validator.validate(evidence()).pass, true);
assert.strictEqual(validator.validate(evidence({ tickPerformanceReport: { pass: true, profile: 'local-interactive', observedSimulationHz: 20 } })).pass, false);
assert.strictEqual(validator.validate(evidence({ assetProductionReport: { pass: true, simulated: true, productionSetAcceptanceReceipt: acceptance } })).pass, false);
assert.strictEqual(validator.validate(evidence({ assetProductionReport: { pass: true, productionSetAcceptanceReceipt: Object.assign({}, acceptance, { requiredSlotCoverage: { complete: false } }) } })).pass, false);
assert.strictEqual(validator.validate(evidence({ assetBindingReport: Object.assign({}, binding, { productionSetId: 'production.other' }) })).pass, false, 'binding evidence from another production set must fail');
assert.strictEqual(validator.validate(evidence({ assetBindingReport: Object.assign({}, binding, { receipts: [Object.assign({}, binding.receipts[0], { assetRevisionId: 'revision.intermediate' })] }) })).pass, false, 'an intermediate or foreign revision must not bind');
assert.strictEqual(validator.validate(evidence({ browserPlaytestReport: { pass: true } })).pass, false, 'browser evidence must name a real HTTP origin');
console.log('PASS playable_runtime_validator');
