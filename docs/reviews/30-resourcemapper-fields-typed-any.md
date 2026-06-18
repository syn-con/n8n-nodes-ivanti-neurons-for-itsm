# Finding 30: resourceMapper field schemas typed as any[] with eslint-disable instead of n8n's ResourceMapperField

| Field | Value |
|---|---|
| Category | TypeScript Quality |
| Severity | medium |
| Status | Confirmed |
| Confidence | high |
| Affected files | /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/methods/listSearch.ts:124-129, 149-150, 161-162, 244-245, 257-258 |

## Problem

Both `resourceMapping` methods declare their return type and their field accumulator as `any[]`, suppressing the linter with `@typescript-eslint/no-explicit-any` overrides instead of using the types `n8n-workflow` already exports for exactly this purpose.

In `nodes/IvantiNeuronsForITSM/methods/listSearch.ts`:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getServiceRequestParametersSchema(this: ILoadOptionsFunctions): Promise<{ fields: any[] }> {
	...
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const fields: any[] = [];
```

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getServiceRequestParametersSimplifiedSchema(this: ILoadOptionsFunctions): Promise<{ fields: any[] }> {
	...
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const fields: any[] = [];
```

The helper that computes the field `type` also returns a bare `string` rather than the `FieldType` union (listSearch.ts:124):

```ts
function mapFieldType(lowerType: string): string {
	if (lowerType.includes('checkbox')) return 'boolean';
	if (lowerType.includes('datetime') || lowerType.includes('date')) return 'dateTime';
	if (lowerType.includes('time')) return 'time';
	return 'string';
}
```

Both functions are registered under `methods.resourceMapping` in `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.ts:107-113`, so n8n already expects them to return `Promise<ResourceMapperFields>` (an object of shape `{ fields: ResourceMapperField[] }`). The current code only imports `IDataObject, ILoadOptionsFunctions, INodeListSearchResult` (listSearch.ts:1) — the resource-mapper types are not imported even though they exist in the same module.

Because the field literals are typed `any`, the compiler does not verify them. For example each object pushed uses keys like `id`, `displayName`, `required`, `defaultMatch`, `display`, `type` — a typo (e.g. `requried`, or `type: 'datetime'` instead of `'dateTime'`) would compile silently and only surface as a broken/empty resourceMapper at runtime in the n8n UI.

## Why it matters

- Maintainability / correctness: typing the literals as `ResourceMapperField` makes the compiler validate every field key and the `type` value against n8n's contract. Right now `mapFieldType` could return any string and the field objects could contain any keys; nothing catches mistakes until the node is loaded in n8n and the mapper renders wrong (or empty).
- Type safety of the public method contract: n8n calls these methods expecting `ResourceMapperFields`. Declaring `{ fields: any[] }` discards that guarantee, so the two functions can silently drift out of conformance.
- Lint cleanliness: the project rulebook (AGENTS.md "Key guidelines") says to use proper types whenever possible and to avoid disabling lint rules without a very specific reason. Here a precise, supported type exists, so the `eslint-disable` lines are unnecessary suppressions that can simply be removed.

## Resolution

All changes are in `nodes/IvantiNeuronsForITSM/methods/listSearch.ts`.

### Step 1 — Import the resource-mapper types

BEFORE (listSearch.ts:1):

```ts
import { IDataObject, ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';
```

AFTER:

```ts
import {
	FieldType,
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	ResourceMapperField,
	ResourceMapperFields,
} from 'n8n-workflow';
```

### Step 2 — Tighten `mapFieldType` to return `FieldType`

BEFORE (listSearch.ts:124-129):

```ts
function mapFieldType(lowerType: string): string {
	if (lowerType.includes('checkbox')) return 'boolean';
	if (lowerType.includes('datetime') || lowerType.includes('date')) return 'dateTime';
	if (lowerType.includes('time')) return 'time';
	return 'string';
}
```

AFTER:

```ts
function mapFieldType(lowerType: string): FieldType {
	if (lowerType.includes('checkbox')) return 'boolean';
	if (lowerType.includes('datetime') || lowerType.includes('date')) return 'dateTime';
	if (lowerType.includes('time')) return 'time';
	return 'string';
}
```

`FieldType` is the union (`'string' | 'number' | 'dateTime' | 'time' | 'boolean' | ...`) that n8n accepts for a resourceMapper field; if any of these string literals were wrong it would now fail to compile.

### Step 3 — Type `getServiceRequestParametersSchema` and remove its eslint-disable

BEFORE (listSearch.ts:149-162):

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getServiceRequestParametersSchema(this: ILoadOptionsFunctions): Promise<{ fields: any[] }> {
	const serviceReqTemplateId = this.getCurrentNodeParameter('serviceReqTemplateId.value') as string;
	if (serviceReqTemplateId === '') {
		return { fields: [] };
	}
	try {
		const result: IDataObject[] = await ivantiApiRequestAllItems.call(this, 'GET', serviceReqParamsUrl, {
			"$filter": `ParentLink_RecID eq '${serviceReqTemplateId}'`,
			"$select": 'RecId,DisplayName,DisplayType,Name,ConfigOptions,RequiredExpression',
		});

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const fields: any[] = [];
```

AFTER:

```ts
export async function getServiceRequestParametersSchema(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
	const serviceReqTemplateId = this.getCurrentNodeParameter('serviceReqTemplateId.value') as string;
	if (serviceReqTemplateId === '') {
		return { fields: [] };
	}
	try {
		const result: IDataObject[] = await ivantiApiRequestAllItems.call(this, 'GET', serviceReqParamsUrl, {
			"$filter": `ParentLink_RecID eq '${serviceReqTemplateId}'`,
			"$select": 'RecId,DisplayName,DisplayType,Name,ConfigOptions,RequiredExpression',
		});

		const fields: ResourceMapperField[] = [];
```

Note: the `id` field is currently pushed as `item.RecId` (an `IDataObject` value, i.e. `any`/`unknown`-ish). `ResourceMapperField.id` is typed `string`, so once the array is `ResourceMapperField[]` the compiler will require `id: item.RecId as string` for the non-dropdown push (listSearch.ts:176) and the dropdown push (listSearch.ts:199). Add the `as string` cast there to match the existing casting style already used throughout this file (e.g. `item.Name as string`):

```ts
fields.push({
	id: item.RecId as string,
	displayName: `${item.Name} [${capitalize(item.DisplayType as string)}]`,
	required: isRequired,
	defaultMatch: false,
	display: true,
	type: mapFieldType(lowerType),
});
```

and in the dropdown branch:

```ts
fields.push(
	{
		id: item.RecId as string,
		displayName: valueDisplayName,
		required: isRequired,
		defaultMatch: false,
		display: true,
		type: 'string',
	},
	{
		id: `${item.RecId as string}_option`,
		displayName: recIdDisplayName,
		required: isRequired,
		defaultMatch: false,
		display: true,
		type: 'string',
	},
);
```

The trailing `fields.sort(...)` and `return { fields };` (listSearch.ts:217-218) and the `catch { return { fields: [] }; }` (listSearch.ts:220-222) remain unchanged and already satisfy `ResourceMapperFields`.

### Step 4 — Type `getServiceRequestParametersSimplifiedSchema` and remove its eslint-disable

BEFORE (listSearch.ts:244-258):

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getServiceRequestParametersSimplifiedSchema(this: ILoadOptionsFunctions): Promise<{ fields: any[] }> {
	const serviceReqTemplateId = this.getCurrentNodeParameter('serviceReqTemplateId.value') as string;
	if (serviceReqTemplateId === '') {
		return { fields: [] };
	}

	try {
		const result: IDataObject[] = await ivantiApiRequestAllItems.call(this, 'GET', serviceReqParamsUrl, {
			'$filter': `ParentLink_RecID eq '${serviceReqTemplateId}'`,
			'$select': 'RecId,DisplayName,DisplayType,Name,ConfigOptions,RequiredExpression',
		});

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const fields: any[] = [];
```

AFTER:

```ts
export async function getServiceRequestParametersSimplifiedSchema(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
	const serviceReqTemplateId = this.getCurrentNodeParameter('serviceReqTemplateId.value') as string;
	if (serviceReqTemplateId === '') {
		return { fields: [] };
	}

	try {
		const result: IDataObject[] = await ivantiApiRequestAllItems.call(this, 'GET', serviceReqParamsUrl, {
			'$filter': `ParentLink_RecID eq '${serviceReqTemplateId}'`,
			'$select': 'RecId,DisplayName,DisplayType,Name,ConfigOptions,RequiredExpression',
		});

		const fields: ResourceMapperField[] = [];
```

Apply the same `id: item.RecId as string` cast to the single `fields.push({ ... })` in this function (listSearch.ts:275-282):

```ts
fields.push({
	id: item.RecId as string,
	displayName: `${item.Name} [${displayType}]`,
	required: isRequired,
	defaultMatch: false,
	display: true,
	type: mapFieldType(lowerType),
});
```

The rest of the function (sort, return, catch) is unchanged.

### Notes

- No new file/helper/module is needed — `FieldType`, `ResourceMapperField`, and `ResourceMapperFields` are all part of `n8n-workflow`'s public type exports (the same module already imported on line 1). `n8n-workflow` is declared as a peer dependency in `package.json` (`"n8n-workflow": "*"`), so the types resolve at build time.
- Do not change the runtime behavior: the field object keys (`id`, `displayName`, `required`, `defaultMatch`, `display`, `type`) already match `ResourceMapperField`, so this is purely a typing tightening. If the compiler flags any of these keys after the change, that flag is the bug this finding is meant to catch — fix the key, do not loosen the type back to `any`.

## Verification

1. From the repo root run the type-check/lint the project uses:
   ```
   npm run lint
   npm run build
   ```
   `n8n-node lint` should report zero `@typescript-eslint/no-explicit-any` occurrences for `listSearch.ts` (the two `eslint-disable` comments are gone and there are no remaining `any` annotations in that file), and `n8n-node build` (tsc) should compile with no errors.
2. Confirm the four `eslint-disable-next-line @typescript-eslint/no-explicit-any` lines and the four `: { fields: any[] }` / `const fields: any[]` occurrences no longer appear:
   ```
   grep -n "no-explicit-any\|fields: any\[\]" nodes/IvantiNeuronsForITSM/methods/listSearch.ts
   ```
   should return nothing.
3. Sanity-check the contract by introducing a deliberate typo (e.g. temporarily set `type: 'datetime'` lowercase, or `requried: isRequired`) and re-running `npm run build`: it should now fail to compile, proving the types are being enforced. Revert the typo afterwards.

## Related findings

None.
