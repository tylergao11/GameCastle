function quote(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function keyForRequirement(requirement) {
  var config = requirement.config || {};
  return config.keyboardKey || null;
}

function inputNamesForRequirement(requirement) {
  var config = requirement.config || {};
  if (Array.isArray(config.inputs)) return config.inputs.slice();
  return [];
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
        placement: requirement.placement || null,
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
    '  function press(input, key) { var code = codeOf(key); if (input && code && input.onKeyPressed) input.onKeyPressed(code); }',
    '  function release(input, key) { var code = codeOf(key); if (input && code && input.onKeyReleased) input.onKeyReleased(code); }',
    '  function px(value) { return Math.round(Number(value) || 0) + "px"; }',
    '  function number(value, fallback) { var n = Number(value); return isFinite(n) && n > 0 ? n : fallback; }',
    '  function makeEl(className, label) {',
    '    var el = document.createElement("div");',
    '    el.className = className;',
    '    el.textContent = label || "";',
    '    el.style.position = "absolute";',
    '    el.style.touchAction = "none";',
    '    el.style.userSelect = "none";',
    '    el.style.zIndex = "2147483000";',
    '    el.style.display = "flex";',
    '    el.style.alignItems = "center";',
    '    el.style.justifyContent = "center";',
    '    el.style.fontFamily = "system-ui, sans-serif";',
    '    el.style.fontWeight = "700";',
    '    el.style.color = "white";',
    '    document.body.appendChild(el);',
    '    return el;',
    '  }',
    '  function place(el, placement, width, height) {',
    '    placement = placement || {};',
    '    var p = placement.resolved || { x: 80, y: 520 };',
    '    width = number(width, 72);',
    '    height = number(height, width);',
    '    el.style.left = px((p.x || 0) - width / 2);',
    '    el.style.top = px((p.y || 0) - height / 2);',
    '    el.style.width = px(width);',
    '    el.style.height = px(height);',
    '  }',
    '  function bindButton(req, input) {',
    '    var cfg = req.config || {};',
    '    var classKey = String(req.thing || req.componentId || "button").replace(/[^a-z0-9]+/gi, "-").toLowerCase();',
    '    var el = makeEl("gc-intent-button gc-" + classKey, cfg.controlLabel || cfg.action || "");',
    '    place(el, req.placement, cfg.width, cfg.height);',
    '    el.style.borderRadius = cfg.shape === "circle" ? "50%" : "8px";',
    '    el.style.background = cfg.color || "rgba(40, 40, 48, 0.72)";',
    '    el.style.border = "2px solid rgba(255,255,255,0.38)";',
    '    var down = false;',
    '    function start(event) { event.preventDefault(); down = true; press(input, req.key); }',
    '    function end(event) { if (event) event.preventDefault(); if (!down) return; down = false; release(input, req.key); }',
    '    el.addEventListener("pointerdown", start);',
    '    window.addEventListener("pointerup", end);',
    '    window.addEventListener("pointercancel", end);',
    '    return el;',
    '  }',
    '  function bindJoystick(req, input) {',
    '    var cfg = req.config || {};',
    '    var size = number(cfg.width, 96);',
    '    var el = makeEl("gc-intent-joystick", "");',
    '    place(el, req.placement, size, size);',
    '    el.style.borderRadius = "50%";',
    '    el.style.background = cfg.color || "rgba(32, 116, 190, 0.28)";',
    '    el.style.border = "2px solid rgba(255,255,255,0.35)";',
    '    var knob = makeEl("gc-intent-joystick-knob", "");',
    '    var knobSize = Math.round(size * 0.4);',
    '    var knobHome = Math.round((size - knobSize) / 2);',
    '    var max = Math.round(size * 0.3);',
    '    knob.style.pointerEvents = "none";',
    '    knob.style.borderRadius = "50%";',
    '    knob.style.width = px(knobSize);',
    '    knob.style.height = px(knobSize);',
    '    knob.style.background = "rgba(255,255,255,0.78)";',
    '    knob.style.left = px(knobHome);',
    '    knob.style.top = px(knobHome);',
    '    el.appendChild(knob);',
    '    var active = false;',
    '    function clear() {',
    '      ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].forEach(function(key) { release(input, key); });',
    '      knob.style.left = px(knobHome); knob.style.top = px(knobHome);',
    '    }',
    '    function move(event) {',
    '      if (!active) return;',
    '      event.preventDefault();',
    '      var rect = el.getBoundingClientRect();',
    '      var cx = rect.left + rect.width / 2;',
    '      var cy = rect.top + rect.height / 2;',
    '      var dx = event.clientX - cx;',
    '      var dy = event.clientY - cy;',
    '      var distance = Math.sqrt(dx * dx + dy * dy) || 1;',
    '      var nx = Math.max(-max, Math.min(max, dx));',
    '      var ny = Math.max(-max, Math.min(max, dy));',
    '      if (distance > max) { nx = dx / distance * max; ny = dy / distance * max; }',
    '      knob.style.left = px(knobHome + nx); knob.style.top = px(knobHome + ny);',
    '      var dead = Math.max(8, Math.round(max * 0.4));',
    '      if (dx < -dead) press(input, "ArrowLeft"); else release(input, "ArrowLeft");',
    '      if (dx > dead) press(input, "ArrowRight"); else release(input, "ArrowRight");',
    '      if (dy < -dead) press(input, "ArrowUp"); else release(input, "ArrowUp");',
    '      if (dy > dead) press(input, "ArrowDown"); else release(input, "ArrowDown");',
    '    }',
    '    el.addEventListener("pointerdown", function(event) { active = true; move(event); });',
    '    window.addEventListener("pointermove", move);',
    '    window.addEventListener("pointerup", function() { active = false; clear(); });',
    '    window.addEventListener("pointercancel", function() { active = false; clear(); });',
    '    return el;',
    '  }',
    '  function bindInventory(req) {',
    '    var cfg = req.config || {};',
    '    var panel = makeEl("gc-intent-inventory-panel", cfg.panelTitle || req.thing || "Inventory");',
    '    place(panel, req.placement, cfg.width, cfg.height);',
    '    panel.style.borderRadius = "8px";',
    '    panel.style.background = cfg.color || "rgba(28, 28, 32, 0.82)";',
    '    panel.style.border = "2px solid rgba(255,255,255,0.25)";',
    '    panel.dataset.slots = String((req.config && req.config.slots) || 24);',
    '    return panel;',
    '  }',
    '  function attach(game) {',
    '    if (!game || attach._attached) return;',
    '    attach._attached = true;',
    '    var input = game.getInputManager && game.getInputManager();',
    '    config.requirements.forEach(function(req) {',
    '      if (req.adapter === "virtual-joystick") bindJoystick(req, input);',
    '      else if (req.adapter === "touch-button") bindButton(req, input);',
    '      else if (req.adapter === "inventory-panel") bindInventory(req);',
    '    });',
    '  }',
    '  window.GameCastleIntentRuntime = { schemaVersion: 1, config: config, attach: attach };',
    '})();',
    ''
  ].join('\n');
}

module.exports = {
  buildRuntimeConfig: buildRuntimeConfig,
  generate: generate
};
