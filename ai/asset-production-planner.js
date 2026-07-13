var crypto = require('crypto');
var templates = require('../shared/asset-template-dictionary.json');
var styles = require('../shared/asset-style-dictionary.json');
var production = require('../shared/asset-production-pipeline-contract.json');
var validator = require('./asset-production-contract-validator');

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'AssetProductionPlanner'; throw error; }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function template(request) {
  var item = templates.templates.find(function(entry) { return entry.id === request.templateId && entry.version === request.templateVersion; });
  if (!item || item.status !== 'approved') fail('ASSET_PRODUCTION_TEMPLATE_INVALID', 'Asset production requires an approved exact template id and version.');
  return item;
}
function compile(input) {
  input = input || {}; var request = validator.validateRequest(clone(input.request || input)); var selected = template(request);
  if (request.styleId !== selected.styleId || !styles.styles[request.styleId]) fail('ASSET_PRODUCTION_STYLE_INVALID', 'AssetProductionRequest styleId must equal the pinned template Style DNA.');
  var requiredTemplateSlots = selected.slots.filter(function(slot) { return slot.required !== false; }).map(function(slot) { return slot.id; }).sort();
  if (JSON.stringify(request.requiredSlotIds.slice().sort()) !== JSON.stringify(requiredTemplateSlots)) fail('ASSET_PRODUCTION_SLOT_COVERAGE_INVALID', 'requiredSlotIds must exactly cover every required template slot.');
  var declaredSlots = input.assetSlots || [];
  if (!Array.isArray(declaredSlots)) fail('ASSET_PRODUCTION_ASSET_SLOTS_INVALID', 'assetSlots must be an array.');
  var sourceById = {};
  declaredSlots.forEach(function(slot) { if (!slot || !slot.slotId || sourceById[slot.slotId]) fail('ASSET_PRODUCTION_ASSET_SLOT_INVALID', 'assetSlots require unique slotId values.'); sourceById[slot.slotId] = slot; });
  var workItems = selected.slots.filter(function(slot) { return request.requiredSlotIds.indexOf(slot.id) >= 0; }).map(function(slot) {
    var source = sourceById[slot.id] || {}, family = production.productionFamilies[slot.productionFamily], recipe = production.recipes[slot.recipeId];
    if (!family || !recipe) fail('ASSET_PRODUCTION_RECIPE_INVALID', 'Template slot references an unknown production family or recipe: ' + slot.id);
    if (source.targetVisualSlotId && source.targetVisualSlotId !== request.targetVisualSlotIds[slot.id]) fail('ASSET_PRODUCTION_TARGET_CONFLICT', 'Asset slot target conflicts with AssetProductionRequest: ' + slot.id);
    var assetSpec = {
      slotId: slot.id,
      kind: source.kind || slot.kind,
      semanticTags: (source.semanticTags || [slot.id]).slice(),
      styleTags: (source.styleTags || [request.styleId]).slice(),
      styleId: request.styleId,
      constraints: Object.assign({}, slot.constraints || {}, source.constraints || {}),
      targetVisualSlotId: request.targetVisualSlotIds[slot.id],
      preserve: (source.preserve || []).slice()
    };
    return {
      workItemPlanId: 'work.' + hash([request.requestId, slot.id, request.targetVisualSlotIds[slot.id]]).slice(0, 24),
      slotId: slot.id,
      targetVisualSlotId: request.targetVisualSlotIds[slot.id],
      productionFamily: slot.productionFamily,
      recipeId: slot.recipeId,
      assetSpec: assetSpec,
      stageSequence: recipe.minimumPath.slice(),
      conditionalCapabilities: recipe.conditionalCapabilities.slice(),
      familyChecks: recipe.familyChecks.slice(),
      stylePromptRef: { dictionaryId: styles.dictionaryId, schemaVersion: styles.schemaVersion, styleId: request.styleId },
      retryBudget: clone(input.retryBudget || { generation: 2, repair: 2, segmentation: 1, color: 1, normalization: 1 })
    };
  });
  var draft = {
    productionSetId: 'production.' + hash([request.projectId, request.requestId, request.templateId, request.templateVersion]).slice(0, 24),
    templateId: request.templateId,
    templateVersion: request.templateVersion,
    styleId: request.styleId,
    workItems: workItems,
    dependencyGraph: { nodes: workItems.map(function(item) { return item.workItemPlanId; }), edges: [] },
    coveragePolicy: { requiredSlotIds: request.requiredSlotIds.slice().sort(), requiredTargetVisualSlotIds: Object.keys(request.targetVisualSlotIds).sort().map(function(slotId) { return request.targetVisualSlotIds[slotId]; }), mode: 'all-required-before-playable' }
  };
  draft.contentHash = hash(draft);
  validator.validatePlan(draft);
  return Object.freeze(draft);
}

module.exports = { compile: compile, _hash: hash };
