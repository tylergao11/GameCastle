// Product total scheduler wire language.
// One natural-language work order per round, routed to a domain executor.
// Distinct from director-dsl-v1 (fixed delivery stage DAG) and semantic-dsl-v9 (domain-internal dispatch).

var LANGUAGE_ID = 'product-dispatch-dsl-v1';
var ROUTES = Object.freeze(['semantic', 'asset']);
var ROUTE_OPERATIONS = Object.freeze({
  semantic: Object.freeze({ domain: 'semantic', operation: 'semantic.design' }),
  asset: Object.freeze({ domain: 'asset', operation: 'asset.realize' })
});

function fail(code, message) {
  var error = new Error(message);
  error.code = code;
  error.owner = 'ProductDispatchDSL';
  throw error;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail('PRODUCT_DISPATCH_DSL_INVALID', label + ' must be non-empty text.');
  return value.trim();
}

function id(value, label) {
  value = text(value, label);
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value)) fail('PRODUCT_DISPATCH_DSL_INVALID', label + ' must be a stable work-order id.');
  return value;
}

function unquoteGoal(raw) {
  raw = String(raw || '').trim();
  if (raw.length >= 2 && raw.charAt(0) === '"' && raw.charAt(raw.length - 1) === '"') {
    return raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return raw;
}

function quoteGoal(value) {
  return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function parseProgram(value) {
  value = text(value, 'Product Dispatch output');
  if (/^[\[{]/.test(value)) fail('PRODUCT_DISPATCH_DSL_JSON_FORBIDDEN', 'Product Dispatcher must emit product-dispatch-dsl-v1 commands, never JSON.');
  var lines = value.split(/\r?\n/).map(function(line) { return line.trim(); }).filter(Boolean);
  if (!lines.length) fail('PRODUCT_DISPATCH_DSL_EMPTY', 'Product Dispatcher emitted no command.');
  if (lines.length !== 1) fail('PRODUCT_DISPATCH_DSL_ONE_ONLY', 'Product Dispatcher must emit exactly one command per round.');
  var line = lines[0];
  if (/^dispatch-complete\s*$/.test(line) || /^dispatch-complete\(\s*\)$/.test(line)) {
    return validateProgram({ languageId: LANGUAGE_ID, kind: 'complete', task: null });
  }
  var task = /^dispatch-task\s+id=([a-zA-Z][a-zA-Z0-9_-]{0,63})\s+route=(semantic|asset)\s+goal=(.+)$/.exec(line);
  if (!task) {
    var paren = /^dispatch-task\(\s*id=([a-zA-Z][a-zA-Z0-9_-]{0,63})\s+route=(semantic|asset)\s+goal=(.+)\)\s*$/.exec(line);
    if (paren) task = paren;
  }
  if (!task) fail('PRODUCT_DISPATCH_DSL_INVALID', 'Line is outside product-dispatch-dsl-v1: expected dispatch-task or dispatch-complete.');
  var goal = unquoteGoal(task[3]);
  if (!goal) fail('PRODUCT_DISPATCH_DSL_INVALID', 'dispatch-task.goal must be non-empty natural language.');
  return validateProgram({
    languageId: LANGUAGE_ID,
    kind: 'task',
    task: { id: id(task[1], 'dispatch-task.id'), route: task[2], goal: goal }
  });
}

function validateProgram(program) {
  if (!program || typeof program !== 'object' || Array.isArray(program) || program.languageId !== LANGUAGE_ID) {
    fail('PRODUCT_DISPATCH_DSL_INVALID', 'Product dispatch program has an invalid shape.');
  }
  if (program.kind === 'complete') {
    if (program.task != null) fail('PRODUCT_DISPATCH_DSL_INVALID', 'dispatch-complete cannot carry a task.');
    return { languageId: LANGUAGE_ID, kind: 'complete', task: null };
  }
  if (program.kind !== 'task' || !program.task || typeof program.task !== 'object' || Array.isArray(program.task)) {
    fail('PRODUCT_DISPATCH_DSL_INVALID', 'dispatch-task program requires a task.');
  }
  var task = program.task;
  var taskId = id(task.id, 'dispatch-task.id');
  var route = text(task.route, 'dispatch-task.route');
  if (ROUTES.indexOf(route) < 0) fail('PRODUCT_DISPATCH_ROUTE_INVALID', 'dispatch-task.route must be semantic or asset.');
  var goal = text(task.goal, 'dispatch-task.goal');
  return {
    languageId: LANGUAGE_ID,
    kind: 'task',
    task: { id: taskId, route: route, goal: goal, domain: ROUTE_OPERATIONS[route].domain, operation: ROUTE_OPERATIONS[route].operation }
  };
}

function stringify(program) {
  program = validateProgram(program);
  if (program.kind === 'complete') return 'dispatch-complete';
  return 'dispatch-task id=' + program.task.id + ' route=' + program.task.route + ' goal=' + quoteGoal(program.task.goal);
}

function routeContract(route) {
  route = text(route, 'route');
  if (!ROUTE_OPERATIONS[route]) fail('PRODUCT_DISPATCH_ROUTE_INVALID', 'Unknown product dispatch route: ' + route);
  return Object.assign({ route: route }, ROUTE_OPERATIONS[route]);
}

module.exports = {
  LANGUAGE_ID: LANGUAGE_ID,
  ROUTES: ROUTES,
  ROUTE_OPERATIONS: ROUTE_OPERATIONS,
  parseProgram: parseProgram,
  validateProgram: validateProgram,
  stringify: stringify,
  routeContract: routeContract
};
