# Finding 47: tsconfig missing noUncheckedIndexedAccess/noUnusedParameters and disables useUnknownInCatchVariables; eslint config not extended

| Field | Value |
|---|---|
| Category | TypeScript Quality |
| Severity | low |
| Status | Confirmed |
| Confidence | high |
| Affected files | /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/tsconfig.json:9, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/tsconfig.json:13, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/eslint.config.mjs:1-3 |

## Problem
`strict: true` is enabled, but the `tsconfig.json` configuration weakens type safety in three ways and the eslint config adds no project-level rules to compensate.

`tsconfig.json` (lines 3, 9, 13):

```json
"strict": true,
...
"useUnknownInCatchVariables": false,
...
"noUnusedLocals": true,
```

Concretely:

1. **`useUnknownInCatchVariables: false`** turns off the one `strict`-family flag that would type `catch` bindings as `unknown`. Because it is disabled, every `catch (error)` binds `error` as `any`, which is exactly why the codebase casts it everywhere. There are 18 occurrences of `(error as Error).message`, e.g. `nodes/IvantiNeuronsForITSM/actions/attachment/readAttachment.operation.ts:87`:

   ```ts
   } catch (error) {
       if (this.continueOnFail()) {
           returnData.push({ json: { error: (error as Error).message } });
   ```

2. **`noUncheckedIndexedAccess` is absent**, so indexed/array access is typed as if it always returns a value. The code relies on this in several spots that can actually be `undefined`:

   - `nodes/IvantiNeuronsForITSM/methods/listSearch.ts:111`
     ```ts
     const typeOnly = (displayType.split(' ')[1] ?? displayType).toLowerCase();
     ```
   - `nodes/IvantiNeuronsForITSM/actions/attachment/readAttachment.operation.ts:71`
     ```ts
     ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
     ```
   - `nodes/IvantiNeuronsForITSM/actions/serviceReq/create.operation.ts:358-360`
     ```ts
     const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
     if (match) {
         str = `${match[1]}-${match[2]}-${match[3]}T00:00:00Z`;
     ```

3. **Only `noUnusedLocals` is set; `noUnusedParameters` is missing**, so unused function parameters never get flagged.

The eslint config provides no second line of defence — `eslint.config.mjs` is just a re-export with no project rules:

```js
import { config } from '@n8n/node-cli/eslint';

export default config;
```

## Why it matters
This is a low-severity maintainability/robustness issue, not a live bug.

- Without `noUncheckedIndexedAccess`, an out-of-range index silently produces `undefined` that the type system treats as defined. The current call sites mostly guard against it (the `?? displayType` fallback, the `?.replace`, the `if (match)` block), so they are safe today — but new code that indexes without a guard will compile cleanly and can throw `Cannot read properties of undefined` at runtime. Enabling the flag forces every index access to be guarded, which is the safe default for this code style.
- `useUnknownInCatchVariables: false` is what forces the ubiquitous `(error as Error)` cast. A thrown non-`Error` value (string, plain object from a rejected HTTP promise) would make `.message` `undefined` and silently lose the real error text. Treating caught values as `unknown` and narrowing them properly makes error reporting correct.
- Missing `noUnusedParameters` lets dead parameters accumulate, which obscures real signatures across the many `*.operation.ts` files.
- A bare eslint re-export means there is no lint-level guard against the `any`/cast patterns these tsconfig gaps encourage.

Because some of these flags will surface new compile errors in existing code, the fix must include the corresponding code adjustments shown below.

## Resolution

### Step 1 — Tighten `tsconfig.json`

Edit `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/tsconfig.json`.

BEFORE (lines 3-14):
```json
"strict": true,
"module": "commonjs",
"moduleResolution": "node",
"target": "es2019",
"lib": ["es2019", "es2020", "es2022.error"],
"removeComments": true,
"useUnknownInCatchVariables": false,
"forceConsistentCasingInFileNames": true,
"noImplicitAny": true,
"noImplicitReturns": true,
"noUnusedLocals": true,
"strictNullChecks": true,
```

AFTER:
```json
"strict": true,
"module": "commonjs",
"moduleResolution": "node",
"target": "es2019",
"lib": ["es2019", "es2020", "es2022.error"],
"removeComments": true,
"forceConsistentCasingInFileNames": true,
"noImplicitAny": true,
"noImplicitReturns": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
"noUncheckedIndexedAccess": true,
"strictNullChecks": true,
```

Changes:
- Removed `"useUnknownInCatchVariables": false,` (so it reverts to the `strict` default of `true`).
- Added `"noUnusedParameters": true,`.
- Added `"noUncheckedIndexedAccess": true,`.

### Step 2 — Add a small typed helper for catch blocks

Removing `useUnknownInCatchVariables: false` makes `error` typed as `unknown`, so `(error as Error).message` will no longer typecheck cleanly (and casting `unknown as Error` is exactly the unsafe pattern we want to remove). Add a shared narrowing helper.

`nodes/IvantiNeuronsForITSM/common.ts` already exists as the shared utils module — append this exported function:

```ts
/**
 * Safely extract a human-readable message from an unknown caught value.
 * `catch` bindings are typed as `unknown`; this narrows them without an unsafe cast.
 */
export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === 'string') {
		return error;
	}
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}
```

Then replace the `(error as Error).message` usages. Example in `nodes/IvantiNeuronsForITSM/actions/attachment/readAttachment.operation.ts`:

BEFORE (line 87):
```ts
returnData.push({ json: { error: (error as Error).message } });
```

AFTER:
```ts
returnData.push({ json: { error: getErrorMessage(error) } });
```

(with `import { getErrorMessage } from '../../common';` added — adjust the relative depth per file). Apply the same substitution to the other 17 occurrences found by:
```bash
grep -rn "(error as Error)" nodes/
```

The connector node (`nodes/IvantiNeuronsForItsmConnector/...`) does not import from the ITSM `common.ts`; for its single occurrence in `actions/automation/update.operation.ts` either inline an `instanceof Error` check or add an equivalent helper local to that node folder.

### Step 3 — Confirm the existing index-access call sites still compile

With `noUncheckedIndexedAccess` on, the three flagged call sites are already written defensively and continue to compile, but verify their inferred types:

- `listSearch.ts:111` — `displayType.split(' ')[1]` becomes `string | undefined`; the existing `?? displayType` fallback handles it. No change needed.
- `readAttachment.operation.ts:71` — `contentDisposition.split('filename=')[1]` becomes `string | undefined`; the existing optional chain `?.replace(...)` handles it. The result `attachmentName` is then `string | undefined`, and it is already cast at line 75 (`attachmentName as string`). Prefer a real fallback instead of the cast:
  ```ts
  const attachmentName =
      contentDisposition?.split('filename=')[1]?.replace(/"/g, '') ?? 'unknown';
  ```
  then drop the `as string` cast on the `prepareBinaryData` call.
- `create.operation.ts:358-360` — `match[1]`/`match[2]`/`match[3]` are inside `if (match)`, but with `noUncheckedIndexedAccess` each capture group is typed `string | undefined`. For a matched regex the groups are present; assert non-empty or guard:
  ```ts
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
      const [, y, m, d] = match;
      str = `${y}-${m}-${d}T00:00:00Z`;
  }
  ```
  If the compiler still complains about `string | undefined` from destructuring, add a guard `if (match && match[1] && match[2] && match[3])`.

Run the build (Step in Verification) and fix any additional unchecked-index errors the compiler surfaces the same way.

### Step 4 — Add project-level eslint rules (optional hardening)

Edit `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/eslint.config.mjs` to keep the node-cli base and append a rules block that flags unsafe `any` access. The `@n8n/node-cli/eslint` config is a flat-config array, so spread it and add an override:

BEFORE:
```js
import { config } from '@n8n/node-cli/eslint';

export default config;
```

AFTER:
```js
import { config } from '@n8n/node-cli/eslint';

export default [
	...config,
	{
		files: ['nodes/**/*.ts', 'credentials/**/*.ts'],
		rules: {
			'@typescript-eslint/no-unsafe-member-access': 'warn',
			'@typescript-eslint/no-explicit-any': 'warn',
		},
	},
];
```

Note: confirm `config` is an array before spreading — run `node -e "import('@n8n/node-cli/eslint').then(m => console.log(Array.isArray(m.config)))"`. If it is a single object, wrap as `[config, { ... }]` instead. These typescript-eslint rules also require type-aware linting (a `parserOptions.project` pointing at `tsconfig.json`); if the base config does not already enable it, this step can be deferred — Steps 1-3 are the load-bearing fix.

## Verification
1. Typecheck/build with the project's tooling:
   ```bash
   npx n8n-node build
   ```
   or, for a pure type check, `npx tsc --noEmit`. It must compile with zero errors after Steps 1-3.
2. Confirm no stray casts remain:
   ```bash
   grep -rn "(error as Error)" nodes/    # expect no results
   ```
3. Lint:
   ```bash
   npx n8n-node lint
   ```
   Should pass (or show only the intentional new warnings from Step 4).
4. Sanity-check the flags are active by temporarily adding an unguarded `const x = ['a'][5].length;` to any node file and confirming `tsc` now reports `'x' is possibly 'undefined'`, then remove it.

## Related findings
The unchecked index access and pervasive `(error as Error)` casts referenced here are the symptoms; this finding addresses their root cause at the compiler-config level. If separate findings track those specific call sites (`listSearch.ts:111`, `readAttachment.operation.ts:71/75`, `create.operation.ts:358`) or the error-handling cast pattern, they should be resolved together with Steps 2-3. Otherwise: None.
