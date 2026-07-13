function quote(value) { return JSON.stringify(value === undefined ? null : value); }

function keyForRequirement(requirement) { return (requirement.config || {}).keyboardKey || null; }
function inputNamesForRequirement(requirement) { var inputs = (requirement.config || {}).inputs; return Array.isArray(inputs) ? inputs.slice() : []; }
function positive(value, fallback) { var number = Number(value); return isFinite(number) && number > 0 ? number : fallback; }

function layoutForRequirement(requirement) {
  var placement = requirement.placement || {};
  var point = placement.resolved || {};
  var config = requirement.config || {};
  var logicalWidth = positive(config.logicalWidth, 800);
  var logicalHeight = positive(config.logicalHeight, 600);
  var width = positive(config.width, requirement.adapter === 'virtual-joystick' ? 96 : 72);
  var height = positive(config.height, width);
  return {
    controlId: requirement.componentId,
    viewportRef: 'gdjs-primary-canvas',
    anchor: 'top-left',
    offsetPolicy: { unit: 'fraction-of-safe-content-rect', x: Math.max(0, Math.min(1, Number(point.x || 0) / logicalWidth)), y: Math.max(0, Math.min(1, Number(point.y || 0) / logicalHeight)) },
    sizePolicy: { basis: 'safe-content-short-edge', widthFraction: width / Math.min(logicalWidth, logicalHeight), heightFraction: height / Math.min(logicalWidth, logicalHeight), minCssPx: 44, maxCssPx: Math.max(width, height) * 2 },
    safeAreaPolicy: 'inside',
    overlapGroup: (config.overlapGroup || requirement.thing || requirement.componentId),
    shape: config.shape || 'rectangle',
    color: config.color || null
  };
}

function buildRuntimeConfig(requirements) {
  return {
    schemaVersion: 1,
    requirements: (requirements || []).map(function(requirement) {
      return {
        adapter: requirement.adapter,
        componentId: requirement.componentId,
        thing: requirement.thing,
        target: requirement.target,
        owner: requirement.owner,
        source: requirement.source,
        mechanism: requirement.mechanism,
        routeId: requirement.routeId,
        routeOwner: requirement.routeOwner,
        routeMechanism: requirement.routeMechanism,
        config: requirement.config || {},
        layout: layoutForRequirement(requirement),
        key: keyForRequirement(requirement),
        inputs: inputNamesForRequirement(requirement)
      };
    })
  };
}

function generate(requirements) {
  var config = buildRuntimeConfig(requirements);
  return [
    '(function(){',
    '  var config = ' + quote(config) + ';',
    '  var keyCodes = { ArrowLeft:37, ArrowRight:39, ArrowUp:38, ArrowDown:40, Space:32, KeyZ:90, KeyI:73 };',
    '  function codeOf(key) { return keyCodes[key] || 0; }',
    '  function bridge() { return window.GameCastleTickRuntime && window.GameCastleTickRuntime.bridge; }',
    '  function press(input, key, action) { var b = bridge(); if (b && action) return b.setVirtualInput(action, true); var code = codeOf(key); if (input && code && input.onKeyPressed) input.onKeyPressed(code); }',
    '  function release(input, key, action) { var b = bridge(); if (b && action) return b.releaseVirtualInputAfter(action, 2); var code = codeOf(key); if (input && code && input.onKeyReleased) input.onKeyReleased(code); }',
    '  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }',
    '  function canvas() { return document.querySelector("canvas"); }',
    '  function safeInsets() { return { left:0, right:0, top:0, bottom:0 }; }',
    '  function RuntimeViewportCoordinator() { this.root = null; this.controls = []; this.attached = false; this.revision = 0; this._resize = this.update.bind(this); }',
    '  RuntimeViewportCoordinator.prototype.attach = function() {',
    '    if (this.attached) return; var c = canvas(); if (!c || !c.parentNode) throw new Error("RuntimeViewportCoordinator requires GDJS canvas");',
    '    this.root = document.createElement("div"); this.root.className = "gc-runtime-overlay-root"; this.root.style.position = "fixed"; this.root.style.pointerEvents = "none"; this.root.style.overflow = "hidden"; this.root.style.zIndex = "2147483000"; c.parentNode.appendChild(this.root);',
    '    this.attached = true; if (typeof ResizeObserver !== "undefined") { this.observer = new ResizeObserver(this._resize); this.observer.observe(c); } window.addEventListener("resize", this._resize, { passive:true }); window.addEventListener("orientationchange", this._resize, { passive:true }); window.addEventListener("fullscreenchange", this._resize, { passive:true }); this.update();',
    '  };',
    '  RuntimeViewportCoordinator.prototype.update = function() {',
    '    if (!this.attached) return; var rect = canvas().getBoundingClientRect(); var inset = safeInsets(); var left = rect.left + inset.left, top = rect.top + inset.top, width = Math.max(0, rect.width - inset.left - inset.right), height = Math.max(0, rect.height - inset.top - inset.bottom);',
    '    this.root.style.left = left + "px"; this.root.style.top = top + "px"; this.root.style.width = width + "px"; this.root.style.height = height + "px"; this.revision++;',
    '    this.controls.forEach(function(control) { var l = control.layout, p = l.offsetPolicy, s = l.sizePolicy, shortEdge = Math.min(width, height), w = clamp(shortEdge * s.widthFraction, s.minCssPx, s.maxCssPx), h = clamp(shortEdge * s.heightFraction, s.minCssPx, s.maxCssPx); control.el.style.left = clamp(width * p.x - w / 2, 0, Math.max(0, width - w)) + "px"; control.el.style.top = clamp(height * p.y - h / 2, 0, Math.max(0, height - h)) + "px"; control.el.style.width = w + "px"; control.el.style.height = h + "px"; if (control.resize) control.resize(w, h); });',
    '  };',
    '  RuntimeViewportCoordinator.prototype.add = function(el, layout, resize) { el.style.position = "absolute"; el.style.pointerEvents = "auto"; el.style.touchAction = "none"; el.style.userSelect = "none"; this.root.appendChild(el); this.controls.push({ el:el, layout:layout, resize:resize }); this.update(); return el; };',
    '  function makeEl(className, label) { var el = document.createElement("div"); el.className = className; el.textContent = label || ""; el.style.display = "flex"; el.style.alignItems = "center"; el.style.justifyContent = "center"; el.style.fontFamily = "system-ui, sans-serif"; el.style.fontWeight = "700"; el.style.color = "white"; return el; }',
    '  function bindButton(req, input, coordinator) { var cfg = req.config || {}, key = String(req.thing || req.componentId || "button").replace(/[^a-z0-9]+/gi, "-").toLowerCase(), el = makeEl("gc-intent-button gc-" + key, cfg.controlLabel || cfg.action || ""); el.style.borderRadius = req.layout.shape === "circle" ? "50%" : "8px"; el.style.background = req.layout.color || "rgba(40,40,48,.72)"; el.style.border = "2px solid rgba(255,255,255,.38)"; var down = false; function start(event) { event.preventDefault(); down = true; press(input, req.key, cfg.action); } function end(event) { if (event) event.preventDefault(); if (!down) return; down = false; release(input, req.key, cfg.action); } el.addEventListener("pointerdown", start); window.addEventListener("pointerup", end, { passive:false }); window.addEventListener("pointercancel", end, { passive:false }); return coordinator.add(el, req.layout); }',
    '  function bindJoystick(req, input, coordinator) { var cfg = req.config || {}, el = makeEl("gc-intent-joystick", ""), knob = makeEl("gc-intent-joystick-knob", ""), active = false, metrics = {}; el.style.borderRadius = "50%"; el.style.background = req.layout.color || "rgba(32,116,190,.28)"; el.style.border = "2px solid rgba(255,255,255,.35)"; knob.style.position = "absolute"; knob.style.pointerEvents = "none"; knob.style.borderRadius = "50%"; knob.style.background = "rgba(255,255,255,.78)"; el.appendChild(knob); function resize(w) { metrics.size = w; metrics.knob = Math.round(w * .4); metrics.home = Math.round((w - metrics.knob) / 2); metrics.max = Math.round(w * .3); knob.style.width = metrics.knob + "px"; knob.style.height = metrics.knob + "px"; knob.style.left = metrics.home + "px"; knob.style.top = metrics.home + "px"; } function clear() { ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].forEach(function(key) { release(input, key); }); knob.style.left = metrics.home + "px"; knob.style.top = metrics.home + "px"; } function move(event) { if (!active) return; event.preventDefault(); var rect = el.getBoundingClientRect(), dx = event.clientX - rect.left - rect.width / 2, dy = event.clientY - rect.top - rect.height / 2, distance = Math.sqrt(dx * dx + dy * dy) || 1, nx = clamp(dx, -metrics.max, metrics.max), ny = clamp(dy, -metrics.max, metrics.max), dead = Math.max(8, Math.round(metrics.max * .4)); if (distance > metrics.max) { nx = dx / distance * metrics.max; ny = dy / distance * metrics.max; } knob.style.left = (metrics.home + nx) + "px"; knob.style.top = (metrics.home + ny) + "px"; if (dx < -dead) press(input, "ArrowLeft"); else release(input, "ArrowLeft"); if (dx > dead) press(input, "ArrowRight"); else release(input, "ArrowRight"); if (dy < -dead) press(input, "ArrowUp"); else release(input, "ArrowUp"); if (dy > dead) press(input, "ArrowDown"); else release(input, "ArrowDown"); } el.addEventListener("pointerdown", function(event) { active = true; move(event); }); window.addEventListener("pointermove", move, { passive:false }); window.addEventListener("pointerup", function() { active = false; clear(); }, { passive:false }); window.addEventListener("pointercancel", function() { active = false; clear(); }, { passive:false }); return coordinator.add(el, req.layout, resize); }',
    '  function bindInventory(req, coordinator) { var cfg = req.config || {}, panel = makeEl("gc-intent-inventory-panel", cfg.panelTitle || req.thing || "Inventory"); panel.style.borderRadius = "8px"; panel.style.background = req.layout.color || "rgba(28,28,32,.82)"; panel.style.border = "2px solid rgba(255,255,255,.25)"; panel.dataset.slots = String(cfg.slots || 24); return coordinator.add(panel, req.layout); }',
    '  function attach(game) { if (!game || attach._attached) return; attach._attached = true; var input = game.getInputManager && game.getInputManager(), coordinator = new RuntimeViewportCoordinator(); coordinator.attach(); config.requirements.forEach(function(req) { if (req.adapter === "virtual-joystick") bindJoystick(req, input, coordinator); else if (req.adapter === "touch-button") bindButton(req, input, coordinator); else if (req.adapter === "inventory-panel") bindInventory(req, coordinator); }); window.GameCastleIntentRuntime.coordinator = coordinator; }',
    '  window.GameCastleIntentRuntime = { schemaVersion:1, config:config, attach:attach, RuntimeViewportCoordinator:RuntimeViewportCoordinator };',
    '})();',
    ''
  ].join('\n');
}

module.exports = { buildRuntimeConfig: buildRuntimeConfig, generate: generate, layoutForRequirement: layoutForRequirement };
