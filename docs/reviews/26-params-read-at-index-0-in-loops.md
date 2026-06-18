# Finding 26: Multi-item operations read parameters at index 0 inside per-item loops, ignoring per-item expressions

| Field | Value |
|---|---|
| Category | Bugs / Correctness |
| Severity | medium |
| Status | Confirmed |
| Confidence | high |
| Affected files | nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:279-280; nodes/IvantiNeuronsForITSM/actions/object/searchByKeyword.operation.ts:130-160; nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts:115-121; nodes/IvantiNeuronsForITSM/actions/relationship/link.operation.ts:85-86; nodes/IvantiNeuronsForITSM/actions/relationship/unlink.operation.ts:86-87; nodes/IvantiNeuronsForITSM/actions/search/savedsearch.operation.ts:72-91; nodes/IvantiNeuronsForITSM/actions/search/fulltextsearchinsingleobject.operation.ts:94 |

## Problem

Several operations iterate over `this.getInputData()` one item at a time, but read key value-bearing parameters **once, before the loop, with a hardcoded index `0`**. In n8n, `getNodeParameter(name, itemIndex)` resolves any expression (e.g. `={{ $json.objectName }}`) against the item at `itemIndex`. Reading at `0` means every iteration uses the value derived from the **first** input item, silently discarding per-item expression values for items `1..N-1`.

The repository is internally inconsistent about this: in some operations a few params are correctly read with the loop index `i` while sibling params on the same operation are read at `0`. For example `getRelated.operation.ts` reads `recordId` and `includeInputFields` with `i` (lines 125, 130) but reads `relationship`, `businessObject`, and `selectFields` at `0` (lines 115-121).

Confirmed instances:

`getMany.operation.ts:279-280` — `object` and `returnAll` read at `0` (note: `buildODataQuery(i)` at line 368 already correctly uses `itemIndex` for select/filter/orderBy, and `limit` at line 295 uses `i`, so only these two are affected):
```ts
const object = this.getNodeParameter('object', 0) as string;
const returnAll = this.getNodeParameter('returnAll', 0) as boolean;
```

`searchByKeyword.operation.ts:130-160` — `object`, `selectAllFields`, `selectFields.fields`, `limit`, `searchText`, `returnAll` all read at `0`, *then* the loop runs with a constant query:
```ts
const object = this.getNodeParameter('object', 0) as string;
...
const selectAllFields = this.getNodeParameter('selectAllFields', 0) as boolean;
...
const limit = this.getNodeParameter('limit', 0) as number;
...
const searchText = this.getNodeParameter('searchText', 0) as string;
...
const returnAll = this.getNodeParameter('returnAll', 0) as boolean;

try {
    for (let i = 0; i < items.length; i++) {
        ...
        const allRecords = await ivantiApiRequestAllItemsWithLimit.call(
            this, 'GET', baseUrl,
            { "$select": select || undefined, "$search": searchText },
            undefined, limit,
        );
```
Because the query never changes between iterations, this performs **N identical API calls** and emits **N copies of the same result set** for N input items — a correctness *and* efficiency defect.

`getRelated.operation.ts:115-121`:
```ts
const relationship = this.getNodeParameter('relationship', 0) as string;
const businessObject = this.getNodeParameter('businessObject', 0) as string;

let select = '';
const selectFieldsCollection = this.getNodeParameter('selectFields.fields', 0, []) as { name: string }[];
```

`link.operation.ts:85-86` and `unlink.operation.ts:86-87` — `relationship` and `businessObject` read at `0` (while `recordId`/`targetRecordId` inside the loop correctly use `i`):
```ts
const relationship = this.getNodeParameter('relationship', 0) as string;
const businessObject = this.getNodeParameter('businessObject', 0) as string;
```

`savedsearch.operation.ts:72-91` — all three params read at `0`, then the loop re-issues the **identical** request once per input item:
```ts
const searchObject = this.getNodeParameter('searchObject', 0) as string;
...
const savedSearchName = this.getNodeParameter('savedSearchName', 0) as string;
...
const savedSearchGUID = this.getNodeParameter('savedSearchGUID', 0) as string;
...
for (let i = 0; i < items.length; i++) {
    const response = await ivantiApiRequest.call(this, 'GET', `/odata/businessobject/${searchObject}/${savedSearchName}`, {}, { ActionId: savedSearchGUID });
```

`fulltextsearchinsingleobject.operation.ts:94` — `searchObject` read at `0` (here `searchText` and `limit` inside the loop already use `i` correctly):
```ts
const searchObject = this.getNodeParameter('searchObject', 0) as string;
const returnAll = this.getNodeParameter('returnAll', 0) as boolean;
```

## Why it matters

- **Incorrect output for multi-item input with expressions.** When an upstream node feeds multiple items and these parameters are bound to expressions (the normal n8n way to drive per-item behavior), every item silently uses item 0's values. Users get wrong business objects queried, wrong relationships traversed, wrong saved searches executed — with no error to signal it.
- **Duplicate API calls and duplicate output.** In `searchByKeyword` and `savedsearch` the per-iteration request is constant, so N input items trigger N identical calls and the same result set is emitted N times. This wastes API quota/rate-limit budget and pollutes downstream data with duplicates.
- **Inconsistent behavior is a maintenance hazard.** Mixing `0` and `i` reads within the same function makes the intent ambiguous and invites copy-paste of the buggy pattern into new operations.

Note: `returnAll` / `selectAllFields` are `boolean` toggles that are typically static; reading them at `0` is usually harmless in practice, but for consistency and to support per-item expressions they should also be read with `i` unless there is a documented reason to treat them as node-global.

## Resolution

The fix is the same pattern everywhere: move per-item parameter reads **inside** the loop and pass the loop index `i`. Keep outside the loop only what is genuinely node-global and cheap to validate once. Because each operation already throws/validates per param, the simplest robust change is to move both the read and its validation inside the loop (so a bad expression result on item 3 is reported against item 3, and honors `continueOnFail`).

### 1. `getMany.operation.ts`

BEFORE (lines 278-288):
```ts
const returnData: INodeExecutionData[] = [];
const object = this.getNodeParameter('object', 0) as string;
const returnAll = this.getNodeParameter('returnAll', 0) as boolean;
if (object === '') {
    throw new NodeOperationError(this.getNode(), 'The "Business Object" parameter is required!');
}
if (!object.endsWith('s')) {
    throw new NodeOperationError(this.getNode(), 'The business object must end with an "s" (e.g., "Incidents", "Changes")');
}
try {
    for (let i = 0; i < items.length; i++) {
```

AFTER:
```ts
const returnData: INodeExecutionData[] = [];
try {
    for (let i = 0; i < items.length; i++) {
        const object = this.getNodeParameter('object', i) as string;
        const returnAll = this.getNodeParameter('returnAll', i) as boolean;
        if (object === '') {
            throw new NodeOperationError(this.getNode(), 'The "Business Object" parameter is required!');
        }
        if (!object.endsWith('s')) {
            throw new NodeOperationError(this.getNode(), 'The business object must end with an "s" (e.g., "Incidents", "Changes")');
        }
```
Leave the rest of the loop body (which already uses `buildODataQuery.call(this, i)` and `getNodeParameter('limit', i)`) unchanged.

### 2. `searchByKeyword.operation.ts`

BEFORE (lines 130-165):
```ts
const object = this.getNodeParameter('object', 0) as string;
const returnData: INodeExecutionData[] = [];

if (!object) {
    throw new NodeOperationError(this.getNode(), 'The business object is required');
}
if (object.endsWith('s') === false) {
    throw new NodeOperationError(this.getNode(), 'The business object must end with an "s" (e.g., "Incidents", "Changes")');
}
const selectAllFields = this.getNodeParameter('selectAllFields', 0) as boolean;
const baseUrl = `/odata/businessobject/${object}`;
let select = '';
if (!selectAllFields) {
    const selectFieldsCollection = this.getNodeParameter('selectFields.fields', 0, []) as { name: string }[];
    if (selectFieldsCollection.length !== 0) {
        select += selectFieldsCollection.map(field => field.name).join(',');
    }
}
const limit = this.getNodeParameter('limit', 0) as number;

if (limit < 0) {
    throw new NodeOperationError(this.getNode(), 'The limit must be a non-negative number');
}
const searchText = this.getNodeParameter('searchText', 0) as string;

if (!searchText) {
    throw new NodeOperationError(this.getNode(), 'The search text is required');
}
const returnAll = this.getNodeParameter('returnAll', 0) as boolean;

try {
    for (let i = 0; i < items.length; i++) {
        const records: IDataObject[] = [];
```

AFTER (move all reads/validation inside the loop, using `i`):
```ts
const returnData: INodeExecutionData[] = [];

try {
    for (let i = 0; i < items.length; i++) {
        const object = this.getNodeParameter('object', i) as string;
        if (!object) {
            throw new NodeOperationError(this.getNode(), 'The business object is required');
        }
        if (object.endsWith('s') === false) {
            throw new NodeOperationError(this.getNode(), 'The business object must end with an "s" (e.g., "Incidents", "Changes")');
        }
        const selectAllFields = this.getNodeParameter('selectAllFields', i) as boolean;
        const baseUrl = `/odata/businessobject/${object}`;
        let select = '';
        if (!selectAllFields) {
            const selectFieldsCollection = this.getNodeParameter('selectFields.fields', i, []) as { name: string }[];
            if (selectFieldsCollection.length !== 0) {
                select += selectFieldsCollection.map(field => field.name).join(',');
            }
        }
        const limit = this.getNodeParameter('limit', i) as number;
        if (limit < 0) {
            throw new NodeOperationError(this.getNode(), 'The limit must be a non-negative number');
        }
        const searchText = this.getNodeParameter('searchText', i) as string;
        if (!searchText) {
            throw new NodeOperationError(this.getNode(), 'The search text is required');
        }
        const returnAll = this.getNodeParameter('returnAll', i) as boolean;

        const records: IDataObject[] = [];
```
The rest of the loop body (the `if (returnAll) {...} else {...}` request and the `constructExecutionMetaData` push) stays as-is. This also removes the duplicate-call/duplicate-output defect because the query is now derived per item.

### 3. `getRelated.operation.ts`

BEFORE (lines 114-123):
```ts
const returnData: INodeExecutionData[] = [];
const relationship = this.getNodeParameter('relationship', 0) as string;
const businessObject = this.getNodeParameter('businessObject', 0) as string;

let select = '';
const selectFieldsCollection = this.getNodeParameter('selectFields.fields', 0, []) as { name: string }[];
if (selectFieldsCollection.length !== 0) {
    select += selectFieldsCollection.map(field => field.name).join(',');
}
for (let i = 0; i < items.length; i++) {
    try {
        const recordId = this.getNodeParameter('recordId', i) as string;
```

AFTER (move the three reads into the existing per-item `try`):
```ts
const returnData: INodeExecutionData[] = [];

for (let i = 0; i < items.length; i++) {
    try {
        const relationship = this.getNodeParameter('relationship', i) as string;
        const businessObject = this.getNodeParameter('businessObject', i) as string;

        let select = '';
        const selectFieldsCollection = this.getNodeParameter('selectFields.fields', i, []) as { name: string }[];
        if (selectFieldsCollection.length !== 0) {
            select += selectFieldsCollection.map(field => field.name).join(',');
        }
        const recordId = this.getNodeParameter('recordId', i) as string;
```
The rest of the loop body is unchanged.

### 4. `link.operation.ts` and `unlink.operation.ts`

BEFORE (link lines 85-91; unlink lines 86-92 are structurally identical):
```ts
const relationship = this.getNodeParameter('relationship', 0) as string;
const businessObject = this.getNodeParameter('businessObject', 0) as string;


for (let i = 0; i < items.length; i++) {
    try {
        const recordId = this.getNodeParameter('recordId', i) as string;
```

AFTER:
```ts
for (let i = 0; i < items.length; i++) {
    try {
        const relationship = this.getNodeParameter('relationship', i) as string;
        const businessObject = this.getNodeParameter('businessObject', i) as string;
        const recordId = this.getNodeParameter('recordId', i) as string;
```
Apply the identical change to `unlink.operation.ts` (relationship/businessObject read at `0` on lines 86-87 → move inside the loop with `i`).

### 5. `savedsearch.operation.ts`

BEFORE (lines 69-97):
```ts
const returnData: INodeExecutionData[] = [];
const items = this.getInputData();

const searchObject = this.getNodeParameter('searchObject', 0) as string;

if (searchObject === '') {
    throw new NodeOperationError(this.getNode(), 'The "Business Object" parameter is required!');
}
const savedSearchName = this.getNodeParameter('savedSearchName', 0) as string;

if (savedSearchName === '') {
    throw new NodeOperationError(this.getNode(), 'The "Saved Search Name" parameter is required!');
}

const savedSearchGUID = this.getNodeParameter('savedSearchGUID', 0) as string;

if (savedSearchGUID === '') {
    throw new NodeOperationError(this.getNode(), 'The "Saved Search GUID" parameter is required!');
}

try {
    for (let i = 0; i < items.length; i++) {
        const response = await ivantiApiRequest.call(this, 'GET', `/odata/businessobject/${searchObject}/${savedSearchName}`, {}, { ActionId: savedSearchGUID });
        const executionData = this.helpers.constructExecutionMetaData(
            this.helpers.returnJsonArray(response.value),
            { itemData: { item: i } },
        );
        returnData.push(...executionData);
    }

} catch (error) {
    throw new NodeOperationError(this.getNode(), error as Error);
}
```

AFTER:
```ts
const returnData: INodeExecutionData[] = [];
const items = this.getInputData();

try {
    for (let i = 0; i < items.length; i++) {
        const searchObject = this.getNodeParameter('searchObject', i) as string;
        if (searchObject === '') {
            throw new NodeOperationError(this.getNode(), 'The "Business Object" parameter is required!');
        }
        const savedSearchName = this.getNodeParameter('savedSearchName', i) as string;
        if (savedSearchName === '') {
            throw new NodeOperationError(this.getNode(), 'The "Saved Search Name" parameter is required!');
        }
        const savedSearchGUID = this.getNodeParameter('savedSearchGUID', i) as string;
        if (savedSearchGUID === '') {
            throw new NodeOperationError(this.getNode(), 'The "Saved Search GUID" parameter is required!');
        }

        const response = await ivantiApiRequest.call(this, 'GET', `/odata/businessobject/${searchObject}/${savedSearchName}`, {}, { ActionId: savedSearchGUID });
        const executionData = this.helpers.constructExecutionMetaData(
            this.helpers.returnJsonArray(response.value),
            { itemData: { item: i } },
        );
        returnData.push(...executionData);
    }

} catch (error) {
    throw new NodeOperationError(this.getNode(), error as Error);
}
```
This also removes the duplicate-identical-request defect. (Optional, separate from this finding: this operation does not honor `continueOnFail`; that is out of scope here.)

### 6. `fulltextsearchinsingleobject.operation.ts`

BEFORE (lines 94-99):
```ts
const searchObject = this.getNodeParameter('searchObject', 0) as string;
const returnAll = this.getNodeParameter('returnAll', 0) as boolean;
if (searchObject === '') {
    throw new NodeOperationError(this.getNode(), 'The "Business Object" parameter is required!');
}
for (let i = 0; i < items.length; i++) {
    try {
        const searchText = this.getNodeParameter('searchText', i) as string;
```

AFTER (move both reads + validation into the existing per-item `try`, which already honors `continueOnFail`):
```ts
for (let i = 0; i < items.length; i++) {
    try {
        const searchObject = this.getNodeParameter('searchObject', i) as string;
        const returnAll = this.getNodeParameter('returnAll', i) as boolean;
        if (searchObject === '') {
            throw new NodeOperationError(this.getNode(), 'The "Business Object" parameter is required!');
        }
        const searchText = this.getNodeParameter('searchText', i) as string;
```
The rest of the loop body (`searchText` validation, body build, returnAll/limit branches, push) is unchanged. `searchText` and `limit` already use `i`.

### General principle for new operations
Read every value-bearing parameter inside the per-item loop with the loop index `i`. Only hoist a read above the loop when the value is provably node-global and you intend to ignore per-item expressions (which is rarely the case). The existing correct examples in this repo are `getMany.operation.ts`'s `buildODataQuery(i)` and the `recordId`/`targetRecordId`/`limit`/`searchText` reads that already use `i`.

## Verification

1. Typecheck/lint after edits:
   ```
   npm run lint
   npm run build
   ```
   (or the `n8n-node` CLI equivalents used by this project, e.g. `npx n8n-node lint` / `npx n8n-node build`). No new type errors should appear, since only the index argument and statement placement change.
2. Static confirmation that no value-bearing param is still read at index `0` inside these files (toggles intentionally left at `0`, if any, should be the only matches):
   ```
   grep -rn "getNodeParameter('[a-zA-Z.]*', 0" nodes/IvantiNeuronsForITSM/actions
   ```
   Expect zero matches for `object`, `searchObject`, `relationship`, `businessObject`, `savedSearchName`, `savedSearchGUID`, `searchText`, `selectFields.fields`, `selectAllFields`, `limit`, `returnAll`.
3. Manual functional check in n8n: feed a Code/Set node emitting 2+ items whose `object`/`searchObject`/`relationship` differ per item, bind the node parameters to expressions referencing those per-item fields, run, and confirm:
   - each output item reflects its own item's parameter value (not item 0's), and
   - for `searchByKeyword` and `savedsearch`, the output is no longer N duplicated copies of item 0's result set (inspect the node's execution / API call count).

## Related findings

None.
