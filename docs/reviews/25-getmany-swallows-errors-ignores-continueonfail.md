# Finding 25: getMany wraps the whole item loop in one try/catch, swallows non-Error throws, and ignores continueOnFail

| Field | Value |
|---|---|
| Category | Bugs / Correctness |
| Severity | medium |
| Status | Confirmed |
| Confidence | high |
| Affected files | `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:287-316`, `nodes/IvantiNeuronsForITSM/actions/search/savedsearch.operation.ts:89-102`, `nodes/IvantiNeuronsForITSM/actions/search/fulltextsearchacrossallobjects.operation.ts:51-72` |

## Problem

Three operations wrap the **entire** per-item `for` loop inside a single `try` block and have a `catch` handler that does not behave like the rest of the codebase. Two distinct defects are present.

**1. `getMany` silently swallows non-`Error` throws and never honors `continueOnFail()`** (`getMany.operation.ts:287-316`):

```ts
    try {
        for (let i = 0; i < items.length; i++) {
            const records: IDataObject[] = [];
            const odataQuery = buildODataQuery.call(this, i) as IDataObject;
            if (returnAll) {
                const allRecords = await ivantiApiRequestAllItems.call(this, 'GET', `/odata/businessobject/${object}`, odataQuery);
                records.push(...allRecords);
            } else {
                // ... single/multi page fetch ...
            }
            const executionData = this.helpers.constructExecutionMetaData(
                this.helpers.returnJsonArray(records),
                { itemData: { item: i } },
            );
            returnData.push(...executionData);
        }
    } catch (error) {
        if (error instanceof Error) {
            throw new NodeOperationError(this.getNode(), error);
        }
    }
    return returnData;
```

The `catch` only rethrows when `error instanceof Error`. Any non-`Error` throw (e.g. a thrown string, a rejected promise that resolves to a plain object, or an HTTP error object that is not an `Error` instance) falls through the `if`, the function continues to `return returnData`, and the partial/empty `returnData` is returned to the workflow **with no error surfaced**. It also never calls `this.continueOnFail()`, and because the loop body is inside the single `try`, a failure on item *i* aborts every remaining item.

**2. `savedsearch` and `fulltextsearchacrossallobjects` unconditionally rethrow and never honor `continueOnFail()`.**

`savedsearch.operation.ts:89-102`:

```ts
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

`fulltextsearchacrossallobjects.operation.ts:51-72`:

```ts
    try {
        for (let i = 0; i < items.length; i++) {

            const searchTextAll = this.getNodeParameter('searchText', i) as string;
            if (searchTextAll === '') {
                throw new NodeOperationError(this.getNode(), 'The "Search Text" parameter is required!');
            }
            const responseAllData = await ivantiApiRequest.call(this, 'POST', `/rest/Search`, {}, {
                "Text": searchTextAll,
            });
            const executionData = this.helpers.constructExecutionMetaData(
                this.helpers.returnJsonArray(responseAllData),
                { itemData: { item: i } },
            );
            returnData.push(...executionData);
        }
    } catch (error) {
        throw new NodeOperationError(this.getNode(), error as Error);
    }
```

Both wrap the loop in one `try`, never check `this.continueOnFail()`, and abort all remaining items on a single failure.

This is inconsistent with the established pattern in this same codebase, e.g. `getByRecId.operation.ts:79-107`, where the `try/catch` is **inside** the loop and includes the standard `continueOnFail` branch:

```ts
    for (let i = 0; i < items.length; i++) {
        try {
            // ... per-item work ...
            returnData.push(...executionData);
        } catch (error) {
            if (this.continueOnFail()) {
                returnData.push({ json: { error: (error as Error).message } });
            } else {
                throw error;
            }
        }
    }
```

## Why it matters

- **Silent data loss / hidden failures (getMany):** if the underlying request or pagination helper throws anything that is not an `Error` instance, the node returns partial or empty data and reports success. The workflow continues as if nothing went wrong, which can corrupt downstream logic and is very hard to diagnose.
- **`continueOnFail()` is ignored in all three:** users who enable "Continue On Fail" on these nodes still get the whole node execution aborted on the first failing item, contradicting both the n8n setting and the rest of this package's nodes. There is no way to get partial results plus per-item error records.
- **One bad item aborts the batch:** because the loop is inside the `try`, a failure processing input item 3 discards items 4..N even when they would have succeeded. The correct pattern isolates each item.
- **Maintainability / consistency:** these three operations diverge from the project's own convention (`getByRecId`, `create`, `update`, `searchByKeyword`, etc.), making the package behave unpredictably depending on which operation is used.

## Resolution

Move the `try/catch` **inside** the `for` loop in all three operations and add the standard `continueOnFail` branch per item, matching the canonical pattern at `getByRecId.operation.ts:98-105`.

### 1. `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts`

**BEFORE** (lines 287-317):

```ts
    try {
        for (let i = 0; i < items.length; i++) {
            const records: IDataObject[] = [];
            const odataQuery = buildODataQuery.call(this, i) as IDataObject;
            if (returnAll) {
                const allRecords = await ivantiApiRequestAllItems.call(this, 'GET', `/odata/businessobject/${object}`, odataQuery);
                records.push(...allRecords);
            } else {
                const limit = this.getNodeParameter('limit', i) as number;
                if(limit > 100){
                    const allRecords = await ivantiApiRequestAllItemsWithLimit.call(this, 'GET', `/odata/businessobject/${object}`, odataQuery, undefined, limit);
                    records.push(...allRecords);
                }else{
                    odataQuery["$top"] = limit;
                    const response = await ivantiApiRequest.call(this, 'GET', `/odata/businessobject/${object}`, odataQuery,{});
                    const searchResponse : SearchResponse = response;
                    records.push(...searchResponse.value);
                }
            }
            const executionData = this.helpers.constructExecutionMetaData(
                this.helpers.returnJsonArray(records),
                { itemData: { item: i } },
            );
            returnData.push(...executionData);
        }
    } catch (error) {
        if (error instanceof Error) {
            throw new NodeOperationError(this.getNode(), error);
        }
    }
    return returnData;
```

**AFTER:**

```ts
    for (let i = 0; i < items.length; i++) {
        try {
            const records: IDataObject[] = [];
            const odataQuery = buildODataQuery.call(this, i) as IDataObject;
            if (returnAll) {
                const allRecords = await ivantiApiRequestAllItems.call(this, 'GET', `/odata/businessobject/${object}`, odataQuery);
                records.push(...allRecords);
            } else {
                const limit = this.getNodeParameter('limit', i) as number;
                if (limit > 100) {
                    const allRecords = await ivantiApiRequestAllItemsWithLimit.call(this, 'GET', `/odata/businessobject/${object}`, odataQuery, undefined, limit);
                    records.push(...allRecords);
                } else {
                    odataQuery["$top"] = limit;
                    const response = await ivantiApiRequest.call(this, 'GET', `/odata/businessobject/${object}`, odataQuery, {});
                    const searchResponse: SearchResponse = response;
                    records.push(...searchResponse.value);
                }
            }
            const executionData = this.helpers.constructExecutionMetaData(
                this.helpers.returnJsonArray(records),
                { itemData: { item: i } },
            );
            returnData.push(...executionData);
        } catch (error) {
            if (this.continueOnFail()) {
                returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
            } else {
                throw error;
            }
        }
    }
    return returnData;
```

Notes:
- The two top-level validations (`object === ''` and `!object.endsWith('s')`) at lines 281-286 stay **above** the loop unchanged — they are not per-item.
- `error instanceof Error` rethrow logic is dropped entirely; the `else { throw error; }` branch rethrows the original error unconditionally so nothing is ever silently swallowed. (`NodeOperationError` accepts any thrown value, so wrapping is optional; `throw error` matches `getByRecId`.)

### 2. `nodes/IvantiNeuronsForITSM/actions/search/savedsearch.operation.ts`

**BEFORE** (lines 89-102):

```ts
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

**AFTER:**

```ts
    for (let i = 0; i < items.length; i++) {
        try {
            const response = await ivantiApiRequest.call(this, 'GET', `/odata/businessobject/${searchObject}/${savedSearchName}`, {}, { ActionId: savedSearchGUID });
            const executionData = this.helpers.constructExecutionMetaData(
                this.helpers.returnJsonArray(response.value),
                { itemData: { item: i } },
            );
            returnData.push(...executionData);
        } catch (error) {
            if (this.continueOnFail()) {
                returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
            } else {
                throw error;
            }
        }
    }
```

The three top-level required-parameter validations (lines 74-87) remain above the loop unchanged.

### 3. `nodes/IvantiNeuronsForITSM/actions/search/fulltextsearchacrossallobjects.operation.ts`

**BEFORE** (lines 51-72):

```ts
    try {
        for (let i = 0; i < items.length; i++) {

            const searchTextAll = this.getNodeParameter('searchText', i) as string;
            if (searchTextAll === '') {
                throw new NodeOperationError(this.getNode(), 'The "Search Text" parameter is required!');
            }
            const responseAllData = await ivantiApiRequest.call(this, 'POST', `/rest/Search`, {}, {
                "Text": searchTextAll,
            });

            const executionData = this.helpers.constructExecutionMetaData(
                this.helpers.returnJsonArray(responseAllData),
                { itemData: { item: i } },
            );

            returnData.push(...executionData);

        }
    } catch (error) {
        throw new NodeOperationError(this.getNode(), error as Error);
    }
```

**AFTER:**

```ts
    for (let i = 0; i < items.length; i++) {
        try {
            const searchTextAll = this.getNodeParameter('searchText', i) as string;
            if (searchTextAll === '') {
                throw new NodeOperationError(this.getNode(), 'The "Search Text" parameter is required!');
            }
            const responseAllData = await ivantiApiRequest.call(this, 'POST', `/rest/Search`, {}, {
                "Text": searchTextAll,
            });

            const executionData = this.helpers.constructExecutionMetaData(
                this.helpers.returnJsonArray(responseAllData),
                { itemData: { item: i } },
            );

            returnData.push(...executionData);
        } catch (error) {
            if (this.continueOnFail()) {
                returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
            } else {
                throw error;
            }
        }
    }
```

Here the `searchText === ''` validation is genuinely per-item (it reads `searchText` with index `i`), so it correctly stays inside the loop — and with the fix it now participates in `continueOnFail` too.

### Optional consistency note
After this change, `NodeOperationError` is no longer referenced inside the `catch` of `getMany` and `savedsearch` (only the `else { throw error; }` path remains). `NodeOperationError` is still used by the top-level validations in both files (`getMany` lines 282/285, `savedsearch` lines 75/80/86) and remains used inside the loop in `fulltextsearchacrossallobjects`, so the existing `import { NodeOperationError, updateDisplayOptions } from 'n8n-workflow';` import must **not** be removed in any of the three files — doing so would break the validations / lint with an unused-or-missing error.

## Verification

1. Build / typecheck and lint the package (use the project's `n8n-node` CLI per AGENTS.md, falling back to npm scripts):
   - `npm run build` (or `n8n-node build`) — confirms the three edited files still compile with no TypeScript errors.
   - `npm run lint` (or `n8n-node lint`) — confirms no new unused-import warnings (especially `NodeOperationError`) and no lint regressions.
2. Confirm structurally that the `try` now sits inside the loop and the swallowing branch is gone:
   - `grep -n "continueOnFail" nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts nodes/IvantiNeuronsForITSM/actions/search/savedsearch.operation.ts nodes/IvantiNeuronsForITSM/actions/search/fulltextsearchacrossallobjects.operation.ts` — each file should now match.
   - `grep -n "instanceof Error" nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts` — should return **no** matches (the swallowing `if` is removed).
3. Manual runtime check in n8n:
   - Enable **Continue On Fail** on a Get Many / Saved Search / Full Text Search node, feed it two input items where the first triggers a failure (e.g. a non-existent business object or an invalid saved-search GUID) and the second is valid. After the fix, the output should contain one `{ "error": ... }` item plus the successful item, instead of the whole node erroring out.
   - With **Continue On Fail disabled**, the same failing input should now surface the error (previously, a non-`Error` throw in `getMany` would have produced a silent partial/empty success).

## Related findings

None.
