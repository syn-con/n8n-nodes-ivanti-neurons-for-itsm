# Finding 8: quickAction run uses businessObject.replace('s', '#') (unanchored), corrupting names like 'Tasks'

| Field | Value |
|---|---|
| Category | Bugs / Correctness |
| Severity | high |
| Status | Confirmed |
| Confidence | high |
| Affected files | /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation.ts:119, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/actions/attachment/uploadAttachment.operation.ts:106 |

## Problem

To build the quick-action payload, `run.operation.ts` derives `actualObjectType` from the plural `businessObject` name by stripping the trailing `s`. But it calls `String.prototype.replace` with a **plain string** as the first argument, which replaces only the **first** occurrence of `s` and is **not anchored to the end**:

`nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation.ts:111-123`
```ts
const quickActionPayload = {
    ActionId: quickActionId,
    ShouldSave: true,
    ActionParams: {
        GridParams: null,
        FormParams: {
            actionId: quickActionId,
            objectId: recordId,
            actualObjectType: businessObject.replace('s', '#'),
        }
    },
    promptParams: null
}
```

Because `replace('s', '#')` targets the first `s` anywhere in the string, the transformation is wrong for many real business-object names:

- `'Tasks'` -> `'Ta#ks'` (intended: `'Task#'`)
- `'Assets'` -> `'A#sets'` (intended: `'Asset#'`)
- `'Releases'` -> `'Relea#es'` (intended: `'Release#'`)
- `'Incidents'` (only one `s`, at the end) -> `'Incident#'` — happens to work by coincidence
- `'Changes'` -> `'Change#'` — also works by coincidence

So the bug silently produces correct output only when the **first** `s` in the name is also the **last** character. Any business object whose name contains an earlier `s` is corrupted.

The sibling attachment-upload operation already does this correctly with an end-anchored regex, which confirms the intended behavior is to strip only the trailing plural `s`:

`nodes/IvantiNeuronsForITSM/actions/attachment/uploadAttachment.operation.ts:106`
```ts
formData.append('objectType', objectType.replace(/s$/, '#'));
```

Note also that `run.operation.ts:101-103` already validates that `businessObject` ends with `s`, reinforcing that the intent is to replace the trailing `s`:
```ts
if (businessObject.endsWith('s') === false) {
    throw new NodeOperationError(this.getNode(), 'The "Business Object" parameter must end with an "s" (e.g., "Incidents", "Changes")');
}
```

## Why it matters

`actualObjectType` is sent to the Ivanti Neurons API as part of the quick-action `FormParams`. A malformed singular type (e.g. `'Ta#ks'` instead of `'Task#'`) means the quick action is dispatched against a non-existent / wrong object type. At runtime this produces a server-side rejection or, worse, a silently no-op / incorrect action with no obvious error — a correctness bug that breaks the Quick Action operation for any business object whose plural name contains an `s` before the final character (Tasks, Assets, Releases, and similar). The failure is data-dependent and easy to miss in testing if only Incidents/Changes are exercised, which is exactly why it slipped through.

## Resolution

Replace the unanchored string-argument `replace('s', '#')` with the same end-anchored regex used in the attachment operation, so only the trailing plural `s` is converted.

File: `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation.ts`

BEFORE (line 119):
```ts
				actualObjectType: businessObject.replace('s', '#'),
```

AFTER:
```ts
				actualObjectType: businessObject.replace(/s$/, '#'),
```

That is the only change required. The surrounding guard at lines 101-103 already guarantees `businessObject` ends with `s`, so `/s$/` will always match exactly once and strip precisely the trailing plural `s`.

Optional (recommended for consistency / DRY): both operations now perform the identical "plural -> singular `#` form" transformation. Consider extracting a small helper into the shared utilities module `nodes/IvantiNeuronsForITSM/common.ts` and using it in both call sites:

```ts
// nodes/IvantiNeuronsForITSM/common.ts
/**
 * Converts a plural Ivanti business object name (e.g. "Tasks") into the
 * singular "#"-suffixed object type expected by quick-action / attachment
 * payloads (e.g. "Task#"). Only the trailing plural "s" is replaced.
 */
export function toActualObjectType(pluralName: string): string {
	return pluralName.replace(/s$/, '#');
}
```

Then in `run.operation.ts`:
```ts
actualObjectType: toActualObjectType(businessObject),
```
and in `uploadAttachment.operation.ts`:
```ts
formData.append('objectType', toActualObjectType(objectType));
```
This is optional; the minimal, lowest-risk fix is the single-line regex change above.

## Verification

1. Apply the edit, then run the project's build/lint via the n8n-node CLI (per AGENTS.md guidelines), e.g. `npm run build` and `npm run lint` (or `n8n-node build` / `n8n-node lint`), and confirm no new type/lint errors.
2. Quick correctness check of the transformation logic in a Node REPL or a scratch test:
   ```js
   ['Incidents','Changes','Tasks','Assets','Releases'].map(s => s.replace(/s$/, '#'));
   // => ['Incident#','Change#','Task#','Asset#','Release#']
   ```
   Confirm each result strips only the final `s` (compare against the old `replace('s', '#')` which yields `['Incident#','Change#','Ta#ks','A#sets','Relea#es']`).
3. Manual end-to-end (if an Ivanti environment is available): run the Quick Action operation with Business Object set to `Tasks`, and confirm the request succeeds (it previously sent the corrupted `Ta#ks`).

## Related findings

None.
