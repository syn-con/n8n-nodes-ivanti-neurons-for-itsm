# Finding 14: No automated tests exist and CI does not run or gate on tests before deploy-on-main

| Field | Value |
|---|---|
| Category | Tests & Coverage |
| Severity | high |
| Status | Confirmed |
| Confidence | high |
| Affected files | /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/package.json:22-30, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/.github/workflows/ci.yml:30-44, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/methods/listSearch.ts:62-129, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/actions/serviceReq/create.operation.ts:337, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:332-368, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:361 |

## Problem

There is **no test infrastructure of any kind** in this package, and CI redeploys `main` without running tests.

**1. Zero tests / no runner / no test script.** A repo-wide search (excluding `dist/` and `node_modules/`) returns no `*.test.ts`, `*.spec.ts`, or `__tests__` directories, no `vitest`/`jest`/`mocha` config or dependency, and no `test` script. The `package.json` `scripts` block only wires build/lint/release:

```json
	"scripts": {
		"build": "n8n-node build",
		"build:watch": "tsc --watch",
		"dev": "n8n-node dev",
		"lint": "n8n-node lint",
		"lint:fix": "n8n-node lint --fix",
		"release": "n8n-node release",
	  		"prepublishOnly": "npm run build"
	},
```

**2. CI runs only lint + build, then dispatches a redeploy on push to `main`.** From `.github/workflows/ci.yml`:

```yaml
      - name: Run lint
        run: 'npm run lint'

      - name: Run build
        run: 'npm run build'

      # On push to main, kick the k3s home-lab repo's tyrunas-n8n-custom
      # workflow so it rebuilds + redeploys the n8n custom image.
      - name: Trigger k3s-home-lab build
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        env:
          GH_TOKEN: ${{ secrets.HOMELAB_DISPATCH_PAT }}
        run: |
          gh api repos/tyrunasj/k3s-home-lab/dispatches \
            -f event_type=ivanti-node-updated
```

Because `lint` and `build` only catch syntax/type errors, any change that merges to `main` and *compiles* is immediately redeployed to the home-lab n8n instance with **no behavioral verification**.

**3. The highest-value pure helpers are module-private (unexported), so they can't be unit-tested as-is.** Verified locations:

- `nodes/IvantiNeuronsForITSM/actions/serviceReq/create.operation.ts:337` — `function coerceParameterValue(value: unknown, fieldType: string): string` (pure; date/datetime normalisation + boolean stringify).
- `nodes/IvantiNeuronsForITSM/methods/listSearch.ts` — `extractBoName` (:66), `resolveDropdownDisplayType` (:85), `buildDropdownDisplayNames` (:105), `mapFieldType` (:124), `capitalize` (:62). All `function ...` with no `export`.
- `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:361` — `function encodeBasicAuth(username: string, password: string): string` (pure).

> Nuance worth recording: the finding also lists `parseValue` and `buildODataQuery` in `getMany.operation.ts`. Both are declared with a `this: IExecuteFunctions` context and call `this.getNode()` / `this.getNodeParameter()` (see :332 and :368). `parseValue` is *almost* pure (only `this.getNode()` for the error path), but `buildODataQuery` reads node parameters and is **not** pure. So the practical highest-ROI unit-test targets are the six genuinely-pure helpers above; `parseValue`/`buildODataQuery` are better covered later via either a small refactor (split the pure parsing out of the `this`-bound wrapper) or a mocked-`this` test. This does not change the conclusion — the finding is confirmed.

## Why it matters

- **No regression safety net on logic that is easy to get subtly wrong.** This package does OData `$filter` assembly, value coercion, `ConfigOptions` JSON parsing, and webhook Basic-Auth. These are exactly the string/format edge-case heavy areas where bugs hide (e.g. millisecond stripping, timezone `Z` normalisation, `boName.replace('#','')`, base64 auth). The other findings in this review (boolean coercion, broken Return-All paging) are concrete examples of bugs that a single unit test would have caught.
- **Untested code is auto-deployed.** The `push: main` -> dispatch step means a faulty merge reaches the running n8n instance with only "it compiled" as the gate. There is no opportunity to catch a behavioral regression before users hit it.
- **The most testable code is locked behind module privacy.** The pure helpers cannot be imported by a test file, so even a motivated contributor cannot add coverage without first refactoring exports. This raises the activation energy for *ever* adding tests.

## Resolution

### Step 1 — Add a test runner (Vitest)

Vitest needs zero extra config for TS (uses esbuild) and integrates cleanly with the existing tooling. Add the dev dependency and a `test` script.

`package.json` (BEFORE):

```json
	"scripts": {
		"build": "n8n-node build",
		"build:watch": "tsc --watch",
		"dev": "n8n-node dev",
		"lint": "n8n-node lint",
		"lint:fix": "n8n-node lint --fix",
		"release": "n8n-node release",
	  		"prepublishOnly": "npm run build"
	},
```

`package.json` (AFTER):

```json
	"scripts": {
		"build": "n8n-node build",
		"build:watch": "tsc --watch",
		"dev": "n8n-node dev",
		"lint": "n8n-node lint",
		"lint:fix": "n8n-node lint --fix",
		"test": "vitest run",
		"test:watch": "vitest",
		"release": "n8n-node release",
		"prepublishOnly": "npm run build"
	},
```

And add to `devDependencies`:

```json
	"devDependencies": {
		"@n8n/node-cli": "*",
		"eslint": "9.32.0",
		"prettier": "3.6.2",
		"release-it": "^19.0.4",
		"typescript": "5.9.2",
		"vitest": "^2.1.0"
	},
```

Install with `npm install -D vitest`.

> Note: lint config (`eslint.config.mjs`) and `.eslintignore`/tsconfig `include` may need `*.test.ts` allowed. If `npm run lint` complains about test files, add a test-file override or include `**/*.test.ts` in the lint glob rather than disabling rules wholesale.

### Step 2 — Export the pure helpers so they can be imported by tests

`nodes/IvantiNeuronsForITSM/actions/serviceReq/create.operation.ts:337` — BEFORE:

```ts
function coerceParameterValue(value: unknown, fieldType: string): string {
```

AFTER:

```ts
export function coerceParameterValue(value: unknown, fieldType: string): string {
```

`nodes/IvantiNeuronsForITSM/methods/listSearch.ts` — add `export` to the four helpers being tested (lines 62, 66, 85, 124). BEFORE / AFTER for each:

```ts
// :62
export function capitalize(s: string): string {
// :66
export function extractBoName(configOptions: string): string | null {
// :85
export function resolveDropdownDisplayType(rawType: string, lowerType: string, configOptions: string | undefined): DropdownTypeInfo {
// :124
export function mapFieldType(lowerType: string): string {
```

`buildDropdownDisplayNames` (:105) and the `DropdownTypeInfo` interface (:78) should also be exported if you want to test display-name assembly:

```ts
export interface DropdownTypeInfo { /* ... */ }
export function buildDropdownDisplayNames(/* ... */): { valueDisplayName: string; recIdDisplayName: string } {
```

`nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:361` — BEFORE:

```ts
function encodeBasicAuth(username: string, password: string): string {
	return Buffer.from(`${username}:${password}`).toString('base64');
}
```

AFTER:

```ts
export function encodeBasicAuth(username: string, password: string): string {
	return Buffer.from(`${username}:${password}`).toString('base64');
}
```

> `export`ing additional functions from a node file is safe for n8n: n8n loads the node by its registered class export; extra named exports are ignored by the loader.

### Step 3 — Add unit tests for the pure helpers

Create `nodes/IvantiNeuronsForITSM/actions/serviceReq/coerceParameterValue.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { coerceParameterValue } from './create.operation';

describe('coerceParameterValue', () => {
	it('stringifies booleans', () => {
		expect(coerceParameterValue(true, 'checkbox')).toBe('true');
		expect(coerceParameterValue(false, 'checkbox')).toBe('false');
	});

	it('passes through empty/whitespace untouched', () => {
		expect(coerceParameterValue('', 'text')).toBe('');
		expect(coerceParameterValue('   ', 'text')).toBe('   ');
	});

	it('strips milliseconds from datetime', () => {
		expect(coerceParameterValue('2026-06-13T10:00:00.123Z', 'datetime'))
			.toBe('2026-06-13T10:00:00Z');
	});

	it('normalises timezone offset to Z for datetime', () => {
		expect(coerceParameterValue('2026-06-13T10:00:00+02:00', 'datetime'))
			.toBe('2026-06-13T10:00:00Z');
	});

	it('appends Z to bare datetime strings without one', () => {
		expect(coerceParameterValue('2026-06-13T10:00:00', 'datetime'))
			.toBe('2026-06-13T10:00:00Z');
	});

	it('reduces date fields to YYYY-MM-DD with T00:00:00Z', () => {
		expect(coerceParameterValue('2026-06-13T10:00:00Z', 'date'))
			.toBe('2026-06-13T00:00:00Z');
	});

	it('returns other types as-is', () => {
		expect(coerceParameterValue('plain text', 'text')).toBe('plain text');
	});
});
```

Create `nodes/IvantiNeuronsForITSM/methods/listSearch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
	extractBoName,
	resolveDropdownDisplayType,
	mapFieldType,
} from './listSearch';

describe('extractBoName', () => {
	it('returns null for invalid JSON', () => {
		expect(extractBoName('not json')).toBeNull();
	});

	it('strips a leading # from the boName', () => {
		const config = JSON.stringify({
			validationListAdditionalConfig: [{ boName: '#Incident' }],
		});
		expect(extractBoName(config)).toBe('Incident');
	});

	it('reads boName from nested configData', () => {
		const config = JSON.stringify({
			configData: { validationListAdditionalConfig: [{ boName: 'Change' }] },
		});
		expect(extractBoName(config)).toBe('Change');
	});

	it('returns null when boName is absent', () => {
		expect(extractBoName(JSON.stringify({ foo: 'bar' }))).toBeNull();
	});
});

describe('resolveDropdownDisplayType', () => {
	it('renames combo to Dropdown', () => {
		expect(resolveDropdownDisplayType('combo', 'combo', undefined).displayType)
			.toBe('Dropdown');
	});

	it('prefixes the boName when ConfigOptions yields one', () => {
		const config = JSON.stringify({
			validationListAdditionalConfig: [{ boName: '#Incident' }],
		});
		const out = resolveDropdownDisplayType('combo', 'combo', config);
		expect(out).toEqual({ displayType: 'Incident Dropdown', boName: 'Incident' });
	});

	it('marks list/combo types without a boName as Manual', () => {
		expect(resolveDropdownDisplayType('list', 'list', undefined))
			.toEqual({ displayType: 'Manual List', boName: null });
	});
});

describe('mapFieldType', () => {
	it.each([
		['checkbox', 'boolean'],
		['datetime', 'dateTime'],
		['date', 'dateTime'],
		['time', 'time'],
		['text', 'string'],
	])('maps %s -> %s', (input, expected) => {
		expect(mapFieldType(input)).toBe(expected);
	});
});
```

Create `nodes/IvantiNeuronsForItsmConnector/encodeBasicAuth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { encodeBasicAuth } from './IvantiNeuronsForItsmConnectorTrigger.node';

describe('encodeBasicAuth', () => {
	it('base64-encodes user:pass', () => {
		// "alice:secret" -> base64
		expect(encodeBasicAuth('alice', 'secret'))
			.toBe(Buffer.from('alice:secret').toString('base64'));
		expect(encodeBasicAuth('alice', 'secret')).toBe('YWxpY2U6c2VjcmV0');
	});
});
```

### Step 4 — Gate CI on tests BEFORE the deploy dispatch

`.github/workflows/ci.yml` (BEFORE — the relevant tail):

```yaml
      - name: Run build
        run: 'npm run build'

      # On push to main, kick the k3s home-lab repo's tyrunas-n8n-custom
      # workflow so it rebuilds + redeploys the n8n custom image.
      - name: Trigger k3s-home-lab build
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

`.github/workflows/ci.yml` (AFTER — insert the test step between build and the dispatch):

```yaml
      - name: Run build
        run: 'npm run build'

      - name: Run tests
        run: 'npm test'

      # On push to main, kick the k3s home-lab repo's tyrunas-n8n-custom
      # workflow so it rebuilds + redeploys the n8n custom image.
      - name: Trigger k3s-home-lab build
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Because steps run sequentially and a failing step fails the job, placing `Run tests` before `Trigger k3s-home-lab build` means a test failure aborts the job and the deploy dispatch never fires. (Optionally also restrict the dispatch to PR-only merges via branch protection, but the step ordering alone closes the deploy-on-broken-main gap.)

### Step 5 — Update CHANGELOG.md

Per AGENTS.md ("If you are updating the npm package version, make sure to update CHANGELOG.md"), if this work is shipped under a new version, add an entry noting the test harness addition and the newly-exported helpers (the exports are an API-surface change worth recording, though they are additive and non-breaking).

## Verification

1. `npm install -D vitest` then `npm test` — confirm Vitest discovers and runs the new `*.test.ts` files and all assertions pass.
2. `npm run lint` — confirm the added `export` keywords and the test files produce no lint errors (adjust the lint glob/override if test files are flagged, per Step 1 note).
3. `npm run build` — confirm `n8n-node build` still compiles cleanly with the new exports (extra named exports must not break the node bundle).
4. Negative check: temporarily break one helper (e.g. make `encodeBasicAuth` return the raw string) and re-run `npm test` to confirm a test fails — proving the suite actually exercises the code.
5. CI check: push a branch / open a PR and confirm the `Run tests` step appears and runs before the `Trigger k3s-home-lab build` step in the Actions log; confirm the dispatch step is skipped on PRs and only runs on `push` to `main` after tests pass.

## Related findings

- The boolean-coercion bug and the broken Return-All paging bug referenced in the summary are the concrete regressions a test suite would have caught; cross-reference those finding numbers when prioritising which helpers get the first tests (`coerceParameterValue` and the pagination helper in `transports/index.ts`). If those findings have their own numbers in this review, link them here. Otherwise: None.
