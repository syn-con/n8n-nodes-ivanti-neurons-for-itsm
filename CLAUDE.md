@AGENTS.md

# Project rules: Ivanti Neurons for ITSM community node

These rules are specific to this package and take precedence over the generic
guidance in `AGENTS.md` and `.agents/`.

## Package layout
- npm package: `@synergyconsulting/n8n-nodes-ivanti-neurons-for-itsm`
- Nodes (all **programmatic** style, all currently `version: 1`):
  - `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.ts`: the main action node.
    `execute` hands off to `actions/router.ts`, which calls
    `actions/<resource>/<operation>.operation.ts`
  - `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts`: the polling trigger
  - `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts`: the webhook trigger
- Shared code:
  - `transports/index.ts`: every HTTP call goes through `ivantiApiRequest`,
    `ivantiApiRequestAllItems`, `ivantiApiRequestAllItemsWithLimit`, `fetchRecords`,
    `ivantiApiRequestFormData` or `ivantiApiRequestBinary`. Never call
    `this.helpers.httpRequest*` from an operation
  - `common.ts`: validation helpers (`assertSafeFieldName`, `assertSafeRecordId`,
    `validateBusinessObject`, `escapeODataString`, `parseJsonObjectParameter`, …)
  - `odata/`: the shared OData list properties (`odataListProperties`) and
    `buildODataQuery`, used by Get Many and the polling trigger
  - `actions/requestOptions.ts`: the shared **Options → Override Headers** collection

## New features: use node versioning
Follow https://docs.n8n.io/connect/create-nodes/build-your-node/reference/versioning
(see also `.agents/versioning.md`).

Any new feature or behaviour change that could alter an **existing** workflow
must be added as a new **light version** of the node. Saved workflows keep the
version they were built with, and new workflows get the latest version.

1. Change `version` to an array that adds the new version, e.g. `version: 1`
   becomes `version: [1, 1.1]`. For a single node file with light versioning
   there is no separate `defaultVersion` to set: new workflows get the highest
   version in the array.
2. Show new parameters only on the new version with `@version` in `displayOptions`:
   ```ts
   displayOptions: { show: { '@version': [{ _cnd: { gte: 1.1 } }] } }
   ```
   To hide a parameter that the new version replaces, use the same condition
   with `lt`.
3. Branch behaviour in code on `this.getNode().typeVersion`, e.g.
   `if (this.getNode().typeVersion >= 1.1) { … }`. Always keep the old code
   path for older versions.
4. Read new parameters with a default value (`getNodeParameter(name, i, default)`)
   so older versions that don't show the parameter keep working.
5. Do **not** introduce full versioning (`VersionedNodeType` with `v1/`, `v2/`
   folders) unless explicitly asked.

When a new version isn't needed:
- Bug fixes that restore the intended behaviour.
- Purely additive optional parameters whose empty default leaves the request
  unchanged, such as a new entry in the Options collection.

If unsure, add a new version.

## n8n community review requirements
The package is submitted for n8n verification and is scanned with
`npx @n8n/scan-community-package @synergyconsulting/n8n-nodes-ivanti-neurons-for-itsm`.
- Trigger nodes must **not** set `usableAsTool`. The local lint rule
  `@n8n/community-nodes/node-usable-as-tool` demands it, so it is disabled on the
  trigger classes with a comment. Keep it that way.
- Use `NodeConnectionTypes.Main` for inputs/outputs, never the string `'main'`.
- Never re-throw a raw error in a `catch` block: throw
  `new NodeApiError(this.getNode(), error as JsonObject)` (an existing
  `NodeApiError` passes through unchanged).
- Never pass a value that may be `undefined` as the message of
  `NodeOperationError`. It crashes with "Cannot use 'in' operator to search for
  'description' in undefined". When the message comes from an Ivanti reply,
  provide a fallback string.

## Conventions in operations
- Every operation except the **Automation** resource must pass the per-item
  override headers to every transport call:
  `getOverrideHeaders.call(this, i)` (from `actions/requestOptions.ts`). If an
  `Authorization` header is overridden, the transport sends it instead of the
  credential's API key.
- Wrap each item in `try`/`catch` with `continueOnFail()` support, and add
  `{ itemData: { item: i } }` through `constructExecutionMetaData`.
- Validate every value placed in a URL or OData filter with the helpers in
  `common.ts`, which protects against injection.
- Ivanti may answer a successful request with an empty body (HTTP 204). Don't
  treat a missing field in the reply as a failure.
- Read `json`-type parameters with `parseJsonObjectParameter`. They arrive as
  text when typed and as an object when set by an expression.
- In `displayName` and `description` strings, avoid apostrophes inside
  single-quoted strings, and don't end a parameter `description` with a period
  (lint rule).

## Before finishing a change
Run all four and fix every error, warning and failing test:
```
npm run lint
npx tsc --noEmit -p .
npm run build
npm test
```
Several files use CRLF line endings. Keep a file's existing line endings when
editing it.

## Releasing
- Tags are bare version numbers (`1.4.3`, not `v1.4.3`) on `main`.
- For every release:
  1. Bump `version` in `package.json`. Use semver: a patch bump for fixes and
     a minor bump for new features. `package-lock.json` is stale and is not
     updated.
  2. Add a `## [x.y.z] - YYYY-MM-DD` section to `CHANGELOG.md` (Keep a Changelog
     format: Added / Changed / Fixed / Removed). Describe user-visible behaviour
     in plain language, naming the resource → operation and parameter.
  3. Update `README.md` when parameters or behaviour change.
  4. Commit to `main`, create the tag, and push both the branch and the tag.
- Pushing the tag runs `.github/workflows/publish.yml`, which publishes to npm
  with a provenance attestation (required by n8n). **Never run `npm publish`
  locally.** Check the result with `gh run list --workflow publish.yml` and
  `npm view @synergyconsulting/n8n-nodes-ivanti-neurons-for-itsm@<version> --prefer-online`.
