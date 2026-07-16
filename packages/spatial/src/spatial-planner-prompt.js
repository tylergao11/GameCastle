function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function compactContext(context) {
  return {
    planningSpace: context.planningSpace,
    semanticView: context.semanticView,
    imageRefs: context.imageInputs.map(function(input) { return { imageRef: input.imageRef, semanticId: input.semanticId, contentHash: input.contentHash, source: input.source }; }),
    subjects: context.subjects.map(function(subject) {
      return { layoutIntentId: subject.layoutIntentId, subject: subject.subject, objectName: subject.objectName, roles: subject.roles, designGuidance: subject.designGuidance, renderGeometry: subject.renderGeometry, acceptedVisuals: subject.acceptedVisuals.map(function(visual) { return { semanticId: visual.semanticId, imageRef: visual.imageRef, contentHash: visual.contentHash, resourceKind: visual.resourceKind, source: visual.source }; }) };
    })
  };
}
function buildFeedback(value) {
  value = value || {};
  return {
    round: value.round || 0,
    status: value.status || 'initial',
    fact: value.fact ? clone(value.fact) : null,
    readyCandidate: value.readyCandidate ? clone(value.readyCandidate) : null
  };
}
function buildPrompt(context, feedback, round, imageInputs) {
  var state = buildFeedback(feedback), canAccept = !!state.readyCandidate, orderedImageInputs = (imageInputs || context.imageInputs || []).map(function(input, index) {
    var item = { position: index + 1, imageRef: input.imageRef, kind: input.kind || 'accepted-asset' };
    if (input.semanticId) item.semanticId = input.semanticId;
    if (input.contentHash) item.contentHash = input.contentHash;
    return item;
  });
  return {
    systemPrompt: [
      'Role: Spatial Planner.',
      'Goal: arrange declared scene and UI subjects in the supplied planningSpace.',
      'Output: one spatial-dsl-v1 program.',
      'PLACE uses planningSpace coordinateFrame object-origin coordinates and direct display size.',
      'Layout: place every planningSpace subject inside its legalRegion with its declared layer and zOrderRange.',
      'Image role: match supplied images to the orderedImageInputs list and preserve accepted resource identities.',
      'Acceptance: issue standalone ACCEPT after a prior preview is ready.'
    ].join('\n'),
    prompt: [
      'Round: ' + round,
      'Program mode: ' + (canAccept ? 'full PLACE program or standalone ACCEPT' : 'full PLACE program'),
      'PLACE grammar: PLACE subject=<json-string> x=<number> y=<number> width=<number> height=<number> angle=<number> layer=<json-string> zOrder=<number>',
      'ACCEPT grammar: ACCEPT',
      'orderedImageInputs (provider image order):',
      JSON.stringify(orderedImageInputs),
      'Frozen context:',
      JSON.stringify(compactContext(context)),
      'Runtime feedback:',
      JSON.stringify(state)
    ].join('\n')
  };
}

module.exports = { buildPrompt: buildPrompt, buildFeedback: buildFeedback, compactContext: compactContext };
