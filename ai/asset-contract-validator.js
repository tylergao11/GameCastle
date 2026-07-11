function includesAll(actual, expected) { return (expected || []).every(function(value) { return (actual || []).indexOf(value) >= 0; }); }

function validateAssetCandidate(slot, candidate) {
  var errors = [];
  var constraints = slot.constraints || {};
  if (!candidate || !candidate.path) errors.push('missing_path');
  if (!candidate || candidate.format !== 'png') errors.push('format_must_be_png');
  if (!candidate || !Number.isFinite(candidate.width) || candidate.width < 1 || !Number.isFinite(candidate.height) || candidate.height < 1) errors.push('invalid_dimensions');
  if (constraints.width && candidate && candidate.width !== constraints.width) errors.push('width_mismatch');
  if (constraints.height && candidate && candidate.height !== constraints.height) errors.push('height_mismatch');
  if (constraints.transparent && candidate && candidate.transparent !== true) errors.push('transparent_png_required');
  if (candidate && !includesAll(candidate.semanticTags, slot.semanticTags)) errors.push('semantic_tags_mismatch');
  if (candidate && !includesAll(candidate.styleTags, slot.styleTags)) errors.push('style_tags_mismatch');
  if (candidate && slot.styleId && candidate.styleId && candidate.styleId !== slot.styleId) errors.push('style_id_mismatch');
  if (candidate && (candidate.source === 'imageGeneration' || candidate.source === 'imageEdit') && (candidate.status !== 'generated' && candidate.status !== 'variant')) errors.push('model_status_invalid');
  if (!candidate || !candidate.publishability || candidate.publishability.playable !== true) errors.push('not_playable');
  if (candidate && candidate.publishability && candidate.publishability.blocksFinalExport === true) errors.push('blocks_final_export');
  return { pass: errors.length === 0, errors: errors };
}

module.exports = { validateAssetCandidate: validateAssetCandidate };
