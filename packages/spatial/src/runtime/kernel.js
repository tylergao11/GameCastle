var crypto = require('crypto');

// Shared deterministic primitives for the standalone Spatial Runtime.

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, Object.create(null)); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SpatialRuntime'; throw error; }
function object(value, label, code) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code || 'SPATIAL_LAYOUT_INVALID', label + ' must be an object'); return value; }
function text(value, label, code) { if (typeof value !== 'string' || !value.trim()) fail(code || 'SPATIAL_LAYOUT_INVALID', label + ' must be non-empty text'); return value.trim(); }
function finite(value, label, code) { if (typeof value !== 'number' || !isFinite(value)) fail(code || 'SPATIAL_LAYOUT_INVALID', label + ' must be finite'); return value; }
function positive(value, label, code) { value = finite(value, label, code); if (value <= 0) fail(code || 'SPATIAL_LAYOUT_INVALID', label + ' must be positive'); return value; }
function allowed(value, fields, label, code) { Object.keys(value).forEach(function(field) { if (fields.indexOf(field) < 0) fail(code || 'SPATIAL_LAYOUT_INVALID', label + ' contains unknown field: ' + field); }); }

module.exports = { clone: clone, stable: stable, hash: hash, fail: fail, object: object, text: text, finite: finite, positive: positive, allowed: allowed };
