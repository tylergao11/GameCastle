# Local Derivation Kernel

`ai/local-derivation-kernel.js` executes only registered, project-local deterministic operations described by an `OperationSpec`.

The caller provides a complete operation specification. The kernel validates the operation, dispatches only to its registered handler, and returns an immutable receipt. An unregistered operation fails with `LOCAL_OPERATION_UNAVAILABLE`; it is not redirected to a cloud service or a model.

The kernel does not select assets, interpret game intent, modify `GameSemanticSource`, choose a repair, or bind resources to GDJS. Those boundaries remain with LLM2, the asset-production contract, and the source-hash-checked GDJS binder respectively.

All input and output paths are project-local. Derived raster outputs are explicit PNG artifacts with hash-backed receipts and must pass the normal asset acceptance path before runtime binding.
