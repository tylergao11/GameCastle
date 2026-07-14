# Asset and provider operations

## Runtime policy

Asset generation is optional. A development machine without a GPU can run all semantic compilation, dictionary, layout, asset-binding, provider, and API tests. Do not invoke image generation merely to satisfy an assembly path.

The asset engine has two explicit acceptance paths:

1. Image assets may use the configured image provider and must pass deterministic pixel checks plus review-loop acceptance.
2. Non-image resources are accepted only from a local file that matches the semantic requirement's declared resource kind, format, SHA-256, and source hash.

Both paths produce an accepted `semantic-asset-world`; missing input becomes a blocking debt, never a placeholder or type conversion.

## Provider boundary

`ProviderRuntime` owns provider authorization, endpoints, secrets, cost reservation, and safe receipts. Semantic design calls use the `semantic-design` role and strict JSON output. Provider receipts do not contain raw prompts, binary assets, or secrets.

External access must be enabled deliberately through the provider policy and environment configuration. The default local development path remains deterministic and does not silently access a network service.

## GPU workstations

GPU-dependent ComfyUI validation belongs on the controlled GPU worker. Before using it, prepare the pinned local toolchain and run the relevant provider checks there. The non-GPU workstation must not claim GPU validation passed and must not substitute simulated images into a publishable asset world.

## Local derivation

Local image operations are registered deterministic handlers. An unavailable operation returns an explicit error. See [Local Derivation Kernel](local-derivation-kernel.md).

## Verification

```powershell
npm run check:semantic-engine
npm run check:provider
```
