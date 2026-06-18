# Finding 48: package.json missing engines field; build:watch uses bare tsc and won't copy icon assets

| Field | Value |
|---|---|
| Category | Production Readiness |
| Severity | low |
| Status | Confirmed |
| Confidence | high |
| Affected files | /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/package.json:22-30, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/tsconfig.json |

## Problem

Two related production-readiness gaps in `package.json`.

**1. No `engines` field.** The package declares no supported Node version, yet CI pins `lts/*`:

`.github/workflows/ci.yml:24`
```yaml
          node-version: 'lts/*'
```
`.github/workflows/publish.yml:81`
```yaml
          node-version: 'lts/*'
```

`package.json` (lines 1-30, abbreviated) has scripts and metadata but no `engines` key. Without it, npm cannot warn an installer that they are on an unsupported runtime, and the contract that CI implicitly relies on (`lts/*`) is not codified anywhere consumers can see.

**2. `build:watch` uses bare `tsc --watch`.** `package.json:22-30`:
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

`build` and `dev` use the `n8n-node` CLI, which compiles TypeScript **and** copies non-TS assets (the SVG icons) into `dist`. `build:watch` instead invokes the bare TypeScript compiler. `tsconfig.json` only sets `"outDir": "./dist/"` and has no asset-copy logic:
```json
	"compilerOptions": {
		...
		"outDir": "./dist/"
	},
	"include": ["credentials/**/*", "nodes/**/*", "nodes/**/*.json", "package.json"]
```

So `tsc --watch` emits `.js`/`.d.ts`/`.js.map` but never copies the icon files. Every node references an icon by relative path that resolves into `dist`:

`nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.ts:41`
```ts
        icon: { light: 'file:../../icons/ivant-neurons-for-itsm.svg', dark: 'file:../../icons/ivant-neurons-for-itsm.dark.svg' },
```
The same `file:../../icons/...` pattern appears in `IvantiNeuronsForItsmTrigger.node.ts:41`, `IvantiNeuronsForItsmConnector.node.ts:31`, and `IvantiNeuronsForItsmConnectorTrigger.node.ts:42`. The source SVGs live in the top-level `./icons/` directory (`ivant-neurons-for-itsm.svg`, `ivant-neurons-for-itsm.dark.svg`, `synergy.svg`, `synergy.dark.svg`), which `tsc` ignores entirely.

## Why it matters

- **Missing `engines`:** A consumer installing the published package on an unsupported Node version gets no `EBADENGINE` warning, and there is no machine-readable declaration of the runtime the maintainers actually test (`lts/*`). This is the difference between a silent runtime breakage downstream and an upfront, actionable warning at install time. It is purely a maintainability/clarity gap, hence low severity.
- **`build:watch` divergence:** A developer who runs `npm run build:watch` produces a `dist/` whose icons are missing relative to what `npm run build` (and the published artifact) produces. The nodes will load but render without their icons in a locally linked n8n, causing confusing "why is the icon broken in dev but fine after a real build" debugging. The dev output silently diverges from production output. AGENTS.md / `.agents/workflow.md:52-53,75,82` explicitly direct contributors to "Use the `n8n-node` CLI tool **whenever possible**" for building and dev/hot-reload, so the bare-`tsc` script also contradicts project convention.

## Resolution

### Step 1 — Add an `engines` field

n8n requires a modern Node LTS. Pin a floor that matches n8n's runtime (Node 20+ is the current n8n baseline; align with the `lts/*` that CI uses). Add the field to `package.json`.

BEFORE (`package.json`, top metadata block, lines 1-21 unchanged through `repository`):
```json
	"repository": {
		"type": "git",
		"url": "https://github.com/syn-con/n8n-nodes-ivanti-neurons-for-itsm.git"
	},
	"scripts": {
```

AFTER (insert an `engines` block between `repository` and `scripts`):
```json
	"repository": {
		"type": "git",
		"url": "https://github.com/syn-con/n8n-nodes-ivanti-neurons-for-itsm.git"
	},
	"engines": {
		"node": ">=20.15"
	},
	"scripts": {
```

Note: `>=20.15` matches the Node 20 LTS line n8n currently targets. If you prefer to track newer LTS, use `>=22` — but keep it consistent with whatever `lts/*` resolves to in CI at release time. Do not pin a single exact version (e.g. `20.15.0`), which would reject patch upgrades.

### Step 2 — Replace `build:watch` with a CLI-based watch

The `n8n-node` CLI is the single source of truth for "compile + copy assets." The cleanest fix is to make the watch script delegate to the CLI's dev/hot-reload mode (which keeps `dist` complete and identical to `build`). Per `.agents/workflow.md:75`, `n8n-node dev` runs the node in hot-reload mode; this is functionally the intended "watch" workflow.

BEFORE (`package.json:22-30`):
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

AFTER (drop the redundant, asset-dropping `build:watch` and rely on the CLI's `dev` for watching; this also fixes the stray tab/space indentation on the `prepublishOnly` line):
```json
	"scripts": {
		"build": "n8n-node build",
		"build:watch": "n8n-node dev --external-n8n",
		"dev": "n8n-node dev",
		"lint": "n8n-node lint",
		"lint:fix": "n8n-node lint --fix",
		"release": "n8n-node release",
		"prepublishOnly": "npm run build"
	},
```

Rationale for `n8n-node dev --external-n8n`: `--external-n8n` (documented in `.agents/workflow.md:79`) makes the command rebuild/relink on change **without** launching a full n8n instance, which is the closest behavioral match to the old "just keep compiling into dist" intent of `build:watch`, while still copying icon assets. If you want the watch script to also boot n8n for manual testing, use plain `n8n-node dev` instead and remove the now-duplicate `dev` script — but keeping both (one external, one full) is the more useful arrangement.

If, and only if, the `n8n-node` CLI in your installed version does not expose a watch/dev mode that copies assets, the fallback is to keep `tsc --watch` but chain an explicit copy step. In that case the minimal correct form is:
```json
		"build:watch": "tsc --watch --preserveWatchOutput & n8n-node build --watch-assets",
```
However, verify the CLI flag exists before adopting this; the preferred, convention-aligned fix is the `n8n-node dev` approach above. No new helper module or type is required for this finding.

## Verification

1. **`engines` is honored:** From the repo root run `npm pkg get engines` — it must print `{"node":">=20.15"}` (or your chosen range). Then run `npm install --engine-strict` on Node < 20 to confirm npm now emits an `EBADENGINE` warning/error (proves the field is wired correctly). On the CI-pinned `lts/*` runtime it installs cleanly.
2. **Watch produces icons:** Delete `dist/` (`rm -rf dist`), run `npm run build:watch`, let it complete its first pass, then in another shell confirm the SVGs were copied:
   - `ls dist/icons/` should list `ivant-neurons-for-itsm.svg`, `ivant-neurons-for-itsm.dark.svg`, `synergy.svg`, `synergy.dark.svg`, OR the icons should appear alongside the compiled nodes wherever the CLI places them.
   - Compare against a clean `npm run build`: `rm -rf dist && npm run build && find dist -name '*.svg'` and confirm the watch output's SVG set is identical. The two outputs must match.
3. **Lint/build still pass:** `npm run lint` and `npm run build` both succeed (the script changes are config-only and do not touch TypeScript).
4. **JSON validity:** `node -e "require('./package.json')"` exits 0 (catches a malformed edit / trailing comma).

## Related findings

None.
