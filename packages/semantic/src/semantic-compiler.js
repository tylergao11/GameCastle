var dictionary = require('./capability-semantic-dictionary');
var capabilityIr = require('./semantic-capability-ir');
var sourceContract = require('./game-semantic-source');

function eventConnection(event) {
  return {
    eventTypeRef: event.eventTypeRef,
    arguments: event.arguments,
    locals: event.locals,
    conditions: event.conditions.map(function(item) { return { semantic: item.semanticRef, arguments: item.arguments, channel: item.channel, inverted: item.inverted }; }),
    actions: event.actions.map(function(item) { return { semantic: item.semanticRef, arguments: item.arguments, channel: item.channel, awaited: item.awaited }; }),
    children: event.children.map(eventConnection)
  };
}
function compileEvent(registry, event) {
  return capabilityIr.compileEventConnection(registry, eventConnection(event));
}
function compile(source, options) {
  options = options || {};
  var index = options.index || dictionary.loadIndex();
  var valid = sourceContract.validateSource(source, { index: index });
  var registry = options.registry || capabilityIr.loadRegistry({ semanticIndex: index });
  return {
    schemaVersion: 2,
    compilerKind: 'semantic-source-to-gdjs-event-graph',
    sourceHash: sourceContract.sourceHash(valid),
    dictionarySource: valid.dictionarySource,
    events: valid.events.map(function(event) { return compileEvent(registry, event); }),
    entities: valid.entities.map(function(entity) { return { semanticId: entity.semanticId, roles: entity.roles.slice(), members: entity.members.map(function(member) { return { semanticId: member.semanticId, value: member.value }; }) }; })
  };
}
module.exports = { compile: compile };
