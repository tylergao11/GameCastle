var READ_COMMANDS = ['retrieve'];
var WRITE_COMMANDS = ['game', 'entity', 'member', 'event', 'when', 'then', 'asset', 'layout', 'policy', 'remove'];
var COMMIT_COMMANDS = ['commit'];
var ALL_COMMANDS = READ_COMMANDS.concat(WRITE_COMMANDS, COMMIT_COMMANDS);

var LINES = [
  '>retrieve(group=...gHandle, kind=...oneExtensionKind)',
  '>game(semanticId=...semanticId, name=...name)',
  '>entity(semanticId=...semanticId, roles=[...roles], kind=...entityKind, behaviors=[...behaviorKinds])',
  '>member(entity=...entity, semanticId=...semanticId, roles=[...roles], value=...value, bindings=[...operationUses])',
  '>event(semanticId=...semanticId, kind=...eventKind, parent=...parentEventOptional, locals={...semanticId:value}, ...eventSlot=value)',
  '>when(event=...event, use=...conditionUse, not=...booleanOptional, ...slot=value, slot=...existingSlotOptional)',
  '>then(event=...event, use=...actionUse, await=...booleanOptional, ...slot=value, slot=...existingSlotOptional)',
  '>asset(semanticId=...semanticId, roles=[...roles], subject=...subject, description=...description, family=...fHandle, style=...sHandle, constraints={...key:value}, bindings=[...operationUses])',
  '>layout(semanticId=...semanticId, roles=[...roles], subject=...subject, relations=[{"semanticId":...semanticId,"layout":...lHandle,"subjects":[...subjects]}], bindings=[...operationUses])',
  '>policy(degree=...degree, mode=percentage|absolute, value=...positiveNumber)',
  '>remove(collection=entities|events|assetIntents|layoutIntents, semanticId=...semanticId)',
  '>commit'
];

module.exports = { READ_COMMANDS: READ_COMMANDS, WRITE_COMMANDS: WRITE_COMMANDS, COMMIT_COMMANDS: COMMIT_COMMANDS, ALL_COMMANDS: ALL_COMMANDS, LINES: LINES };
