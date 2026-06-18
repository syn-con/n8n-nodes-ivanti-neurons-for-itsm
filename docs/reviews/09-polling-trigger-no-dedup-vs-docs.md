# Finding 9: Polling trigger does NOT deduplicate, contradicting README, FAQ, and its own class JSDoc

| Field | Value |
|---|---|
| Category | Bugs / Correctness |
| Severity | high |
| Status | Confirmed |
| Confidence | high |
| Affected files | `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:13-35`, `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:244-246`, `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:262-279`, `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:331-335`, `README.md:34`, `README.md:141-146`, `README.md:1472-1474` |

## Problem

The polling trigger advertises `RecId`-based deduplication backed by workflow static data in **four** places, but the actual `poll()` implementation never reads or writes any state and re-emits the **entire** result set on every poll cycle.

The class-level JSDoc explicitly promises dedup (`nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:13-35`):

```ts
 * 3. It compares the `RecId` of every returned record against the set of IDs
 *    seen in the previous poll (stored in workflow static data).
 * 4. Only **new** records (IDs not seen before) are emitted downstream.
 * 5. The seen-IDs set is updated after each poll so duplicates are suppressed
 *    across executions.
```

`buildQuery()` even force-injects `RecId` specifically so dedup will work (`:275-278`):

```ts
// Always include RecId so deduplication across poll cycles works
if (!fieldNames.includes('RecId')) {
    fieldNames.unshift('RecId');
}
```

But the actual `poll()` body never touches static data. It just fetches and returns everything (`:316-335`):

```ts
const query = buildQuery();
let response: IDataObject | IDataObject[] | null = null;
try {
    const returnAll = this.getNodeParameter('returnAll', false) as boolean;
    if (returnAll) {
        response = await ivantiApiRequestAllItems.call(this, 'GET', `/odata/businessobject/${object}`, query, {}) as IDataObject[];
    }else{
        const limit = this.getNodeParameter('limit', 50) as number;
        response = await ivantiApiRequestAllItemsWithLimit.call(this, 'GET', `/odata/businessobject/${object}`, query, {}, limit) as IDataObject[];
    }
} catch (error) {
    throw new NodeOperationError(this.getNode(), error as Error);
}

if(response !== null && Array.isArray(response) && response.length > 0){
    return [this.helpers.returnJsonArray(response)];
}

return null;
```

There is no call to `this.getWorkflowStaticData(...)` anywhere in the file (verified: zero occurrences). The method-level comment (`:244-246`) even contradicts the class doc:

```ts
 * Note: deduplication (seen-RecId tracking) is NOT performed here — this node relies on
 * n8n's built-in poll deduplication via `getWorkflowStaticData` if needed, or the caller
 * is expected to filter downstream.
```

This claim ("relies on n8n's built-in poll deduplication") is false: n8n does **not** auto-deduplicate poll outputs; that is the node author's responsibility. There is no built-in mechanism that suppresses repeated `RecId`s.

The README repeats the false promise in three spots:

- `README.md:34` — `**Smart Polling**: Intelligent trigger node with deduplication and filtering`
- `README.md:141-146`:
  ```
  **How It Works**:
  1. Polls the Ivanti OData API at configurable intervals
  2. Compares results against previous poll using `RecId`
  3. Emits only new/changed records
  4. Stores state in workflow static data for deduplication
  ```
- `README.md:1472-1474`:
  ```
  **Q: Does polling create duplicate executions?**

  A: No, the trigger tracks seen `RecId` values to prevent duplicates.
  ```

## Why it matters

In production, with a static OData filter (the common case — e.g. `Status eq 'Active'`), every poll cycle re-emits **all** currently-matching records. Each re-emission triggers the full downstream workflow again, producing duplicate side effects: duplicate Slack/email notifications, duplicate created tickets, duplicate approvals, duplicate API writes. A 5-minute poll over 50 active incidents fires 50 downstream executions every 5 minutes indefinitely.

Users explicitly told (README FAQ) that duplicates will NOT happen will build workflows without their own idempotency guard, so the defect manifests as real, repeated, externally-visible duplicate actions — not just noisy logs. This is a correctness bug, not cosmetic.

## Resolution

Two valid options. **Option A (recommended)** implements the documented dedup so all the docs become true. **Option B** removes the false claims if dedup is intentionally out of scope. Pick one.

### Option A — Implement RecId dedup via workflow static data (recommended)

Edit `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts`.

**Step 1 — Replace the misleading method-level comment** (`:244-246`).

BEFORE:
```ts
	 * Note: deduplication (seen-RecId tracking) is NOT performed here — this node relies on
	 * n8n's built-in poll deduplication via `getWorkflowStaticData` if needed, or the caller
	 * is expected to filter downstream.
	 */
```

AFTER:
```ts
	 * Deduplication: in normal (scheduled) mode the set of previously-seen `RecId`
	 * values is read from / written to workflow static data, and only records whose
	 * `RecId` has not been seen before are emitted. In manual (editor "Fetch Test
	 * Event") mode the stored state is ignored so the user can inspect the data shape.
	 */
```

**Step 2 — Add dedup logic in `poll()`.** Replace the tail of `poll()` (`:331-335`).

BEFORE:
```ts
		if(response !== null && Array.isArray(response) && response.length > 0){
			return [this.helpers.returnJsonArray(response)];
		}

		return null;
	}
```

AFTER:
```ts
		if (response === null || !Array.isArray(response) || response.length === 0) {
			return null;
		}

		// In manual ("Fetch Test Event") mode, ignore stored state and just
		// return whatever the API currently provides so the data shape can be inspected.
		if (this.getMode() === 'manual') {
			return [this.helpers.returnJsonArray(response)];
		}

		// Scheduled mode: deduplicate by RecId against state stored in workflow static data.
		const staticData = this.getWorkflowStaticData('node') as { seenRecIds?: string[] };
		const seenRecIds = new Set<string>(staticData.seenRecIds ?? []);

		const newItems = (response as IDataObject[]).filter((item) => {
			const recId = item.RecId;
			// Records without a RecId cannot be deduplicated; emit them rather than drop them.
			if (recId === undefined || recId === null || recId === '') {
				return true;
			}
			return !seenRecIds.has(String(recId));
		});

		for (const item of newItems) {
			const recId = item.RecId;
			if (recId !== undefined && recId !== null && recId !== '') {
				seenRecIds.add(String(recId));
			}
		}
		staticData.seenRecIds = Array.from(seenRecIds);

		if (newItems.length === 0) {
			return null;
		}

		return [this.helpers.returnJsonArray(newItems)];
	}
```

Notes:
- `getMode()` and `getWorkflowStaticData()` are both available on `IPollFunctions`, so no new imports are required. `IDataObject` is already imported (`:3`).
- The `'node'`-scoped static data is the correct scope for per-node poll state.
- Records lacking a `RecId` are emitted (not silently dropped). Since `buildQuery()` already force-prepends `RecId` to `$select` (`:275-278`), `selectAllFields=false` queries still carry it.

**Optional hardening (unbounded growth):** `seenRecIds` grows without bound over the workflow's lifetime. If memory of static data is a concern, cap it to the most recent N ids before persisting, e.g. immediately before `staticData.seenRecIds = ...`:
```ts
const MAX_SEEN = 10000;
const ids = Array.from(seenRecIds);
staticData.seenRecIds = ids.length > MAX_SEEN ? ids.slice(ids.length - MAX_SEEN) : ids;
```
(`Set` insertion order is preserved, so this keeps the most recently added ids.)

After this change, the existing class JSDoc (`:13-35`) and all three README sections become accurate and require no edits — except the JSDoc's claim that the **first run emits all** records is now also true (state is empty, so nothing is filtered).

### Option B — Remove the dedup claims (only if dedup is intentionally not wanted)

If dedup is deliberately out of scope, make the docs honest instead.

1. `IvantiNeuronsForItsmTrigger.node.ts:13-35` — delete bullets 3–5 about RecId comparison / static data, and the "On the first run … bootstrap its state" paragraph.
2. `IvantiNeuronsForItsmTrigger.node.ts:262-279` — change the `buildQuery()` comment and the inline `RecId` comment; if `RecId` is no longer force-injected for dedup, remove lines `:275-278` entirely.
3. `README.md:34` — change `deduplication and filtering` to `filtering`.
4. `README.md:141-146` — remove steps 2–4 about RecId comparison / static data; describe it as emitting all matching records each interval.
5. `README.md:1472-1474` — change the FAQ answer to "Yes — add an OData time-window filter (e.g. `LastModDateTime gt ...`) or a downstream dedup/Remove-Duplicates step, since the trigger emits all matching records each cycle."
6. Add a CHANGELOG.md entry documenting the doc correction (per AGENTS.md "update CHANGELOG.md" rule).

Because the user-facing docs make a firm correctness promise and downstream side effects depend on it, **Option A is strongly preferred.**

## Verification

1. Type/lint: from the repo root run the project's checks (per AGENTS.md, prefer the `n8n-node` CLI):
   ```
   npm run lint
   npm run build
   ```
   Confirm no new TypeScript or ESLint errors in `IvantiNeuronsForItsmTrigger.node.ts` (especially that `getMode()` / `getWorkflowStaticData()` typecheck on `IPollFunctions`).
2. Functional (Option A) in a local n8n:
   - Add the Polling Trigger, point it at a business object with a static filter, set a short interval.
   - Activate the workflow. First poll: all matching records emitted once.
   - Wait for the next poll with no new records created in Ivanti → execution count does **not** increase (returns `null`).
   - Create one new matching record in Ivanti → next poll emits exactly that one record.
   - Click "Fetch Test Event" (manual mode) → all current records returned regardless of stored state, confirming the `getMode() === 'manual'` branch.
   - Inspect workflow static data (n8n DB / debug) and confirm `seenRecIds` is populated and grows only with new RecIds.
3. Doc consistency: confirm `README.md:34`, `:141-146`, `:1472-1474`, and the class JSDoc `:13-35` all describe the same behavior the code now implements.

## Related findings

None.
