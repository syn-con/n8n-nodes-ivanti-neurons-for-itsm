# Finding 41: Authorization header and tenant baseURL test expression duplicated verbatim across both credentials

| Field | Value |
|---|---|
| Category | DRY / Duplication |
| Severity | low |
| Status | Confirmed |
| Confidence | high |
| Affected files | credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts:55, credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts:62, credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:150, credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:159 |

## Problem

Two credential classes embed byte-for-byte identical credential expressions for (a) the outbound `Authorization` header and (b) the tenant-normalizing `test.request.baseURL`.

In `credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts`:

```ts
// line 55
Authorization: '={{ "rest_api_key=" + $credentials.apiKey }}',
...
// line 62
baseURL: '={{ "https://" + $credentials.tenant.replace(/^https?:\\/\\//, "").replace(/\\/+$/, "") + ($credentials.isOnPrem ? "/HEAT" : "") + "/api/odata/businessobject" }}',
```

In `credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts`:

```ts
// line 150
Authorization: '={{ "rest_api_key=" + $credentials.apiKey }}',
...
// line 159
baseURL: '={{ "https://" + $credentials.tenant.replace(/^https?:\\/\\//, "").replace(/\\/+$/, "") + ($credentials.isOnPrem ? "/HEAT" : "") + "/api/odata/businessobject" }}',
```

The two `baseURL` strings differ only in the trailing `test.request.url` (`/Incidents?$top=1` vs `/N8N_AuthTypes`), not in the base-URL expression itself, which is identical.

The same tenant normalization (`.replace(/^https?:\/\//, '').replace(/\/+$/, '')` plus the `isOnPrem ? '/HEAT/api' : '/api'` prefix) is also re-implemented at runtime three separate times in `nodes/IvantiNeuronsForITSM/transports/index.ts` (lines 44/46/51, 163/165/168, 202/204/208). Note: there is no single named `buildBaseUrl` helper in the repo despite the finding's wording — the logic is inlined in each transport function, so the duplication is actually wider than just the two credentials.

```ts
// nodes/IvantiNeuronsForITSM/transports/index.ts:44-51
const tenant = (credential.tenant as string).replace(/^https?:\/\//, '').replace(/\/+$/, '');
...
const tenantPath = isOnPrem ? '/HEAT/api' : '/api';
...
url: `https://${tenant}${tenantPath}${endpoint}`,
```

## Why it matters

Pure maintainability (no runtime bug today). The auth scheme string (`rest_api_key=`) and the tenant-normalization regex/`/HEAT` logic are repeated in at least 5 places (2 credentials + 3 transport functions). A future change — e.g. switching the auth header format, supporting a different protocol, or adjusting the on-prem path — must be applied to every copy and kept in sync. Silent drift between the credential-test URL and the runtime request URL would mean the credential test passes against a different endpoint than the node actually calls, producing confusing "test succeeds but operations fail" reports.

A key constraint: n8n credential `authenticate` / `test` blocks are evaluated as expression strings by n8n's runtime, **not** as TypeScript executed at module-load. They cannot reference imported runtime functions. So the `baseURL`/`Authorization` expressions cannot literally call a shared TS helper. What *can* be deduplicated is (1) the literal source strings (via exported string constants concatenated at class-construction time), and (2) the runtime transport copies (via a real exported function). Given severity is low, a comment cross-link is also an acceptable minimal fix.

## Resolution

Two tiers; pick based on appetite. Tier 1 is the low-effort fix that directly addresses the finding; Tier 2 additionally removes the runtime triplication.

### Tier 1 — Share the literal strings between the two credentials

1. Create a new helper module `credentials/shared.ts`:

```ts
// credentials/shared.ts

/**
 * Shared credential-expression fragments for the Ivanti Neurons for ITSM
 * credentials. These are plain strings (not runtime helpers) because n8n
 * evaluates credential `authenticate` / `test` expressions itself and cannot
 * call imported TypeScript functions.
 *
 * Keep the tenant-normalization logic here in sync with the runtime version in
 * nodes/IvantiNeuronsForITSM/transports/index.ts (the `.replace(...)` chain).
 */

/** Outbound Authorization header value: `rest_api_key=<apiKey>`. */
export const ITSM_AUTH_HEADER = '={{ "rest_api_key=" + $credentials.apiKey }}';

/**
 * Normalized OData businessobject base URL built from `$credentials.tenant`:
 * strips any leading `https?://` and trailing slashes, then appends the
 * on-prem `/HEAT` segment when applicable.
 */
export const ITSM_TEST_BASE_URL =
	'={{ "https://" + $credentials.tenant.replace(/^https?:\\/\\//, "").replace(/\\/+$/, "") + ($credentials.isOnPrem ? "/HEAT" : "") + "/api/odata/businessobject" }}';
```

2. Update `credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts`:

BEFORE (lines 51-66):

```ts
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '={{ "rest_api_key=" + $credentials.apiKey }}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{ "https://" + $credentials.tenant.replace(/^https?:\\/\\//, "").replace(/\\/+$/, "") + ($credentials.isOnPrem ? "/HEAT" : "") + "/api/odata/businessobject" }}',
			method: 'GET',
			url: '/Incidents?$top=1',
		},
	};
```

AFTER:

```ts
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: ITSM_AUTH_HEADER,
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: ITSM_TEST_BASE_URL,
			method: 'GET',
			url: '/Incidents?$top=1',
		},
	};
```

Add to the import block at the top of the file:

```ts
import { ITSM_AUTH_HEADER, ITSM_TEST_BASE_URL } from './shared';
```

3. Update `credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts` the same way:

BEFORE (lines 146-160, abridged):

```ts
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '={{ "rest_api_key=" + $credentials.apiKey }}',
			},
		},
	};
	...
	test: ICredentialTestRequest = {
		request: {
			method: 'GET',
			baseURL: '={{ "https://" + $credentials.tenant.replace(/^https?:\\/\\//, "").replace(/\\/+$/, "") + ($credentials.isOnPrem ? "/HEAT" : "") + "/api/odata/businessobject" }}',
			url: '/N8N_AuthTypes',
			...
```

AFTER:

```ts
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: ITSM_AUTH_HEADER,
			},
		},
	};
	...
	test: ICredentialTestRequest = {
		request: {
			method: 'GET',
			baseURL: ITSM_TEST_BASE_URL,
			url: '/N8N_AuthTypes',
			...
```

Add to its import block:

```ts
import { ITSM_AUTH_HEADER, ITSM_TEST_BASE_URL } from './shared';
```

Because these are plain string constants concatenated at class-construction time (not function calls inside the expression), n8n still receives an identical literal expression string — behavior is byte-for-byte unchanged, only the source is deduplicated.

### Tier 2 (optional) — Remove the runtime triplication and cross-link

In `nodes/IvantiNeuronsForITSM/transports/index.ts` the tenant normalization is inlined in three functions. Extract one helper near the top of that file:

```ts
/**
 * Builds the full Ivanti OData request URL from the credential's tenant value.
 * Mirrors the credential-test expression in credentials/shared.ts
 * (ITSM_TEST_BASE_URL) — keep the two in sync.
 */
export function buildItsmUrl(tenant: string, isOnPrem: boolean, endpoint: string): string {
	const host = tenant.replace(/^https?:\/\//, '').replace(/\/+$/, '');
	const tenantPath = isOnPrem ? '/HEAT/api' : '/api';
	return `https://${host}${tenantPath}${endpoint}`;
}
```

Then replace each of the three inlined blocks (around lines 44-51, 163-168, 202-208), e.g.:

BEFORE:

```ts
	const tenant = (credential.tenant as string).replace(/^https?:\/\//, '').replace(/\/+$/, '');
	...
	const tenantPath = isOnPrem ? '/HEAT/api' : '/api';
	...
		url: `https://${tenant}${tenantPath}${endpoint}`,
```

AFTER:

```ts
		url: buildItsmUrl(credential.tenant as string, isOnPrem, endpoint),
```

(Keep the `isOnPrem` local if it is read elsewhere in the same function.)

Finally, add a one-line cross-reference comment above `ITSM_TEST_BASE_URL` in `credentials/shared.ts` pointing at `buildItsmUrl` (already included in the snippet above), so the two normalization implementations stay paired.

If full extraction is out of scope, the minimum acceptable fix is Tier 1 alone (or, at the very least, a comment on lines 62 and 159 cross-linking each credential's expression to the other and to the transport logic, as the finding's last sentence allows).

## Verification

1. Build / typecheck and lint:
   - `npm run build` (or `npx n8n-node build`) — must compile the new `credentials/shared.ts` and both credential files with no TS errors.
   - `npm run lint` (or `npx n8n-node lint`) — must pass with no new warnings.
2. Confirm the emitted expressions are unchanged by diffing the built output: after building, the compiled `dist/credentials/*.js` `Authorization` and `baseURL` values should be the exact same literal strings as before this change (the refactor must be behavior-preserving). `grep -n "rest_api_key" dist/credentials/*.js` should still show `"rest_api_key=" + $credentials.apiKey`.
3. Grep for residual duplicates to confirm the literals now exist only in `credentials/shared.ts`:
   - `grep -rn 'rest_api_key=' credentials/` should match only `credentials/shared.ts`.
   - `grep -rn 'odata/businessobject' credentials/` should match only `credentials/shared.ts`.
4. (If Tier 2 applied) `grep -n 'replace(/^https?' nodes/IvantiNeuronsForITSM/transports/index.ts` should appear only once (inside `buildItsmUrl`).
5. Functional smoke test in n8n: open each credential and click "Test", confirming both the API Key credential and the Connector Auth credential still validate against a live tenant exactly as before.

## Related findings

None.
