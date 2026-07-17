// Placeholder ledger: cross-domain join keys for product dispatch.
// Assembly joins on sealed/filled placeholders; it does not invent slots.
// Asset may only fill ids that are already sealed.

var PLACEHOLDER_STATUSES = Object.freeze(['declared', 'sealed', 'filled', 'invalid']);

function fail(code, message) {
  var error = new Error(message);
  error.code = code;
  error.owner = 'ProductDispatchLedger';
  throw error;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail('PRODUCT_DISPATCH_LEDGER_INVALID', label + ' must be non-empty text.');
  return value.trim();
}

function empty() {
  return { schemaVersion: 1, documentKind: 'product-placeholder-ledger', placeholders: Object.create(null) };
}

function list(ledger) {
  ledger = ledger && typeof ledger === 'object' ? ledger : empty();
  var map = ledger.placeholders || {};
  return Object.keys(map).sort().map(function(id) { return clone(map[id]); });
}

function get(ledger, id) {
  ledger = ledger && typeof ledger === 'object' ? ledger : empty();
  var item = ledger.placeholders && ledger.placeholders[id];
  return item ? clone(item) : null;
}

function normalizeItem(item, label) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) fail('PRODUCT_DISPATCH_LEDGER_INVALID', label + ' must be a structure.');
  var id = text(item.id, label + '.id');
  var kind = text(item.kind || 'image', label + '.kind');
  var subject = text(item.subject || id, label + '.subject');
  var required = item.required !== false;
  var status = item.status || 'declared';
  if (PLACEHOLDER_STATUSES.indexOf(status) < 0) fail('PRODUCT_DISPATCH_LEDGER_INVALID', label + '.status is invalid.');
  return {
    id: id,
    kind: kind,
    subject: subject,
    required: required,
    status: status,
    reservation: item.reservation && typeof item.reservation === 'object' ? clone(item.reservation) : null,
    requirement: item.requirement && typeof item.requirement === 'object' ? clone(item.requirement) : null,
    fill: item.fill && typeof item.fill === 'object' ? clone(item.fill) : null,
    sourceHash: item.sourceHash ? String(item.sourceHash) : null
  };
}

function restore(items) {
  var ledger = empty();
  (Array.isArray(items) ? items : []).forEach(function(item, index) {
    var normalized = normalizeItem(item, 'placeholders[' + index + ']');
    ledger.placeholders[normalized.id] = normalized;
  });
  return ledger;
}

function upsert(ledger, item) {
  ledger = ledger && typeof ledger === 'object' ? clone(ledger) : empty();
  if (!ledger.placeholders || typeof ledger.placeholders !== 'object') ledger.placeholders = Object.create(null);
  var next = normalizeItem(item, 'placeholder');
  var prev = ledger.placeholders[next.id];
  if (prev && prev.status === 'filled' && next.status !== 'invalid' && next.status !== 'filled') {
    fail('PRODUCT_DISPATCH_LEDGER_IMMUTABLE', 'Filled placeholder cannot regress: ' + next.id);
  }
  ledger.placeholders[next.id] = next;
  return ledger;
}

function declareMany(ledger, items) {
  items = Array.isArray(items) ? items : [];
  var next = ledger && typeof ledger === 'object' ? clone(ledger) : empty();
  items.forEach(function(item, index) {
    var normalized = normalizeItem(Object.assign({}, item, { status: item.status || 'declared' }), 'placeholders[' + index + ']');
    if (next.placeholders && next.placeholders[normalized.id] && next.placeholders[normalized.id].status === 'filled') return;
    if (next.placeholders && next.placeholders[normalized.id] && next.placeholders[normalized.id].status === 'sealed' && normalized.status === 'declared') {
      normalized.status = 'sealed';
    }
    next = upsert(next, normalized);
  });
  return next;
}

function seal(ledger, ids) {
  var next = ledger && typeof ledger === 'object' ? clone(ledger) : empty();
  if (!next.placeholders) next.placeholders = Object.create(null);
  var targets = Array.isArray(ids) && ids.length
    ? ids.map(function(id) { return text(id, 'seal id'); })
    : Object.keys(next.placeholders);
  if (!targets.length) fail('PRODUCT_DISPATCH_LEDGER_EMPTY', 'Cannot seal an empty placeholder ledger.');
  targets.forEach(function(id) {
    var item = next.placeholders[id];
    if (!item) fail('PRODUCT_DISPATCH_LEDGER_MISSING', 'Cannot seal unknown placeholder: ' + id);
    if (item.status === 'invalid') fail('PRODUCT_DISPATCH_LEDGER_INVALID', 'Cannot seal invalid placeholder: ' + id);
    if (item.status === 'filled') return;
    item.status = 'sealed';
    next.placeholders[id] = item;
  });
  return next;
}

function fill(ledger, id, fillMeta) {
  var next = ledger && typeof ledger === 'object' ? clone(ledger) : empty();
  id = text(id, 'fill id');
  var item = next.placeholders && next.placeholders[id];
  if (!item) fail('PRODUCT_DISPATCH_LEDGER_MISSING', 'Cannot fill unknown placeholder: ' + id);
  if (item.status !== 'sealed' && item.status !== 'filled') {
    fail('PRODUCT_DISPATCH_LEDGER_NOT_SEALED', 'Asset may only fill sealed placeholders: ' + id);
  }
  item.status = 'filled';
  item.fill = fillMeta && typeof fillMeta === 'object' ? clone(fillMeta) : { ok: true };
  next.placeholders[id] = item;
  return next;
}

function invalidate(ledger, ids, reason) {
  var next = ledger && typeof ledger === 'object' ? clone(ledger) : empty();
  (Array.isArray(ids) ? ids : []).forEach(function(id) {
    id = text(id, 'invalidate id');
    if (!next.placeholders || !next.placeholders[id]) return;
    next.placeholders[id].status = 'invalid';
    next.placeholders[id].fill = { reason: reason || 'invalidated' };
  });
  return next;
}

function sealedCount(ledger) {
  return list(ledger).filter(function(item) { return item.status === 'sealed' || item.status === 'filled'; }).length;
}

function hasSealed(ledger) {
  return sealedCount(ledger) > 0;
}

function unfilledSealed(ledger) {
  return list(ledger).filter(function(item) { return item.status === 'sealed'; });
}

function assemblyReady(ledger) {
  var items = list(ledger);
  if (!items.length) return { ready: false, reason: 'no-placeholders', missing: [] };
  var missing = items.filter(function(item) { return item.required && item.status !== 'filled'; }).map(function(item) { return item.id; });
  if (missing.length) return { ready: false, reason: 'unfilled-required', missing: missing };
  if (items.some(function(item) { return item.status === 'invalid'; })) return { ready: false, reason: 'invalid-placeholders', missing: [] };
  return { ready: true, reason: 'ok', missing: [] };
}

function summary(ledger) {
  var items = list(ledger);
  var byStatus = { declared: 0, sealed: 0, filled: 0, invalid: 0 };
  items.forEach(function(item) { byStatus[item.status] = (byStatus[item.status] || 0) + 1; });
  var gate = assemblyReady(ledger);
  return {
    count: items.length,
    byStatus: byStatus,
    sealed: hasSealed(ledger),
    assemblyReady: gate.ready,
    assemblyReason: gate.reason,
    missing: gate.missing,
    placeholders: items.map(function(item) {
      return { id: item.id, kind: item.kind, subject: item.subject, status: item.status, required: item.required };
    })
  };
}

module.exports = {
  PLACEHOLDER_STATUSES: PLACEHOLDER_STATUSES,
  empty: empty,
  list: list,
  get: get,
  restore: restore,
  upsert: upsert,
  declareMany: declareMany,
  seal: seal,
  fill: fill,
  invalidate: invalidate,
  sealedCount: sealedCount,
  hasSealed: hasSealed,
  unfilledSealed: unfilledSealed,
  assemblyReady: assemblyReady,
  summary: summary
};
