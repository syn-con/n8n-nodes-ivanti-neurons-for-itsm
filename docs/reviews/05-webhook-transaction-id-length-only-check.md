# Finding 5: Webhook x-transaction-id validated only by length === 32 before OData interpolation (injection on authenticated path)

| Field | Value |
|---|---|
| Category | Security |
| Severity | high |
| Status | Confirmed |
| Confidence | high |
| Affected files | nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:335 (interpolation at :347), nodes/IvantiNeuronsForItsmConnector/actions/automation/update.operation.ts:89 (interpolation at :92) |

## Problem

Both code paths validate the transaction ID using **only its length** (`!== 32`) and then interpolate the raw string directly into an OData key literal inside single quotes. No character-set check is performed, so any 32-character string — including one containing single quotes and OData operators — passes validation and reaches the URL.

In the trigger (`IvantiNeuronsForItsmConnectorTrigger.node.ts`):

```ts
// Ivanti transaction IDs are 32-character GUIDs (no hyphens)
if ((headers['x-transaction-id'] as string).length !== 32) {
	throw new NodeOperationError(this.getNode(), 'Transaction ID is not a valid GUID');
}
...
const url = `${baseUrl}/odata/businessobject/IVNT_Automation_Transactionss('${headers['x-transaction-id']}')`;
```

In the Connector action (`actions/automation/update.operation.ts`):

```ts
if (transactionId.length !== 32) {
	throw new NodeOperationError(this.getNode(), 'The "Transaction ID" parameter is not a valid GUID!');
}
const url = `/odata/businessobject/IVNT_Automation_Transactionss('${transactionId}')`;
```

In the trigger case the value comes from the inbound `x-transaction-id` HTTP header. The header is read **before** the authorization check ordering matters here: the URL is built and the authenticated outbound request is issued by `validateAutomationTransaction` using the platform's stored credentials, so a crafted header drives an attacker-influenced OData query executed with the integration's own privileges.

A 32-character payload such as `') or Status ne 'zzzz' or ('aaaaaaaa` (length-32 strings are trivial to construct) breaks out of the `'...'` key literal. The resulting URL is no longer a single-record key lookup but an OData filter/expression of the attacker's choosing, evaluated server-side against the `IVNT_Automation_Transactionss` business object on an authenticated channel.

## Why it matters

- **OData injection on an authenticated outbound request.** The interpolated value escapes the single-quoted key literal, letting an attacker rewrite the query that the integration runs against Ivanti using the tenant's own credentials. Depending on how Ivanti's OData layer parses the malformed key, this can change which record(s) are returned, bypass the intended single-record scoping, or trigger broader data exposure than a key lookup should ever allow.
- **The injectable value is externally controlled.** For the trigger it is an HTTP request header (`x-transaction-id`) on a publicly reachable webhook endpoint; for the action it is a workflow-supplied parameter that may itself originate from untrusted upstream data.
- **The existing "validation" gives a false sense of safety.** The comment and error message both claim GUID validation ("Transaction ID is not a valid GUID"), but only length is checked, so reviewers and maintainers reasonably assume the value is safe to interpolate when it is not.

## Resolution

Validate the transaction ID against the actual Ivanti GUID character set (32 hex characters, no hyphens) **before** building any URL, in both locations. Use a single shared helper so the two sites cannot drift.

### Step 1 — Add a shared validation helper

Create `nodes/IvantiNeuronsForItsmConnector/common.ts`:

```ts
/**
 * Validates that a value is a valid Ivanti transaction GUID:
 * exactly 32 hexadecimal characters (no hyphens).
 *
 * Ivanti transaction IDs are interpolated into OData key literals, so the
 * character set MUST be restricted to prevent breaking out of the quoted
 * key and injecting arbitrary OData.
 */
export function isValidIvantiGuid(value: unknown): value is string {
	return typeof value === 'string' && /^[A-Fa-f0-9]{32}$/.test(value);
}
```

(If a `common.ts` is later shared across both nodes, the helper can be lifted; for now it lives next to the only consumers, mirroring the existing `transports/` layout in this node folder.)

### Step 2 — Fix the trigger

In `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts`, add the import near the existing imports:

```ts
import { isValidIvantiGuid } from './common';
```

Then in `validateAutomationTransaction`, replace the length-only check.

BEFORE:

```ts
	if (headers['x-transaction-id'] === '') {
		throw new NodeOperationError(this.getNode(), 'Transaction ID is required');
	}
	// Ivanti transaction IDs are 32-character GUIDs (no hyphens)
	if ((headers['x-transaction-id'] as string).length !== 32) {
		throw new NodeOperationError(this.getNode(), 'Transaction ID is not a valid GUID');
	}
```

AFTER:

```ts
	if (headers['x-transaction-id'] === '') {
		throw new NodeOperationError(this.getNode(), 'Transaction ID is required');
	}
	// Ivanti transaction IDs are 32-character hex GUIDs (no hyphens).
	// Charset is enforced because the value is interpolated into an OData key literal below.
	if (!isValidIvantiGuid(headers['x-transaction-id'])) {
		throw new NodeOperationError(this.getNode(), 'Transaction ID is not a valid GUID');
	}
```

Because `isValidIvantiGuid` narrows the type to `string`, the URL line can drop the cast:

BEFORE:

```ts
	const url = `${baseUrl}/odata/businessobject/IVNT_Automation_Transactionss('${headers['x-transaction-id']}')`;
```

AFTER:

```ts
	const transactionId = headers['x-transaction-id'];
	const url = `${baseUrl}/odata/businessobject/IVNT_Automation_Transactionss('${transactionId}')`;
```

### Step 3 — Fix the Connector action

In `nodes/IvantiNeuronsForItsmConnector/actions/automation/update.operation.ts`, add the import:

```ts
import { isValidIvantiGuid } from '../../common';
```

Then replace the length-only check inside `execute`.

BEFORE:

```ts
			if (transactionId === '') {
				throw new NodeOperationError(this.getNode(), 'The "Transaction ID" parameter is required!');
			}
			if (transactionId.length !== 32) {
				throw new NodeOperationError(this.getNode(), 'The "Transaction ID" parameter is not a valid GUID!');
			}
			const url = `/odata/businessobject/IVNT_Automation_Transactionss('${transactionId}')`;
```

AFTER:

```ts
			if (transactionId === '') {
				throw new NodeOperationError(this.getNode(), 'The "Transaction ID" parameter is required!');
			}
			// Charset enforced: transactionId is interpolated into an OData key literal below.
			if (!isValidIvantiGuid(transactionId)) {
				throw new NodeOperationError(this.getNode(), 'The "Transaction ID" parameter is not a valid GUID!');
			}
			const url = `/odata/businessobject/IVNT_Automation_Transactionss('${transactionId}')`;
```

### Note on defense in depth

This fix closes the injection by restricting the input to a safe charset, which is the correct primary control for an OData key literal (there is no parameterized-key API for OData `('...')` key segments). The regex `^[A-Fa-f0-9]{32}$` admits exactly the Ivanti hyphen-less GUID format and rejects every character that could escape the quoted literal (notably `'`, `(`, `)`, spaces, and operators). Keep the existing terminal-state check (`Completed` / `Failed` / `Aborted`) unchanged.

## Verification

1. Build / typecheck and lint to confirm the new helper, imports, and type narrowing compile cleanly:
   ```
   npx n8n-node build
   npx n8n-node lint
   ```
   (or the project's equivalent `npm run build` / `npm run lint`).
2. Confirm both call sites now reference `isValidIvantiGuid` and no `length !== 32` check remains for transaction IDs:
   ```
   grep -rn "length !== 32" nodes/
   grep -rn "isValidIvantiGuid" nodes/
   ```
   The first command should return nothing for transaction-ID checks; the second should show the helper definition plus the two consumers.
3. Manual/logic check of the regex against representative inputs:
   - `"0123456789abcdef0123456789ABCDEF"` (32 hex) -> accepted.
   - `"') or Status ne 'zzzz' or ('aaaaaaaa"` (32 chars, contains quotes/operators) -> rejected with "not a valid GUID".
   - 31- or 33-char hex string -> rejected.
4. (Optional) Trigger-path smoke test: POST to the webhook with a malformed but 32-char `x-transaction-id` header containing a single quote and confirm the node throws the GUID error and never issues the outbound OData request.

## Related findings

None.
