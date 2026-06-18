# Finding 49: Return All / Limit field definitions inconsistent across operations (spurious required, stray noDataExpression)

| Field | Value |
|---|---|
| Category | n8n Node Conventions / UX Guidelines |
| Severity | low |
| Status | Confirmed |
| Confidence | high |
| Affected files | `nodes/IvantiNeuronsForITSM/actions/search/fulltextsearchinsingleobject.operation.ts:42-65`, `nodes/IvantiNeuronsForITSM/actions/object/searchByKeyword.operation.ts:32-54` (compared against `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:37-59`) |

## Problem
The standard n8n `Return All` / `Limit` pagination pair is defined three different ways across the package's three operations that use it. There is no shared definition, so each copy drifted.

**1. `fulltextsearchinsingleobject.operation.ts:42-65`** marks BOTH `returnAll` and `limit` as `required: true`:

```ts
{
    displayName: 'Return All',
    name: 'returnAll',
    type: 'boolean',
    default: false,
    required: true,                 // <-- spurious: a defaulted boolean is never "unset"
    description: 'Whether to return all results or only up to a given limit',
},
//limit
{
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    default: 50,
    required: true,                 // <-- spurious AND contradictory: hidden when returnAll=true
    typeOptions: {
        minValue: 1,
    },
    displayOptions: {
        show: {
            returnAll: [false],
        },
    },
    description: 'Max number of results to return',
}
```

`required: true` on `returnAll` is meaningless because it has `default: false` and can never be empty. Worse, `required: true` on `limit` is contradictory: the field is hidden via `displayOptions.show.returnAll: [false]` whenever `Return All` is enabled, yet it is still declared required.

**2. `searchByKeyword.operation.ts:32-54`** puts `noDataExpression: true` on both `returnAll` and `limit`:

```ts
{
    displayName: 'Return All',
    name: 'returnAll',
    type: 'boolean',
    default: false,
    noDataExpression: true,         // <-- stray on returnAll
    description: 'Whether to return all results or only up to a given limit',
},
{
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    default: 50,
    noDataExpression: true,         // <-- stray on limit
    typeOptions: {
        minValue: 1,
    },
    description: 'Max number of results to return',
    displayOptions: {
        show: {
            returnAll: [false],
        },
    },
},
```

**3. `getMany.operation.ts:37-59`** (the de-facto correct reference) has neither `required` nor `noDataExpression` on the pair:

```ts
{
    displayName: 'Return All',
    name: 'returnAll',
    type: 'boolean',
    noDataExpression: true,         // note: getMany DOES carry noDataExpression on returnAll
    default: false,
    description: 'Whether to return all results or only up to a given limit',
},
{
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    default: 50,
    typeOptions: {
        minValue: 1,
    },
    description: 'Max number of results to return',
    displayOptions: {
        show: {
            returnAll: [false],
        },
    },
},
```

So the three operations disagree on `required`, on `noDataExpression`, and even within themselves (getMany keeps `noDataExpression` on `returnAll` but not on `limit`). No operation sets `maxValue`. The canonical n8n pattern (as used in core nodes and consistent with `.agents/nodes.md:174-176`) is: a `Return All` boolean with no `required`, and a `Limit` number with `typeOptions: { minValue: 1 }`, `displayOptions.show.returnAll: [false]`, no `required`, and no `noDataExpression`.

## Why it matters
- Maintainability / inconsistency: three near-identical blocks define the same UX concept three different ways. Future edits will keep diverging, and reviewers cannot tell which form is intentional.
- UX correctness: `required: true` on a hidden field (`limit` when `Return All` is on) is contradictory and can produce a confusing "required" affordance in the editor for a field the user cannot see. `required: true` on a defaulted boolean is dead metadata.
- Convention compliance: `noDataExpression: true` on `returnAll`/`limit` deviates from the standard n8n pagination pattern; these fields are normally expression-enabled. This is the kind of inconsistency flagged during n8n Cloud community-node review.
- No data loss or runtime failure: this is purely a metadata/UX defect.

## Resolution
Standardize all three operations on a single canonical definition. The target shape per field:

- `Return All`: `type: 'boolean'`, `default: false`, no `required`, no `noDataExpression`.
- `Limit`: `type: 'number'`, `default: 50`, `typeOptions: { minValue: 1 }`, `displayOptions: { show: { returnAll: [false] } }`, `description: 'Max number of results to return'`, no `required`, no `noDataExpression`.

### Step 1 — Fix `fulltextsearchinsingleobject.operation.ts` (lines 42-65)
Remove `required: true` from both `returnAll` and `limit`.

BEFORE:
```ts
    {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
        default: false,
        required: true,
        description: 'Whether to return all results or only up to a given limit',
    },
    //limit
    {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        default: 50,
        required: true,
        typeOptions: {
            minValue: 1,
        },
        displayOptions: {
            show: {
                returnAll: [false],
            },
        },
        description: 'Max number of results to return',
    }
```

AFTER:
```ts
    {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
        default: false,
        description: 'Whether to return all results or only up to a given limit',
    },
    //limit
    {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        default: 50,
        typeOptions: {
            minValue: 1,
        },
        displayOptions: {
            show: {
                returnAll: [false],
            },
        },
        description: 'Max number of results to return',
    }
```

### Step 2 — Fix `searchByKeyword.operation.ts` (lines 32-54)
Remove `noDataExpression: true` from both `returnAll` and `limit`.

BEFORE:
```ts
    {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
        default: false,
        noDataExpression: true,
        description: 'Whether to return all results or only up to a given limit',
    },
    {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        default: 50,
        noDataExpression: true,
        typeOptions: {
            minValue: 1,
        },
        description: 'Max number of results to return',
        displayOptions: {
            show: {
                returnAll: [false],
            },
        },
    },
```

AFTER:
```ts
    {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
        default: false,
        description: 'Whether to return all results or only up to a given limit',
    },
    {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        default: 50,
        typeOptions: {
            minValue: 1,
        },
        description: 'Max number of results to return',
        displayOptions: {
            show: {
                returnAll: [false],
            },
        },
    },
```

### Step 3 — Align `getMany.operation.ts` (lines 37-44)
For full consistency, remove the lone `noDataExpression: true` from its `returnAll` so all three operations match exactly (its `limit` already matches the target).

BEFORE:
```ts
    {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
        noDataExpression: true,
        default: false,
        description: 'Whether to return all results or only up to a given limit',
    },
```

AFTER:
```ts
    {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
        default: false,
        description: 'Whether to return all results or only up to a given limit',
    },
```

### Step 4 (recommended) — Extract a shared definition to prevent future drift
To stop these three copies from diverging again, add a reusable factory to `nodes/IvantiNeuronsForITSM/common.ts` and import it in each operation's `properties` array.

Add to `nodes/IvantiNeuronsForITSM/common.ts`:
```ts
import type { INodeProperties } from 'n8n-workflow';

/**
 * Canonical "Return All" / "Limit" pagination property pair.
 * Use the same definition across every list/search operation so the UX
 * stays consistent (no `required`, no `noDataExpression`; Limit hidden when
 * Return All is enabled).
 */
export const returnAllAndLimitProperties: INodeProperties[] = [
    {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
        default: false,
        description: 'Whether to return all results or only up to a given limit',
    },
    {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        default: 50,
        typeOptions: {
            minValue: 1,
        },
        displayOptions: {
            show: {
                returnAll: [false],
            },
        },
        description: 'Max number of results to return',
    },
];
```

Then in each of the three operation files, replace the inline `returnAll` + `limit` objects with a spread:
```ts
import { returnAllAndLimitProperties } from '../../common';
// ...
export const properties: INodeProperties[] = [
    // ...other props before the pagination pair...
    ...returnAllAndLimitProperties,
    // ...other props after...
];
```
Note the ordering differs per file (in `fulltextsearchinsingleobject` and `getMany` the pair sits among other props; in `searchByKeyword` `searchText`/`selectAllFields`/`selectFields` follow it) — place the spread at the exact position the two objects currently occupy so the rendered field order is unchanged. `getMany.operation.ts` already imports from `../../common` (`assertSafeFieldName, SearchResponse`), so just extend that import.

Steps 1-3 alone resolve the finding; Step 4 is the durable fix and is optional but recommended.

## Verification
1. Apply the edits, then run the package lint/build:
   ```
   npm run lint
   npm run build
   ```
   (or `npx n8n-node lint` / `npx n8n-node build` if using the CLI per `AGENTS.md`). Expect no new errors or warnings.
2. Grep to confirm the spurious attributes are gone from the pagination pair:
   ```
   grep -n "required\|noDataExpression" \
     nodes/IvantiNeuronsForITSM/actions/search/fulltextsearchinsingleobject.operation.ts \
     nodes/IvantiNeuronsForITSM/actions/object/searchByKeyword.operation.ts \
     nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts
   ```
   Confirm no `required` or `noDataExpression` line falls within the `returnAll`/`limit` blocks (the legitimate `required`/`noDataExpression` on `object`, `searchText`, `searchObject`, `selectAllFields`, etc. remain).
3. If Step 4 was applied, confirm all three files import `returnAllAndLimitProperties` from `../../common` and that `common.ts` exports it.
4. Manual UI check (optional): load the node in n8n; for each of the three operations toggle `Return All` on and verify `Limit` hides cleanly with no lingering "required" indicator, and that an expression toggle is now available on both fields.

## Related findings
None.
