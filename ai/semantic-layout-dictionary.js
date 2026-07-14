var dictionary = require('../shared/semantic-layout-dictionary.json');
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function resolve(reference) { var relation = dictionary.relations[reference]; if (!relation) { var error = new Error('Unknown semantic layout relation: ' + reference); error.code = 'SEMANTIC_LAYOUT_REFERENCE_INVALID'; throw error; } return Object.assign({ semanticRef: reference }, clone(relation)); }
function list() { return Object.keys(dictionary.relations).sort().map(resolve); }
module.exports = { dictionary: dictionary, resolve: resolve, list: list };
