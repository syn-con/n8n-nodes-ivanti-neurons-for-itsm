# Finding 51: README 'Report Transaction' Status options and field name do not match the node

| Field | Value |
|---|---|
| Category | Documentation Accuracy (README/CHANGELOG) |
| Severity | low |
| Status | Confirmed |
| Confidence | high |
| Affected files | /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/README.md:768-791, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForItsmConnector/actions/automation/update.operation.ts:41-55, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForItsmConnector/actions/automation/index.ts:19 |

## Problem
The README's "Automation (Connector Node Only)" section documents the operation as **Report Transaction** with a Status dropdown of `Completed, Failed, or Aborted` and a field named `Job Result`. None of these match the actual node.

README.md:768-779:

```
### Automation (Connector Node Only)

#### Report Transaction

Report the outcome of an Ivanti automation workflow back to the platform.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Transaction ID | string | Automation transaction GUID |
| Status | dropdown | Completed, Failed, or Aborted |
| Job Result | string | Result message or error details |
```

The actual node's Status dropdown (update.operation.ts:41-46) offers a different set, and `Aborted` is **not** one of them:

```ts
options: [
	{ name: 'Pending', value: 'Pending' },
	{ name: 'In Progress', value: 'In Progress' },
	{ name: 'Completed', value: 'Completed' },
	{ name: 'Failed', value: 'Failed' },
],
```

`Aborted` only appears as a terminal-state guard in the execute logic (update.operation.ts:98), where the operation refuses to run if the existing transaction is already `Completed`/`Failed`/`Aborted` — it is never a value the user can select.

The field the README calls "Job Result" is actually labeled **Result** in the node (update.operation.ts:48-55):

```ts
{
	displayName: 'Result',
	name: 'result',
	type: 'string',
	description: 'The payload of the transaction',
	default: '',
	placeholder: '',
},
```

Additionally, the operation itself is not named "Report Transaction" anywhere in the user-facing UI. The selectable operation name is **Update Automation Transaction** (index.ts:19):

```ts
{ name: 'Update Automation Transaction', value: 'update',action: 'Update an automation transaction' },
```

So three distinct README claims are wrong: the operation name, the Status option list, and the Result field name.

## Why it matters
Pure documentation accuracy. A user following the README will:
- Look for an operation called "Report Transaction" and not find it (it is "Update Automation Transaction").
- Expect to choose `Aborted` as a status and be unable to, while not realizing `Pending` and `In Progress` are available.
- Look for a "Job Result" field that is actually labeled "Result".

No data loss, security, or runtime impact — the node behaves correctly. This is a low-severity onboarding/trust issue: stale docs erode confidence in the rest of the README.

## Resolution
Update the README section to reflect the real node. Edit `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/README.md`, lines 768-791.

### Step 1 — Fix the heading and parameter table (README.md:768-779)

BEFORE:

```markdown
### Automation (Connector Node Only)

#### Report Transaction

Report the outcome of an Ivanti automation workflow back to the platform.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Transaction ID | string | Automation transaction GUID |
| Status | dropdown | Completed, Failed, or Aborted |
| Job Result | string | Result message or error details |
```

AFTER:

```markdown
### Automation (Connector Node Only)

#### Update Automation Transaction

Report the outcome of an Ivanti automation workflow back to the platform.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| Transaction ID | string | Automation transaction GUID (32-character GUID) |
| Status | dropdown | Pending, In Progress, Completed, or Failed |
| Result | string | Result message or error details |

> Note: The operation refuses to run if the transaction is already in a terminal
> state (`Completed`, `Failed`, or `Aborted`). `Aborted` is set by Ivanti, not
> selectable in n8n.
```

### Step 2 — Fix the example block (README.md:786-791)

BEFORE:

```markdown
**Example**:
```javascript
Transaction ID: {{ $('Trigger').item.json.TransactionId }}
Status: Completed
Job Result: Successfully provisioned user account
```
```

AFTER:

```markdown
**Example**:
```javascript
Transaction ID: {{ $('Trigger').item.json.TransactionId }}
Status: Completed
Result: Successfully provisioned user account
```
```

Note the only example-body change is `Job Result:` → `Result:` (the `Status: Completed` line is already a valid option, so it stays).

No code changes are required — the node is the source of truth and is correct. This is documentation-only.

## Verification
1. Manual diff check: open `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/README.md` at the Automation section and confirm the Status row reads `Pending, In Progress, Completed, or Failed`, the field is named `Result`, and the heading reads `Update Automation Transaction`.
2. Cross-check against the node: confirm the four `name`/`value` entries in `nodes/IvantiNeuronsForItsmConnector/actions/automation/update.operation.ts:42-45` exactly match the README's listed Status values, and that `displayName: 'Result'` (line 49) matches the README field name.
3. Confirm the operation label: `grep -n "value: 'update'" nodes/IvantiNeuronsForItsmConnector/actions/automation/index.ts` should show `name: 'Update Automation Transaction'`, matching the new README heading.
4. Optional sanity sweep for leftover stale terms: `grep -rn "Job Result\|Report Transaction" README.md` should return no results after the edit.

This is a docs-only change; no `npm run build`, lint, or test run is required, though running the existing build/lint will confirm nothing else was disturbed.

## Related findings
None.
