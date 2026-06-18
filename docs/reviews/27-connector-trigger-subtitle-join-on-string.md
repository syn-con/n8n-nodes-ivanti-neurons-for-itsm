# Finding 27: Connector trigger subtitle calls .join() on $parameter["updates"], an options string, throwing in the editor

| Field | Value |
|---|---|
| Category | Bugs / Correctness |
| Severity | medium |
| Status | Confirmed |
| Confidence | high |
| Affected files | /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:45 |

## Problem
The node's `subtitle` expression invokes `Array.prototype.join` on the `updates` parameter, but that parameter is a single-value `options` field, not a `multiOptions` array.

Subtitle expression (`IvantiNeuronsForItsmConnectorTrigger.node.ts:45`):

```ts
subtitle: '=Updates: {{$parameter["updates"].join(", ")}}',
```

The `updates` parameter is declared as `type: 'options'` with a string default (`IvantiNeuronsForItsmConnectorTrigger.node.ts:67-77`):

```ts
{
	displayName: 'Trigger On',
	name: 'updates',
	type: 'options',

	options: [
		{ name: 'On Automation Transaction', value: 'OnAutomationTransaction' },
	],
	default: 'OnAutomationTransaction',

},
```

At runtime `$parameter["updates"]` resolves to the string `"OnAutomationTransaction"`. Strings have no `.join` method, so the expression evaluates `("OnAutomationTransaction").join(", ")` and throws `TypeError: ...join is not a function`. The subtitle therefore fails to render in the n8n editor canvas.

For comparison, every other node in this package references the parameter value directly without `.join()` — e.g. the polling trigger at `IvantiNeuronsForItsmTrigger.node.ts:44`:

```ts
subtitle: '=Poll: {{$parameter["object"]}} every {{$parameter["pollInterval"]}} min',
```

## Why it matters
This is a cosmetic/UX defect, not a data-loss or security issue, but it is a guaranteed runtime failure of the subtitle expression:
- The node tile on the editor canvas will not display its intended `Updates: ...` subtitle; instead the user sees an empty or error subtitle, which looks broken and undermines confidence in the node.
- `.join` on a string is not a typo that "sometimes" works — it throws every time the field has its only valid value, so the subtitle is permanently broken.
- It would likely be flagged during n8n Cloud verification review, which scrutinizes editor UX correctness against the UX guidelines.

## Resolution
Since `updates` is a single-select `options` field with exactly one possible value, reference the value directly instead of calling `.join()`.

File: `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts`

1. Change the subtitle expression on line 45 to reference the parameter directly.

BEFORE (line 45):

```ts
subtitle: '=Updates: {{$parameter["updates"].join(", ")}}',
```

AFTER:

```ts
subtitle: '=Updates: {{$parameter["updates"]}}',
```

That is the minimal, correct fix and matches the existing convention used by the other three nodes in this package (`IvantiNeuronsForItsmTrigger.node.ts:44`, `IvantiNeuronsForItsm.node.ts:43`, `IvantiNeuronsForItsmConnector.node.ts:33`), all of which interpolate `$parameter[...]` values directly.

Alternative (only if multiple trigger events are genuinely intended in the future): convert the parameter to `multiOptions` so it actually resolves to an array, in which case `.join()` becomes valid. This is a larger behavioral change and is NOT recommended unless additional trigger options are added.

BEFORE (lines 67-77):

```ts
{
	displayName: 'Trigger On',
	name: 'updates',
	type: 'options',

	options: [
		{ name: 'On Automation Transaction', value: 'OnAutomationTransaction' },
	],
	default: 'OnAutomationTransaction',

},
```

AFTER (multiOptions variant — only if multi-select is desired):

```ts
{
	displayName: 'Trigger On',
	name: 'updates',
	type: 'multiOptions',
	options: [
		{ name: 'On Automation Transaction', value: 'OnAutomationTransaction' },
	],
	default: ['OnAutomationTransaction'],
},
```

Given there is currently only one option, the direct-reference fix (option 1) is the correct choice; do not adopt the `multiOptions` variant unless more trigger events are being introduced.

## Verification
1. Apply the one-line edit above.
2. Build and lint the package: run `n8n-node lint` (or the project's configured `npm run lint` / `npm run build`). The change is a string literal so it will not introduce type errors; lint should pass with no new warnings.
3. Manual confirmation in the editor: load the node in n8n dev mode (`n8n-node dev`), drag the "Ivanti Neurons for ITSM Connector Trigger" node onto the canvas, and confirm the tile subtitle now renders as `Updates: OnAutomationTransaction` with no console `TypeError` (open the browser devtools console; before the fix it logs a `.join is not a function` error when evaluating the subtitle expression).

## Related findings
None.
