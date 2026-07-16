function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') return Object.keys(value).reduce(function(copy, key) { copy[key] = clone(value[key]); return copy; }, {});
  return value;
}
function quote(value) {
  return '"' + String(value === undefined || value === null ? '' : value)
    .replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t').replace(/\f/g, '\\f').replace(/\u0008/g, '\\b') + '"';
}
function factRows(value, root) {
  var lines = [];
  function visit(current, path) {
    if (Array.isArray(current)) { lines.push('fact(path=' + quote(path + '.count') + ',value=' + current.length + ')'); current.forEach(function(item, index) { visit(item, path + '.' + index); }); return; }
    if (current && typeof current === 'object') { Object.keys(current).sort().forEach(function(key) { visit(current[key], path + '.' + key); }); return; }
    if (typeof current === 'string') lines.push('fact(path=' + quote(path) + ',value=' + quote(current) + ')');
    else if (current === null || current === undefined) lines.push('fact(path=' + quote(path) + ',value=null)');
    else lines.push('fact(path=' + quote(path) + ',value=' + String(current) + ')');
  }
  visit(value, root);
  return lines;
}
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
  return { round: value.round || 0, status: value.status || 'initial', fact: value.fact ? clone(value.fact) : null, readyCandidate: value.readyCandidate ? clone(value.readyCandidate) : null };
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
      'Output: one spatial-dsl-v1 program. Emit DSL commands only; never emit JSON, Markdown, or explanation.',
      'PLACE uses planningSpace coordinateFrame object-origin coordinates and direct display size.',
      'Layout: place every planningSpace subject inside its legalRegion with its declared layer and zOrderRange.',
      'Image role: match supplied images to ordered image-input FACT rows and preserve accepted resource identities.',
      'Acceptance: issue standalone ACCEPT after a prior preview is ready.',
      'PLACE grammar: PLACE subject=<dsl-string> x=<number> y=<number> width=<number> height=<number> angle=<number> layer=<dsl-string> zOrder=<number>.',
      'ACCEPT grammar: ACCEPT.'
    ].join('\n'),
    prompt: ['[spatial-facts]'].concat(factRows({ round: round, programMode: canAccept ? 'full-place-or-accept' : 'full-place', orderedImageInputs: orderedImageInputs, context: compactContext(context), feedback: state }, 'spatial')).join('\n')
  };
}

module.exports = { buildPrompt: buildPrompt, buildFeedback: buildFeedback, compactContext: compactContext, factRows: factRows, quote: quote };
