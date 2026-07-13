/* WP3 local ProjectStore: multi-project index, immutable versions, and recovery. */
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var SCHEMA_VERSION = 1;
var REQUIRED_VERSION_ARTIFACTS = ['project.json', 'project-world.json', 'asset-world.json', 'execution-ledger.json'];

function now() { return new Date().toISOString(); }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function safeId(value) { var id = String(value || '').replace(/[^A-Za-z0-9_.-]/g, '_'); if (!id) throw new Error('ProjectStore requires a stable id'); return id; }
function readJson(filePath, fallback) { try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (_error) { return fallback; } }
function writeJson(filePath, value) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8'); }
function copyDirectory(source, target) { fs.mkdirSync(target, { recursive: true }); fs.readdirSync(source, { withFileTypes: true }).forEach(function(entry) { var from = path.join(source, entry.name), to = path.join(target, entry.name); if (entry.isDirectory()) copyDirectory(from, to); else if (entry.isFile()) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); } }); }
function contentHash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function createProjectStore(options) {
  options = options || {};
  var rootDir = path.resolve(options.rootDir || path.join(__dirname, '..', '.gamecastle'));
  var projectsDir = path.join(rootDir, 'projects');
  var indexPath = path.join(rootDir, 'project-index.json');
  function projectDir(projectId) { return path.join(projectsDir, safeId(projectId)); }
  function metadataPath(projectId) { return path.join(projectDir(projectId), 'project.json'); }
  function versionsDir(projectId) { return path.join(projectDir(projectId), 'versions'); }
  function versionDir(projectId, versionId) { return path.join(versionsDir(projectId), safeId(versionId)); }
  function versionManifestPath(projectId, versionId) { return path.join(versionDir(projectId, versionId), 'version.json'); }
  function readIndex() { var index = readJson(indexPath, null); return index && index.schemaVersion === SCHEMA_VERSION && Array.isArray(index.projects) ? index : { schemaVersion: SCHEMA_VERSION, projects: [] }; }
  function writeIndex(index) { writeJson(indexPath, index); }
  function findProject(projectId) { return readIndex().projects.find(function(project) { return project.projectId === safeId(projectId); }) || null; }
  function createProject(input) {
    input = input || {}; var projectId = safeId(input.projectId); var index = readIndex(); var existing = index.projects.find(function(project) { return project.projectId === projectId; });
    if (existing) return clone(existing);
    var project = { projectId: projectId, name: String(input.name || projectId), createdAt: now(), updatedAt: now(), activeVersionId: null, latestRunId: null, versionCount: 0 };
    index.projects.push(project); index.projects.sort(function(left, right) { return left.projectId.localeCompare(right.projectId); }); writeIndex(index); writeJson(metadataPath(projectId), project); return clone(project);
  }
  function listProjects() { return clone(readIndex().projects).sort(function(left, right) { return String(right.updatedAt).localeCompare(String(left.updatedAt)); }); }
  function requireProject(projectId) { var project = findProject(projectId); if (!project) throw new Error('Project does not exist: ' + projectId); return project; }
  function listVersions(projectId) { requireProject(projectId); if (!fs.existsSync(versionsDir(projectId))) return []; return fs.readdirSync(versionsDir(projectId), { withFileTypes: true }).filter(function(entry) { return entry.isDirectory() && entry.name.indexOf('.staging-') !== 0; }).map(function(entry) { return readJson(versionManifestPath(projectId, entry.name), null); }).filter(Boolean).sort(function(left, right) { return String(right.createdAt).localeCompare(String(left.createdAt)); }); }
  function loadVersion(projectId, versionId) { var manifest = readJson(versionManifestPath(projectId, versionId), null); if (!manifest || manifest.schemaVersion !== SCHEMA_VERSION || manifest.projectId !== safeId(projectId)) throw new Error('ProjectVersion does not exist: ' + versionId); REQUIRED_VERSION_ARTIFACTS.forEach(function(name) { if (!fs.existsSync(path.join(versionDir(projectId, versionId), name))) throw new Error('ProjectVersion is incomplete: ' + versionId + ' missing ' + name); }); var runtimeDir = path.join(versionDir(projectId, versionId), 'runtime'); return { manifest: clone(manifest), project: readJson(path.join(versionDir(projectId, versionId), 'project.json')), projectWorld: readJson(path.join(versionDir(projectId, versionId), 'project-world.json')), assetWorld: readJson(path.join(versionDir(projectId, versionId), 'asset-world.json')), executionLedger: readJson(path.join(versionDir(projectId, versionId), 'execution-ledger.json')), semanticSession: readJson(path.join(runtimeDir, 'semantic-session.json'), null), runtimeDir: runtimeDir }; }
  function saveVersion(input) {
    input = input || {}; var projectId = safeId(input.projectId); var project = requireProject(projectId); var runDir = path.resolve(input.runDir || input.sourceDir || ''); var runtimeDir = path.resolve(input.runtimeDir || path.join(runDir, 'runtime'));
    if (!runDir || !fs.existsSync(runDir) || !fs.existsSync(runtimeDir)) throw new Error('ProjectVersion requires existing source and runtime directories');
    REQUIRED_VERSION_ARTIFACTS.forEach(function(name) { if (!fs.existsSync(path.join(name === 'project.json' ? runtimeDir : runDir, name))) throw new Error('Cannot commit ProjectVersion without ' + name); });
    var projectWorld = readJson(path.join(runDir, 'project-world.json')); var assetWorld = readJson(path.join(runDir, 'asset-world.json')); if (!projectWorld.semanticHash || !assetWorld.semanticHash) throw new Error('ProjectVersion requires ProjectWorld and AssetWorld semantic hashes');
    var parentVersionId = input.parentVersionId === undefined ? project.activeVersionId : input.parentVersionId;
    var versionId = safeId(input.versionId || ('v.' + Date.now().toString(36) + '.' + contentHash([projectId, input.runId, projectWorld.semanticHash, assetWorld.semanticHash]).slice(0, 12)));
    var staging = path.join(versionsDir(projectId), '.staging-' + versionId); var target = versionDir(projectId, versionId); if (fs.existsSync(target)) throw new Error('ProjectVersion already exists: ' + versionId); fs.rmSync(staging, { recursive: true, force: true }); fs.mkdirSync(staging, { recursive: true });
    try {
      ['project-world.json', 'asset-world.json', 'execution-ledger.json'].forEach(function(name) { fs.copyFileSync(path.join(runDir, name), path.join(staging, name)); });
      fs.copyFileSync(path.join(runtimeDir, 'project.json'), path.join(staging, 'project.json'));
      copyDirectory(runtimeDir, path.join(staging, 'runtime'));
      var manifest = { schemaVersion: SCHEMA_VERSION, versionId: versionId, projectId: projectId, parentVersionId: parentVersionId || null, runId: input.runId || null, semanticHash: projectWorld.semanticHash, assetSemanticHash: assetWorld.semanticHash, releaseCandidateId: input.releaseCandidateId || null, createdAt: now(), contentHash: contentHash({ projectWorld: projectWorld.semanticHash, assetWorld: assetWorld.semanticHash, runId: input.runId || null }), artifacts: REQUIRED_VERSION_ARTIFACTS.concat(['runtime']) };
      writeJson(path.join(staging, 'version.json'), manifest); fs.renameSync(staging, target);
      var index = readIndex(); var record = index.projects.find(function(item) { return item.projectId === projectId; }); record.activeVersionId = versionId; record.latestRunId = input.runId || null; record.versionCount = listVersions(projectId).length; record.updatedAt = now(); writeIndex(index); writeJson(metadataPath(projectId), record);
      return clone(manifest);
    } catch (error) { fs.rmSync(staging, { recursive: true, force: true }); throw error; }
  }
  function getContinueContext(projectId) { var project = requireProject(projectId); if (!project.activeVersionId) throw new Error('Project has no active version: ' + projectId); var version = loadVersion(projectId, project.activeVersionId); return { project: version.project, projectWorld: version.projectWorld, assetWorld: version.assetWorld, semanticSession: version.semanticSession, projectVersion: version.manifest }; }
  function describeProject(projectId) { var project = requireProject(projectId); return { project: clone(project), activeVersion: project.activeVersionId ? clone(loadVersion(projectId, project.activeVersionId).manifest) : null }; }
  function rollback(projectId, versionId) { var target = loadVersion(projectId, versionId); var index = readIndex(); var record = index.projects.find(function(item) { return item.projectId === safeId(projectId); }); var previousVersionId = record.activeVersionId; record.activeVersionId = target.manifest.versionId; record.updatedAt = now(); writeIndex(index); writeJson(metadataPath(projectId), record); return { schemaVersion: SCHEMA_VERSION, receiptId: 'rollback.' + safeId(projectId) + '.' + Date.now(), projectId: safeId(projectId), fromVersionId: previousVersionId || null, toVersionId: target.manifest.versionId, semanticHash: target.manifest.semanticHash, createdAt: now() }; }
  function recover(projectId) { var project = requireProject(projectId); if (!project.activeVersionId) return { recovered: false, reason: 'no-active-version' }; var version = loadVersion(projectId, project.activeVersionId); return { recovered: true, projectId: project.projectId, versionId: version.manifest.versionId, context: { project: version.project, projectWorld: version.projectWorld, assetWorld: version.assetWorld } }; }
  function materializeActiveVersion(projectId, targetDir) { var context = getContinueContext(projectId); var source = context.projectVersion && path.join(versionDir(projectId, context.projectVersion.versionId), 'runtime'); if (!source || !fs.existsSync(source)) throw new Error('Active ProjectVersion has no runtime snapshot'); fs.rmSync(targetDir, { recursive: true, force: true }); copyDirectory(source, targetDir); return { projectId: safeId(projectId), versionId: context.projectVersion.versionId, semanticHash: context.projectVersion.semanticHash }; }
  return { rootDir: rootDir, createProject: createProject, listProjects: listProjects, saveVersion: saveVersion, loadVersion: loadVersion, listVersions: listVersions, getContinueContext: getContinueContext, describeProject: describeProject, rollback: rollback, recover: recover, materializeActiveVersion: materializeActiveVersion };
}
module.exports = { SCHEMA_VERSION: SCHEMA_VERSION, REQUIRED_VERSION_ARTIFACTS: REQUIRED_VERSION_ARTIFACTS.slice(), createProjectStore: createProjectStore };
