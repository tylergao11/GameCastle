// Facade: product total scheduler is the LangGraph implementation.
// Kept so existing require paths resolve to the real graph runtime.

var langgraph = require('./product-dispatch-langgraph');

module.exports = {
  SCHEMA_VERSION: langgraph.SCHEMA_VERSION,
  DOCUMENT_KIND: langgraph.DOCUMENT_KIND,
  DEFAULT_MAX_ROUNDS: langgraph.DEFAULT_MAX_DECIDES,
  DEFAULT_MAX_DECIDES: langgraph.DEFAULT_MAX_DECIDES,
  create: langgraph.create
};
