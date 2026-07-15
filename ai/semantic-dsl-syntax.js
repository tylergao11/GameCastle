var LANGUAGE_ID = 'semantic-dsl-v1';
var READ_COMMANDS = ['retrieve'];
var WRITE_COMMANDS = ['game', 'entity', 'component', 'member', 'event', 'when', 'then', 'asset', 'layout', 'policy', 'remove'];
var COMPLETION_COMMANDS = ['complete'];
var ALL_COMMANDS = READ_COMMANDS.concat(WRITE_COMMANDS, COMPLETION_COMMANDS);

var READ_LINES = [
  'retrieve(group=...gHandle, kind=...oneExtensionKind)',
];
var WRITE_LINES = [
  'game(semanticId=...semanticId, name=...name)',
  'entity(semanticId=...semanticId, roles=...nonEmptyStringArray, kind=...entityKind, behaviors=...stringArray)',
  'component(semanticId=...semanticId, kind=...componentHandle, target=...entityOptional, config=...object, bindings={...bindingName:{"use":...actionOrConditionUse,"arguments":{...parameter:value}}})',
  'member(entity=...entity, semanticId=...semanticId, roles=...nonEmptyStringArray, value=...value, bindings=...stringArray)',
  'asset(semanticId=...semanticId, roles=...nonEmptyStringArray, subject=...subject, description=...description, family=...fHandle, style=...sHandle, constraints=...object, bindings=...stringArray)',
  'layout(semanticId=...semanticId, roles=...nonEmptyStringArray, subject=...subject, bounds={"width":...positiveNumber,"height":...positiveNumber}, relations=...relationArray, bindings=...stringArray)',
  'policy(degree=...degree, mode=percentage|absolute, value=...positiveNumber)',
  'remove(collection=entities|components|events|assetIntents|layoutIntents, semanticId=...semanticId)',
];
var ROOT_EVENT_LINES = [
  'event(semanticId=...semanticId, kind=...eventKind, locals={...semanticId:value}, ...eventParameter=value)'
];
var CHILD_EVENT_LINES = [
  'event(semanticId=...semanticId, kind=...eventKind, parent=...existingParentEvent, locals={...semanticId:value}, ...eventParameter=value)'
];
var EVENT_LOGIC_LINES = [
  'when(event=...event, use=...conditionUse, not=...booleanOptional, ...parameter=value, replace=...existingConditionOperationIdOptional)',
  'then(event=...event, use=...actionUse, await=...booleanOptional, ...parameter=value, replace=...existingActionOperationIdOptional)'
];
var COMPLETION_LINES = [
  'complete()'
];
var LINES = READ_LINES.concat(WRITE_LINES, ROOT_EVENT_LINES, CHILD_EVENT_LINES, EVENT_LOGIC_LINES, COMPLETION_LINES);

module.exports = { LANGUAGE_ID: LANGUAGE_ID, READ_COMMANDS: READ_COMMANDS, WRITE_COMMANDS: WRITE_COMMANDS, COMPLETION_COMMANDS: COMPLETION_COMMANDS, ALL_COMMANDS: ALL_COMMANDS, READ_LINES: READ_LINES, WRITE_LINES: WRITE_LINES, ROOT_EVENT_LINES: ROOT_EVENT_LINES, CHILD_EVENT_LINES: CHILD_EVENT_LINES, EVENT_LOGIC_LINES: EVENT_LOGIC_LINES, COMPLETION_LINES: COMPLETION_LINES, LINES: LINES };
