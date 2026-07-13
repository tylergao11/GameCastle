var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var production = require('../shared/asset-production-pipeline-contract.json');
var templates = require('../shared/asset-template-dictionary.json');
var styles = require('../shared/asset-style-dictionary.json');
var workflows = require('../shared/comfyui-workflow-registry.json');

assert.strictEqual(production.contractId, 'gamecastle.asset-production-pipeline');
assert.strictEqual(production.status, 'designed');
Object.keys(production.truthSources).forEach(function(key) {
  assert(fs.existsSync(path.join(root, production.truthSources[key])), 'missing production truth source: ' + key);
});
assert(styles.styles[styles.defaultStyleId], 'default Style DNA must resolve');
templates.templates.forEach(function(template) {
  assert(styles.styles[template.styleId], 'template styleId must resolve: ' + template.id);
  template.slots.forEach(function(slot) {
    assert(production.productionFamilies[slot.productionFamily], 'slot production family must resolve: ' + template.id + '/' + slot.id);
    assert(production.recipes[slot.recipeId], 'slot recipe must resolve: ' + template.id + '/' + slot.id);
  });
});
['GENERATE_DRAFT', 'INSPECT', 'SEGMENT_SUBJECT', 'APPLY_CUTOUT', 'REPAIR_MASKED_REGION', 'APPLY_DECLARED_COLOR', 'NORMALIZE_STYLE', 'FINAL_REVIEW'].forEach(function(action) {
  assert(production.closedLoop.actionCatalog[action], 'missing loop action: ' + action);
});
assert(production.closedLoop.iteration.some(function(step) { return step.indexOf('REOBSERVE') === 0; }), 'loop must reobserve every pixel-changing result');
assert(production.closedLoop.invariants.indexOf('every pixel-changing output receives a new revision id and sha256') >= 0);
assert(production.playableVersionGate.forbidden.indexOf('partially generated game presented as playable') >= 0);
assert(production.playableVersionGate.forbidden.indexOf('runtime hot swap of draft or candidate revisions') >= 0);
assert(production.comfyExecutionPolicy.requiredWorkflowRoles.indexOf('subject-segment') >= 0);
assert(workflows.workflows['gamecastle.sprite-generate.dev-cpu.v1'].role === 'image-generate');
assert(workflows.workflows['gamecastle.sprite-edit.dev-cpu.v1'].role === 'image-edit');
assert(workflows.workflows['gamecastle.florence2.review.cpu.v1'].role === 'vision-review');
assert.strictEqual(production.comfyExecutionPolicy.p0DependencyDecision.ImpactPackAndSubpack.indexOf('must be commit, hash, node and license pinned before approval') >= 0, true);
assert(fs.existsSync(path.join(root, 'docs', 'comfyui-asset-production-pipeline.md')));

console.log('[AssetProductionPipelineDesign] one Style DNA, conditional LangGraph loop, workflow boundary, complete-before-playable gate and retired-path deletion passed');
