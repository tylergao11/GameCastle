var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var catalog = require('../shared/wp2-template-source-catalog.json');

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map(function(key) { return JSON.stringify(key) + ':' + stable(value[key]); }).join(',') + '}';
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function normalize(relativePath) { return relativePath.replace(/\\/g, '/'); }
function walk(root, directory, out) {
  fs.readdirSync(directory, { withFileTypes: true }).sort(function(a, b) { return a.name.localeCompare(b.name); }).forEach(function(entry) {
    var full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(root, full, out);
    if (entry.isFile()) out.push({ path: normalize(path.relative(root, full)), sha256: sha256(fs.readFileSync(full)) });
  });
}
function sourceSpec(sourceId) { return catalog.sources.filter(function(item) { return item.sourceId === sourceId; })[0] || null; }
function reject(code, message) { var error = new Error(message); error.code = code; throw error; }
function sourceRoot(spec, options) {
  if (options.rootDir) return path.resolve(options.rootDir);
  var locator = spec && spec.locator;
  if (!locator || locator.kind !== 'filesystem-relative') reject('TEMPLATE_SOURCE_UNAVAILABLE', 'Template source requires an explicit local root directory.');
  var root = process.env[locator.rootEnv];
  if (!root) reject('TEMPLATE_SOURCE_UNAVAILABLE', 'Template source root environment variable is not set: ' + locator.rootEnv);
  return path.join(root, locator.relativePath);
}
function intake(input) {
  input = input || {};
  var spec = sourceSpec(input.sourceId);
  if (!spec) reject('TEMPLATE_SOURCE_UNKNOWN', 'Unknown template source: ' + input.sourceId);
  if (spec.licenseDecision === 'discovery-only') reject('TEMPLATE_LICENSE_DISCOVERY_ONLY', 'Source is discovery-only and cannot be ingested.');
  var root = sourceRoot(spec, input);
  if (!fs.existsSync(root)) reject('TEMPLATE_SOURCE_MISSING', 'Template source directory does not exist.');
  var entryProject = input.entryProject;
  if (!entryProject) reject('TEMPLATE_ENTRY_REQUIRED', 'Template intake requires an entry project relative path.');
  var entryPath = path.resolve(root, entryProject);
  if (!entryPath.startsWith(root + path.sep) && entryPath !== root) reject('TEMPLATE_ENTRY_ESCAPE', 'Entry project escapes source root.');
  if (!fs.existsSync(entryPath)) reject('TEMPLATE_ENTRY_MISSING', 'Template entry project does not exist.');
  var files = [];
  walk(root, root, files);
  var upstreamRevision = String(input.upstreamRevision || 'local-' + sha256(stable(files)).slice(0, 16));
  var contentHash = sha256(stable({ sourceId: spec.sourceId, upstreamRevision: upstreamRevision, files: files }));
  var allowedUses = (spec.allowedUses || []).slice();
  var record = {
    schemaVersion: 1,
    sourceId: spec.sourceId,
    sourceKind: spec.sourceKind,
    upstreamRevision: upstreamRevision,
    contentHash: contentHash,
    license: input.license || spec.licenseDecision,
    entryProject: normalize(path.relative(root, entryPath)),
    allowedUses: allowedUses,
    intakeStatus: spec.licenseDecision === 'structure-only' ? 'quarantined' : 'accepted',
    provenance: { owner: 'TemplateIntake', sourceCatalogId: catalog.catalogId, rootKind: (spec.locator || {}).kind || 'explicit-local', fileCount: files.length, files: files },
    receiptHash: ''
  };
  record.receiptHash = sha256(stable(record));
  return record;
}
module.exports = { intake: intake, sourceSpec: sourceSpec, stable: stable, sha256: sha256 };
