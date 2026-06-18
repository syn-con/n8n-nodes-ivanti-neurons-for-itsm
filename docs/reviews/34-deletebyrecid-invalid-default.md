# Finding 34: deleteByRecId Business Object default 'incident' fails its own endsWith('s') validation

| Field | Value |
|---|---|
| Category | n8n Node Conventions / UX Guidelines |
| Severity | medium |
| Status | Confirmed |
| Confidence | high |
| Affected files | /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/actions/object/deleteByRecId.operation.ts:22, :70-72 |

## Problem
The **Business Object → Delete By Record ID** operation ships a non-empty default of `"incident"` for the `businessObject` field:

```ts
// deleteByRecId.operation.ts:19-28
{
    displayName: "Business Object",
    name: "businessObject",
    default: "incident",
    type: "string",
    required: true,
    noDataExpression: true,
    description: "The business object to delete, e.g., 'Incident'. Should be end 's' like 'Incidents' or 'Changes'.",
    placeholder: "Incidents",
},
```

But the same operation's `execute()` rejects any value that does not end in `s`:

```ts
// deleteByRecId.operation.ts:67-72
if (!object) {
    throw new NodeOperationError(this.getNode(), 'The business object is required');
}
if (object.endsWith('s') === false) {
    throw new NodeOperationError(this.getNode(), 'The business object must end with an "s" (e.g., "Incidents", "Changes")');
}
```

`"incident"` does not end with `s`, so the shipped default fails the operation's own validation. The user must edit the field before the operation can run.

This is inconsistent with every other Business Object operation in the package, all of which default `businessObject` to an empty string:
- `getByRecId.operation.ts:23` -> `default: ""`
- `create.operation.ts:27` -> `default: ""`
- `getMany.operation.ts:30` -> `default: ""`
- `searchByKeyword.operation.ts:26` -> `default: ""`
- `update.operation.ts:28` -> `default: ""`

Note `getByRecId`, `create`, `searchByKeyword`, and `update` carry the identical `endsWith('s')` guard, so an empty default plus the `required: true` flag (and an explicit empty check) is the established convention.

## Why it matters
- Runtime failure out of the box: a user who drags in the node, picks Delete By Record ID, supplies a Record ID, and clicks execute hits a `NodeOperationError` purely because of the shipped default. The error message ("must end with an 's'") does not point at the real cause (a bad default), so it reads as a confusing self-inflicted failure.
- Inconsistency / maintainability: this is the only object operation whose default contradicts its own validation. The divergence makes the codebase harder to reason about and is a UX guideline violation (defaults should be valid or empty, never a value the node will immediately reject).
- A non-empty default also defeats the `required: true` red-asterisk prompt, so n8n will not flag the field as needing attention even though its value is invalid.

## Resolution
Change the default to an empty string to match every sibling operation. With `required: true` already set and the empty-string guard at line 67-68, an empty default surfaces the standard "required field" prompt in the UI instead of silently shipping an invalid value.

1. Edit `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/actions/object/deleteByRecId.operation.ts`.

BEFORE (lines 19-28):
```ts
export const properties: INodeProperties[] = [
    {
        displayName: "Business Object",
        name: "businessObject",
        default: "incident",
        type: "string",
        required: true,
        noDataExpression: true,
        description: "The business object to delete, e.g., 'Incident'. Should be end 's' like 'Incidents' or 'Changes'.",
        placeholder: "Incidents",
    },
```

AFTER:
```ts
export const properties: INodeProperties[] = [
    {
        displayName: "Business Object",
        name: "businessObject",
        default: "",
        type: "string",
        required: true,
        noDataExpression: true,
        description: "The business object to delete, e.g., 'Incident'. Should be end 's' like 'Incidents' or 'Changes'.",
        placeholder: "Incidents",
    },
```

Only the single line `default: "incident",` -> `default: "",` changes. The `endsWith('s')` validation, the empty-object guard, and the rest of the operation are left untouched, so behavior now matches the sibling operations exactly.

Alternative (not recommended): set the default to a valid plural such as `"Incidents"`. This would also pass validation, but it diverges from the package-wide convention of an empty default and risks a user accidentally deleting a real `Incidents` record if they forget to change it. The empty-string approach is safer for a destructive (DELETE) operation and is what the other five operations already do.

No new shared helper or type is needed for this fix; it is a one-character data correction.

## Verification
1. Apply the edit above.
2. Build / typecheck: from the repo root run the project's build (e.g. `npx n8n-node build` or `npm run build` per `package.json` scripts) and confirm no TypeScript errors.
3. Lint: run the project's lint command (e.g. `npx n8n-node lint` or `npm run lint`) and confirm no new warnings on `deleteByRecId.operation.ts`.
4. Manual / behavioral confirmation: in n8n, add the Ivanti Neurons for ITSM node, select resource Business Object and operation Delete By Record ID. Confirm the Business Object field now renders empty (with the required-field indicator) instead of pre-filled `incident`. Leaving it empty and executing should raise "The business object is required"; entering a non-plural value such as `Incident` should raise "The business object must end with an 's'..."; entering `Incidents` should pass validation and issue the DELETE request.
5. Quick grep to confirm the default is gone:
   `grep -n 'default: "incident"' nodes/IvantiNeuronsForITSM/actions/object/deleteByRecId.operation.ts` should return no matches.

## Related findings
None.
