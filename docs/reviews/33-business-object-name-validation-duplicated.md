# Finding 33: 'Business object must end with s' validation hand-rolled across 8 sites with drifting messages and poor UX

| Field | Value |
|---|---|
| Category | DRY / Duplication |
| Severity | medium |
| Status | Confirmed |
| Confidence | high |
| Affected files | `nodes/IvantiNeuronsForITSM/actions/object/create.operation.ts:133-139`, `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:281-286`, `nodes/IvantiNeuronsForITSM/actions/object/update.operation.ts:146-152`, `nodes/IvantiNeuronsForITSM/actions/object/deleteByRecId.operation.ts:67-72`, `nodes/IvantiNeuronsForITSM/actions/object/getByRecId.operation.ts:69-74`, `nodes/IvantiNeuronsForITSM/actions/object/searchByKeyword.operation.ts:135-139`, `nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation.ts:98-103`, `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:251-260`. Field descriptions: `actions/object/create.operation.ts:30`, `update.operation.ts:31`, `deleteByRecId.operation.ts:26`, `getByRecId.operation.ts:27`, `relationship/link.operation.ts:31`, `relationship/unlink.operation.ts:30`, `relationship/getRelated.operation.ts:33`, `search/savedsearch.operation.ts:29`, `attachment/uploadAttachment.operation.ts:27` |

## Problem

The "business object must be plural / end with `s`" guard (with a preceding empty-check) is hand-rolled in **at least 8 execute/poll sites** (the canonical list of 7, plus `searchByKeyword.operation.ts` which the original finding missed). Each site re-implements the same two checks with **three different spellings of the condition** and **inconsistent messages**.

Empty-check spellings differ:

```ts
// create.operation.ts:133, update.operation.ts:146, deleteByRecId.operation.ts:67
if (!object) {
	throw new NodeOperationError(this.getNode(), 'The business object is required');
}

// getMany.operation.ts:281, getByRecId.operation.ts:69
if (object === '') {
	throw new NodeOperationError(this.getNode(), 'The "Business Object" parameter is required!');
}

// quickAction/run.operation.ts:98
if (businessObject === '') {
	throw new NodeOperationError(this.getNode(), 'The "Business Object" parameter is required!');
}

// IvantiNeuronsForItsmTrigger.node.ts:251
if (!object || !object.trim()) {
	throw new NodeOperationError(this.getNode(), 'The "Business Object" parameter is required');
}
```

Trailing-`s` spellings differ (`!object.endsWith('s')` vs `object.endsWith('s') === false`) and so do the messages (note the trigger drops "an" before `"s"`):

```ts
// create.operation.ts:137, update.operation.ts:150, deleteByRecId.operation.ts:70
if (object.endsWith('s') === false) {
	throw new NodeOperationError(this.getNode(), 'The business object must end with an "s" (e.g., "Incidents", "Changes")');
}

// getMany.operation.ts:284, getByRecId.operation.ts:72
if (!object.endsWith('s')) {
	throw new NodeOperationError(this.getNode(), 'The business object must end with an "s" (e.g., "Incidents", "Changes")');
}

// quickAction/run.operation.ts:101  — yet another message variant
if (businessObject.endsWith('s') === false) {
	throw new NodeOperationError(this.getNode(), 'The "Business Object" parameter must end with an "s" (e.g., "Incidents", "Changes")');
}

// IvantiNeuronsForItsmTrigger.node.ts:255  — "with \"s\"" (no "an")
if (!object.endsWith('s')) {
	throw new NodeOperationError(this.getNode(), 'The business object must end with "s" (e.g. "Incidents", "Changes")');
}
```

On top of the duplication, the **field descriptions are ungrammatical** ("Should be end 's'"), and the requirement is expressed differently again for the attachment flow (which uses `#`, not `s`):

```ts
// actions/object/getByRecId.operation.ts:27 (and link/unlink/getRelated/update/deleteByRecId)
description: "The business object to retrieve, e.g., 'Incident'. Should be end 's' like 'Incidents' or 'Changes'.",

// actions/attachment/uploadAttachment.operation.ts:27 — the "#" variant of the same plural rule
description: "The type of the business object, e.g., 'Incident'. Should be end '#' like 'Incident#' or 'Change#'.",
```

Note `quickAction/run.operation.ts:119` also derives the `#` form from the plural name at runtime (`businessObject.replace('s', '#')`), so two encodings of the same rule coexist.

There is **no shared helper** today; `common.ts` only exports `assertSafeFieldName` (lines 64-68), which is the established precedent for this kind of `this`-bound validation helper.

## Why it matters

- **Maintainability:** Eight copies of the same two-line guard means any change to the rule or message must be made in eight places; the current drift (three condition spellings, three messages) is direct evidence that this already failed.
- **UX inconsistency:** A user who triggers the error in one operation sees a different sentence than in another (`an "s"` vs `"s"`, `parameter is required!` vs `is required`), which looks unpolished and violates the project's UX guidelines.
- **Discoverability:** The plural rule is enforced only at runtime. Combined with the ungrammatical "Should be end 's'" descriptions, users learn the rule by hitting an error rather than from clear field help.

## Resolution

### 1. Add one canonical helper to `common.ts`

`common.ts` already imports `NodeOperationError` and the `IExecuteFunctions | IPollFunctions` pattern (used by `assertSafeFieldName`). Append a helper that does both checks with a single canonical message and returns the validated value. Place it after `assertSafeFieldName` (after line 68):

```ts
/**
 * Validates that a business-object name is present and plural (Ivanti OData
 * collections are always plural, e.g. "Incidents", "Changes"). Trims surrounding
 * whitespace and returns the cleaned value so callers can use it directly.
 *
 * @param value - Raw business-object parameter value
 * @param label - Display name used in error messages (default "Business Object")
 * @returns The trimmed, validated business-object name
 * @throws {NodeOperationError} if the value is empty or does not end with "s"
 */
export function validateBusinessObject(
	this: IExecuteFunctions | IPollFunctions,
	value: string,
	label = 'Business Object',
): string {
	const object = (value ?? '').trim();
	if (object === '') {
		throw new NodeOperationError(this.getNode(), `The "${label}" parameter is required`);
	}
	if (!object.endsWith('s')) {
		throw new NodeOperationError(
			this.getNode(),
			`The "${label}" must end with an "s" because Ivanti OData collections are plural (e.g. "Incidents", "Changes")`,
		);
	}
	return object;
}
```

(`IExecuteFunctions`, `IPollFunctions`, `NodeOperationError`, and `IDataObject` are already imported at the top of `common.ts` — no import changes needed there.)

### 2. Replace each hand-rolled guard with one call

Each operation imports from `n8n-workflow` and from `../../transports`. Add `validateBusinessObject` from `../../common` (operations are two levels under `actions/`, so the path is `../../common`; the trigger is at the node root, so it uses `./common`).

**create.operation.ts** (and identically `update.operation.ts`, `deleteByRecId.operation.ts`, `getByRecId.operation.ts`, `getMany.operation.ts`, `searchByKeyword.operation.ts`):

BEFORE (`create.operation.ts:131-139`):
```ts
const object = this.getNodeParameter('object', 0) as string;

if (!object) {
	throw new NodeOperationError(this.getNode(), 'The business object is required');
}

if (object.endsWith('s') === false) {
	throw new NodeOperationError(this.getNode(), 'The business object must end with an "s" (e.g., "Incidents", "Changes")');
}
```

AFTER:
```ts
const object = validateBusinessObject.call(this, this.getNodeParameter('object', 0) as string);
```

Add the import near the existing `n8n-workflow` import:
```ts
import { validateBusinessObject } from '../../common';
```

Note: `deleteByRecId.operation.ts` and `getByRecId.operation.ts` read the parameter as `'businessObject'` (not `'object'`); keep that parameter name, only the guard changes. Where `NodeOperationError` was used *only* for these two checks, remove the now-unused import to satisfy lint; where it is still used elsewhere in the file (e.g. the Record ID check), leave it.

**quickAction/run.operation.ts** (`run.operation.ts:96-103`) — note the guard is inside the per-item loop here; keep it there:

BEFORE:
```ts
const businessObject = this.getNodeParameter('businessObject', i) as string;

if (businessObject === '') {
	throw new NodeOperationError(this.getNode(), 'The "Business Object" parameter is required!');
}
if (businessObject.endsWith('s') === false) {
	throw new NodeOperationError(this.getNode(), 'The "Business Object" parameter must end with an "s" (e.g., "Incidents", "Changes")');
}
```

AFTER:
```ts
const businessObject = validateBusinessObject.call(this, this.getNodeParameter('businessObject', i) as string);
```

**IvantiNeuronsForItsmTrigger.node.ts** (`:250-260`), inside `poll()`:

BEFORE:
```ts
const object = this.getNodeParameter('object') as string;
if (!object || !object.trim()) {
	throw new NodeOperationError(this.getNode(), 'The "Business Object" parameter is required');
}
// Ivanti OData collections are always plural (e.g. "Incidents", not "Incident")
if (!object.endsWith('s')) {
	throw new NodeOperationError(
		this.getNode(),
		'The business object must end with "s" (e.g. "Incidents", "Changes")',
	);
}
```

AFTER:
```ts
const object = validateBusinessObject.call(this, this.getNodeParameter('object') as string);
```

Add to the trigger's imports:
```ts
import { validateBusinessObject } from './common';
```

`this` inside `poll()` is `IPollFunctions`, which the helper's `this` type already accepts.

### 3. Fix the ungrammatical field descriptions

Replace every `"Should be end 's' like ..."` description with one consistent, grammatical sentence. Affected lines: `object/create.operation.ts:30` (already reads "Should end with 's'" — align it too), `object/update.operation.ts:31`, `object/deleteByRecId.operation.ts:26`, `object/getByRecId.operation.ts:27`, `relationship/link.operation.ts:31`, `relationship/unlink.operation.ts:30`, `relationship/getRelated.operation.ts:33`, `search/savedsearch.operation.ts:29` (currently doubly redundant).

BEFORE (e.g. `getByRecId.operation.ts:27`):
```ts
description: "The business object to retrieve, e.g., 'Incident'. Should be end 's' like 'Incidents' or 'Changes'.",
```

AFTER:
```ts
description: "The business object to retrieve. Must be the plural OData collection name (e.g. 'Incidents', 'Changes').",
```

For the attachment `#` variant (`attachment/uploadAttachment.operation.ts:27`), fix the grammar without changing the meaning:

BEFORE:
```ts
description: "The type of the business object, e.g., 'Incident'. Should be end '#' like 'Incident#' or 'Change#'.",
```

AFTER:
```ts
description: "The business object type. Must end with '#' (e.g. 'Incident#', 'Change#').",
```

### 4. (Optional, recommended) Improve UX beyond hard-failing

Two follow-ups that further address the "users only learn the rule at runtime" point. Treat these as optional and reviewer-approved before implementing:

- **Auto-normalize:** in `validateBusinessObject`, instead of throwing on a singular value, append `s` if missing (e.g. `Incident` -> `Incidents`). This is the lowest-effort UX win but changes behavior, so it should be a deliberate decision.
- **Known-objects dropdown:** convert the `object` string field to a `resourceLocator`/`loadOptions` backed by the existing dynamic lookup in `methods/listSearch.ts`, so users pick a valid collection instead of typing it. This is the most robust fix but larger in scope; track separately.

Keep the hard-fail helper from steps 1-3 regardless, as the safety net for manual-entry mode.

## Verification

1. Run the project lint/typecheck (per AGENTS.md, prefer the n8n-node CLI): `npx n8n-node lint` and `npx n8n-node build` (or `npm run lint && npm run build`). Confirm zero new errors/warnings and, in particular, no "unused import `NodeOperationError`" warnings in files where it was removed.
2. `grep -rn "endsWith('s')" nodes/IvantiNeuronsForITSM` should return **no** matches in `actions/` execute bodies or the trigger `poll()` after the change (only `serviceReq/create.operation.ts`, which uses `endsWith('_option')`/`endsWith('Z')` for unrelated reasons, should remain).
3. `grep -rn "Should be end" nodes/IvantiNeuronsForITSM` should return zero matches.
4. Manual: in n8n, run e.g. the Create operation with `object = "Incident"` (singular) and confirm the single canonical error message appears; repeat for getMany/getByRecId/delete/update/quickAction and the trigger and confirm the message is now identical across all of them.

## Related findings

None.
