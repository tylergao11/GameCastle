// GameCastle Network Runtime — Code Generator
//
// Reads the network manifest produced by the module compiler
// and assembles a self-contained JavaScript file containing:
//   1. Transport class
//   2. Required sync strategies
//   3. Wiring code (instantiation + public API)
//
// The output is a single IIFE suitable for <script> injection.

var fs = require("fs");
var path = require("path");

var RUNTIME_DIR = __dirname;
var STRATEGIES_DIR = path.join(RUNTIME_DIR, "strategies");

var DEFAULT_SIGNALING_URL = "ws://localhost:3001";

// ── Strategy registry ────────────────────────────────────────────────────
// Maps sync model → { file, constructor, description }
var REGISTRY = {
  "lockstep":             { file: "input-sync.js",    ctor: "InputSyncStrategy",    desc: "Deterministic input forwarding (2P)" },
  "lockstep-input":       { file: "input-sync.js",    ctor: "InputSyncStrategy",    desc: "Deterministic input forwarding (2P)" },
  "snapshot":             { file: "state-sync.js",    ctor: "StateSyncStrategy",    desc: "Host broadcasts state snapshots" },
  "event":                { file: "event-relay.js",   ctor: "EventRelayStrategy",   desc: "Event-driven, server-validated" },
  "peer-event":           { file: "event-relay.js",   ctor: "EventRelayStrategy",   desc: "Event relay between peers" },
  "async-state":          { file: "async-state.js",   ctor: "AsyncStateStrategy",   desc: "Save/load state to server" },
  "server-authoritative": { file: "authority-sync.js", ctor: "AuthoritySyncStrategy", desc: "Server orders inputs, clients run deterministic sim" },
};

// ── Public API ────────────────────────────────────────────────────────────

function generate(manifest, options) {
  options = options || {};
  var signalingUrl = options.signalingUrl || DEFAULT_SIGNALING_URL;
  var modules = manifest.modules || [];

  // 1. Collect strategies from manifest
  var entries = resolveStrategies(modules);
  var sourceFiles = collectSourceFiles(entries);

  // Add game-bridge source (always included for network-aware games)
  sourceFiles.push("game-bridge.js");

  // 2. Read and clean source files
  var sourceBlocks = sourceFiles.map(function (file) {
    return readSourceFile(file);
  });

  // 3. Generate wiring (includes bridge init inside the same IIFE)
  var wiring = generateWiring(signalingUrl, entries, modules);

  // 4. Assemble final output (single IIFE: classes + wiring + bridge)
  return assembleOutput(entries, sourceBlocks, wiring);
}

// ── Manifest processing ──────────────────────────────────────────────────

function resolveStrategies(modules) {
  var entries = [];

  modules.forEach(function (mod) {
    var policy = mod.syncPolicy;
    if (!policy || policy.sync === "local") return;

    var entry = REGISTRY[policy.sync];
    if (!entry) {
      console.warn("[NetworkCodegen] unsupported sync model: " + policy.sync + " (module " + mod.id + ")");
      return;
    }
    if (!entry.file) {
      console.warn("[NetworkCodegen] not yet implemented: " + policy.sync + " — " + entry.desc);
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

function collectSourceFiles(entries) {
  var files = ["transport.js"];
  entries.forEach(function (e) {
    if (files.indexOf(e.file) < 0) files.push(e.file);
  });
  return files;
}

function buildConfig(mod, policy) {
  var config = {
    tickRate: policy.tickRate || 0,
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
  } else if (filename === "game-bridge.js") {
    filePath = path.join(RUNTIME_DIR, filename);
  } else {
    filePath = path.join(STRATEGIES_DIR, filename);
  }

  if (!fs.existsSync(filePath)) {
    throw new Error("Network runtime source missing: " + filePath);
  }

  var src = fs.readFileSync(filePath, "utf8");

  // Strip Node.js module export for browser bundle
  src = src.replace(
    /\nif\s*\(typeof\s+module\s*!==\s*"undefined"\)\s*\{\s*module\.exports\s*=\s*\w+;?\s*\}\s*\n?/g,
    "\n"
  );

  return src;
}

// ── Wiring generation ────────────────────────────────────────────��───────

function generateWiring(signalingUrl, entries, modules) {
  var lines = [];

  // Section: Config
  lines.push("  // ── Config ──");
  lines.push("  var SIGNALING_URL = " + JSON.stringify(signalingUrl) + ";");
  lines.push("");

  if (entries.length === 0) {
    return lines.concat([
      "  // No network sync needed (all modules are local-only).",
      "  window.GameCastleNetwork = {",
      "    transport: null,",
      "    strategies: {},",
      "    host: function () { return Promise.reject(new Error('No network sync configured')); },",
      "    join: function () { return Promise.reject(new Error('No network sync configured')); },",
      "  };",
    ]).join("\n");
  }

  // Section: Transport
  lines.push("  // ── Transport ──");
  lines.push("  var transport = new GameCastleTransport(SIGNALING_URL);");
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

  // Typed accessor variables (e.g. GameCastleNetwork.platformer)
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

  // host(): connect → create room → join → return { roomId, playerId }
  lines.push("  function host() {");
  lines.push("    return transport.connect().then(function () {");
  lines.push("      return new Promise(function (resolve, reject) {");
  lines.push("        transport.on(\"room_created\", function (roomId) {");
  lines.push("          transport.joinRoom(roomId);");
  lines.push("        });");
  lines.push("        transport.on(\"joined\", function (roomId, playerId) {");
  lines.push("          startAllStrategies();");
  lines.push("          resolve({ roomId: roomId, playerId: playerId });");
  lines.push("        });");
  lines.push("        transport.on(\"error\", function (err) {");
  lines.push("          reject(new Error(err));");
  lines.push("        });");
  lines.push("        transport.createRoom();");
  lines.push("      });");
  lines.push("    });");
  lines.push("  }");
  lines.push("");

  // join(roomId): connect → join room → return { roomId, playerId }
  lines.push("  function join(roomId) {");
  lines.push("    return transport.connect().then(function () {");
  lines.push("      return new Promise(function (resolve, reject) {");
  lines.push("        transport.on(\"joined\", function (rid, playerId) {");
  lines.push("          startAllStrategies();");
  lines.push("          resolve({ roomId: rid, playerId: playerId });");
  lines.push("        });");
  lines.push("        transport.on(\"error\", function (err) {");
  lines.push("          reject(new Error(err));");
  lines.push("        });");
  lines.push("        transport.joinRoom(roomId);");
  lines.push("      });");
  lines.push("    });");
  lines.push("  }");
  lines.push("");

  // Section: Public API
  lines.push("  // ── Public API ──");
  lines.push("  window.GameCastleNetwork = {");
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
  var bridgeLines = buildBridgeInitLines(entries, modules);
  lines.push("");
  lines = lines.concat(bridgeLines);

  return lines.join("\n");
}

// ── Output assembly ──────────────────────────────────────────────────────

function assembleOutput(entries, sourceBlocks, wiring) {
  var syncSummary = entries.length > 0
    ? entries.map(function (e) { return e.id + " (" + e.sync + ")"; }).join(", ")
    : "none";

  return [
    "// GameCastle Network Runtime",
    "// Auto-generated from network manifest",
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
    "  // Wiring + Bridge Init (generated from network manifest)",
    "  // ═══════════════════════════════════════════════════════════════",
    wiring,
    "",
    "})();",
    "",
  ].join("\n");
}

// ── Bridge init (runs inside the main IIFE, same scope as classes) ────────

function buildBridgeInitLines(entries, modules) {
  if (entries.length === 0) return [];

  var allInputs = [];
  var allState = [];
  var seenInputs = {};
  var seenState = {};

  modules.forEach(function (mod) {
    (mod.inputs || []).forEach(function (input) {
      if (!seenInputs[input]) { seenInputs[input] = true; allInputs.push(input); }
    });
    (mod.state || []).forEach(function (s) {
      if (!seenState[s]) { seenState[s] = true; allState.push(s); }
    });
  });

  var primary = entries[0];
  var config = primary.config || {};

  return [
    "  // ── Game-Network Bridge ──",
    "  // Creates the bridge instance that connects GDevelop to the network.",
    "  // Runs in the same scope as classes + strategies, so all symbols are visible.",
    "  (function () {",
    "    if (!transport) {",
    "      console.log('[GC:Bridge] No transport — running in local mode');",
    "      return;",
    "    }",
    "",
    "    var bridgeConfig = {",
    "      inputs: " + JSON.stringify(allInputs) + ",",
    "      state: " + JSON.stringify(allState) + ",",
    "      tickRate: " + (config.tickRate || 20) + ",",
    "      sync: " + JSON.stringify(primary.sync) + ",",
    "      transport: transport,",
    "      strategy: " + primary.varName + ",",
    "    };",
    "",
    "    var bridge = new GameCastleNetworkBridge(bridgeConfig);",
    "",
    "    // Forward remote game_input from other players to bridge",
    "    transport.on('game_input', function (from, tick, inputs) {",
    "      bridge.receiveRemoteInputs(tick, inputs);",
    "    });",
    "",
    "    // Handle sync channel for lockstep input relay",
    "    transport.on('sync', function (from, channel, data) {",
    "      if (channel === 'input' && data && data.tick !== undefined) {",
    "        bridge.receiveRemoteInputs(data.tick, data.inputs);",
    "      }",
    "    });",
    "",
    "    // Expose bridge on global API",
    "    window.GameCastleNetwork.bridge = bridge;",
    "",
    "    console.log('[GC:Bridge] Ready. inputs=' + bridgeConfig.inputs.join(',') + ' state=' + bridgeConfig.state.join(',') + ' sync=' + bridgeConfig.sync);",
    "  })();",
  ];
}

module.exports = { generate: generate, REGISTRY: REGISTRY };
