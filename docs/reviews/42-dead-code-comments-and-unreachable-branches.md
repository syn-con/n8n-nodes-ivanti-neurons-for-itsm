# Finding 42: Dead commented imports, stray scratch comment, unreachable parseValue branch, and explicit usableAsTool: undefined

| Field | Value |
|---|---|
| Category | Dead Code |
| Severity | low |
| Status | Confirmed |
| Confidence | high |
| Affected files | nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation.ts:1-4,12 · nodes/IvantiNeuronsForITSM/actions/search/savedsearch.operation.ts:2 · nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts:131 · nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:332,358 · nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:49 · nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:40 |

## Problem
Several small dead-code / dead-annotation items, all verified in the repo:

**1. `quickAction/run.operation.ts` — 4 leading blank lines + commented dead import** (lines 1-4 are empty, line 12):
```ts
1
2
3
4
5  import {
   ...
12 // import { ivantiApiRequest } from '../../transport/ivanti.rest.api'
```
The commented path is also wrong (`../../transport/...` singular) — the real, active import on line 17 is `import { ivantiApiRequest } from '../../transports'` (plural). The comment is pure noise.

**2. `search/savedsearch.operation.ts:2` — commented-out unused import**:
```ts
1 import type {
2     //IDataObject,
3     IExecuteFunctions,
```

**3. `relationship/getRelated.operation.ts:131` — trailing scratch comment**:
```ts
const url = `/odata/businessobject/${businessObject}('${recordId}')/${relationship}`; ///${relationship}
```

**4. `object/getMany.operation.ts:332,358` — unreachable branch + impossible `Date` in return type**:
```ts
332 function parseValue(this: IExecuteFunctions, fieldType: string, value: string): string | number | boolean | Date | null {
...
351     if (fieldType === 'date') {
...
356         return date.toISOString();   // returns a string, never a Date
357     }
358     return null;                     // unreachable
```
The UI `fieldType` dropdown only offers `boolean`, `date`, `number`, `string` (getMany.operation.ts:131-143), so the four `if` branches are exhaustive and the trailing `return null` can never execute. Additionally, the `date` branch returns `date.toISOString()` (a `string`), so a `Date` value is never actually returned — the `| Date` in the return-type union is impossible. (Note: the analogous `parseValue` in the polling trigger at line 351-377 already has the correct narrower signature `string | number | boolean | null` without `Date`, confirming `Date` is a stale annotation unique to getMany.)

**5. Both trigger nodes — `usableAsTool: undefined`**:
```ts
// IvantiNeuronsForItsmTrigger.node.ts:49
usableAsTool: undefined,
// IvantiNeuronsForItsmConnectorTrigger.node.ts:40
usableAsTool: undefined,
```
`usableAsTool` is meaningful only for action nodes that can be exposed as AI Agent tools. Trigger nodes cannot be tools, and assigning `undefined` is a no-op key that adds noise and implies an intent that the platform ignores.

## Why it matters
Maintainability only — none of these affect runtime behavior:
- The wrong commented import path (`transport` vs `transports`) is actively misleading to anyone scanning imports.
- The `| Date` return type is a lie about the function contract; a caller could write a `Date`-handling branch that is dead.
- The unreachable `return null` and stray `///${relationship}` are clutter that obscures real logic during review.
- `usableAsTool: undefined` on trigger nodes signals confusion about the n8n node model and is flagged by reviewers / linters expecting clean node descriptions.

## Resolution

### 1. `nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation.ts`
Remove the 4 leading blank lines and the dead commented import on line 12.

BEFORE (lines 1-17):
```ts



import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
} from 'n8n-workflow';

// import { ivantiApiRequest } from '../../transport/ivanti.rest.api'


import { NodeOperationError, updateDisplayOptions } from 'n8n-workflow';

import { ivantiApiRequest } from '../../transports'
```
AFTER:
```ts
import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
} from 'n8n-workflow';

import { NodeOperationError, updateDisplayOptions } from 'n8n-workflow';

import { ivantiApiRequest } from '../../transports'
```

### 2. `nodes/IvantiNeuronsForITSM/actions/search/savedsearch.operation.ts`
Delete the commented import line.

BEFORE (lines 1-6):
```ts
import type {
    //IDataObject,
    IExecuteFunctions,
    INodeExecutionData,
    INodeProperties,
} from 'n8n-workflow';
```
AFTER:
```ts
import type {
    IExecuteFunctions,
    INodeExecutionData,
    INodeProperties,
} from 'n8n-workflow';
```

### 3. `nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts:131`
Strip the trailing scratch comment.

BEFORE:
```ts
const url = `/odata/businessobject/${businessObject}('${recordId}')/${relationship}`; ///${relationship}
```
AFTER:
```ts
const url = `/odata/businessobject/${businessObject}('${recordId}')/${relationship}`;
```

### 4. `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:332,358`
Narrow the return type (drop `| Date`, which is never returned), and remove the unreachable `return null` by converting the last branch to a final `return` plus an exhaustiveness fallback that throws for an unexpected type (preferable to silently returning `null`). This mirrors the trigger node's narrower signature.

BEFORE (lines 332, 351-359):
```ts
function parseValue(this: IExecuteFunctions, fieldType: string, value: string): string | number | boolean | Date | null {
    ...
    if (fieldType === 'date') {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
           throw new NodeOperationError(this.getNode(), `Invalid date: ${value}`);
        }
        return date.toISOString();
    }
    return null;
}
```
AFTER:
```ts
function parseValue(this: IExecuteFunctions, fieldType: string, value: string): string | number | boolean {
    ...
    if (fieldType === 'date') {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
           throw new NodeOperationError(this.getNode(), `Invalid date: ${value}`);
        }
        return date.toISOString();
    }
    throw new NodeOperationError(this.getNode(), `Unsupported field type: ${fieldType}`);
}
```
If you prefer the minimal change (keep `null` for callers that already tolerate it), at least drop `| Date` from the signature so the type matches reality:
```ts
function parseValue(this: IExecuteFunctions, fieldType: string, value: string): string | number | boolean | null {
```
The throwing variant is recommended because it aligns the return type with the only values actually produced and surfaces an impossible-input bug rather than letting a `null` flow into the OData filter. Verify the single call site (getMany.operation.ts:391, `const parsedValue = parseValue.call(this, filter.fieldType, filter.value);`) still type-checks; it consumes the value into the filter string, so a narrower type is safe.

### 5. Trigger nodes — remove the no-op key
`nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:49`

BEFORE:
```ts
		defaults: {
			name: 'Ivanti Neurons for ITSM Polling Trigger',
		},
		usableAsTool: undefined,
		inputs: [],
```
AFTER:
```ts
		defaults: {
			name: 'Ivanti Neurons for ITSM Polling Trigger',
		},
		inputs: [],
```

`nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:40`

BEFORE:
```ts
		displayName: 'Ivanti Neurons for ITSM Connector Trigger',
		usableAsTool: undefined,
		name: 'ivantiNeuronsForItsmConnectorTrigger',
```
AFTER:
```ts
		displayName: 'Ivanti Neurons for ITSM Connector Trigger',
		name: 'ivantiNeuronsForItsmConnectorTrigger',
```

## Verification
1. Run the package lint + typecheck (per AGENTS.md, prefer the `n8n-node` CLI): `npx n8n-node lint` and the TypeScript build `npm run build` (or `tsc --noEmit`). The build must still succeed — the narrowed `parseValue` return type must compile against its call site at getMany.operation.ts:391.
2. Confirm removals manually:
   - `grep -n "ivanti.rest.api" nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation.ts` → no matches.
   - `grep -n "//IDataObject" nodes/IvantiNeuronsForITSM/actions/search/savedsearch.operation.ts` → no matches.
   - `grep -n "///\${relationship}" nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts` → no matches.
   - `grep -rn "usableAsTool" nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts` → no matches.
   - `grep -n "Date \| null\|return null" nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts` → `Date` removed from the parseValue signature.
3. No runtime behavior should change (the removed branch was unreachable; the `Date` type was never produced); existing workflows for getMany, savedsearch, getRelated, quickAction, and both triggers should behave identically.

## Related findings
None.
