var EventEmitter = require('events');
var fs = require('fs');
var path = require('path');
var creatorExperience = require('./creator-experience');

var ACTIVE_STATUSES = ['running', 'cancelling'];

function now() {
  return new Date().toISOString();
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeRunId() {
  return 'run-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function artifactValue(version, metadata, playBaseUrl) {
  if (!version) return null;
  return {
    version: version,
    playUrl: String(playBaseUrl || '') + '/play/' + encodeURIComponent(version) + '/game.html',
    worldVersion: metadata && metadata.worldVersion !== undefined ? metadata.worldVersion : null,
    semanticHash: metadata && metadata.semanticHash ? metadata.semanticHash : null,
  };
}

function idleState(artifact, projectId) {
  return {
    schemaVersion: 1,
    sequence: 0,
    projectId: projectId || null,
    health: 'ready',
    runId: null,
    mode: null,
    intent: null,
    status: 'idle',
    outcome: null,
    stage: { id: 'idle', label: 'Ready', message: 'Ready to build a game.' },
    startedAt: null,
    finishedAt: null,
    error: null,
    artifact: artifact || null,
  };
}

function normalizeError(error, runId) {
  var code = error.code || 'RUNTIME_FAILED';
  return {
    code: code,
    message: creatorExperience.recovery(code).message,
    detail: null,
    stage: error.stage || null,
    retryable: error.code !== 'RUNTIME_UNHEALTHY',
    runId: runId || null,
    recovery: creatorExperience.recovery(code),
  };
}

function createRunCoordinator(options) {
  var artifactStore = options.artifactStore;
  var stateStore = options.stateStore;
  var transaction = options.transaction;
  var runner = options.runner;
  var playBaseUrl = options.playBaseUrl || '';
  var diagnosticsPath = options.diagnosticsPath || null;
  var projectStore = options.projectStore;
  var outputDir = options.outputDir;
  var emitter = new EventEmitter();
  emitter.setMaxListeners(100);
  var activeExecution = null;
  var state;

  try {
    state = stateStore.load();
  } catch (error) {
    state = idleState(null, null);
    state.health = 'unhealthy';
    state.status = 'failed';
    state.error = normalizeError(Object.assign(error, { code: 'STATE_CORRUPT' }), null);
  }

  if (!state) {
    state = idleState(null, null);
  } else if (state.artifact && !artifactStore.hasRelease(state.artifact.version)) {
    state.artifact = null;
    state.health = 'unhealthy';
    state.error = normalizeError(Object.assign(new Error('The committed playable release is missing.'), { code: 'RELEASE_MISSING' }), state.runId);
  } else if (state.artifact) {
    state.artifact = artifactValue(state.artifact.version, state.artifact, playBaseUrl);
  }

  function persistAndEmit() {
    state.sequence = Number(state.sequence || 0) + 1;
    stateStore.save(state);
    emitter.emit('snapshot', copy(state));
  }

  function recoverInterruptedRun() {
    var hasPendingTransaction = transaction.hasPending();
    var hasActiveState = ACTIVE_STATUSES.indexOf(state.status) >= 0;
    if (!hasPendingTransaction && !hasActiveState) return;
    if (hasActiveState && !hasPendingTransaction) {
      state.health = 'unhealthy';
      state.status = 'failed';
      state.finishedAt = now();
      state.error = normalizeError(Object.assign(new Error('An interrupted run has no recovery journal.'), { code: 'RECOVERY_JOURNAL_MISSING' }), state.runId);
      persistAndEmit();
      return;
    }
    try {
      transaction.rollback();
      state.health = 'ready';
      state.status = 'failed';
      state.outcome = null;
      state.finishedAt = now();
      state.stage = { id: 'failed', label: 'Build interrupted', message: 'The previous build was interrupted and its mutable workspace was restored.' };
      state.error = normalizeError(Object.assign(new Error('The local runtime restarted during a build.'), { code: 'SERVER_RESTARTED' }), state.runId);
      persistAndEmit();
    } catch (error) {
      state.health = 'unhealthy';
      state.status = 'failed';
      state.finishedAt = now();
      state.error = normalizeError(Object.assign(error, { code: 'RECOVERY_FAILED' }), state.runId);
      persistAndEmit();
    }
  }

  recoverInterruptedRun();

  function snapshot() {
    return copy(state);
  }

  function projectSnapshot(projectId) {
    var described = projectStore.describeProject(projectId);
    var version = described.activeVersion;
    return {
      project: described.project,
      activeVersion: version ? creatorExperience.projectVersionCard(version) : null,
      artifact: version && version.releaseCandidateId && artifactStore.hasRelease(version.releaseCandidateId)
        ? artifactValue(version.releaseCandidateId, version, playBaseUrl) : null,
      versions: projectStore.listVersions(projectId).map(creatorExperience.projectVersionCard),
    };
  }

  function recordDiagnostic(error, id) {
    if (!diagnosticsPath) return;
    try {
      fs.mkdirSync(path.dirname(diagnosticsPath), { recursive: true });
      fs.appendFileSync(diagnosticsPath, JSON.stringify({
        at: now(),
        runId: id || null,
        code: error.code || 'RUNTIME_FAILED',
        message: error.message || String(error),
        detail: error.detail || null,
      }) + '\n', 'utf8');
    } catch (_error) {
      // Diagnostics must never replace the authoritative runtime outcome.
    }
  }

  function finishFailure(error, id, previousArtifact, cancelled) {
    if (state.runId !== id || ACTIVE_STATUSES.indexOf(state.status) < 0) return;
    recordDiagnostic(error, id);
    var rollbackError = null;
    try { transaction.rollback(); } catch (caught) { rollbackError = caught; }
    activeExecution = null;
    state.finishedAt = now();
    state.artifact = previousArtifact;
    state.outcome = null;
    if (rollbackError) {
      state.health = 'unhealthy';
      state.status = 'failed';
      state.stage = { id: 'failed', label: 'Recovery required', message: 'The failed build could not restore its workspace.' };
      state.error = normalizeError(Object.assign(rollbackError, { code: 'ROLLBACK_FAILED' }), id);
    } else {
      state.health = 'ready';
      state.status = cancelled ? 'cancelled' : 'failed';
      state.stage = { id: state.status, label: cancelled ? 'Build cancelled' : 'Build failed', message: error.message || 'The game could not be built.' };
      state.error = normalizeError(error, id);
    }
    persistAndEmit();
  }

  function start(request) {
    var intent = String(request.intent || '').trim();
    if (request.mode !== 'create' && request.mode !== 'continue') {
      var invalidMode = new Error('Run mode must be create or continue.');
      invalidMode.code = 'INVALID_MODE';
      throw invalidMode;
    }
    var mode = request.mode;
    var projectId = String(request.projectId || '').trim().replace(/[^A-Za-z0-9_.-]/g, '_');
    if (!projectId) {
      var missingProject = new Error('Project id is required.');
      missingProject.code = 'PROJECT_ID_REQUIRED';
      throw missingProject;
    }
    projectStore.createProject({ projectId: projectId, name: request.projectName || projectId });
    if (state.health !== 'ready') {
      var unhealthy = new Error('The local runtime requires recovery before it can accept another build.');
      unhealthy.code = 'RUNTIME_UNHEALTHY';
      throw unhealthy;
    }
    if (!intent) {
      var missingIntent = new Error('Creative intent is required.');
      missingIntent.code = 'INTENT_REQUIRED';
      throw missingIntent;
    }
    if (intent.length > 8000) {
      var tooLong = new Error('Creative intent must be 8000 characters or fewer.');
      tooLong.code = 'INTENT_TOO_LONG';
      throw tooLong;
    }
    if (activeExecution || ACTIVE_STATUSES.indexOf(state.status) >= 0) {
      var busy = new Error('The active project already has a build in progress.');
      busy.code = 'RUN_BUSY';
      throw busy;
    }
    if (mode === 'continue' && !projectStore.listProjects().some(function(project) { return project.projectId === projectId && project.activeVersionId; })) {
      var noProject = new Error('An active ProjectVersion is required before the game can be changed.');
      noProject.code = 'CONTINUE_STATE_MISSING';
      throw noProject;
    }

    var id = makeRunId();
    var previousArtifact = null;
    try {
      var previousContext = projectStore.getContinueContext(projectId);
      if (previousContext.projectVersion.releaseCandidateId && artifactStore.hasRelease(previousContext.projectVersion.releaseCandidateId)) {
        previousArtifact = artifactValue(previousContext.projectVersion.releaseCandidateId, previousContext.projectVersion, playBaseUrl);
      }
    } catch (_error) {}
    transaction.begin(id);
    if (mode === 'continue') projectStore.materializeActiveVersion(projectId, outputDir);
    var baseline = artifactStore.captureEngineBaseline();
    state = {
      schemaVersion: 1,
      sequence: Number(state.sequence || 0),
      projectId: projectId,
      health: 'ready',
      runId: id,
      mode: mode,
      intent: intent,
      status: 'running',
      outcome: null,
      stage: { id: 'queued', label: 'Starting the castle', message: 'The local game pipeline is starting.' },
      startedAt: now(),
      finishedAt: null,
      error: null,
      artifact: previousArtifact,
    };
    persistAndEmit();

    try {
      activeExecution = runner.start({
        intent: intent,
        mode: mode,
        intentFixtureFile: request.intentFixtureFile || null,
        onLine: function(line, channel) {
          if (channel === 'stderr' && state.runId === id && state.status === 'running') {
            state.stage.message = 'The engine reported a diagnostic while ' + state.stage.label.toLowerCase() + '.';
            persistAndEmit();
          }
        },
        onStage: function(stage) {
          if (state.runId !== id || state.status !== 'running') return;
          state.stage = { id: stage.id, label: stage.label, message: stage.label + '…' };
          persistAndEmit();
        },
      });
      transaction.markProcess(activeExecution.processId);
    } catch (error) {
      finishFailure(error, id, previousArtifact, false);
      return snapshot();
    }

    activeExecution.promise.then(function(result) {
      if (state.runId !== id || state.status !== 'running') return;
      try {
        transaction.markProcess(null);
        if (result.noChange) {
          if (!previousArtifact || !artifactStore.hasRelease(previousArtifact.version)) {
            throw new Error('The pipeline reported no change without a committed playable release.');
          }
          transaction.commit();
          state.outcome = 'no_change';
          state.artifact = previousArtifact;
        } else {
          var committed = artifactStore.commitRelease(id, baseline);
          var projectVersion = projectStore.saveVersion({ projectId: projectId, runId: id, sourceDir: outputDir, runtimeDir: outputDir, releaseCandidateId: committed.version });
          transaction.commit();
          state.outcome = 'committed';
          state.artifact = Object.assign(artifactValue(committed.version, committed, playBaseUrl), { projectVersionId: projectVersion.versionId });
        }
        activeExecution = null;
        state.status = 'succeeded';
        state.finishedAt = now();
        state.stage = { id: 'complete', label: 'Game ready', message: state.outcome === 'no_change' ? 'The current game already matches this request.' : 'A complete immutable playable release was committed.' };
        persistAndEmit();
      } catch (error) {
        finishFailure(error, id, previousArtifact, false);
      }
    }).catch(function(error) {
      try { transaction.markProcess(null); } catch (_error) {}
      finishFailure(error, id, previousArtifact, error.code === 'RUN_CANCELLED');
    });

    return snapshot();
  }

  function cancel(id) {
    if (!activeExecution || state.runId !== id || state.status !== 'running') {
      var conflict = new Error('Only the active running build can be cancelled.');
      conflict.code = 'RUN_NOT_CANCELLABLE';
      throw conflict;
    }
    var previousArtifact = state.artifact;
    state.status = 'cancelling';
    state.stage = { id: 'cancelling', label: 'Stopping the build', message: 'Stopping the complete pipeline process tree.' };
    persistAndEmit();
    var cancelError = new Error('The build was cancelled.');
    cancelError.code = 'RUN_CANCELLED';
    activeExecution.cancel('RUN_CANCELLED');
    finishFailure(cancelError, id, previousArtifact, true);
    return snapshot();
  }

  function close() {
    if (!activeExecution || ACTIVE_STATUSES.indexOf(state.status) < 0) return;
    var id = state.runId;
    var previousArtifact = state.artifact;
    activeExecution.cancel('SERVER_SHUTDOWN');
    var shutdownError = new Error('The local runtime stopped during the build.');
    shutdownError.code = 'SERVER_SHUTDOWN';
    finishFailure(shutdownError, id, previousArtifact, false);
  }

  return {
    start: start,
    cancel: cancel,
    snapshot: snapshot,
    projectSnapshot: projectSnapshot,
    close: close,
    onSnapshot: function(listener) { emitter.on('snapshot', listener); return function() { emitter.off('snapshot', listener); }; },
  };
}

module.exports = {
  createRunCoordinator: createRunCoordinator,
};
