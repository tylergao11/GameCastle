// ===== EVENT TEMPLATE ENGINE =====
// Maps natural-language event descriptions to GDevelop event JSON
// 12 condition templates + 15 action templates = covers 90% of mini-game logic

// ---- CONDITION TEMPLATES ----
// Each returns a condition object: { type: {inverted:false, value:name}, parameters:[...] }

var CONDITIONS = {
  // Scene lifecycle
  'start': function() { return { type: {inverted:false, value:'DepartScene'}, parameters:[''] }; },
  'every': function(seconds) { return null; }, // handled by timer sub-event

  // Collision
  'collision': function(a, b) { return { type: {inverted:false, value:'CollisionNP'}, parameters:[a, b, ''] }; },

  // Input
  'key': function(key) {
    var map = { up:'Up', down:'Down', left:'Left', right:'Right', space:'Space', enter:'Return', esc:'Escape' };
    var k = map[key.toLowerCase()] || key;
    return { type: {inverted:false, value:'KeyPressed'}, parameters:['', k] };
  },
  'mouse': function(obj) { return { type: {inverted:false, value:'SourisSurObjet'}, parameters:['LeftButton', '', obj] }; },

  // Variables
  'variable': function(name, op, value) { return { type: {inverted:false, value:'Variable'}, parameters:[name, op, String(value)] }; },
  'objvar': function(obj, name, op, value) { return { type: {inverted:false, value:'VarObjet'}, parameters:[obj, name, op, String(value)] }; },

  // Platform behavior states
  'is_jumping': function(obj) { return { type: {inverted:false, value:'PlatformBehavior::IsJumping'}, parameters:[obj, 'PlatformerObject'] }; },
  'is_falling': function(obj) { return { type: {inverted:false, value:'PlatformBehavior::IsFalling'}, parameters:[obj, 'PlatformerObject'] }; },
  'is_on_floor': function(obj) { return { type: {inverted:false, value:'PlatformBehavior::IsOnFloor'}, parameters:[obj, 'PlatformerObject'] }; },
};

// ---- ACTION TEMPLATES ----
var ACTIONS = {
  // Object manipulation
  'destroy': function(obj) { return { type: {inverted:false, value:'Delete'}, parameters:[obj, ''] }; },
  'spawn': function(obj, x, y) { return { type: {inverted:false, value:'CreateObject'}, parameters:[obj, String(x), String(y)] }; },
  'move_to': function(obj, x, y) { return { type: {inverted:false, value:'MettreXY'}, parameters:[obj, '=', String(x), '=', String(y)] }; },
  'jump': function(obj, strength) { return { type: {inverted:false, value:'AddForce'}, parameters:[obj, 'Up', String(strength||500)] }; },
  'flip': function(obj, dir) { return { type: {inverted:false, value:'FlipX'}, parameters:[obj, dir==='left'?'yes':'no'] }; },

  // Variables
  'set_var': function(name, op, value) { return { type: {inverted:false, value:'SetVariable'}, parameters:[name, op||'=', String(value)] }; },
  'score': function(op, n) { return { type: {inverted:false, value:'SetVariable'}, parameters:['Score', op||'+', String(n)] }; },

  // Animation
  'animate': function(obj, animName) { return { type: {inverted:false, value:'ChangeAnimation'}, parameters:[obj, '=', animName] }; },

  // Camera
  'camera_follow': function(obj) { return { type: {inverted:false, value:'CameraX'}, parameters:['', '=', obj+'.X()'] }; },

  // Text
  'set_text': function(obj, text) { return { type: {inverted:false, value:'TextObject::String'}, parameters:[obj, '=', text] }; },

  // Scene
  'change_scene': function(name) { return { type: {inverted:false, value:'ChangeScene'}, parameters:[name] }; },
  'restart': function() { return { type: {inverted:false, value:'ResetGame'}, parameters:[] }; },

  // Platformer input simulation
  'sim_left': function(obj) { return { type: {inverted:false, value:'PlatformBehavior::SimulateLeftKey'}, parameters:[obj, 'PlatformerObject'] }; },
  'sim_right': function(obj) { return { type: {inverted:false, value:'PlatformBehavior::SimulateRightKey'}, parameters:[obj, 'PlatformerObject'] }; },
  'sim_jump': function(obj) { return { type: {inverted:false, value:'PlatformBehavior::SimulateJumpKey'}, parameters:[obj, 'PlatformerObject'] }; },
};
