# Finding 35: Same Business Object field uses internal name 'object' in some operations and 'businessObject' in others

| Field | Value |
|---|---|
| Category | n8n Node Conventions / UX Guidelines |
| Severity | medium |
| Status | Confirmed |
| Confidence | high |
| Affected files | nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:28, nodes/IvantiNeuronsForITSM/actions/object/create.operation.ts:25, nodes/IvantiNeuronsForITSM/actions/object/update.operation.ts:26, nodes/IvantiNeuronsForITSM/actions/object/searchByKeyword.operation.ts:24, nodes/IvantiNeuronsForITSM/actions/object/getByRecId.operation.ts:22, nodes/IvantiNeuronsForITSM/actions/object/deleteByRecId.operation.ts:21 |

## Problem

All six operations under the `businessobject` resource (`displayOptions.show.resource: ['businessobject']`) expose the same UI field with `displayName: "Business Object"`, but they disagree on the internal parameter `name`. Four operations call it `object` and two call it `businessObject`.

`object` (getMany, create, update, searchByKeyword):

```ts
// getMany.operation.ts:26-29
{
    displayName: "Business Object",
    name: "object",
    type: "string",
```

```ts
// create.operation.ts:23-26
{
    displayName: "Business Object",
    name: "object",
    type: "string",
```

```ts
// update.operation.ts:24-27
{
    displayName: "Business Object",
    name: "object",
    type: "string",
```

```ts
// searchByKeyword.operation.ts:22-25
{
    displayName: "Business Object",
    name: "object",
    type: "string",
```

`businessObject` (getByRecId, deleteByRecId):

```ts
// getByRecId.operation.ts:20-24
{
    displayName: "Business Object",
    name: "businessObject",
    default: "",
    type: "string",
```

```ts
// deleteByRecId.operation.ts:19-23
{
    displayName: "Business Object",
    name: "businessObject",
    default: "incident",
    type: "string",
```

The `execute` functions read the parameter under whichever name they declared. For example getMany reads `this.getNodeParameter('object', 0)` (getMany.operation.ts:279) while getByRecId reads `this.getNodeParameter('businessObject', 0)` (getByRecId.operation.ts:68) and deleteByRecId reads `this.getNodeParameter('object', 0)`... wait — note deleteByRecId actually declares `businessObject` (line 21) and correctly reads `this.getNodeParameter('businessObject', 0)` (deleteByRecId.operation.ts:65). So the read/declare pairing is internally consistent per file; the problem is cross-operation inconsistency of the internal name for the same logical field.

Note: a third spelling, `searchObject`, exists in the separate `search` resource (savedsearch.operation.ts:25, fulltextsearchinsingleobject.operation.ts:26), and `businessObject` is also used by the `relationship` and `quickAction` resources. Those are different resources, so switching between them already discards parameters; the actionable defect for this finding is strictly **within the `businessobject` resource**, where the same field flips between `object` and `businessObject`.

## Why it matters

In n8n, a parameter's value is preserved when the user switches the **Operation** dropdown only if the internal `name` is identical across operations (n8n keys stored parameter values by their internal name, not their display name). Concrete impact within the `businessobject` resource:

- A user types `Incidents` into "Business Object" while on **Get Many** (stored as `object`), then switches the Operation to **Get By Record ID** (which reads `businessObject`). The field appears blank and the value is silently lost; the user must re-type it. The same loss occurs switching back, and between any `object`-named op and either `businessObject`-named op.
- Expressions that reference the field break across operations: `{{ $parameter["object"] }}` works for getMany/create/update/searchByKeyword but is empty for getByRecId/deleteByRecId, where `{{ $parameter["businessObject"] }}` is required. This is a foot-gun for anyone building expressions against the node.
- It is inconsistent with n8n UX guidelines, which expect a single logical field to keep one stable internal name across a resource's operations. This also hurts maintainability: future code/tests must remember which spelling each operation uses.

Severity is medium: no data corruption or security impact, but a real, repeatable UX regression (value loss on operation switch) plus an expression-compatibility trap.

## Resolution

Standardize on a single internal name for the Business Object field across the entire `businessobject` resource. Recommended canonical name: `object` (it is already used by the majority — 4 of 6 operations — and by all the execute-time literals in those files, so fewer changes are needed and the OData URL-building code that uses the local `object` variable is unaffected).

Change only the two outliers (`getByRecId`, `deleteByRecId`): rename their property `name` and their matching `getNodeParameter` reads from `businessObject` to `object`. Also fix the misleading non-empty default `"incident"` in deleteByRecId (it is not a valid plural OData entity and the execute code requires a value ending in `s`).

### 1. getByRecId.operation.ts

Property declaration — BEFORE (lines 20-29):

```ts
{
    displayName: "Business Object",
    name: "businessObject",
    default: "",
    type: "string",
    required: true,
    noDataExpression: true,
    description: "The business object to retrieve, e.g., 'Incident'. Should be end 's' like 'Incidents' or 'Changes'.",
    placeholder: "Incidents",
},
```

AFTER:

```ts
{
    displayName: "Business Object",
    name: "object",
    default: "",
    type: "string",
    required: true,
    noDataExpression: true,
    description: "The business object to retrieve, e.g., 'Incident'. Should be end 's' like 'Incidents' or 'Changes'.",
    placeholder: "Incidents",
},
```

Execute read — BEFORE (line 68):

```ts
const object = this.getNodeParameter('businessObject', 0) as string;
```

AFTER:

```ts
const object = this.getNodeParameter('object', 0) as string;
```

### 2. deleteByRecId.operation.ts

Property declaration — BEFORE (lines 19-28):

```ts
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

AFTER (rename to `object`; also clear the invalid `"incident"` default so it matches the other operations and does not pre-populate a value that fails the `endsWith('s')` check):

```ts
{
    displayName: "Business Object",
    name: "object",
    default: "",
    type: "string",
    required: true,
    noDataExpression: true,
    description: "The business object to delete, e.g., 'Incident'. Should be end 's' like 'Incidents' or 'Changes'.",
    placeholder: "Incidents",
},
```

Execute read — BEFORE (line 65):

```ts
const object = this.getNodeParameter('businessObject', 0) as string;
```

AFTER:

```ts
const object = this.getNodeParameter('object', 0) as string;
```

### Notes / scope guard

- Do **not** touch `relationship/*` or `quickAction/run.operation.ts` (`businessObject`) or `search/*` (`searchObject`) — those live under different `resource` values, so renaming them is out of scope for this finding and would not fix the value-preservation problem (n8n does not preserve values across a resource switch anyway). If a future, broader cleanup wants a single project-wide name, that should be tracked separately.
- After renaming, verify there are no remaining `businessObject` references inside the two edited files (none of their other logic uses the name). The local TS variable is named `object` in both already, so the OData URL construction (`/odata/businessobject/${object}`) is unchanged.

### Optional follow-up (CHANGELOG / version)

Per AGENTS.md, if you bump the package version for this change, add an entry to `CHANGELOG.md`. A property `name` rename is a non-breaking internal change for new workflows but will reset the field for existing saved workflows that used getByRecId/deleteByRecId; mention that in the changelog so users know to re-enter the Business Object value once.

## Verification

1. Static confirmation that only one spelling remains in the `businessobject` resource:
   ```bash
   grep -rn "name: *[\"']businessObject[\"']" \
     /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/actions/object/
   ```
   Expected: no matches (previously matched getByRecId.operation.ts:22 and deleteByRecId.operation.ts:21).
   ```bash
   grep -rn "getNodeParameter('businessObject'" \
     /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/actions/object/
   ```
   Expected: no matches.
2. Build and lint with the project's n8n tooling (per AGENTS.md, use the `n8n-node` CLI), e.g. `npm run build` / `npm run lint`. Expect zero new errors; the rename is type-safe because each `getNodeParameter` call uses a string literal.
3. Manual UX check in n8n dev mode: add the node, select resource **Business Object**, choose **Get Many**, type `Incidents` in "Business Object", then switch Operation to **Get By Record ID** and to **Delete By Record ID**. The field should retain `Incidents` after the fix (before the fix it cleared). Repeat switching back to Create/Update/Search By Keyword to confirm the value persists across all six operations.

## Related findings

None.
