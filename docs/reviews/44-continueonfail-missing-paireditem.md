# Finding 44: continueOnFail and includeInputFields output items omit pairedItem metadata

| Field | Value |
|---|---|
| Category | Bugs / Correctness |
| Severity | low |
| Status | Confirmed |
| Confidence | high |
| Affected files | nodes/IvantiNeuronsForITSM/actions/object/create.operation.ts:180-184, nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts:148-168 (plus the same pattern in update.operation.ts:198, getByRecId.operation.ts:101, deleteByRecId.operation.ts:90, quickAction/run.operation.ts:133, and 12 other operations) |

## Problem

In n8n, every output item should carry `pairedItem` metadata linking it back to the input item index it was derived from. Success paths in this repo do this correctly via `constructExecutionMetaData(..., { itemData: { item: i } })`, which injects `pairedItem`. But the `continueOnFail` error branches and the `includeInputFields` branch push raw `{ json }` objects with no `pairedItem`.

`create.operation.ts:180-184` (continueOnFail branch):

```ts
} catch (error) {
	if (this.continueOnFail()) {
		returnData.push({ json: { error: (error as Error).message } });
		continue;
	}
	throw error;
}
```

`getRelated.operation.ts:148-168` (both the `includeInputFields` branch and the catch branch):

```ts
let executionData: INodeExecutionData[] = [];
if(includeInputFields){
	executionData.push(
		{
			json:  {
				...items[i].json,
				[`${relationship}`]: responseData.value,
			}
		}
	)
}else{
	executionData = this.helpers.constructExecutionMetaData(
		this.helpers.returnJsonArray(responseData.value),
		{ itemData: { item: i } },
	);
}
returnData.push(...executionData);
} catch (error) {
	if (this.continueOnFail()) {
		returnData.push({ json: { error: (error as Error).message } });
	}
```

Note that the `else` (success) branch correctly attaches paired-item metadata, but the `if (includeInputFields)` branch and the `catch` branch do not.

A repository-wide check confirms the scope: `grep -rn "pairedItem" nodes/` returns **zero** matches (no operation ever sets it explicitly), and the same `returnData.push({ json: { error: (error as Error).message } });` pattern appears in 18 operation files (object create/update/getByRecId/deleteByRecId/searchByKeyword, relationship link/unlink/getRelated, quickAction/run, attachment upload/read/delete, search, serviceReq create/create.simplified/getSubscription/getServiceReqParams, and the connector automation/update). The success paths are only safe because they go through `constructExecutionMetaData`; the error and `includeInputFields` paths bypass that helper.

## Why it matters

`pairedItem` is what n8n uses to thread an output item back to its originating input item. Without it:

- Downstream nodes that rely on item linking (e.g. expressions referencing earlier nodes via `$()`, or "Merge"-style item correlation) cannot resolve which input produced the error/merged item and can throw "Can't get data for expression" / paired-item resolution errors at runtime.
- For the `continueOnFail` error item specifically, the loss of linkage is exactly when a user most needs to know which input row failed.

Impact is limited (n8n falls back to best-effort behavior, and error items are an edge path), hence the low severity, but it is a real correctness gap and trivially fixable.

## Resolution

Add `pairedItem: { item: i }` to every hand-built output object that bypasses `constructExecutionMetaData`. The two cited files are the canonical fixes; apply the identical pattern to the other affected operations listed above for consistency.

### 1. `nodes/IvantiNeuronsForITSM/actions/object/create.operation.ts` (catch branch, ~line 182)

BEFORE:

```ts
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({ json: { error: (error as Error).message } });
				continue;
			}
			throw error;
		}
```

AFTER:

```ts
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({
					json: { error: (error as Error).message },
					pairedItem: { item: i },
				});
				continue;
			}
			throw error;
		}
```

### 2. `nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts` (includeInputFields branch ~line 150 and catch branch ~line 167)

BEFORE (includeInputFields branch):

```ts
			if(includeInputFields){
				executionData.push(
					{
						json:  {
							...items[i].json,
							[`${relationship}`]: responseData.value,
						}
					}
				)
			}else{
```

AFTER:

```ts
			if(includeInputFields){
				executionData.push(
					{
						json:  {
							...items[i].json,
							[`${relationship}`]: responseData.value,
						},
						pairedItem: { item: i },
					}
				)
			}else{
```

BEFORE (catch branch):

```ts
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({ json: { error: (error as Error).message } });
			}
			else {
				throw error;
			}
		}
```

AFTER:

```ts
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({
					json: { error: (error as Error).message },
					pairedItem: { item: i },
				});
			}
			else {
				throw error;
			}
		}
```

### 3. Apply the same `pairedItem: { item: i }` addition to the remaining `continueOnFail` error pushes

Each of these uses the identical `returnData.push({ json: { error: (error as Error).message } });` line inside a `for (let i = 0; ...)` loop, so the variable `i` is in scope at each site:

- `nodes/IvantiNeuronsForITSM/actions/object/update.operation.ts:198`
- `nodes/IvantiNeuronsForITSM/actions/object/getByRecId.operation.ts:101`
- `nodes/IvantiNeuronsForITSM/actions/object/deleteByRecId.operation.ts:90`
- `nodes/IvantiNeuronsForITSM/actions/object/searchByKeyword.operation.ts:196`
- `nodes/IvantiNeuronsForITSM/actions/relationship/link.operation.ts:124`
- `nodes/IvantiNeuronsForITSM/actions/relationship/unlink.operation.ts:126`
- `nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation.ts:133`
- `nodes/IvantiNeuronsForITSM/actions/attachment/uploadAttachment.operation.ts:121`
- `nodes/IvantiNeuronsForITSM/actions/attachment/readAttachment.operation.ts:87`
- `nodes/IvantiNeuronsForITSM/actions/attachment/delete.operation.ts:58`
- `nodes/IvantiNeuronsForITSM/actions/search/fulltextsearchinsingleobject.operation.ts:151`
- `nodes/IvantiNeuronsForITSM/actions/serviceReq/create.operation.ts:246`
- `nodes/IvantiNeuronsForITSM/actions/serviceReq/create.simplified.operation.ts:387`
- `nodes/IvantiNeuronsForITSM/actions/serviceReq/getSubscription.operation.ts:92`
- `nodes/IvantiNeuronsForITSM/actions/serviceReq/getServiceReqParams.operation.ts:69`
- `nodes/IvantiNeuronsForItsmConnector/actions/automation/update.operation.ts:123`

In each, change:

```ts
returnData.push({ json: { error: (error as Error).message } });
```

to:

```ts
returnData.push({
	json: { error: (error as Error).message },
	pairedItem: { item: i },
});
```

> Caveat: before editing each file, confirm the loop counter is named `i`. All sampled operations use `for (let i = 0; i < items.length; i++)`, so `i` is the correct index. If any operation does not iterate per-item (e.g. a single aggregate request), use the appropriate input index instead of blindly adding `i`.

(Optional, larger refactor — not required for this fix: extract a small helper, e.g. `pushErrorItem(returnData, error, i)`, into `nodes/IvantiNeuronsForITSM/common.ts` to centralize the error-item shape and guarantee `pairedItem` is always set. This is a maintainability improvement, not needed to close the finding.)

## Verification

1. Build/lint with the project toolchain to ensure no type errors introduced by the object-literal change:
   - `npm run build` (or `npx n8n-node build`) and `npm run lint` (or `npx n8n-node lint`). `pairedItem: { item: i }` is valid `IPairedItemData` on `INodeExecutionData`, so this must compile cleanly.
2. Confirm the change took: `grep -rn "pairedItem" nodes/` should now return one match per edited site (previously zero), and `grep -rn "json: { error: (error as Error).message } });" nodes/` should return zero of the old single-line form.
3. Manual runtime check in n8n: build a workflow with two input items where the second triggers an API failure (e.g. an invalid `Record ID` for Get Related), enable "Continue On Fail" on the node, and add a downstream node with an expression that references the previous node. The error output item should now resolve its paired input without a paired-item error. Repeat with Get Related's "Include Input Fields" toggle enabled to confirm the merged item links to the correct input.

## Related findings

None.
