# Finding 40: SearchResponse and encodeBasicAuth re-declared locally instead of imported from common.ts

| Field | Value |
|---|---|
| Category | DRY / Duplication |
| Severity | low |
| Status | Confirmed |
| Confidence | high |
| Affected files | nodes/IvantiNeuronsForITSM/actions/object/searchByKeyword.operation.ts:205-209, nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts:180-183, nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:361-363, nodes/IvantiNeuronsForITSM/common.ts:40-56 |

## Problem

`common.ts` is the established home for these shared declarations:

```ts
// nodes/IvantiNeuronsForITSM/common.ts:40-44
export interface SearchResponse {
	"@odata.context": string
	"@odata.count": number,
	value: IDataObject[]
}

// nodes/IvantiNeuronsForITSM/common.ts:54-56
export function encodeBasicAuth(username: string, password: string): string {
	return Buffer.from(`${username}:${password}`).toString('base64');
}
```

Three places duplicate this code instead of importing it:

1. **`searchByKeyword.operation.ts:205-209`** re-declares a byte-identical, **`export`ed but never used** `SearchResponse`. It is dead code — the only occurrence of `SearchResponse` in the file is the declaration itself (confirmed via grep; the operation reads responses through the `ivantiApiRequestAllItems` / `ivantiApiRequestAllItemsWithLimit` transport helpers, never via this type):

   ```ts
   // nodes/IvantiNeuronsForITSM/actions/object/searchByKeyword.operation.ts:205-209
   export interface SearchResponse {
       "@odata.context": string
       "@odata.count": number,
       value: IDataObject[]
   }
   ```

2. **`getRelated.operation.ts:180-183`** declares `GetRelatedResponse`, which is `SearchResponse` minus the `@odata.count` member. Unlike case 1, this type **is used** (lines 138 and 146):

   ```ts
   // nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts:180-183
   export interface GetRelatedResponse {
       "@odata.context": string
       value: IDataObject[]
   }
   ```

3. **`IvantiNeuronsForItsmConnectorTrigger.node.ts:361-363`** declares a private `encodeBasicAuth` that is byte-identical to the one in `common.ts`, used at line 297:

   ```ts
   // nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:297
   const encodedAuth = encodeBasicAuth(credentials.username as string, credentials.password as string);
   // ...
   // nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:361-363
   function encodeBasicAuth(username: string, password: string): string {
       return Buffer.from(`${username}:${password}`).toString('base64');
   }
   ```

That `common.ts` is the intended single source of truth is corroborated by three files that already import `SearchResponse` from it: `transports/index.ts:13`, `actions/object/getMany.operation.ts:13`, and `actions/serviceReq/create.simplified.operation.ts:12`.

## Why it matters

This is a maintainability issue (low severity, no runtime/security/data impact):

- **Dead, misleading code.** The `searchByKeyword` copy is exported but never referenced, so it is pure noise that suggests a contract the file does not actually use.
- **Drift risk.** Three independent copies of the OData response shape and the auth-encoding logic mean a future change to one (e.g. adding a field, or switching encoding) silently diverges from the others.
- **Duplicated logic across nodes.** The connector node carries its own copy of `encodeBasicAuth` even though an identical, documented one already exists in the package.

## Resolution

### 1. Delete the dead `SearchResponse` in `searchByKeyword.operation.ts`

It is unused, so simply remove lines 205-209. No import is needed because nothing in the file references the type.

**BEFORE** (`nodes/IvantiNeuronsForITSM/actions/object/searchByKeyword.operation.ts:202-209`):

```ts
    return returnData;
}


export interface SearchResponse {
    "@odata.context": string
    "@odata.count": number,
    value: IDataObject[]
}
```

**AFTER**:

```ts
    return returnData;
}
```

### 2. Reuse the shared `SearchResponse` for `getRelated`

`GetRelatedResponse` is `SearchResponse` without `@odata.count`. Since `@odata.count` is only present when `$count=true` is requested, the cleanest fix is to make it optional in the canonical type and reuse it everywhere. This is backward compatible with the existing importers (`transports/index.ts`, `getMany.operation.ts`, `create.simplified.operation.ts`), which only ever read `value` / `@odata.count` and never assign the type.

**Step 2a — make `@odata.count` optional in `common.ts`:**

**BEFORE** (`nodes/IvantiNeuronsForITSM/common.ts:40-44`):

```ts
export interface SearchResponse {
	"@odata.context": string
	"@odata.count": number,
	value: IDataObject[]
}
```

**AFTER**:

```ts
export interface SearchResponse {
	"@odata.context": string
	"@odata.count"?: number,
	value: IDataObject[]
}
```

**Step 2b — in `getRelated.operation.ts`, delete the local interface (lines 178-183) and import the shared type.**

Add `SearchResponse` to the import from `common`. The file currently has no `common` import, so add one (path is `../../common`, matching the sibling `getMany.operation.ts:13` pattern):

```ts
import { SearchResponse } from '../../common';
```

Then replace the two usages and remove the local declaration:

**BEFORE** (`nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts:138,146,178-183`):

```ts
			let responseData: GetRelatedResponse;
			// ...
				responseData = response as GetRelatedResponse;
// ...
/** Shape of the OData response returned by relationship traversal endpoints. */
export interface GetRelatedResponse {
	"@odata.context": string
	value: IDataObject[]
}
```

**AFTER** (interface deleted; usages point at the shared type):

```ts
			let responseData: SearchResponse;
			// ...
				responseData = response as SearchResponse;
```

> If keeping the relationship response strictly free of `@odata.count` is preferred over relaxing `SearchResponse`, an equally valid alternative is to keep `SearchResponse` unchanged and define `GetRelatedResponse` as a derived type in `common.ts`: `export type GetRelatedResponse = Omit<SearchResponse, '@odata.count'>;` and import that. Either way, the duplicated literal interface body is removed.

### 3. Reuse `encodeBasicAuth` in the connector trigger

The connector node lives in a sibling directory (`nodes/IvantiNeuronsForItsmConnector/`) and currently has **no** imports from `nodes/IvantiNeuronsForITSM/`. Two options:

**Option A (minimal) — import cross-node from `common.ts`:**

Add to the imports at the top of `IvantiNeuronsForItsmConnectorTrigger.node.ts` (the relative path is `../IvantiNeuronsForITSM/common`):

```ts
import { encodeBasicAuth } from '../IvantiNeuronsForITSM/common';
```

Then delete the local declaration:

**BEFORE** (`nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:361-363`):

```ts
function encodeBasicAuth(username: string, password: string): string {
	return Buffer.from(`${username}:${password}`).toString('base64');
}
```

**AFTER**: (declaration removed; line 297 call site is unchanged and now resolves to the imported function).

**Option B (cleaner, recommended for a genuinely cross-node helper) — move `encodeBasicAuth` to a top-level shared module.** Because `encodeBasicAuth` is the only thing the connector node would otherwise pull from the `IvantiNeuronsForITSM` directory, a cross-directory import couples two otherwise-independent node folders. Create a small shared module and have both nodes import from it:

Create `nodes/shared/auth.ts`:

```ts
/**
 * Encodes a username/password pair as a Base64 Basic-Auth string,
 * suitable for an `Authorization: Basic <token>` header.
 */
export function encodeBasicAuth(username: string, password: string): string {
	return Buffer.from(`${username}:${password}`).toString('base64');
}
```

Then:
- In `nodes/IvantiNeuronsForITSM/common.ts`, replace the `encodeBasicAuth` definition (lines 54-56) with a re-export so existing importers keep working: `export { encodeBasicAuth } from '../shared/auth';` (verify no other file imports `encodeBasicAuth` from `common` — grep currently shows none do besides the connector, so a plain re-export is safe).
- In `IvantiNeuronsForItsmConnectorTrigger.node.ts`, delete lines 361-363 and add `import { encodeBasicAuth } from '../shared/auth';`.

Option A is the smallest change and is acceptable; Option B is preferable if more shared helpers are expected. No new `package.json` `n8n` entries are required either way (shared modules are not nodes/credentials).

## Verification

1. **Build / typecheck** — run the project's build (per AGENTS.md, prefer the `n8n-node` CLI):

   ```
   npx n8n-node build
   ```

   or the underlying TypeScript check (`npx tsc --noEmit`). Any leftover reference to a now-deleted `SearchResponse` / `GetRelatedResponse` / local `encodeBasicAuth` would fail compilation.

2. **Lint** — run the linter to catch unused imports/declarations:

   ```
   npx n8n-node lint
   ```

   (or `npx eslint .`). This also confirms the deleted dead `SearchResponse` no longer triggers any rule.

3. **Manual grep confirmation** that no duplicate declarations remain and every reference resolves to a shared source:

   ```
   grep -rn "interface SearchResponse" nodes/        # expect only common.ts
   grep -rn "GetRelatedResponse" nodes/              # expect 0 (or only an Omit alias in common.ts)
   grep -rn "function encodeBasicAuth" nodes/        # expect only one definition (common.ts or shared/auth.ts)
   ```

## Related findings

References the same "Dead Code" and "DRY / Duplication" themes noted in the finding's `sources`. No specific cross-finding numbers were provided; otherwise None.
