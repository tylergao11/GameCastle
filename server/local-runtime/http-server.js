var http = require('http');

function sendJson(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(value));
}

function errorStatus(code) {
  if (code === 'RUN_BUSY' || code === 'CONTINUE_STATE_MISSING' || code === 'RUN_NOT_CANCELLABLE') return 409;
  if (code === 'PROJECT_ID_REQUIRED' || code === 'VERSION_ID_REQUIRED' || code === 'INTENT_REQUIRED' || code === 'INTENT_TOO_LONG' || code === 'INVALID_JSON' || code === 'INVALID_MODE' || code === 'ASSET_BINDING_INVALID' || code === 'ASSET_PNG_REQUIRED' || code === 'ASSET_SIZE_INVALID' || code === 'ASSET_SIGNATURE_INVALID' || code === 'ASSET_PNG_CONTRACT_INVALID' || code === 'ASSET_WEAVE_REJECTED' || code === 'ASSET_CLOUD_RESOLVE_INVALID' || code === 'ASSET_CLOUD_UNAVAILABLE' || code === 'ASSET_CLOUD_MATERIALIZE_FAILED' || code === 'ASSET_SIMULATED_GENERATE_INVALID' || code === 'ASSET_SIMULATED_GENERATE_REJECTED' || code === 'ASSET_SIMULATED_MATERIALIZE_FAILED') return 400;
  return 500;
}

function readJson(req, maxBytes) {
  maxBytes = maxBytes || 16384;
  return new Promise(function(resolve, reject) {
    var chunks = [];
    var size = 0;
    req.on('data', function(chunk) {
      size += chunk.length;
      if (size > maxBytes) {
        var error = new Error('Request body is too large.');
        error.code = 'INTENT_TOO_LONG';
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function() {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (_error) {
        var invalid = new Error('Request body must be valid JSON.');
        invalid.code = 'INVALID_JSON';
        reject(invalid);
      }
    });
    req.on('error', reject);
  });
}

function decodeSegment(value, res) {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    sendJson(res, 400, { error: { code: 'INVALID_PATH_ENCODING', message: 'Request path contains invalid encoding.' } });
    return null;
  }
}

function createLocalGameRuntimeServer(options) {
  var coordinator = options.coordinator;
  var artifactStore = options.artifactStore;
  var projectStore = options.projectStore;
  var localAssetInputStore = options.localAssetInputStore;
  var cloudAssetEngine = options.cloudAssetEngine;
  var allowedUiOrigin = options.allowedUiOrigin || 'http://127.0.0.1:5173';

  var server = http.createServer(function(req, res) {
    var requestUrl;
    try {
      requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
    } catch (_error) {
      sendJson(res, 400, { error: { code: 'INVALID_URL', message: 'Invalid request URL.' } });
      return;
    }
    var pathname = requestUrl.pathname;
    var requestHost = String(req.headers.host || '').split(':')[0].toLowerCase();
    var isPlayOrigin = requestHost === 'localhost';
    var isApiOrigin = requestHost === '127.0.0.1';

    if (pathname.indexOf('/play/') === 0 && !isPlayOrigin) {
      sendJson(res, 403, { error: { code: 'PLAY_HOST_REQUIRED', message: 'Playable releases are only available on the isolated play origin.' } });
      return;
    }
    if (pathname.indexOf('/play/') !== 0 && !isApiOrigin) {
      sendJson(res, 403, { error: { code: 'PLAY_ORIGIN_ISOLATED', message: 'The playable game origin cannot access the Runtime API.' } });
      return;
    }
    if (req.method === 'POST' && pathname.indexOf('/api/runtime/') === 0) {
      if (String(req.headers.origin || '') !== allowedUiOrigin) {
        sendJson(res, 403, { error: { code: 'RUNTIME_ORIGIN_REJECTED', message: 'Runtime mutations are only accepted from the GameCastle UI origin.' } });
        return;
      }
      if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
        sendJson(res, 415, { error: { code: 'JSON_CONTENT_TYPE_REQUIRED', message: 'Runtime mutations require application/json.' } });
        return;
      }
    }

    if (req.method === 'GET' && pathname === '/api/runtime/health') {
      var healthSnapshot = coordinator.snapshot();
      var healthy = healthSnapshot.health === 'ready';
      sendJson(res, healthy ? 200 : 503, { ok: healthy, service: 'local-game-runtime', projectId: healthSnapshot.projectId, health: healthSnapshot.health });
      return;
    }
    if (req.method === 'GET' && pathname === '/api/runtime') {
      sendJson(res, 200, coordinator.snapshot());
      return;
    }
    if (req.method === 'GET' && pathname === '/api/projects') {
      sendJson(res, 200, { projects: projectStore.listProjects() });
      return;
    }
    var projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (req.method === 'GET' && projectMatch) {
      var describedProjectId = decodeSegment(projectMatch[1], res);
      if (describedProjectId === null) return;
      try { sendJson(res, 200, coordinator.projectSnapshot(describedProjectId)); } catch (error) { sendJson(res, 404, { error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' } }); }
      return;
    }
    var rollbackMatch = pathname.match(/^\/api\/projects\/([^/]+)\/rollback$/);
    if (req.method === 'POST' && rollbackMatch) {
      var rollbackProjectId = decodeSegment(rollbackMatch[1], res);
      if (rollbackProjectId === null) return;
      readJson(req).then(function(body) {
        if (!body.versionId) { var error = new Error('versionId is required.'); error.code = 'VERSION_ID_REQUIRED'; throw error; }
        var receipt = projectStore.rollback(rollbackProjectId, body.versionId);
        sendJson(res, 200, { receipt: receipt, workspace: coordinator.projectSnapshot(rollbackProjectId) });
      }).catch(function(error) { sendJson(res, errorStatus(error.code), { error: { code: error.code || 'RUNTIME_FAILED', message: error.message } }); });
      return;
    }
    if (req.method === 'GET' && pathname === '/api/runtime/assets/cloud/search') {
      if (!cloudAssetEngine) {
        sendJson(res, 503, { error: { code: 'ASSET_CLOUD_UNAVAILABLE', message: 'The shared asset library is not configured for this local runtime.' } });
        return;
      }
      var tags = String(requestUrl.searchParams.get('tags') || '').split(',').map(function(value) { return value.trim(); }).filter(function(value) { return /^[A-Za-z0-9._-]{1,128}$/.test(value); });
      var matches = cloudAssetEngine.search(tags).map(function(asset) { return { assetId: asset.assetId, sha256: asset.sha256, format: asset.format, width: asset.width || null, height: asset.height || null, styleId: asset.styleId || null, semanticTags: asset.semanticTags || [], repositoryStatus: asset.status }; });
      sendJson(res, 200, { matches: matches });
      return;
    }
    if (req.method === 'POST' && pathname === '/api/runtime/runs') {
      readJson(req).then(function(body) {
        var snapshot = coordinator.start({ projectId: body.projectId, projectName: body.projectName, intent: body.intent, mode: body.mode });
        sendJson(res, 202, snapshot);
      }).catch(function(error) {
        sendJson(res, errorStatus(error.code), { error: { code: error.code || 'RUNTIME_FAILED', message: error.message } });
      });
      return;
    }
    if (req.method === 'POST' && pathname === '/api/runtime/fixtures/mobile-platformer') {
      readJson(req).then(function() {
        var snapshot = coordinator.start({ projectId: body.projectId, projectName: body.projectName, intent: 'Offline platformer fixture', mode: 'create', intentFixtureFile: 'ai/fixtures/intent-mobile-platformer.dsl' });
        sendJson(res, 202, snapshot);
      }).catch(function(error) {
        sendJson(res, errorStatus(error.code), { error: { code: error.code || 'RUNTIME_FAILED', message: error.message } });
      });
      return;
    }
    if (req.method === 'POST' && pathname === '/api/runtime/assets/inputs') {
      readJson(req, 6 * 1024 * 1024).then(function(body) {
        return localAssetInputStore.ingest(body).then(function(inputRecord) { sendJson(res, 201, { input: inputRecord }); });
      }).catch(function(error) {
        sendJson(res, errorStatus(error.code), { error: { code: error.code || 'RUNTIME_FAILED', message: error.message } });
      });
      return;
    }
    var runMatch = pathname.match(/^\/api\/runtime\/runs\/([^/]+)$/);
    if (req.method === 'GET' && runMatch) {
      var runSnapshot = coordinator.snapshot();
      var decodedRunId = decodeSegment(runMatch[1], res);
      if (decodedRunId === null) return;
      if (runSnapshot.runId !== decodedRunId) {
        sendJson(res, 404, { error: { code: 'RUN_NOT_FOUND', message: 'Run not found.' } });
        return;
      }
      sendJson(res, 200, runSnapshot);
      return;
    }

    var cancelMatch = pathname.match(/^\/api\/runtime\/runs\/([^/]+)\/cancel$/);
    if (req.method === 'POST' && cancelMatch) {
      var cancelRunId = decodeSegment(cancelMatch[1], res);
      if (cancelRunId === null) return;
      try {
        sendJson(res, 202, coordinator.cancel(cancelRunId));
      } catch (error) {
        sendJson(res, errorStatus(error.code), { error: { code: error.code || 'RUNTIME_FAILED', message: error.message } });
      }
      return;
    }

    var eventMatch = pathname.match(/^\/api\/runtime\/runs\/([^/]+)\/events$/);
    if (req.method === 'GET' && eventMatch) {
      var requestedRunId = decodeSegment(eventMatch[1], res);
      if (requestedRunId === null) return;
      var current = coordinator.snapshot();
      if (current.runId !== requestedRunId) {
        sendJson(res, 404, { error: { code: 'RUN_NOT_FOUND', message: 'Run not found.' } });
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      function writeSnapshot(snapshot) {
        if (snapshot.runId !== requestedRunId || res.writableEnded) return;
        res.write('id: ' + String(snapshot.sequence || 0) + '\nevent: snapshot\ndata: ' + JSON.stringify(snapshot) + '\n\n');
      }
      writeSnapshot(current);
      var unsubscribe = coordinator.onSnapshot(writeSnapshot);
      var heartbeat = setInterval(function() {
        if (!res.writableEnded) res.write(': keep-alive\n\n');
      }, 15000);
      req.on('close', function() {
        clearInterval(heartbeat);
        unsubscribe();
      });
      return;
    }

    if ((req.method === 'GET' || req.method === 'HEAD') && pathname.indexOf('/play/') === 0) {
      var state = coordinator.snapshot();
      if (!state.artifact) {
        sendJson(res, 404, { error: { code: 'ARTIFACT_NOT_READY', message: 'No playable artifact is available.' } });
        return;
      }
      var artifactPath = pathname.slice('/play/'.length).split('/');
      var version = decodeSegment(artifactPath.shift() || '', res);
      if (version === null) return;
      artifactStore.send(version, artifactPath.join('/'), res, req.method === 'HEAD');
      return;
    }

    sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });

  server.on('close', function() { coordinator.close(); });
  return server;
}

module.exports = {
  createLocalGameRuntimeServer: createLocalGameRuntimeServer,
};
