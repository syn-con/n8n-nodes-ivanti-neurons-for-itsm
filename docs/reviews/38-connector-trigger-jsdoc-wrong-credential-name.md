# Finding 38: Connector trigger JSDoc references credential 'automationAuthApi' that does not exist

| Field | Value |
|---|---|
| Category | Comments & Doc-Comment Accuracy |
| Severity | medium |
| Status | Confirmed |
| Confidence | high |
| Affected files | `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:24`, `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:283` |

> Note: the canonical finding lists the path as `nodes/IvantiNeuronsForItsmConnectorTrigger.node.ts`, but the file actually lives in the `IvantiNeuronsForItsmConnector/` subfolder: `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts`. The line numbers (24, 283) match exactly.

## Problem
Two JSDoc comments in the connector trigger node refer to a credential named `automationAuthApi`. No such credential exists in the package. A repo-wide search (`grep -rn "automationAuthApi" nodes/ credentials/ package.json`) returns only these two doc-comment hits — there is no declaration anywhere.

The class JSDoc, `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:24`:

```ts
 *    - Authorization header must match the configured `automationAuthApi` credential
 *      (Basic or custom header token)
```

The `validateRequestAuth` JSDoc, same file lines 281-290:

```ts
/**
 * Validates the `Authorization` header of an inbound webhook request against
 * the configured `automationAuthApi` credential.
 *
 * Supports two authentication modes:
 * - **base** – HTTP Basic Auth (`Basic <base64(username:password)>`)
 * - **header** – arbitrary header token value
 *
 * @throws {NodeOperationError} when credentials are missing or the header does not match
 */
```

The node actually uses the credential `ivantiNeuronsForItsmConnectorAuthApi`, declared at line 54:

```ts
credentials: [
    {
        name: 'ivantiNeuronsForItsmConnectorAuthApi',
        required: true,
    },
],
```

and fetched at lines 292, 338, and 354, e.g. line 292:

```ts
const credentials = await this.getCredentials('ivantiNeuronsForItsmConnectorAuthApi');
```

This is corroborated by the credential file `credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:23` (`name = 'ivantiNeuronsForItsmConnectorAuthApi';`).

Additionally, the `validateRequestAuth` JSDoc (lines 285-288) documents only two modes (`base`, `header`), but the function body handles **three** modes. Lines 296-314:

```ts
if (credentials.type === 'base') {
    ...
} else if (credentials.type === 'apiKey') {
    if (headers['authorization'] !== `${credentials.webhookApiKey}`) {
        throw new NodeOperationError(this.getNode(), 'Invalid Authorization');
    }
} else if (credentials.type === 'header') {
    ...
} else {
    throw new NodeOperationError(this.getNode(), 'Invalid Authorization Type');
}
```

The credential itself confirms three webhook auth modes (`credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:42-46`):

```ts
options: [
    { name: 'Basic Auth', value: 'base' },
    { name: 'Api Key', value: 'apiKey' },
    { name: 'Header', value: 'header' },
],
```

## Why it matters
This is a documentation-accuracy / maintainability defect, not a runtime bug — the code references the correct credential name, so the node functions correctly. The impact:

- A maintainer reading the JSDoc will search for an `automationAuthApi` credential, find nothing, and waste time, or assume the docs describe a second credential that does not exist.
- The `validateRequestAuth` JSDoc undercounts the supported auth modes (omits `apiKey`), so anyone relying on the comment to understand auth coverage gets an incomplete picture and may overlook the `apiKey` path during changes or security review.
- The credential file's own class JSDoc (`credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:13-15`) has the same "two modes" inaccuracy, so the wrong mental model is reinforced across files.

## Resolution
Replace both `automationAuthApi` references with the real credential name and update the `validateRequestAuth` JSDoc to document all three auth modes. All edits are in `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts`.

### Step 1 — Fix the class JSDoc (line 24)

BEFORE:

```ts
 *    - Authorization header must match the configured `automationAuthApi` credential
 *      (Basic or custom header token)
```

AFTER:

```ts
 *    - Authorization header must match the configured
 *      `ivantiNeuronsForItsmConnectorAuthApi` credential
 *      (Basic Auth, API key, or custom header token)
```

### Step 2 — Fix the `validateRequestAuth` JSDoc (lines 281-290)

BEFORE:

```ts
/**
 * Validates the `Authorization` header of an inbound webhook request against
 * the configured `automationAuthApi` credential.
 *
 * Supports two authentication modes:
 * - **base** – HTTP Basic Auth (`Basic <base64(username:password)>`)
 * - **header** – arbitrary header token value
 *
 * @throws {NodeOperationError} when credentials are missing or the header does not match
 */
```

AFTER:

```ts
/**
 * Validates the `Authorization` header of an inbound webhook request against
 * the configured `ivantiNeuronsForItsmConnectorAuthApi` credential.
 *
 * Supports three authentication modes (selected by the credential's `type` field):
 * - **base**   – HTTP Basic Auth (`Basic <base64(username:password)>`)
 * - **apiKey** – the `Authorization` header must equal the configured `webhookApiKey`
 * - **header** – a custom header (named by `header`) must equal the configured `webhookApiKey`
 *
 * @throws {NodeOperationError} when credentials are missing, the auth type is
 *   unrecognised, or the header does not match
 */
```

### Step 3 (optional, recommended) — Align the credential file JSDoc

The same "two modes" inaccuracy exists in `credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:13-15`:

BEFORE:

```ts
 * Supports two authentication modes for the inbound webhook side:
 * - **Base** – HTTP Basic Auth (username + password)
 * - **Header** – arbitrary raw header value (e.g. a pre-shared token)
```

AFTER:

```ts
 * Supports three authentication modes for the inbound webhook side:
 * - **Base** – HTTP Basic Auth (username + password)
 * - **Api Key** – a pre-shared key compared against the `Authorization` header
 * - **Header** – arbitrary raw header (named by `header`) holding a pre-shared token
```

This step is out of the strict scope of finding #38 (which cites only the trigger node) but fixes the identical inaccuracy at its source and keeps both files consistent. Apply if the reviewer wants the docs fully aligned; otherwise Steps 1-2 fully resolve the cited finding.

## Verification
1. Confirm the stale name is gone from the trigger node:
   `grep -rn "automationAuthApi" nodes/ credentials/` should return **no** results.
2. Confirm the real name is now referenced in the doc comments:
   `grep -n "ivantiNeuronsForItsmConnectorAuthApi" nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts` should show the line 54 declaration, the three `getCredentials` / `httpRequestWithAuthentication` call sites, plus the two updated JSDoc lines.
3. Since only comments changed, behavior is unchanged. Run the project's lint/build to ensure nothing regressed (per AGENTS.md, prefer the `n8n-node` CLI): `npx n8n-node lint` and `npx n8n-node build` (or the repo's configured `npm run lint` / `npm run build`). Both should pass with no new warnings.

## Related findings
None.
