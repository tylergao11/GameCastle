var crypto = require('crypto');
var dictionary = require('../shared/wp2-fun-blueprint-dictionary.json');
var mechanics = require('./mechanic-registry');
var semanticRefs = require('./semantic-reference-resolver');
function stable(value, omitHash) { if (Array.isArray(value)) return '[' + value.map(function(item) { return stable(item, omitHash); }).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).filter(function(key) { return !(omitHash && key === 'contentHash'); }).sort().map(function(key) { return JSON.stringify(key) + ':' + stable(value[key], omitHash); }).join(',') + '}'; return JSON.stringify(value); }
function hash(value) { return crypto.createHash('sha256').update(stable(value, true)).digest('hex'); }
function revision(id, number) { var item = dictionary.blueprints[id] && dictionary.blueprints[id][String(number)]; if (!item) throw new Error('Unknown FunBlueprint revision: ' + id + '@' + number); return item; }
function validate(item) { if (item.status !== 'approved') throw new Error('FunBlueprint is not approved: ' + item.blueprintId + '@' + item.revision); if (item.contentHash !== hash(item)) throw new Error('FunBlueprint content hash mismatch: ' + item.blueprintId + '@' + item.revision); (item.familyAffinities || []).forEach(function(affinity) { if (!dictionary.families[affinity.familyRef]) throw new Error('Unknown FunBlueprint family: ' + affinity.familyRef); }); semanticRefs.assertAll(item.requiredSemanticRefs || []); (item.mechanicSlots || []).forEach(function(slot) { (slot.requiredMechanicRevisionRefs || []).concat(slot.allowedSubstitutionRevisionRefs || []).forEach(mechanics.resolve); }); return item; }
function approved(id, number) { return validate(revision(id, number)); }
function allApproved() { return Object.keys(dictionary.blueprints).sort().map(function(id) { return approved(id, Math.max.apply(null, Object.keys(dictionary.blueprints[id]).map(Number))); }); }
module.exports = { dictionary: dictionary, stable: stable, hash: hash, revision: revision, approved: approved, allApproved: allApproved };
