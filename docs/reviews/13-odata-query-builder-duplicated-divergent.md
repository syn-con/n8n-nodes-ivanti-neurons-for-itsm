# Finding 13: OData query builder (parseValue + buildQuery) duplicated between getMany and the polling trigger, already divergent

| Field | Value |
|---|---|
| Category | DRY / Duplication |
| Severity | high |
| Status | Confirmed |
| Confidence | high |
| Affected files | `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:332-403` (parseValue 332-359, buildODataQuery 368-403, property block 25-250); `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:268-377` (buildQuery 268-314, parseValue 351-377, property block 58-228); `nodes/IvantiNeuronsForITSM/common.ts:64` (assertSafeFieldName) |

## Problem

The OData query assembly (`$select` / `$filter` / `$orderby`) and the `parseValue` literal-coercion helper exist as two near-identical copies, and the copies have already drifted in a security-relevant way.

In `getMany.operation.ts`, `buildODataQuery` sanitizes every filter field name before interpolating it into the `$filter` string:

```ts
// getMany.operation.ts:380-392
const filterStrings = odataFilterCollection.map((filter, index) => {
    assertSafeFieldName.call(this, filter.fieldName);
    const prefix = index === 0 ? '' : ` ${filter.logicalOperator} `;

    if(filter.operation === 'isnull'){
        return `${prefix}${filter.fieldName} eq null`;
    }
    if(filter.operation === 'isnotnull'){
        return `${prefix}${filter.fieldName} ne null`;
    }

    const parsedValue = parseValue.call(this, filter.fieldType, filter.value);
    return `${prefix}${filter.fieldName} ${filter.operation} ${parsedValue}`;
});
```

The trigger's inline `buildQuery` does the **same string interpolation but omits `assertSafeFieldName` entirely** (it is never imported nor called anywhere in the trigger file — confirmed via grep):

```ts
// IvantiNeuronsForItsmTrigger.node.ts:290-303
const filterStrings = odataFilterCollection.map((filter, index) => {
    // First condition has no prefix; subsequent ones are joined by the chosen logical operator
    const prefix = index === 0 ? '' : ` ${filter.logicalOperator} `;

    if(filter.operation === 'isnull'){
        return `${prefix}${filter.fieldName} eq null`;
    }
    if(filter.operation === 'isnotnull'){
        return `${prefix}${filter.fieldName} ne null`;
    }

    const parsedValue = parseValue.call(this, filter.fieldType, filter.value);
    return `${prefix}${filter.fieldName} ${filter.operation} ${parsedValue}`;
});
```

Additional confirmed drift between the two copies:

1. **`$select` RecId injection** — the trigger always prepends `RecId` (lines 276-278: `if (!fieldNames.includes('RecId')) { fieldNames.unshift('RecId'); }`); `getMany` does not.
2. **`parseValue` boolean branch** — `getMany.operation.ts:344-350` contains dead/incorrect logic (`const boolean = Boolean(value); if (boolean === undefined)` — a `boolean` can never be `undefined`), whereas the trigger's copy (lines 366-368) is the simpler `return Boolean(value);`. The two `parseValue` functions are no longer byte-identical.

The full OData property UI block (Business Object / Return All / Limit / Select All Fields / Select Fields / OData Filter / Order By / Order Direction) is also copy-pasted: `getMany.operation.ts:25-250` vs `IvantiNeuronsForItsmTrigger.node.ts:58-228`.

## Why it matters

- **Security (OData filter injection).** `assertSafeFieldName` (`common.ts:64-67`) is the guard that rejects field names containing anything other than `[A-Za-z0-9_]`. Because the trigger path skips it, a user-supplied filter `Field Name` is interpolated raw into the `$filter` query string. The polling trigger and the `getMany` action expose the identical filter UI, yet only one path is protected. Any hardening applied to one copy silently fails to protect the other — exactly what has already happened.
- **Maintainability / correctness drift.** Three behaviors now differ between two functions that are supposed to be the same (sanitization, RecId injection, boolean parsing). Each future change must be made in two places; the boolean dead-code already shows a fix landed in one copy only.
- **Testability.** A single exported builder can be unit-tested once; two inline copies (one of them a closure inside `poll`) cannot be tested without standing up a full node execution context.

## Resolution

Extract one shared `parseValue` + `buildODataQuery` module and one shared property array, then consume them from `getMany`, `searchByKeyword`, the trigger, and future list ops. Bake `assertSafeFieldName` into the shared builder so every path gets the check.

### Step 1 — Create the shared query-builder module

New file: `nodes/IvantiNeuronsForITSM/odata/queryBuilder.ts`

```ts
import type { IDataObject, IExecuteFunctions, IPollFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { assertSafeFieldName } from '../common';

/** Context shared by execute (action) and poll (trigger) callers. */
type QueryCtx = IExecuteFunctions | IPollFunctions;

/** A single row from the OData Filter fixedCollection UI. */
export interface ODataFilterEntry {
	fieldName: string;
	fieldType: string;
	operation: string;
	value: string;
	logicalOperator: string;
}

/** Options that differ per caller. */
export interface BuildODataQueryOptions {
	/** Prepend RecId to $select when projecting specific fields (trigger needs this for dedup). */
	includeRecId?: boolean;
}

/**
 * Converts a raw string value from the OData filter UI into the correct OData literal.
 *
 * - `string`  -> wrapped in single quotes
 * - `number`  -> parsed as a JS number
 * - `boolean` -> coerced to boolean
 * - `date`    -> parsed and returned as an ISO 8601 string
 * - anything else -> null
 *
 * @throws {NodeOperationError} when the value cannot be parsed for the given type
 */
export function parseValue(
	this: QueryCtx,
	fieldType: string,
	value: string,
): string | number | boolean | null {
	if (fieldType === 'string') {
		return `'${value}'`;
	}
	if (fieldType === 'number') {
		const num = Number(value);
		if (isNaN(num)) {
			throw new NodeOperationError(this.getNode(), `Invalid number: ${value}`);
		}
		return num;
	}
	if (fieldType === 'boolean') {
		return Boolean(value);
	}
	if (fieldType === 'date') {
		const date = new Date(value);
		if (isNaN(date.getTime())) {
			throw new NodeOperationError(this.getNode(), `Invalid date: ${value}`);
		}
		return date.toISOString();
	}
	return null;
}

/**
 * Assembles an OData query object ($select, $filter, $orderby) from the node UI inputs.
 *
 * `getNodeParameter` is read positionally so the same signature works for both
 * `IExecuteFunctions` (which passes an item index) and `IPollFunctions`.
 *
 * Every filter field name is validated with `assertSafeFieldName`, so all callers
 * get OData-injection protection for free.
 */
export function buildODataQuery(
	this: QueryCtx,
	itemIndex: number,
	options: BuildODataQueryOptions = {},
): IDataObject {
	const query: IDataObject = {};

	const selectAllFields = this.getNodeParameter('selectAllFields', itemIndex) as boolean;
	if (!selectAllFields) {
		const selectFieldsCollection = this.getNodeParameter(
			'selectFields.fields',
			itemIndex,
			[],
		) as Array<{ name: string }>;
		const fieldNames = selectFieldsCollection
			.map((f) => f.name)
			.filter((name) => name !== '' && name !== undefined && name !== null);
		if (options.includeRecId && !fieldNames.includes('RecId')) {
			fieldNames.unshift('RecId');
		}
		query['$select'] = fieldNames.join(',');
	}

	const odataFilterCollection = this.getNodeParameter(
		'odataFilter.odataFilter',
		itemIndex,
		[],
	) as ODataFilterEntry[];
	if (odataFilterCollection.length > 0) {
		const filterStrings = odataFilterCollection.map((filter, index) => {
			assertSafeFieldName.call(this, filter.fieldName);
			const prefix = index === 0 ? '' : ` ${filter.logicalOperator} `;

			if (filter.operation === 'isnull') {
				return `${prefix}${filter.fieldName} eq null`;
			}
			if (filter.operation === 'isnotnull') {
				return `${prefix}${filter.fieldName} ne null`;
			}

			const parsedValue = parseValue.call(this, filter.fieldType, filter.value);
			return `${prefix}${filter.fieldName} ${filter.operation} ${parsedValue}`;
		});
		query['$filter'] = filterStrings.join('');
	}

	const orderBy = this.getNodeParameter('orderBy', itemIndex, '') as string;
	const orderDirection = this.getNodeParameter('orderDirection', itemIndex, 'asc') as string;
	if (orderBy) {
		query['$orderby'] = `${orderBy} ${orderDirection}`;
	}

	return query;
}
```

Note: `assertSafeFieldName` in `common.ts:64` is already typed `this: IExecuteFunctions | IPollFunctions`, so it is callable from both the action and trigger contexts with no signature change.

### Step 2 — Create the shared property block

New file: `nodes/IvantiNeuronsForITSM/odata/queryProperties.ts`

Move the verbatim property objects currently duplicated in `getMany.operation.ts:25-250` and `IvantiNeuronsForItsmTrigger.node.ts:58-228` into one exported array. (Reconcile the two minor differences: the trigger's `object` default is `'Incidents'` while getMany's is `''` — keep them caller-specific by overriding `object` separately, and share the rest.)

```ts
import type { INodeProperties } from 'n8n-workflow';

/**
 * Shared OData list properties (Return All / Limit / Select / Filter / Order By).
 * The `object` (Business Object) property is intentionally NOT included here so
 * each caller can set its own default/placeholder; spread it in alongside this array.
 */
export const odataListProperties: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		noDataExpression: true,
		default: false,
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: { show: { returnAll: [false] } },
	},
	{
		displayName: 'Select All Fields',
		name: 'selectAllFields',
		type: 'boolean',
		default: true,
		description: 'Whether to select all fields or not',
	},
	{
		displayName: 'Select Fields',
		name: 'selectFields',
		placeholder: 'Add Select Field',
		type: 'fixedCollection',
		default: [],
		typeOptions: { multipleValues: true },
		description: 'The fields to select from the business object',
		options: [
			{
				name: 'fields',
				displayName: 'Field',
				values: [
					{ displayName: 'Name', name: 'name', type: 'string', placeholder: 'Name', default: '' },
				],
			},
		],
		displayOptions: { show: { selectAllFields: [false] } },
	},
	{
		displayName: 'OData Filter',
		name: 'odataFilter',
		placeholder: 'Add OData Filter',
		type: 'fixedCollection',
		default: [],
		typeOptions: { multipleValues: true },
		options: [
			{
				name: 'odataFilter',
				displayName: 'OData Filter',
				values: [
					{ displayName: 'Field Name', name: 'fieldName', type: 'string', default: '', description: 'Name of the field to filter by', required: true },
					{
						displayName: 'Field Type', name: 'fieldType', type: 'options', default: 'string',
						description: 'The type of the field', required: true,
						options: [
							{ name: 'Boolean', value: 'boolean' },
							{ name: 'Date', value: 'date' },
							{ name: 'Number', value: 'number' },
							{ name: 'String', value: 'string' },
						],
					},
					{
						displayName: 'Logical Operator', name: 'logicalOperator', type: 'options', default: 'and',
						options: [{ name: 'And', value: 'and' }, { name: 'Or', value: 'or' }],
					},
					{
						displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
						default: 'eq', required: true,
						options: [
							{ name: 'Equals', value: 'eq' },
							{ name: 'Greater Than', value: 'gt' },
							{ name: 'Greater Than or Equal', value: 'ge' },
							{ name: 'Is Not Null', value: 'isnotnull' },
							{ name: 'Is Null', value: 'isnull' },
							{ name: 'Less Than', value: 'lt' },
							{ name: 'Less Than or Equal', value: 'le' },
							{ name: 'Not Equals', value: 'ne' },
						],
					},
					{
						displayName: 'Value', name: 'value', type: 'string', default: '',
						description: 'The value to compare the field against', required: true,
						displayOptions: { hide: { operation: ['isnull', 'isnotnull'] } },
					},
				],
			},
		],
	},
	{
		displayName: 'Order By',
		name: 'orderBy',
		type: 'string',
		default: '',
		description: 'Field to order results by',
		placeholder: 'Name',
	},
	{
		displayName: 'Order Direction',
		name: 'orderDirection',
		type: 'options',
		default: 'asc',
		options: [{ name: 'Ascending', value: 'asc' }, { name: 'Descending', value: 'desc' }],
	},
];
```

### Step 3 — Consume from `getMany.operation.ts`

Replace the inline `parseValue` (lines 332-359) and `buildODataQuery` (lines 368-403) and the duplicated property objects.

BEFORE (top of file, lines 12-13 and 25-250):

```ts
import { ivantiApiRequest, ivantiApiRequestAllItems, ivantiApiRequestAllItemsWithLimit } from '../../transports'
import { assertSafeFieldName, SearchResponse } from '../../common';
...
export const properties: INodeProperties[] = [
    { displayName: "Business Object", name: "object", ... },
    { displayName: 'Return All', ... },
    /* ...225 lines of UI... */
];
```

AFTER:

```ts
import { ivantiApiRequest, ivantiApiRequestAllItems, ivantiApiRequestAllItemsWithLimit } from '../../transports'
import { SearchResponse } from '../../common';
import { buildODataQuery } from '../../odata/queryBuilder';
import { odataListProperties } from '../../odata/queryProperties';
...
export const properties: INodeProperties[] = [
    {
        displayName: 'Business Object',
        name: 'object',
        type: 'string',
        default: '',
        required: true,
        noDataExpression: true,
        description: "The business object to retrieve, e.g., 'Incidents'",
    },
    ...odataListProperties,
];
```

Then delete the local `parseValue` (332-359) and `buildODataQuery` (368-403). The call site at line 290 stays valid because the imported builder has the same `(this, itemIndex)` signature:

```ts
// getMany.operation.ts:290 — unchanged
const odataQuery = buildODataQuery.call(this, i) as IDataObject;
```

### Step 4 — Consume from `IvantiNeuronsForItsmTrigger.node.ts`

BEFORE (lines 11, 58-228 property block, 268-314 inline `buildQuery`, 351-377 `parseValue`):

```ts
import { ivantiApiRequestAllItems, ivantiApiRequestAllItemsWithLimit } from './transports';
...
properties: [
    { displayName: 'Business Object', name: 'object', ... },
    /* ...170 lines duplicated... */
],
...
const buildQuery = (): IDataObject => { /* inline copy without assertSafeFieldName */ };
const query = buildQuery();
...
function parseValue(...) { /* second copy */ }
```

AFTER:

```ts
import { ivantiApiRequestAllItems, ivantiApiRequestAllItemsWithLimit } from './transports';
import { buildODataQuery } from '../IvantiNeuronsForITSM/odata/queryBuilder';
import { odataListProperties } from '../IvantiNeuronsForITSM/odata/queryProperties';
...
properties: [
    {
        displayName: 'Business Object',
        name: 'object',
        type: 'string',
        default: 'Incidents',
        required: true,
        noDataExpression: true,
        placeholder: 'Incidents',
        description: "The plural OData entity name to poll, e.g. 'Incidents', 'Changes', 'Problems'",
    },
    ...odataListProperties,
],
```

Inside `poll`, delete the inline `buildQuery` closure (268-314) and call the shared builder with `includeRecId` to preserve the trigger's RecId behavior. The poll context reads parameters without an item index, so pass `0`:

```ts
// replaces lines 316
const query = buildODataQuery.call(this, 0, { includeRecId: true });
```

Finally delete the standalone `parseValue` (351-377) at the bottom of the file. Because the trigger now routes through the shared builder, `filter.fieldName` is validated by `assertSafeFieldName` on the poll path — closing the injection gap.

(The relative import path `../IvantiNeuronsForITSM/odata/...` is correct: the trigger lives in `nodes/IvantiNeuronsForItsmConnector/`-sibling folder `nodes/IvantiNeuronsForITSM/`. The trigger file is `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts`, so the import is actually `./odata/queryBuilder` / `./odata/queryProperties`. Use `./odata/...` from the trigger, since it sits in the same `IvantiNeuronsForITSM` directory.)

> Correction for Step 4 imports — the trigger is in `nodes/IvantiNeuronsForITSM/`, same directory as the new `odata/` folder, so use:
> ```ts
> import { buildODataQuery } from './odata/queryBuilder';
> import { odataListProperties } from './odata/queryProperties';
> ```

### Step 5 — Optional: align `searchByKeyword`

`searchByKeyword.operation.ts:141-149` builds `$select` inline (without RecId, without the empty-string filter that getMany applies) and uses `$search` rather than `$filter`. It does not use the filter/orderby UI, so it cannot consume the whole builder, but it can reuse the `$select` portion. At minimum, replace its private `SearchResponse` interface (lines 205-209) with the shared one from `common.ts` to remove that smaller duplication. This is lower priority than Steps 1-4.

## Verification

1. Build / typecheck: run the project's build (per AGENTS.md, prefer the `n8n-node` CLI) — e.g. `npx n8n-node build` or `npm run build`. It must compile with no TS errors; the deleted local `parseValue`/`buildODataQuery`/`buildQuery` must not leave dangling references.
2. Lint: `npx n8n-node lint` (or `npm run lint`) must pass with no new warnings, confirming no unused imports remain (e.g. `assertSafeFieldName` should no longer be imported directly in `getMany.operation.ts`).
3. Static confirmation of the security fix:
   - `grep -rn "assertSafeFieldName" nodes/` should now show the call inside `odata/queryBuilder.ts` and NO remaining direct call in `getMany.operation.ts`.
   - `grep -n "buildQuery\|function parseValue" nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts` should return nothing (both inline copies removed).
4. Behavioral check (manual or test): with a filter whose Field Name is `Name; DROP` (contains a space/semicolon), BOTH the `getMany` action and the polling trigger must now throw `Invalid field name: "Name; DROP"` from `assertSafeFieldName`. Before the fix the trigger accepted it.
5. Behavioral check for `$select`: configure the trigger with `Select All Fields = false` and one field; confirm the emitted `$select` still starts with `RecId,` (preserved via `includeRecId: true`), while the `getMany` action's `$select` does not include `RecId` unless the user added it.

## Related findings

None.
