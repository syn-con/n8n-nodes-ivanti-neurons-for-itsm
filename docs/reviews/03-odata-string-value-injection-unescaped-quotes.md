# Finding 3: OData $filter string values interpolated without escaping single quotes (injection / broken filters)

| Field | Value |
|---|---|
| Category | Security |
| Severity | high |
| Status | Confirmed |
| Confidence | high |
| Affected files | nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:334-336; nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:356-358; nodes/IvantiNeuronsForITSM/actions/serviceReq/getServiceReqParams.operation.ts:56; nodes/IvantiNeuronsForITSM/actions/serviceReq/create.simplified.operation.ts:171 |

## Problem
User-supplied string values are interpolated directly into OData `$filter` literals wrapped in single quotes, with no escaping of embedded single quotes. The OData spec requires a literal `'` inside a string literal to be doubled (`''`). Four code paths do this.

`getMany` operation, `parseValue` (getMany.operation.ts:334-336):

```ts
if (fieldType === 'string') {
    return `'${value}'`;
}
```

Polling trigger, `parseValue` (IvantiNeuronsForItsmTrigger.node.ts:356-358):

```ts
if (fieldType === 'string') {
    return `'${value}'`;
}
```

Service Request parameter lookup (getServiceReqParams.operation.ts:55-57):

```ts
const response = await ivantiApiRequestAllItems.call(this, 'GET', serviceReqParamsUrl, {
    $filter: `ParentLink_RecID eq '${serviceReqTemplateId}'`,
});
```

Employee lookup by Login ID (create.simplified.operation.ts:170-172):

```ts
const response = await ivantiApiRequest.call(this, 'GET', employeeUrl, {
    $filter: `LoginID eq '${loginId}'`,
}, {}) as SearchResponse;
```

In every case the value comes from node parameters / resource locators that the workflow author or upstream data controls, and is concatenated into the server-side filter string without sanitisation.

Note: the field *name* side is already defended via `assertSafeFieldName` (common.ts:64, called at getMany.operation.ts:381), but the string *value* side has no equivalent protection.

## Why it matters
- Correctness / silently broken filters: A legitimate value such as `O'Brien` produces `Name eq 'O'Brien'`, which is malformed OData. The server rejects it or, worse, parses a truncated value, so the query returns wrong or zero results with no obvious cause.
- OData injection: A value like `x' or RecId ne null or '` produces `Name eq 'x' or RecId ne null or ''`, rewriting the server-side filter to match every record. In the getMany path this can exfiltrate all rows of a Business Object regardless of the intended filter. In the polling trigger it changes which records fire downstream workflow runs. In `resolveEmployeeRecId` it can cause the wrong employee `RecId` to be resolved and used when creating a Service Request (acting as the wrong user). In `getServiceReqParams` it can broaden the template-parameter query.
- This is a high-severity issue because it is both a real injection vector and a frequent functional bug (apostrophes in names are common in ITSM data).

## Resolution
Add one shared escape helper and use it in all four paths.

### 1. Add `escapeODataString` to `common.ts`

File: `nodes/IvantiNeuronsForITSM/common.ts` — append after `assertSafeFieldName`:

```ts
/**
 * Escapes a string value for safe inclusion in an OData string literal.
 * Per the OData spec, a single quote inside a string literal must be doubled.
 * Returns the value already wrapped in single quotes, ready to drop into a
 * `$filter` expression.
 *
 * @param value - Raw string value from user input
 * @returns The value as a quoted, escaped OData string literal, e.g. `'O''Brien'`
 */
export function escapeODataString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}
```

This is a pure function (no `this`), so it works for both `IExecuteFunctions` paths and the `ITriggerFunctions | IPollFunctions` trigger path without type juggling.

### 2. `getMany.operation.ts`

Import is already pulling from `../../common`. Extend it:

BEFORE (getMany.operation.ts:13):
```ts
import { assertSafeFieldName, SearchResponse } from '../../common';
```
AFTER:
```ts
import { assertSafeFieldName, escapeODataString, SearchResponse } from '../../common';
```

BEFORE (getMany.operation.ts:334-336):
```ts
    if (fieldType === 'string') {
        return `'${value}'`;
    }
```
AFTER:
```ts
    if (fieldType === 'string') {
        return escapeODataString(value);
    }
```

### 3. `IvantiNeuronsForItsmTrigger.node.ts`

Add the import (relative path from the node root is `./common`). Add alongside the existing imports near the top of the file:
```ts
import { escapeODataString } from './common';
```

BEFORE (IvantiNeuronsForItsmTrigger.node.ts:356-358):
```ts
	if (fieldType === 'string') {
		return `'${value}'`;
	}
```
AFTER:
```ts
	if (fieldType === 'string') {
		return escapeODataString(value);
	}
```

### 4. `getServiceReqParams.operation.ts`

Add the import (path `../../common`):
```ts
import { escapeODataString } from '../../common';
```

BEFORE (getServiceReqParams.operation.ts:55-57):
```ts
			const response = await ivantiApiRequestAllItems.call(this, 'GET', serviceReqParamsUrl, {
				$filter: `ParentLink_RecID eq '${serviceReqTemplateId}'`,
			});
```
AFTER:
```ts
			const response = await ivantiApiRequestAllItems.call(this, 'GET', serviceReqParamsUrl, {
				$filter: `ParentLink_RecID eq ${escapeODataString(serviceReqTemplateId)}`,
			});
```
(Note the inner `'...'` are removed because `escapeODataString` already returns the quoted literal.)

### 5. `create.simplified.operation.ts`

This file already imports from `../../common` (line 12). Extend it:

BEFORE (create.simplified.operation.ts:12):
```ts
import { serviceReqTemplateRLC, SearchResponse} from '../../common';
```
AFTER:
```ts
import { serviceReqTemplateRLC, SearchResponse, escapeODataString } from '../../common';
```

BEFORE (create.simplified.operation.ts:170-172):
```ts
	const response = await ivantiApiRequest.call(this, 'GET', employeeUrl, {
		$filter: `LoginID eq '${loginId}'`,
	}, {}) as SearchResponse;
```
AFTER:
```ts
	const response = await ivantiApiRequest.call(this, 'GET', employeeUrl, {
		$filter: `LoginID eq ${escapeODataString(loginId)}`,
	}, {}) as SearchResponse;
```

## Verification
1. Build / typecheck and lint to confirm imports resolve and no unused-import warnings: run the project's lint+build (e.g. `npx n8n-node lint` and `npx n8n-node build`, or the equivalent scripts in `package.json`). All four files must compile with the new shared import.
2. Unit-level confirmation of the helper: `escapeODataString("O'Brien")` must return `'O''Brien'` (a single quoted literal with the embedded quote doubled), and `escapeODataString("x' or RecId ne null or '")` must return `'x'' or RecId ne null or '''` so the injected operators are inside the literal rather than terminating it.
3. Manual end-to-end check: in the Business Object Get Many operation add a string filter whose value contains an apostrophe (e.g. `O'Brien`) and confirm the request now sends `Name eq 'O''Brien'` and returns the expected record instead of erroring. Repeat for the polling trigger filter, a Service Request template lookup, and a Login ID containing an apostrophe.

## Related findings
None.
