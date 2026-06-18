# Finding 50: Connector Trigger defaults.name drops 'Connector', colliding with the polling trigger label

| Field | Value |
|---|---|
| Category | n8n Node Conventions / UX Guidelines |
| Severity | low |
| Status | Confirmed |
| Confidence | high |
| Affected files | /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:39, :48 |

> Note: the canonical finding cites the path `nodes/IvantiNeuronsForItsmConnectorTrigger.node.ts:48`. The real file is one directory deeper: `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts`. The line number (48) is correct.

## Problem
The webhook (inbound) trigger node declares a `displayName` that includes the word "Connector", but its `defaults.name` (the label the node shows on the canvas when first dropped in) drops "Connector", so the two strings no longer agree.

From `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts`:

```typescript
	description: INodeTypeDescription = {
		displayName: 'Ivanti Neurons for ITSM Connector Trigger',   // line 39
		...
		defaults: {
			name: 'Ivanti Neurons for ITSM Trigger',               // line 48  <-- drops "Connector"
		},
```

The sibling polling trigger gets this right — both its `displayName` and `defaults.name` are identical. From `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts`:

```typescript
		displayName: 'Ivanti Neurons for ITSM Polling Trigger',    // line 38
		...
		defaults: {
			name: 'Ivanti Neurons for ITSM Polling Trigger',       // line 47
		},
```

So on the canvas the polling trigger labels itself "Ivanti Neurons for ITSM Polling Trigger" while the connector (webhook) trigger labels itself the more generic "Ivanti Neurons for ITSM Trigger". This is a near-collision: the connector trigger's canvas label is a prefix of, and visually almost indistinguishable from, the polling trigger's label, and it no longer carries the distinguishing "Connector" word that its own search/picker entry (`displayName`) advertises.

The project's own convention doc confirms `defaults.name` should mirror `displayName`. From `.agents/nodes.md:31-39`:

```typescript
  displayName: 'Wordpress',
  ...
  defaults: {
    name: 'Wordpress',
  },
```

## Why it matters
- UX / discoverability: A user searches the node panel for and adds "Ivanti Neurons for ITSM Connector Trigger", but the node that lands on the canvas is labeled "Ivanti Neurons for ITSM Trigger". The mismatch is confusing and breaks the mental link between what was picked and what appears.
- Canvas ambiguity: In a workflow that uses both triggers, the canvas shows "Ivanti Neurons for ITSM Polling Trigger" next to "Ivanti Neurons for ITSM Trigger". Without the "Connector"/"Polling" qualifier, the webhook trigger reads like the generic/default trigger, making it harder to tell at a glance which trigger is the inbound webhook vs. the poller.
- Convention compliance: It violates the package's own documented pattern (`.agents/nodes.md`) where `defaults.name` equals `displayName`, and it is inconsistent with the polling trigger in the same package. This is purely a label/maintainability issue — there is no runtime, data, or security impact (hence low severity).

## Resolution
Set `defaults.name` to match the node's `displayName` so the canvas label and the picker entry agree and the "Connector" qualifier is preserved.

1. Open `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts`.

2. Update the `defaults.name` at line 48.

BEFORE (lines 47-49):
```typescript
		defaults: {
			name: 'Ivanti Neurons for ITSM Trigger',
		},
```

AFTER:
```typescript
		defaults: {
			name: 'Ivanti Neurons for ITSM Connector Trigger',
		},
```

No other files need to change. The internal `name` identifier (`ivantiNeuronsForItsmConnectorTrigger`, line 41) is unaffected, so existing workflows, credentials, and `package.json` `n8n.nodes` registration continue to work — only the human-readable default canvas label changes.

## Verification
1. Build / typecheck — the change is a string literal, so it must compile cleanly:
   - `npm run build` (or `npx n8n-node build`) from the repo root.
2. Lint:
   - `npm run lint` (or `npx n8n-node lint`) — should report no new issues.
3. Manual confirmation of the label match:
   - `grep -n "displayName: 'Ivanti Neurons for ITSM Connector Trigger'" nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts`
   - `grep -n "name: 'Ivanti Neurons for ITSM Connector Trigger'" nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts`
   - Both `displayName` (line 39) and `defaults.name` (line 48) should now return the identical string.
4. Optional UI check: in a dev n8n instance, add the trigger from the node panel and confirm the canvas node is labeled "Ivanti Neurons for ITSM Connector Trigger", clearly distinct from "Ivanti Neurons for ITSM Polling Trigger".

## Related findings
None.
