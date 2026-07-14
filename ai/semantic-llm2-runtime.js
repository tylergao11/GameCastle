var documentContract = require('./semantic-document-contract.json');
var prompt = require('./semantic-llm2-prompt');
var sourceContract = require('./game-semantic-source');
var contextProvider = require('./semantic-context-provider');
var providerRuntime = require('./provider-runtime');
var runtimeLinker = require('./semantic-runtime-linker');
var feedbackContract = require('./semantic-feedback-contract');

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticLLM2Runtime'; throw error; }
function semanticDocumentSchema() {
  return {
    name: 'game_semantic_document',
    schema: {
      type: 'object',
      required: ['schemaVersion', 'documentKind'],
      properties: {
        schemaVersion: { type: 'integer', const: 2 },
        documentKind: { enum: [documentContract.sourceDocumentKind, documentContract.revisionDocumentKind, contextProvider.REQUEST_KIND] }
      },
      additionalProperties: true
    }
  };
}
function parse(text) {
  if (typeof text !== 'string' || !text.trim()) fail('SEMANTIC_LLM2_JSON_EMPTY', 'LLM2 returned no JSON document.');
  try { return JSON.parse(text); }
  catch (error) { fail('SEMANTIC_LLM2_JSON_INVALID', 'LLM2 returned invalid JSON: ' + error.message); }
}
function create(options) {
  options = options || {};
  var runtime = options.providerRuntime || providerRuntime.createProviderRuntime();
  async function invoke(input) {
    input = input || {};
    if (input.feedback !== undefined) fail('SEMANTIC_LLM2_LEGACY_FEEDBACK_FIELD', 'Use feedbackBatch with the semantic-feedback-batch contract.');
    if (!input.world || typeof input.world !== 'object') fail('SEMANTIC_LLM2_WORLD_REQUIRED', 'LLM2 requires a semantic world baseline or diff.');
    var feedbackBatch = input.feedbackBatch === undefined ? null : feedbackContract.validate(input.feedbackBatch, {
      source: input.source || null,
      sourceHash: input.source ? sourceContract.sourceHash(input.source) : null,
      structureHash: input.world && input.world.world && input.world.world.structureHash || input.world && input.world.structureHash || null
    });
    var result = await runtime.invokeRole({
      requestId: input.requestId || 'semantic-llm2',
      projectId: input.projectId || 'local-session',
      role: 'semantic-design',
      provider: input.provider,
      model: input.model,
      estimatedCost: input.estimatedCost,
      timeoutMs: input.timeoutMs,
      maxAttempts: input.maxAttempts || 1,
      input: {
        messages: [
          { role: 'system', content: prompt.buildSystemPrompt() },
          { role: 'user', content: prompt.buildUserPrompt(Object.assign({}, input, { feedbackBatch: feedbackBatch })) }
        ],
        maxTokens: input.maxTokens || 4096,
        jsonSchema: semanticDocumentSchema()
      }
    });
    if (!result.ok) return result;
    var document = parse(result.output && result.output.text);
    if (document.documentKind === documentContract.sourceDocumentKind) {
      var source = sourceContract.validateSource(document, { index: input.index });
      document = { source: source, assembly: runtimeLinker.assemble(source, { index: input.index }) };
    }
    else if (document.documentKind === documentContract.revisionDocumentKind) {
      if (!input.source) fail('SEMANTIC_LLM2_SOURCE_REQUIRED', 'LLM2 revision validation requires the complete current GameSemanticSource.');
      var revisedSource = sourceContract.applyRevision(input.source, document, { index: input.index });
      document = { source: revisedSource, revision: document, assembly: runtimeLinker.assemble(revisedSource, { index: input.index }) };
    } else if (document.documentKind === contextProvider.REQUEST_KIND) document = contextProvider.execute(document, { index: input.index });
    else fail('SEMANTIC_LLM2_DOCUMENT_KIND_INVALID', 'LLM2 returned an unsupported semantic document kind.');
    return { ok: true, document: document, receipt: result.receipt };
  }
  return { invoke: invoke, semanticDocumentSchema: semanticDocumentSchema };
}
module.exports = { create: create, semanticDocumentSchema: semanticDocumentSchema, parse: parse };
