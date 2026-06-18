# Finding 4: Field names, $orderby, $select, recordId, relationship, quickAction and savedSearch names interpolated into OData URL/query without validation

| Field | Value |
|---|---|
| Category | Security |
| Severity | high |
| Status | Confirmed |
| Confidence | high |
| Affected files | nodes/IvantiNeuronsForITSM/common.ts:64; nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:373, 397-401; nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:279, 295, 298, 302, 309-311; nodes/IvantiNeuronsForITSM/actions/object/getByRecId.operation.ts:86; nodes/IvantiNeuronsForITSM/actions/relationship/link.operation.ts:103; nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts:131; nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation.ts:108; nodes/IvantiNeuronsForITSM/actions/search/savedsearch.operation.ts:91 |

## Problem

A safety helper exists but is applied inconsistently. `assertSafeFieldName` is defined in `common.ts:64`:

```ts
export function assertSafeFieldName(this: IExecuteFunctions | IPollFunctions, name: string) {
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
        throw new NodeOperationError(this.getNode(), `Invalid field name: "${name}"`);
    }
}
```

It is called in exactly **one** place — the `$filter` field name in `getMany.operation.ts:381` (`assertSafeFieldName.call(this, filter.fieldName);`). Every other identifier that ends up inside the OData URL or query string is concatenated raw.

The endpoint string is built by raw interpolation and handed straight to the HTTP client with **no encoding** (`transports/index.ts:51`, `url: `https://${tenant}${tenantPath}${endpoint}``), and `qs` values are passed through unmodified. So nothing downstream sanitizes these inputs.

Confirmed raw-interpolation sites:

1. `$select` field list — `getMany.operation.ts:373`:
```ts
query["$select"] = selectFieldsCollection.map(field => field.name)
    .filter(field => field !== '' && field !== undefined && field !== null)
    .join(',');
```

2. `$orderby` field and direction — `getMany.operation.ts:397-401`:
```ts
const orderBy = this.getNodeParameter('orderBy', itemIndex) as string;
const orderDirection = this.getNodeParameter('orderDirection', itemIndex) as string;
if (orderBy) {
    query["$orderby"] = `${orderBy} ${orderDirection}`;
}
```

3. The polling trigger validates **no** identifier at all — `IvantiNeuronsForItsmTrigger.node.ts:279` ($select), `:295`/`:298` (filter field names in the isnull/isnotnull branches), `:302` (filter field name in the general branch), and `:309-311` ($orderby):
```ts
query['$select'] = fieldNames.join(',');                 // line 279
...
return `${prefix}${filter.fieldName} eq null`;           // line 295
...
return `${prefix}${filter.fieldName} ne null`;           // line 298
...
return `${prefix}${filter.fieldName} ${filter.operation} ${parsedValue}`;  // line 302
...
query['$orderby'] = `${orderBy} ${orderDirection}`;      // line 309-311
```

4. `recordId`/`targetRecordId` placed inside OData key literals `('...')`, and `relationship`/`quickAction`/`savedSearchName`/`businessObject` appended as raw path segments — only an emptiness (and sometimes `endsWith('s')`) check is performed:

- `getByRecId.operation.ts:86`: `const fullUrl = `${baseUrl}('${recordId}')`;`
- `link.operation.ts:103`: `const url = `/odata/businessobject/${businessObject}('${recordId}')/${relationship}('${targetRecordId}')/$Ref`;`
- `getRelated.operation.ts:131`: `const url = `/odata/businessobject/${businessObject}('${recordId}')/${relationship}`;`
- `run.operation.ts:108`: `const baseUrl = `/odata/businessobject/${businessObject}('${recordId}')/${quickAction}`;`
- `savedsearch.operation.ts:91`: `... `/odata/businessobject/${searchObject}/${savedSearchName}`, ...`

Note that `link.operation.ts` and `getRelated.operation.ts` do not even enforce the `endsWith('s')` check on `businessObject` that the other operations have.

## Why it matters

Every interpolated value above is fully user-controlled (node parameters, which can be expressions fed from upstream items). Because they are concatenated into the OData URL path / key literals / query string with no validation and no `encodeURIComponent`, an attacker (or a malicious/compromised upstream item driving an expression) can:

- **Break out of an OData key literal.** A `recordId` containing `')/<segment>...` escapes the `('...')` boundary and rewrites the rest of the path, allowing traversal to a different entity, navigation property, or function — e.g. reading or mutating records the workflow author never intended.
- **Inject `$filter`/path expressions via field names** in the trigger, which performs no `assertSafeFieldName` check at all. A crafted `fieldName` such as `RecId eq null or 1 eq 1--` rewrites the filter, turning a narrow poll into a full-table read.
- **Inject raw path segments** through `relationship`, `quickAction`, and `savedSearchName`, reaching arbitrary OData segments/functions on the same authenticated tenant.
- **Cause request corruption / 400s** from unescaped reserved characters (`#`, `&`, `?`, spaces, single quotes) even in benign use, producing confusing runtime failures.

This is classic injection into a privileged, authenticated server-side request (the credential is a tenant-wide API key / basic auth). The blast radius is the whole ITSM tenant the credential can reach. Severity high is appropriate.

## Resolution

The fix has three parts: (a) make the validation helpers shared and complete, (b) validate every interpolated identifier, and (c) encode path-segment key literals so even validated-but-special values cannot break the URL structure.

### Step 1 — Extend the shared helpers in `common.ts`

Add a GUID validator and a safe path-segment encoder next to the existing `assertSafeFieldName`. `assertSafeFieldName` already lives in `nodes/IvantiNeuronsForITSM/common.ts` and is imported by `getMany.operation.ts` — reuse it everywhere.

`nodes/IvantiNeuronsForITSM/common.ts` — AFTER (append below line 68):

```ts
/**
 * Asserts that a value is a valid Ivanti record GUID.
 * Ivanti GUIDs are documented as 32 hex characters, e.g.
 * '07E1BD1BF5804E67B8E76B26FA6EF9A0'. Hyphenated 36-char GUIDs are also accepted.
 * @throws {NodeOperationError} if the value is not a valid GUID
 */
export function assertSafeRecordId(this: IExecuteFunctions | IPollFunctions, id: string) {
    if (!/^[0-9A-Fa-f]{32}$/.test(id) && !/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(id)) {
        throw new NodeOperationError(this.getNode(), `Invalid record ID (expected a 32-character GUID): "${id}"`);
    }
}

/**
 * Asserts that an OData path segment (business object collection name,
 * relationship name, quick action name, saved-search name) is safe to
 * interpolate into a URL path. Allows only letters, digits and underscores.
 * @throws {NodeOperationError} if the segment is not safe
 */
export function assertSafePathSegment(this: IExecuteFunctions | IPollFunctions, segment: string, label: string) {
    if (!/^[A-Za-z0-9_]+$/.test(segment)) {
        throw new NodeOperationError(this.getNode(), `Invalid ${label}: "${segment}"`);
    }
}
```

> The polling trigger uses `IPollFunctions`, the action operations use `IExecuteFunctions` — the existing `this:` union type already covers both, so all these helpers are usable from both nodes.

### Step 2 — Validate `$select` and `$orderby` in `getMany.operation.ts`

`getMany.operation.ts` already imports `assertSafeFieldName` (line 13). Extend the import and apply it.

Import — BEFORE (line 13):
```ts
import { assertSafeFieldName, SearchResponse } from '../../common';
```
AFTER:
```ts
import { assertSafeFieldName, assertSafePathSegment, SearchResponse } from '../../common';
```

`$select` — BEFORE (`getMany.operation.ts:371-376`):
```ts
if (!selectAllFields) {
    const selectFieldsCollection = this.getNodeParameter('selectFields.fields', itemIndex, []) as { name: string }[];
    query["$select"] = selectFieldsCollection.map(field => field.name)
        .filter(field => field !== '' && field !== undefined && field !== null)
        .join(',');
}
```
AFTER:
```ts
if (!selectAllFields) {
    const selectFieldsCollection = this.getNodeParameter('selectFields.fields', itemIndex, []) as { name: string }[];
    const selectNames = selectFieldsCollection.map(field => field.name)
        .filter(field => field !== '' && field !== undefined && field !== null);
    selectNames.forEach(name => assertSafeFieldName.call(this, name));
    query["$select"] = selectNames.join(',');
}
```

`$orderby` — BEFORE (`getMany.operation.ts:397-401`):
```ts
const orderBy = this.getNodeParameter('orderBy', itemIndex) as string;
const orderDirection = this.getNodeParameter('orderDirection', itemIndex) as string;
if (orderBy) {
    query["$orderby"] = `${orderBy} ${orderDirection}`;
}
```
AFTER:
```ts
const orderBy = this.getNodeParameter('orderBy', itemIndex) as string;
const orderDirection = this.getNodeParameter('orderDirection', itemIndex) as string;
if (orderBy) {
    assertSafeFieldName.call(this, orderBy);
    const direction = orderDirection === 'desc' ? 'desc' : 'asc';
    query["$orderby"] = `${orderBy} ${direction}`;
}
```

(`orderDirection` comes from an `options` dropdown, but pinning it to a whitelist removes any chance of an expression injecting into it and is essentially free.)

The `$filter` field name (`getMany.operation.ts:381`) is already guarded by `assertSafeFieldName.call(this, filter.fieldName);` and needs no change.

### Step 3 — Validate identifiers in the polling trigger

`IvantiNeuronsForItsmTrigger.node.ts` performs **no** identifier validation. Import the shared helpers and apply them.

Import — BEFORE (line 11):
```ts
import { ivantiApiRequestAllItems, ivantiApiRequestAllItemsWithLimit } from './transports';
```
AFTER:
```ts
import { ivantiApiRequestAllItems, ivantiApiRequestAllItemsWithLimit } from './transports';
import { assertSafeFieldName, assertSafePathSegment } from './common';
```

Validate the business object (after the existing `endsWith('s')` check, around line 260):
```ts
assertSafePathSegment.call(this, object, 'Business Object');
```

`$select` — BEFORE (`IvantiNeuronsForItsmTrigger.node.ts:272-280`):
```ts
if (!selectAllFields) {
    const selectFieldsCollection = this.getNodeParameter('selectFields.fields', []) as { name: string }[];
    const fieldNames = selectFieldsCollection.map((f) => f.name).filter(Boolean);
    // Always include RecId so deduplication across poll cycles works
    if (!fieldNames.includes('RecId')) {
        fieldNames.unshift('RecId');
    }
    query['$select'] = fieldNames.join(',');
}
```
AFTER:
```ts
if (!selectAllFields) {
    const selectFieldsCollection = this.getNodeParameter('selectFields.fields', []) as { name: string }[];
    const fieldNames = selectFieldsCollection.map((f) => f.name).filter(Boolean);
    fieldNames.forEach((name) => assertSafeFieldName.call(this, name));
    // Always include RecId so deduplication across poll cycles works
    if (!fieldNames.includes('RecId')) {
        fieldNames.unshift('RecId');
    }
    query['$select'] = fieldNames.join(',');
}
```

`$filter` field names — BEFORE (`IvantiNeuronsForItsmTrigger.node.ts:290-303`):
```ts
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
AFTER (add the assertion as the first statement in the callback):
```ts
const filterStrings = odataFilterCollection.map((filter, index) => {
    assertSafeFieldName.call(this, filter.fieldName);
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

`$orderby` — BEFORE (`IvantiNeuronsForItsmTrigger.node.ts:307-311`):
```ts
const orderBy = this.getNodeParameter('orderBy', '') as string;
const orderDirection = this.getNodeParameter('orderDirection', 'asc') as string;
if (orderBy) {
    query['$orderby'] = `${orderBy} ${orderDirection}`;
}
```
AFTER:
```ts
const orderBy = this.getNodeParameter('orderBy', '') as string;
const orderDirection = this.getNodeParameter('orderDirection', 'asc') as string;
if (orderBy) {
    assertSafeFieldName.call(this, orderBy);
    const direction = orderDirection === 'desc' ? 'desc' : 'asc';
    query['$orderby'] = `${orderBy} ${direction}`;
}
```

### Step 4 — Validate record IDs and encode key literals / path segments in the URL-building operations

For each operation that builds a URL, (1) validate the GUID(s) with `assertSafeRecordId`, (2) validate path segments with `assertSafePathSegment`, and (3) wrap the GUID in `encodeURIComponent` inside the `('...')` literal as defense in depth.

`getByRecId.operation.ts` — add import `import { assertSafeRecordId } from '../../common';` and:

BEFORE (lines 82-86):
```ts
const recordId = this.getNodeParameter('recordId', i) as string;
if (recordId === '') {
    throw new NodeOperationError(this.getNode(), 'The "Record ID" parameter is required!');
}

const fullUrl = `${baseUrl}('${recordId}')`;
```
AFTER:
```ts
const recordId = this.getNodeParameter('recordId', i) as string;
if (recordId === '') {
    throw new NodeOperationError(this.getNode(), 'The "Record ID" parameter is required!');
}
assertSafeRecordId.call(this, recordId);

const fullUrl = `${baseUrl}('${encodeURIComponent(recordId)}')`;
```
(`object` here is already `endsWith('s')`-checked at line 72; also add `assertSafePathSegment.call(this, object, 'Business Object');` right after that check.)

`link.operation.ts` — add import `import { assertSafeRecordId, assertSafePathSegment } from '../../common';` and:

BEFORE (lines 96-103):
```ts
if (recordId === '') {
    throw new NodeOperationError(this.getNode(), 'The "Record ID" parameter is required!');
}
if (targetRecordId === '') {
    throw new NodeOperationError(this.getNode(), 'The "Target Record ID" parameter is required!');
}

const url = `/odata/businessobject/${businessObject}('${recordId}')/${relationship}('${targetRecordId}')/$Ref`;
```
AFTER:
```ts
if (recordId === '') {
    throw new NodeOperationError(this.getNode(), 'The "Record ID" parameter is required!');
}
if (targetRecordId === '') {
    throw new NodeOperationError(this.getNode(), 'The "Target Record ID" parameter is required!');
}
assertSafePathSegment.call(this, businessObject, 'Business Object');
assertSafePathSegment.call(this, relationship, 'Relationship');
assertSafeRecordId.call(this, recordId);
assertSafeRecordId.call(this, targetRecordId);

const url = `/odata/businessobject/${businessObject}('${encodeURIComponent(recordId)}')/${relationship}('${encodeURIComponent(targetRecordId)}')/$Ref`;
```

`getRelated.operation.ts` — add import `import { assertSafeRecordId, assertSafePathSegment, assertSafeFieldName } from '../../common';` and:

BEFORE (lines 125-131):
```ts
const recordId = this.getNodeParameter('recordId', i) as string;

if (recordId === '') {
    throw new NodeOperationError(this.getNode(), 'The "Record ID" parameter is required!');
}
const includeInputFields = this.getNodeParameter('includeInputFields', i) as boolean;
const url = `/odata/businessobject/${businessObject}('${recordId}')/${relationship}`; ///${relationship}
```
AFTER:
```ts
const recordId = this.getNodeParameter('recordId', i) as string;

if (recordId === '') {
    throw new NodeOperationError(this.getNode(), 'The "Record ID" parameter is required!');
}
assertSafePathSegment.call(this, businessObject, 'Business Object');
assertSafePathSegment.call(this, relationship, 'Relationship');
assertSafeRecordId.call(this, recordId);
const includeInputFields = this.getNodeParameter('includeInputFields', i) as boolean;
const url = `/odata/businessobject/${businessObject}('${encodeURIComponent(recordId)}')/${relationship}`;
```
Also validate the `$select` fields built at lines 119-122:
```ts
if (selectFieldsCollection.length !== 0) {
    selectFieldsCollection.forEach(field => assertSafeFieldName.call(this, field.name));
    select += selectFieldsCollection.map(field => field.name).join(',');
}
```

`run.operation.ts` — add import `import { assertSafeRecordId, assertSafePathSegment } from '../../common';` and:

BEFORE (lines 104-108):
```ts
const quickAction = this.getNodeParameter('quickAction', i) as string;
const recordId = this.getNodeParameter('recordId', i) as string;
const quickActionId = this.getNodeParameter('quickActionId', i) as string;

const baseUrl = `/odata/businessobject/${businessObject}('${recordId}')/${quickAction}`;
```
AFTER:
```ts
const quickAction = this.getNodeParameter('quickAction', i) as string;
const recordId = this.getNodeParameter('recordId', i) as string;
const quickActionId = this.getNodeParameter('quickActionId', i) as string;

assertSafePathSegment.call(this, businessObject, 'Business Object');
assertSafePathSegment.call(this, quickAction, 'Quick Action');
assertSafeRecordId.call(this, recordId);

const baseUrl = `/odata/businessobject/${businessObject}('${encodeURIComponent(recordId)}')/${quickAction}`;
```

`savedsearch.operation.ts` — add import `import { assertSafePathSegment } from '../../common';` and:

BEFORE (line 91):
```ts
const response = await ivantiApiRequest.call(this, 'GET', `/odata/businessobject/${searchObject}/${savedSearchName}`, {}, { ActionId: savedSearchGUID });
```
AFTER (add the validations once before the loop, after the existing empties checks at line 87):
```ts
assertSafePathSegment.call(this, searchObject, 'Business Object');
assertSafePathSegment.call(this, savedSearchName, 'Saved Search Name');
```
then inside the loop keep:
```ts
const response = await ivantiApiRequest.call(this, 'GET', `/odata/businessobject/${searchObject}/${savedSearchName}`, {}, { ActionId: savedSearchGUID });
```
(`savedSearchGUID` is passed as a `qs` value, so the HTTP client URL-encodes it; validating it with `assertSafeRecordId` is still recommended for consistency.)

> Note on `quickAction`/`savedSearchName`: these are display names that may legitimately contain spaces (e.g. "Assign to Me", "My Open Incidents"). The strict `^[A-Za-z0-9_]+$` regex would reject those. Two acceptable options: (a) loosen `assertSafePathSegment` for those specific names to also allow spaces (`^[A-Za-z0-9_ ]+$`) and `encodeURIComponent` the segment when building the URL, or (b) keep the strict segment validator and require users to URL-encode. Prefer option (a) — change the relevant `getNodeParameter` results to be wrapped with `encodeURIComponent` in the path and validate against `^[A-Za-z0-9_ ]+$` — so legitimate quick-action / saved-search names with spaces keep working while still blocking `/`, `'`, `(`, `)`, `?`, `#`, `&`.

## Verification

1. Type/lint check: run `npm run lint` (which proxies to `n8n-node lint`) and `npm run build` (`n8n-node build`). Both must pass with no new errors/warnings — confirms the new shared helpers in `common.ts` are imported correctly in both nodes and the `this:` typing (`IExecuteFunctions | IPollFunctions`) is satisfied.

2. Manual injection check in the n8n editor (no test framework exists in this repo — `package.json` has no `test` script and there are no `*.test.ts` files):
   - **Get By Record ID:** set Business Object = `Incidents`, Record ID = `')/Employees('x` and execute. After the fix the node must throw `Invalid record ID (expected a 32-character GUID)` instead of issuing the malformed request.
   - **Get By Record ID (happy path):** Record ID = a real 32-char GUID must still succeed.
   - **Get Many / Polling Trigger:** add an OData filter / Order By with field name `RecId eq null or 1 eq 1` and execute — must throw `Invalid field name: "RecId eq null or 1 eq 1"`.
   - **Relationship Link / Get Related / Quick Action / Saved Search:** put `/` or `'` characters into the relationship / quick action / saved search name and confirm the node now rejects them (or URL-encodes per the space-allowing variant) rather than emitting a broken path.

3. Optional regression sanity: confirm a normal Get Many with valid field names, a real GUID lookup, and a quick action with a space-containing name (`Assign to Me`) all still succeed end to end.

## Related findings

None.
