'use strict';

// Spatial owns only the preview port contract. GDJS renderPreview is injected at product composition.

function assertPreviewPort(port) {
  if (!port || typeof port.renderPreview !== 'function') {
    var error = new Error('Spatial Planner requires an injected previewPort.renderPreview from product composition (usually gdjs-spatial-preview).');
    error.code = 'SPATIAL_PREVIEW_PORT_REQUIRED';
    error.owner = 'SpatialPreviewPort';
    throw error;
  }
  return port;
}

module.exports = { assertPreviewPort: assertPreviewPort };
