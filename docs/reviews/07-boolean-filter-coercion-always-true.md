# Finding 7: Boolean OData filter parsing uses Boolean(value), so "false" becomes true

| Field | Value |
|---|---|
| Category | Bugs / Correctness |
| Severity | high |
| Status | Confirmed |
| Confidence | high |
| Affected files | /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:344-350, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:366-368 |

## Problem

Both `parseValue` helpers convert a boolean OData filter value with the `Boolean()` global. `Boolean(value)` is `true` for **any** non-empty string, including the literal string `"false"`. The filter value the user typed comes in as a string from the UI, so `"false"` is coerced to `true`.

In `getMany.operation.ts:344-350`:

```ts
if (fieldType === 'boolean') {
    const boolean = Boolean(value);
    if (boolean === undefined) {
        throw new NodeOperationError(this.getNode(), `Invalid boolean: ${value}`);
    }
    return boolean;
}
```

`Boolean()` can only ever return `true` or `false`, never `undefined`, so the guard at line 346 is dead code that never throws. The parsed value is then interpolated into the OData filter at line 391-392:

```ts
const parsedValue = parseValue.call(this, filter.fieldType, filter.value);
return `${prefix}${filter.fieldName} ${filter.operation} ${parsedValue}`;
```

So a user filter of `IsActive eq false` is silently emitted as `IsActive eq true`.

The polling trigger has the identical bug at `IvantiNeuronsForItsmTrigger.node.ts:366-368`, without even the (dead) guard:

```ts
if (fieldType === 'boolean') {
    return Boolean(value);
}
```

Called at `IvantiNeuronsForItsmTrigger.node.ts:301`:

```ts
const parsedValue = parseValue.call(this, filter.fieldType, filter.value);
```

## Why it matters

This is a silent correctness/data bug, not a crash:

- A user filtering for `false` records receives the **opposite** set (`true` records), and vice-versa for any value the user expects to be `false` (e.g. `"0"`, `"no"` would also coerce to `true`). There is no error, so the wrong result set looks legitimate.
- In the polling trigger, every poll cycle silently fetches the inverted record set, which can drive downstream workflow logic on completely wrong data on a recurring schedule.
- The dead `if (boolean === undefined)` guard gives a false impression of validation, making the bug harder to spot in review.

## Resolution

Parse the boolean explicitly and reject ambiguous input. Because the same logic is duplicated in two files (and `getMany.operation.ts` already imports from `../../common`), put a single shared helper in `nodes/IvantiNeuronsForITSM/common.ts` next to the existing `assertSafeFieldName`, and call it from both `parseValue` copies.

### Step 1 — Add a shared `parseBoolean` helper to `common.ts`

The shared `this` type must cover all three call sites: `getMany` runs under `IExecuteFunctions`, the trigger under `ITriggerFunctions | IPollFunctions`. `common.ts` already imports `NodeOperationError`, `IExecuteFunctions`, and `IPollFunctions`; add `ITriggerFunctions` to the type-only import.

In `nodes/IvantiNeuronsForITSM/common.ts`, change the type import (currently line 2):

BEFORE
```ts
import type { IExecuteFunctions, INodeProperties, IPollFunctions } from 'n8n-workflow';
```

AFTER
```ts
import type { IExecuteFunctions, INodeProperties, IPollFunctions, ITriggerFunctions } from 'n8n-workflow';
```

Then append the helper at the end of `common.ts` (after `assertSafeFieldName`):

```ts
/**
 * Parses a raw string filter value into a strict boolean for OData filters.
 * Only the literal strings "true" and "false" (case-insensitive, trimmed)
 * are accepted; everything else throws so the user gets an explicit error
 * instead of a silently inverted filter.
 *
 * @param value - The raw string value from the OData filter UI
 * @throws {NodeOperationError} if the value is not "true" or "false"
 */
export function parseBoolean(
    this: IExecuteFunctions | ITriggerFunctions | IPollFunctions,
    value: string,
): boolean {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
        return true;
    }
    if (normalized === 'false') {
        return false;
    }
    throw new NodeOperationError(
        this.getNode(),
        `Invalid boolean: "${value}" (expected "true" or "false")`,
    );
}
```

### Step 2 — Use the helper in `getMany.operation.ts`

The file already imports from `../../common` (line 13). Add `parseBoolean` to that import:

BEFORE
```ts
import { assertSafeFieldName, SearchResponse } from '../../common';
```

AFTER
```ts
import { assertSafeFieldName, parseBoolean, SearchResponse } from '../../common';
```

Then replace the boolean branch (lines 344-350):

BEFORE
```ts
if (fieldType === 'boolean') {
    const boolean = Boolean(value);
    if (boolean === undefined) {
        throw new NodeOperationError(this.getNode(), `Invalid boolean: ${value}`);
    }
    return boolean;
}
```

AFTER
```ts
if (fieldType === 'boolean') {
    return parseBoolean.call(this, value);
}
```

### Step 3 — Use the helper in `IvantiNeuronsForItsmTrigger.node.ts`

Add `parseBoolean` to the import from `./common`. (Confirm the existing import path; `assertSafeFieldName` is imported from the same module — match it.) For example:

BEFORE
```ts
import { assertSafeFieldName, ... } from './common';
```

AFTER
```ts
import { assertSafeFieldName, parseBoolean, ... } from './common';
```

Then replace the boolean branch (lines 366-368):

BEFORE
```ts
if (fieldType === 'boolean') {
    return Boolean(value);
}
```

AFTER
```ts
if (fieldType === 'boolean') {
    return parseBoolean.call(this, value);
}
```

### Notes

- Using `parseBoolean.call(this, value)` (rather than a plain call) keeps `this.getNode()` available for the thrown `NodeOperationError`, matching the existing `assertSafeFieldName.call(this, ...)` pattern used at `getMany.operation.ts:381`.
- After this change the dead `if (boolean === undefined)` guard is gone, resolving the Dead Code part of the finding.
- OData boolean literals are lowercase `true` / `false`; returning a JS boolean is correct because it is interpolated directly into the filter string (`${parsedValue}`), which stringifies to `true` / `false`.

## Verification

1. Build / typecheck and lint to confirm the shared helper, the new `ITriggerFunctions` import, and the two call sites compile cleanly:
   - `npm run build` (or the project's `n8n-node build`)
   - `npm run lint` (or `n8n-node lint`)
2. Manual / functional check in `getMany`: configure an OData filter `fieldType=boolean`, `operation=eq`, `value=false` on a boolean field (e.g. `IsActive`). Inspect the generated `$filter` (log `query["$filter"]` in `buildODataQuery` or capture the outbound request) and confirm it is `IsActive eq false`, not `IsActive eq true`.
3. Confirm the throw path: set the boolean filter `value` to something invalid (e.g. `maybe`) and verify the node now fails with `Invalid boolean: "maybe" (expected "true" or "false")` instead of silently passing `true`.
4. Repeat step 2/3 against the polling trigger's filter UI to confirm the same behavior in `IvantiNeuronsForItsmTrigger.node.ts`.

## Related findings

None.
