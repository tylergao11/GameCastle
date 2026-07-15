var crypto = require('crypto');

function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24); }
function readable(value, limit) { var result = String(value).replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, ''); return (result || 'value').slice(0, limit); }
function generatedName(prefix, semanticId) { var identity = String(prefix) + '\u0000' + String(semanticId); return readable(prefix, 40) + '_' + readable(semanticId, 48) + '_' + hash(identity).slice(0, 12); }
function entityObjectName(entityId) { return generatedName('entity', entityId); }
function memberVariableName(entityId, memberId) { return generatedName('member_' + entityId, memberId); }
function behaviorName(entityId, behaviorTypeRef) { return generatedName('behavior_' + entityId, hash(behaviorTypeRef)); }

module.exports = { hash: hash, generatedName: generatedName, entityObjectName: entityObjectName, memberVariableName: memberVariableName, behaviorName: behaviorName };
