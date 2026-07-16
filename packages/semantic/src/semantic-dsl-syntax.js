var taskPlan = require('./semantic-task-plan');

var LANGUAGE_ID = taskPlan.LANGUAGE_ID;
var PLAN_COMMANDS = taskPlan.PLAN_COMMANDS;
var WRITE_COMMANDS = ['game', 'entity', 'component', 'member', 'event', 'when', 'then', 'asset', 'layout', 'policy', 'remove'];
var COMPLETION_COMMANDS = ['complete'];
var ALL_COMMANDS = PLAN_COMMANDS.concat(WRITE_COMMANDS, COMPLETION_COMMANDS);

var PLAN_LINES = taskPlan.PLAN_LINES;
var WRITE_LINES = [
  'game(semanticId=...semanticId, name=...name)',
  'entity(semanticId=...semanticId, roles=...nonEmptyStringArray, kind=...entityKind, behaviors=...stringArray)',
  'component(semanticId=...semanticId, kind=...componentHandle, target=...entityOptional, config=...object, bindings={...bindingName:{"use":...actionOrConditionUse,"arguments":{...parameter:value}}})',
  'member(entity=...entity, semanticId=...semanticId, roles=...nonEmptyStringArray, value=...value, bindings=...stringArray)',
  'asset(semanticId=...semanticId, roles=...nonEmptyStringArray, subject=...subject, description=...description, family=...fHandle, style=...sHandle, constraints=...object, animation=...objectOptional, bindings=...stringArray)',
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
var LINES = PLAN_LINES.concat(WRITE_LINES, ROOT_EVENT_LINES, CHILD_EVENT_LINES, EVENT_LOGIC_LINES, COMPLETION_LINES);

module.exports = { LANGUAGE_ID: LANGUAGE_ID, PLAN_COMMANDS: PLAN_COMMANDS, WRITE_COMMANDS: WRITE_COMMANDS, COMPLETION_COMMANDS: COMPLETION_COMMANDS, ALL_COMMANDS: ALL_COMMANDS, PLAN_LINES: PLAN_LINES, WRITE_LINES: WRITE_LINES, ROOT_EVENT_LINES: ROOT_EVENT_LINES, CHILD_EVENT_LINES: CHILD_EVENT_LINES, EVENT_LOGIC_LINES: EVENT_LOGIC_LINES, COMPLETION_LINES: COMPLETION_LINES, LINES: LINES };
