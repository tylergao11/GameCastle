var assert = require('assert');
var extensions = require('./comfyui-extension-registry');
var workflow = require('../shared/comfyui-workflow-registry.json').workflows['gamecastle.sprite-generate.dev-cpu.v1'];
assert.deepEqual(extensions.compile([], workflow, 'gamecastle.style-dna.v1'), []);
assert.throws(function() { extensions.compile([{ id: 'unknown' }], workflow, 'gamecastle.style-dna.v1'); }, /not registered/);
assert.throws(function() { extensions.compile([{ id: 'gamecastle.style-dna.v1.sd15-lora.v1', path: 'C:\\arbitrary.safetensors' }], workflow, 'gamecastle.style-dna.v1'); }, /may contain only/);
assert.throws(function() { extensions.compile([{ id: 'gamecastle.style-dna.v1.sd15-lora.v1' }], workflow, 'gamecastle.style-dna.v1'); }, /not approved/);
assert.throws(function() { extensions.compile([{ id: 'gamecastle.edge.sd15-controlnet.v1', inputKind: 'url', inputRef: { refId: 'x' } }], workflow, 'gamecastle.style-dna.v1'); }, /not approved/);
console.log('[ComfyUIExtensionRegistry] ID-only, workflow/style scope, and unapproved artifact denial passed');
