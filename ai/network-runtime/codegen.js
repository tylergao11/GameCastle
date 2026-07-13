// GameCastle Tick Intent Runtime — Code Generator
//
// Reads the tick runtime manifest produced by the module compiler
// and assembles a self-contained JavaScript file containing:
//   1. Transport class
//   2. Required sync strategies
//   3. Wiring code (instantiation + public API)
//
// The output is a single IIFE suitable for <script> injection.

var fs = require("fs");
var path = require("path");
var tickPolicyResolver = require('../tick-policy-resolver');

var RUNTIME_DIR = __dirname;
var DEFAULT_SIGNALING_URL = "ws://localhost:3001";
var BRIDGE_OWNED_SYNC = {
  "lockstep": true,
  "lockstep-input": true,
  "server-authoritative": true,
};

// ── Strategy registry ────────────────────────────────────────────────────
// Maps sync model → { file, constructor, description }
var REGISTRY = {
  "lockstep":             { file: "tick-intent-runtime.js",    ctor: "GameCastleTickIntentRuntime", desc: "Deterministic frame input sync" },
  "lockstep-input":       { file: "tick-intent-runtime.js",    ctor: "GameCastleTickIntentRuntime", desc: "Deterministic frame input sync" },
  "snapshot":             { file: "snapshot-sync.js", ctor: "SnapshotSyncStrategy", desc: "Authoritative state snapshots" },
  "event":                { file: "event-relay.js",   ctor: "EventRelayStrategy",   desc: "Event-driven room relay" },
  "peer-event":           { file: "event-relay.js",   ctor: "EventRelayStrategy",   desc: "Directed peer event relay" },
  "async-state":          { file: "async-persistence.js", ctor: "AsyncPersistenceStrategy", desc: "Save/load state to server" },
  "server-authoritative": { file: "tick-intent-runtime.js", ctor: "GameCastleTickIntentRuntime", desc: "Server-ordered inputs, clients replay deterministic frames" },
};

// ── Public API ────────────────────────────────────────────────────────────

function generate(manifest, options) {
  options = options || {};
  var signalingUrl = options.signalingUrl || DEFAULT_SIGNALING_URL;
  var modules = manifest.modules || [];
  var plan = resolvePlan(manifest);
  var bridgeModule = resolveBridgeModule(modules, plan);

  // 1. Collect strategies from manifest
  var entries = resolveStrategies(modules, plan);
  var sourceFiles = collectSourceFiles(entries, bridgeModule);

  if (bridgeModule) {
    // Add runtime-adapter + tick-intent bridge once for tick-driven games.
    sourceFiles.push("tick-intent-runtime.js");
    sourceFiles.push("runtime-adapter.js");
    sourceFiles.push("tick-intent-bridge.js");
  }

  // 2. Read and clean source files
  var sourceBlocks = sourceFiles.map(function (file) {
    return readSourceFile(file);
  });

  // 3. Generate wiring (includes bridge init inside the same IIFE)
  var wiring = generateWiring(signalingUrl, entries, modules, bridgeModule);

  // 4. Assemble final output (single IIFE: classes + wiring + bridge)
  return assembleOutput(entries, bridgeModule, sourceBlocks, wiring);
}

// ── Manifest processing ──────────────────────────────────────────────────

function resolvePlan(manifest) {
  return manifest && manifest.plan ? manifest.plan : null;
}

function resolveBridgeModule(modules, plan) {
  if (plan && plan.realtime) {
    return {
      id: "tick.realtime",
      category: "tick-runtime-plan",
      syncPolicy: {
        sync: plan.realtime.sync,
        tickRate: plan.realtime.tickRate,
        authority: plan.realtime.authority,
        seed: plan.realtime.seed
      },
      inputs: plan.realtime.inputs || plan.allInputs || [],
      state: plan.realtime.state || plan.allState || [],
      deterministic: !!plan.realtime.deterministic,
      moduleIds: plan.realtime.moduleIds || []
    };
  }
  // Single-player modules still have deterministic input frames. They use the
  // same bridge as multiplayer; transport is simply absent.
  if (plan && plan.allInputs && plan.allInputs.length) {
    return {
      id: "tick.local",
      category: "tick-runtime-plan",
      syncPolicy: { sync: "local", authority: "runtime", tickRate: 60, seed: null },
      inputs: plan.allInputs,
      state: plan.allState || [],
      deterministic: true,
      moduleIds: []
    };
  }
  for (var i = 0; i < modules.length; i++) {
    var policy = modules[i].syncPolicy;
    if (policy && policy.sync && BRIDGE_OWNED_SYNC[policy.sync]) return modules[i];
  }
  return null;
}

function resolveStrategies(modules, plan) {
  var entries = [];

  if (plan && plan.channels) {
    plan.channels.forEach(function (channel) {
      var entry = REGISTRY[channel.sync];
      if (!entry) {
        console.warn("[TickRuntimeCodegen] unsupported sync channel: " + channel.sync + " (module " + channel.id + ")");
        return;
      }
      entries.push({
        id: channel.id,
        sync: channel.sync,
        file: entry.file,
        ctor: entry.ctor,
      config: {
          tickRate: tickPolicyResolver.resolve({ sync: channel.sync, tickRate: channel.tickRate, authority: channel.authority }).simulationHz,
          authority: channel.authority || "host",
          inputs: channel.inputs || [],
          state: channel.state || [],
          deterministic: !!channel.deterministic
        },
        varName: "strategy_" + channel.id.replace(/[^a-zA-Z0-9_]/g, "_"),
      });
    });
    return entries;
  }

  modules.forEach(function (mod) {
    var policy = mod.syncPolicy;
    if (!policy || policy.sync === "local") return;
    if (BRIDGE_OWNED_SYNC[policy.sync]) return;

    var entry = REGISTRY[policy.sync];
    if (!entry) {
      console.warn("[TickRuntimeCodegen] unsupported sync model: " + policy.sync + " (module " + mod.id + ")");
      return;
    }
    if (!entry.file) {
      console.warn("[TickRuntimeCodegen] not yet implemented: " + policy.sync + " — " + entry.desc);
      return;
    }

    entries.push({
      id: mod.id,
      sync: policy.sync,
      file: entry.file,
      ctor: entry.ctor,
      config: buildConfig(mod, policy),
      varName: "strategy_" + mod.id.replace(/[^a-zA-Z0-9_]/g, "_"),
    });
  });

  return entries;
}

function collectSourceFiles(entries, bridgeModule) {
  var files = [];
  if (entries.length > 0 || (bridgeModule && bridgeModule.syncPolicy.sync !== "local")) files.push("transport.js");
  entries.forEach(function (e) {
    if (files.indexOf(e.file) < 0) files.push(e.file);
  });
  return files;
}

function buildConfig(mod, policy) {
  var config = {
    tickRate: tickPolicyResolver.resolve(policy).simulationHz,
    authority: policy.authority || "host",
  };
  if (mod.inputs && mod.inputs.length) config.inputs = mod.inputs;
  if (mod.state && mod.state.length) config.state = mod.state;
  if (mod.deterministic !== undefined) config.deterministic = mod.deterministic;
  return config;
}

// ── Source file handling ─────────────────────────────────────────────────

function readSourceFile(filename) {
  var filePath;
  if (filename === "transport.js") {
    filePath = path.join(RUNTIME_DIR, filename);
  } else if (filename === "tick-intent-bridge.js") {
    filePath = path.join(RUNTIME_DIR, filename);
  } else if (filename === "tick-intent-runtime.js") {
    filePath = path.join(RUNTIME_DIR, filename);
  } else if (filename === "snapshot-sync.js") {
    filePath = path.join(RUNTIME_DIR, filename);
  } else if (filename === "event-relay.js") {
    filePath = path.join(RUNTIME_DIR, filename);
  } else if (filename === "async-persistence.js") {
    filePath = path.join(RUNTIME_DIR, filename);
  } else if (filename === "runtime-adapter.js") {
    filePath = path.join(RUNTIME_DIR, filename);
  } else {
    filePath = path.join(RUNTIME_DIR, filename);
  }

  if (!fs.existsSync(filePath)) {
    throw new Error("Tick runtime source missing: " + filePath);
  }

  var src = fs.readFileSync(filePath, "utf8");

  // Strip ALL Node.js module-export blocks for browser bundle.
  // Uses line-based removal to handle nested braces in object literals
  // (e.g. module.exports = { Key: Value, Key2: Value2 };)
  // that regex-based approaches can't handle reliably.
  var lines = src.split("\n");
  var result = [];
  var inModuleExport = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // Detect the opening of an if-guarded module.exports block
    if (/^\s*if\s*\(\s*typeof\s+module\s*!==\s*"undefined"\s*\)/.test(line)) {
      // Single-line: if (...) { module.exports = X; }
      if (/\}\s*$/.test(line)) continue;
      inModuleExport = true;
      continue;
    }
    if (inModuleExport) {
      // Skip the module.exports = ... line
      if (/module\.exports\s*=/.test(line)) continue;
      // Skip the closing brace of the if block
      if (/^\s*\}\s*$/.test(line)) { inModuleExport = false; continue; }
      continue;
    }
    result.push(line);
  }
  // Also strip bare module.exports lines (without if guard)
  var finalLines = [];
  for (var j = 0; j < result.length; j++) {
    if (!/^\s*module\.exports\s*=/.test(result[j])) {
      finalLines.push(result[j]);
    }
  }

  return finalLines.join("\n");
}

// -- Wiring generation -------------------------------------------------

function generateWiring(signalingUrl, entries, modules, bridgeModule) {
  var lines = [];

  // Section: Config
  lines.push("  // ── Config ──");
  lines.push("  var SIGNALING_URL = " + JSON.stringify(signalingUrl) + ";");
  lines.push("");

  if (entries.length === 0 && !bridgeModule) {
    return lines.concat([
      "  // No remote tick intent source needed (all modules are local-only).",
      "  window.GameCastleTickRuntime = {",
      "    transport: null,",
      "    strategies: {},",
      "    host: function () { return Promise.reject(new Error('No remote tick intent source configured')); },",
      "    join: function () { return Promise.reject(new Error('No remote tick intent source configured')); },",
      "  };",
    ]).join("\n");
  }

  // Section: Transport
  lines.push("  // ── Transport ──");
  lines.push("  var transport = " + (bridgeModule && bridgeModule.syncPolicy && bridgeModule.syncPolicy.sync === "local" ? "null" : "new GameCastleTransport(SIGNALING_URL)") + ";");
  lines.push("");

  // Section: Strategies
  lines.push("  // ── Strategies ──");
  entries.forEach(function (e) {
    lines.push("  // " + e.id + " (" + e.sync + ")");
    lines.push("  var " + e.varName + " = new " + e.ctor + "(transport, " + JSON.stringify(e.config) + ");");
    lines.push("");
  });

  // Section: Strategy map + typed accessors
  lines.push("  var strategies = {");
  entries.forEach(function (e) {
    lines.push('    "' + e.id + '": ' + e.varName + ",");
  });
  lines.push("  };");
  lines.push("");

  // Typed accessor variables (e.g. GameCastleTickRuntime.platformer)
  var accessorVars = [];
  entries.forEach(function (e) {
    var alias = e.id.replace(/^[^.]+\./, "").replace(/[^a-zA-Z0-9_]/g, "_");
    if (alias && alias !== e.varName) {
      accessorVars.push("  var gc_" + alias + " = " + e.varName + ";");
    }
  });
  if (accessorVars.length) {
    lines = lines.concat(accessorVars);
    lines.push("");
  }

  // Section: Room lifecycle helpers
  lines.push("  // ── Room lifecycle ──");
  lines.push("");
  lines.push("  function startAllStrategies() {");
  entries.forEach(function (e) {
    lines.push("    if (" + e.varName + ".start) " + e.varName + ".start();");
  });
  lines.push("  }");
  lines.push("");
  lines.push("  function stopAllStrategies() {");
  entries.forEach(function (e) {
    lines.push("    if (" + e.varName + ".stop) " + e.varName + ".stop();");
  });
  lines.push("  }");
  lines.push("");

  // host(): delegates to bridge.host() — bridge owns connect → createRoom → tick loop
  lines.push("  function hostWithoutBridge() {");
  lines.push("    return transport.connect().then(function () {");
  lines.push("      return new Promise(function (resolve, reject) {");
  lines.push("        transport.on('room_created', function (rid) { transport.joinRoom(rid); });");
  lines.push("        transport.on('joined', function (roomId, playerId) {");
  lines.push("          startAllStrategies();");
  lines.push("          resolve({ roomId: roomId, playerId: playerId });");
  lines.push("        });");
  lines.push("        transport.on('error', function (err) { reject(new Error(err)); });");
  lines.push("        transport.createRoom({});");
  lines.push("      });");
  lines.push("    });");
  lines.push("  }");
  lines.push("");
  lines.push("  function joinWithoutBridge(roomId) {");
  lines.push("    if (!roomId) return Promise.reject(new Error('roomId is required'));");
  lines.push("    return transport.connect().then(function () {");
  lines.push("      return new Promise(function (resolve, reject) {");
  lines.push("        transport.on('joined', function (rid, playerId) {");
  lines.push("          startAllStrategies();");
  lines.push("          resolve({ roomId: rid, playerId: playerId });");
  lines.push("        });");
  lines.push("        transport.on('error', function (err) { reject(new Error(err)); });");
  lines.push("        transport.joinRoom(roomId);");
  lines.push("      });");
  lines.push("    });");
  lines.push("  }");
  lines.push("");

  lines.push("  function host() {");
  lines.push("    var b = window.GameCastleTickRuntime && window.GameCastleTickRuntime.bridge;");
  lines.push("    if (!b) return hostWithoutBridge();");
  lines.push("    return b.host().then(function (result) {");
  lines.push("      startAllStrategies();");
  lines.push("      return result;");
  lines.push("    });");
  lines.push("  }");
  lines.push("");

  // join(roomId): delegates to bridge.join() — bridge owns connect → joinRoom → tick loop
  lines.push("  function join(roomId) {");
  lines.push("    var b = window.GameCastleTickRuntime && window.GameCastleTickRuntime.bridge;");
  lines.push("    if (!b) return joinWithoutBridge(roomId);");
  lines.push("    return b.join(roomId).then(function (result) {");
  lines.push("      startAllStrategies();");
  lines.push("      return result;");
  lines.push("    });");
  lines.push("  }");
  lines.push("");

  // Section: Public API
  lines.push("  // ── Public API ──");
  lines.push("  window.GameCastleTickRuntime = {");
  lines.push("    transport: transport,");
  lines.push("    strategies: strategies,");

  // Typed accessors
  var seenAliases = {};
  entries.forEach(function (e) {
    var alias = e.id.replace(/^[^.]+\./, "").replace(/[^a-zA-Z0-9_]/g, "_");
    if (alias && !seenAliases[alias]) {
      seenAliases[alias] = true;
      lines.push("    " + alias + ": gc_" + alias + ",");
    }
  });

  lines.push("");
  lines.push("    host: host,");
  lines.push("    join: join,");
  lines.push("    leave: function () { transport.leaveRoom(); stopAllStrategies(); },");
  lines.push("    close: function () { transport.close(); },");
  lines.push("  };");

  // ── Bridge init (inside IIFE, same scope as classes + strategies) ──
  var bridgeLines = buildBridgeInitLines(bridgeModule, modules);
  lines.push("");
  lines = lines.concat(bridgeLines);

  return lines.join("\n");
}

// ── Output assembly ──────────────────────────────────────────────────────

function assembleOutput(entries, bridgeModule, sourceBlocks, wiring) {
  var syncSummary = entries.length > 0
    ? entries.map(function (e) { return e.id + " (" + e.sync + ")"; }).join(", ")
    : bridgeModule && bridgeModule.syncPolicy
      ? bridgeModule.id + " (" + bridgeModule.syncPolicy.sync + ", bridge-owned)"
      : "none";

  return [
    "// GameCastle Tick Intent Runtime",
    "// Auto-generated from tick runtime manifest",
    "// Sync strategies: " + syncSummary,
    "(function () {",
    '  "use strict";',
    "",
    "  // ═══════════════════════════════════════════════════════════════",
    "  // Source: Classes (Transport, Strategies, Bridge)",
    "  // ═══════════════════════════════════════════════════════════════",
    sourceBlocks.join("\n"),
    "",
    "  // ═══════════════════════════════════════════════════════════════",
    "  // Wiring + Bridge Init (generated from tick runtime manifest)",
    "  // ═══════════════════════════════════════════════════════════════",
    wiring,
    "",
    "})();",
    "",
  ].join("\n");
}

// ── Bridge init (runs inside the main IIFE, same scope as classes) ────────

function buildBridgeInitLines(bridgeModule, modules) {
  if (!bridgeModule || !bridgeModule.syncPolicy) return [];

  var allInputs = [];
  var allState = [];
  var seenInputs = {};
  var seenState = {};

  (bridgeModule.inputs || []).forEach(function (input) {
    if (!seenInputs[input]) { seenInputs[input] = true; allInputs.push(input); }
  });
  (bridgeModule.state || []).forEach(function (s) {
    if (!seenState[s]) { seenState[s] = true; allState.push(s); }
  });
  if (!allInputs.length && !allState.length) {
    modules.forEach(function (mod) {
      (mod.inputs || []).forEach(function (input) {
        if (!seenInputs[input]) { seenInputs[input] = true; allInputs.push(input); }
      });
      (mod.state || []).forEach(function (s) {
        if (!seenState[s]) { seenState[s] = true; allState.push(s); }
      });
    });
  }

  var policy = bridgeModule.syncPolicy;
  var config = buildConfig(bridgeModule, policy);
  var resolvedTickPolicy = tickPolicyResolver.resolve(policy);

  return [
    "  // ── Tick Intent Bridge ──",
    "  // Creates the bridge instance that connects GDevelop to tick intent sources.",
    "  // Runs in the same scope as classes + strategies, so all symbols are visible.",
    "  (function () {",
    "    if (!transport && " + JSON.stringify(policy.sync) + " !== 'local') {",
    "      console.log('[GC:Bridge] No transport — running in local mode');",
    "      return;",
    "    }",
    "",
    "    var bridgeConfig = {",
    "      inputs: " + JSON.stringify(allInputs) + ",",
    "      state: " + JSON.stringify(allState) + ",",
    "      tickRate: " + (config.tickRate || 60) + ",",
    "      tickPolicy: " + JSON.stringify(resolvedTickPolicy) + ",",
    "      sync: " + JSON.stringify(policy.sync) + ",",
    "      transport: transport,",
    "      autoHost: false,",
    "    };",
    "",
    "    var bridge = new GameCastleTickIntentBridge(bridgeConfig);",
    "",
    "    // Bridge registers ALL transport.on() handlers internally",
    "    // via _setupTransportHandlers() (called from host()/join()).",
    "    // Do NOT add duplicate handlers here — the bridge owns everything.",
    "",
    "    // Expose bridge on global API",
    "    window.GameCastleTickRuntime.bridge = bridge;",
    "",
    "    console.log('[GC:Bridge] Ready. inputs=' + bridgeConfig.inputs.join(',') + ' state=' + bridgeConfig.state.join(',') + ' sync=' + bridgeConfig.sync);",
    "  })();",
  ];
}

module.exports = { generate: generate, REGISTRY: REGISTRY };
