# Finding 28: Inconsistent acronym/casing across node folders, credential filenames, operation files, and resource folder

| Field | Value |
|---|---|
| Category | Folder/File Structure & Naming |
| Severity | medium |
| Status | Confirmed |
| Confidence | high |
| Affected files | `nodes/IvantiNeuronsForITSM/` (folder), `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.ts:35`, `credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts:9-10`, `credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:22-23`, `nodes/IvantiNeuronsForITSM/actions/search/index.ts:2-7,21,27,33`, `nodes/IvantiNeuronsForITSM/actions/search/fulltextsearchinsingleobject.operation.ts` (filename), `nodes/IvantiNeuronsForITSM/actions/search/fulltextsearchacrossallobjects.operation.ts` (filename), `nodes/IvantiNeuronsForITSM/actions/search/savedsearch.operation.ts` (filename), `nodes/IvantiNeuronsForITSM/actions/node.type.ts:9-10`, `nodes/IvantiNeuronsForITSM/actions/object/` (folder) + `object/index.ts:61`, `nodes/IvantiNeuronsForITSM/actions/router.ts:7,41-42`, `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.ts:69-71`, `package.json:38-46` |

## Problem

Naming is inconsistent across four distinct axes. Each was verified against the live repository.

**1. Node folder acronym casing.** The two node folders disagree on how to render the "ITSM" acronym:

```
nodes/IvantiNeuronsForITSM/            <- all-caps acronym
nodes/IvantiNeuronsForItsmConnector/   <- Title-cased "Itsm"
```

Worse, *inside* the all-caps `IvantiNeuronsForITSM/` folder, the files themselves use Title-cased `Itsm`, so the folder and its own contents disagree:

```
nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.ts
nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.json
nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts
```

The class itself uses `Itsm` (`IvantiNeuronsForItsm.node.ts:35`):

```ts
export class IvantiNeuronsForItsm implements INodeType {
```

**2. Credential filename + class casing.** n8n convention (see `.agents/credentials.md`) is a PascalCase filename whose name matches the exported class. One credential follows it, the other does not:

```
credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts   <- PascalCase (correct)
credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts          <- camelCase (wrong)
```

In `credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts:9-10` even the exported *class* is camelCase, which is non-idiomatic for a TypeScript class:

```ts
export class ivantiNeuronsForItsmApiKeyApi implements ICredentialType {
	name = 'ivantiNeuronsForItsmApiKeyApi';
```

(Note: the internal `name` strings — `'ivantiNeuronsForItsmApiKeyApi'` and `'ivantiNeuronsForItsmConnectorAuthApi'` — are correctly camelCase and must NOT change; they are the credential type identifiers referenced by nodes and stored on existing credential records.)

**3. Search operation files use run-together lowercase.** Every other resource uses camelCase operation files (`getMany.operation.ts`, `getByRecId.operation.ts`, `searchByKeyword.operation.ts`), but the `search` resource uses run-together lowercase:

```
actions/search/fulltextsearchinsingleobject.operation.ts
actions/search/fulltextsearchacrossallobjects.operation.ts
actions/search/savedsearch.operation.ts
```

These names propagate into the union type (`actions/node.type.ts:9`):

```ts
search: 'fulltextsearchinsingleobject' | 'fulltextsearchacrossallobjects' | 'savedsearch';
```

and into the user-visible operation `value`s (`actions/search/index.ts:21,27,33`), which are what get persisted into saved workflows:

```ts
{ name: 'Full Text Search in Single Object', value: 'fulltextsearchinsingleobject', ... },
{ name: 'Full Text Search Across All Objects', value: 'fulltextsearchacrossallobjects', ... },
{ name: 'Saved Search', value: 'savedsearch', ... },
```

**4. Resource folder name does not match its resource value.** The Business Object resource folder is `object/` and is imported as `object`, but the resource `value`/discriminant is `businessobject`:

- `actions/object/index.ts:61` → `resource: ['businessobject']`
- `actions/node.type.ts:10` → `businessobject: 'getMany' | ...`
- `actions/router.ts:7` → `import * as object from './object';`
- `actions/router.ts:41-42` → `case 'businessobject': returnData = await object[ivanti.operation].execute.call(this);`
- `IvantiNeuronsForItsm.node.ts:69-71` → `{ name: 'Business Object', value: 'businessobject' }`

So the on-disk folder (`object`) and the import alias (`object`) differ from the resource key (`businessobject`) used everywhere else.

## Why it matters

- **Maintainability / onboarding friction.** Three different renderings of the same product acronym (`ITSM`, `Itsm`, `itsm`) and two different operation-naming styles force every contributor to remember which spelling applies where. Grep/IDE navigation breaks: searching for `IvantiNeuronsForItsm` will not surface the `IvantiNeuronsForITSM/` folder path, and the `object/` ↔ `businessobject` split means the resource value cannot be located by folder name.
- **Cloud-submission / lint risk.** n8n's community-node verification and the project's own `.agents/credentials.md` expect PascalCase credential class names matching the filename. The camelCase class `ivantiNeuronsForItsmApiKeyApi` is non-idiomatic and a likely reviewer flag.
- **`package.json` coupling.** `package.json:38-46` hard-codes every node/credential path. Any rename must be mirrored there in lockstep or n8n fails to load the package at runtime (the `dist/...` paths would point at non-existent files).
- **Breaking-change trap.** The run-together operation `value`s are stored verbatim in users' saved workflows. Renaming them (axis 3) and/or the `businessobject` resource value (axis 4) silently breaks existing workflows, so these specific renames are *workflow-breaking* and must be weighed against their benefit and documented.

## Resolution

Standardize on **`Itsm`** for the acronym (matches the existing class names and the Connector folder, and is the lowest-churn choice) and **camelCase** for operation files/values. Split the work into two tiers: non-breaking internal renames (do now) and breaking value renames (defer / decide deliberately).

### Tier A — Non-breaking renames (safe; do these)

These change only file/folder/class names and the import paths/aliases that reference them. No persisted workflow value changes.

**A1. Rename the node folder to match its contents.**

```
git mv nodes/IvantiNeuronsForITSM nodes/IvantiNeuronsForItsm
```

Then update the four `n8n.nodes` paths in `package.json:42-45`.

BEFORE (`package.json:41-46`):
```json
"nodes": [
	"dist/nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.js",
	"dist/nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.js",
	"dist/nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnector.node.js",
	"dist/nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.js"
]
```

AFTER:
```json
"nodes": [
	"dist/nodes/IvantiNeuronsForItsm/IvantiNeuronsForItsm.node.js",
	"dist/nodes/IvantiNeuronsForItsm/IvantiNeuronsForItsmTrigger.node.js",
	"dist/nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnector.node.js",
	"dist/nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.js"
]
```

**A2. Rename the API-key credential file and PascalCase its class** (keep the internal `name` string unchanged).

```
git mv credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts credentials/IvantiNeuronsForItsmApiKeyApi.credentials.ts
```

BEFORE (`credentials/IvantiNeuronsForItsmApiKeyApi.credentials.ts:9-10`):
```ts
export class ivantiNeuronsForItsmApiKeyApi implements ICredentialType {
	name = 'ivantiNeuronsForItsmApiKeyApi';
```

AFTER:
```ts
export class IvantiNeuronsForItsmApiKeyApi implements ICredentialType {
	name = 'ivantiNeuronsForItsmApiKeyApi';   // UNCHANGED: this is the credential type id
```

Update the `n8n.credentials` path in `package.json:39`.

BEFORE (`package.json:37-40`):
```json
"credentials": [
	"dist/credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.js",
	"dist/credentials/ivantiNeuronsForItsmApiKeyApi.credentials.js"
],
```

AFTER:
```json
"credentials": [
	"dist/credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.js",
	"dist/credentials/IvantiNeuronsForItsmApiKeyApi.credentials.js"
],
```

The node's `credentials` reference (`IvantiNeuronsForItsm.node.ts:53`) uses the `name` string `'ivantiNeuronsForItsmApiKeyApi'`, which is unchanged, so no edit is needed there. (Grep `ivantiNeuronsForItsmApiKeyApi` across `nodes/` to confirm all consumers reference the string, not the class.)

**A3. (Optional, non-breaking) Rename the `object/` folder to `businessObject/`** so the folder matches the resource key, and update only the import. The resource *value* `businessobject` stays the same, so workflows are unaffected.

```
git mv nodes/IvantiNeuronsForItsm/actions/object nodes/IvantiNeuronsForItsm/actions/businessObject
```

BEFORE (`actions/router.ts:7,41-42`):
```ts
import * as object from './object';
...
case 'businessobject':
	returnData = await object[ivanti.operation].execute.call(this);
```

AFTER:
```ts
import * as businessObject from './businessObject';
...
case 'businessobject':
	returnData = await businessObject[ivanti.operation].execute.call(this);
```

Apply the same import-alias rename in `IvantiNeuronsForItsm.node.ts:11` (`import * as object from './actions/object';` → `import * as businessObject from './actions/businessObject';`) and at its use site `...object.description,` (`:91`) → `...businessObject.description,`.

### Tier B — Breaking value renames (decide deliberately; requires CHANGELOG)

Renaming operation `value`s (and optionally the `businessobject` resource value) is a **breaking change** for saved workflows. If you choose to do it, do all of the following in one release and bump the version with a CHANGELOG entry.

**B1. Rename the three search operation files and their values to camelCase.**

```
git mv nodes/IvantiNeuronsForItsm/actions/search/fulltextsearchinsingleobject.operation.ts   .../fullTextSearchInSingleObject.operation.ts
git mv nodes/IvantiNeuronsForItsm/actions/search/fulltextsearchacrossallobjects.operation.ts .../fullTextSearchAcrossAllObjects.operation.ts
git mv nodes/IvantiNeuronsForItsm/actions/search/savedsearch.operation.ts                    .../savedSearch.operation.ts
```

BEFORE (`actions/search/index.ts:2-7`):
```ts
import * as fulltextsearchinsingleobject from './fulltextsearchinsingleobject.operation';
import * as fulltextsearchacrossallobjects from './fulltextsearchacrossallobjects.operation';
import * as savedsearch from './savedsearch.operation';

export { fulltextsearchinsingleobject, fulltextsearchacrossallobjects, savedsearch };
```

AFTER:
```ts
import * as fullTextSearchInSingleObject from './fullTextSearchInSingleObject.operation';
import * as fullTextSearchAcrossAllObjects from './fullTextSearchAcrossAllObjects.operation';
import * as savedSearch from './savedSearch.operation';

export { fullTextSearchInSingleObject, fullTextSearchAcrossAllObjects, savedSearch };
```

BEFORE (`actions/search/index.ts:21,27,33` — the persisted values):
```ts
value: 'fulltextsearchinsingleobject',
value: 'fulltextsearchacrossallobjects',
value: 'savedsearch',
```

AFTER:
```ts
value: 'fullTextSearchInSingleObject',
value: 'fullTextSearchAcrossAllObjects',
value: 'savedSearch',
```

Also update the spread references at the bottom of `index.ts:46-48` and the `default:` at `:39`, and update the union type (`actions/node.type.ts:9`):

BEFORE:
```ts
search: 'fulltextsearchinsingleobject' | 'fulltextsearchacrossallobjects' | 'savedsearch';
```

AFTER:
```ts
search: 'fullTextSearchInSingleObject' | 'fullTextSearchAcrossAllObjects' | 'savedSearch';
```

The router (`actions/router.ts:39`) dispatches via `search[ivanti.operation].execute`, so it picks up the renamed exports automatically once the union and the `export { ... }` names match.

**B2. (Optional) Rename the resource value `businessobject` → `businessObject`.** This touches the resource value at `IvantiNeuronsForItsm.node.ts:70` and `:89` (default), the `displayOptions.show.resource` at `object/index.ts:61` (and every other operation file's `displayOptions` under that resource), the `case 'businessobject'` at `router.ts:41`, and the union key at `node.type.ts:10`. Because this is the highest-blast-radius rename and breaks every saved Business Object workflow, weigh it carefully — it may be acceptable to leave the resource value as `businessobject` and only fix the folder name (A3).

**B3. CHANGELOG.** `CHANGELOG.md` currently exists but is empty (0 bytes). Add an entry for the new version, e.g.:

```md
## [1.1.0] - 2026-06-13
### Changed (BREAKING)
- Renamed Search operation values to camelCase: `fulltextsearchinsingleobject` -> `fullTextSearchInSingleObject`,
  `fulltextsearchacrossallobjects` -> `fullTextSearchAcrossAllObjects`, `savedsearch` -> `savedSearch`.
  Existing workflows using these operations must be re-selected.
### Changed (internal, non-breaking)
- Standardized node folder/credential/class casing on "Itsm" (PascalCase credential class).
```

## Verification

1. **Type/lint/build:** run `npm run lint` then `npm run build` (which is `n8n-node build`) from the repo root. A successful build proves every renamed import path, alias, union member, and `package.json` path resolves — a stale path would fail TypeScript module resolution or the n8n loader.
2. **No dangling references to old names:**
   - `grep -rn "IvantiNeuronsForITSM" nodes/ credentials/ package.json` should return nothing after A1.
   - `grep -rn "class ivantiNeuronsForItsmApiKeyApi" credentials/` should return nothing after A2; `grep -rn "'ivantiNeuronsForItsmApiKeyApi'" nodes/ credentials/` should still find the credential `name`/node reference (string id intentionally unchanged).
   - After A3: `grep -rn "from './object'" nodes/` and `grep -rn "actions/object" nodes/` return nothing.
   - After B1: `grep -rn "fulltextsearch\|savedsearch" nodes/` returns nothing.
3. **Load smoke test:** confirm `package.json` `n8n.nodes` / `n8n.credentials` entries each point to a file that exists under `dist/` after build (`ls dist/credentials dist/nodes/IvantiNeuronsForItsm`). Optionally start n8n with the package linked and confirm both action nodes, both triggers, and both credentials appear and open without "node type not found" errors.
4. **Manual UI check (only if Tier B applied):** add the Search resource in a fresh workflow and confirm the three operations are selectable and execute; old saved workflows will show an "unrecognized operation" — expected and documented in CHANGELOG.

## Related findings

None.
