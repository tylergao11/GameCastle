function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'ProductDomainAdapters'; throw error; }

function create(options) {
  options = options || {};
  if (!options.semanticRuntime || typeof options.semanticRuntime.invoke !== 'function') fail('PRODUCT_DOMAIN_ADAPTER_INVALID', 'semantic.design requires SemanticLLM2Runtime.invoke.');
  if (!options.assetPipeline || typeof options.assetPipeline.run !== 'function') fail('PRODUCT_DOMAIN_ADAPTER_INVALID', 'asset.realize requires the canonical asset pipeline run(input).');
  if (!options.spatialPipeline || typeof options.spatialPipeline.run !== 'function') fail('PRODUCT_DOMAIN_ADAPTER_INVALID', 'assembly.verify requires the canonical spatial pipeline run(input).');
  if (!options.browserCapture || typeof options.browserCapture.capture !== 'function') fail('PRODUCT_DOMAIN_ADAPTER_INVALID', 'assembly.verify requires product-owned browser capture.');
  if (!options.assemblyReviewer || typeof options.assemblyReviewer.review !== 'function') fail('PRODUCT_DOMAIN_ADAPTER_INVALID', 'assembly.verify requires an independent AssemblyReviewer.');
  return {
    semantic: {
      invoke: function(input) { return options.semanticRuntime.invoke(input); }
    },
    asset: {
      invoke: function(input) { return options.assetPipeline.run(input); }
    },
    assembly: {
      invoke: async function(input) {
        input = input || {};
        var spatialProduct;
        try {
          spatialProduct = await options.spatialPipeline.run(input.spatial);
          if (typeof input.onSpatialAccepted === 'function') await input.onSpatialAccepted(spatialProduct);
        }
        catch (error) { error.domainStage = 'spatial'; throw error; }
        var browserCapture, assemblyReview, assemblyAttempt;
        try {
          assemblyAttempt = typeof input.beginAssembly === 'function' ? await input.beginAssembly() : null;
          browserCapture = await options.browserCapture.capture({ assetProduct: input.assetProduct, spatialProduct: spatialProduct, outputDir: input.browserDir });
          assemblyReview = await options.assemblyReviewer.review({ requestNamespace: input.requestNamespace, projectId: input.projectId, assetProduct: input.assetProduct, spatialProduct: spatialProduct, browserEvidence: browserCapture, assetCards: input.assetCards });
        } catch (error) { error.domainStage = 'assembly'; throw error; }
        return { schemaVersion: 1, documentKind: 'assembly-verification-result', spatialProduct: spatialProduct, browserCapture: browserCapture, assemblyReview: assemblyReview, assemblyAttempt: assemblyAttempt };
      }
    }
  };
}

module.exports = { create: create };
