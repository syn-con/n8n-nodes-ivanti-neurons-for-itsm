# Finding 22: LICENSE file referenced by README does not exist and would not ship in the npm tarball

| Field | Value |
|---|---|
| Category | Production Readiness |
| Severity | medium |
| Status | Confirmed |
| Confidence | high |
| Affected files | /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/README.md:1561, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/package.json:5, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/package.json:31-33</tt> |

## Problem

Three related defects around licensing/packaging metadata, all verified by reading the real files:

1. **Dead link in README.** The license section links to a file that does not exist:

   `README.md:1559-1561`
   ```markdown
   ## License

   [MIT](LICENSE.md)
   ```

   A directory listing of the repo root confirms there is **no** `LICENSE`, `LICENSE.md`, or `LICENSE.txt`:
   ```
   AGENTS.md  CHANGELOG.md  CLAUDE.md  README.md  package.json  package-lock.json
   tsconfig.json  eslint.config.mjs  .gitignore  .prettierrc.js
   ```
   (`find -maxdepth 1 -iname 'license*'` returns nothing.) The full MIT text is inlined directly below the link in the README (`README.md:1563-1569`), but the `[MIT](LICENSE.md)` hyperlink is broken on GitHub and npm.

2. **`package.json` declares MIT but ships no license file.**

   `package.json:5`
   ```json
   "license": "MIT",
   ```
   License scanners, npm tooling, and SPDX checkers expect a standalone `LICENSE` file alongside this SPDX identifier; the declaration is currently unbacked by a file.

3. **`files` allowlist excludes everything except `dist`.**

   `package.json:31-33`
   ```json
   "files": [
       "dist"
   ],
   ```
   With `files` restricted to `dist`, the published npm tarball will **not** contain `README.md`, `CHANGELOG.md`, or any future `LICENSE` (npm always force-includes `package.json`, `README`, and a `LICENSE` it auto-detects in the root, but relying on auto-detection is fragile and the `dist`-only allowlist is the stated intent here). The CHANGELOG is also currently empty (0 bytes), so even if shipped it carries no content.

## Why it matters

- **Legal/compliance clarity.** A published package whose declared `"license": "MIT"` is not backed by a discoverable `LICENSE` file is harder for downstream consumers, corporate license scanners, and the n8n Cloud verification process to validate. n8n community-node submission guidelines and general npm conventions expect a real license file.
- **Broken documentation.** The `[MIT](LICENSE.md)` link 404s on both GitHub and npmjs.com, signaling an unfinished/low-quality package to users evaluating it.
- **Missing package documentation on npm.** Because `files` is `["dist"]`, the README rendered on the npm package page and the CHANGELOG are at risk of being omitted, leaving users with no usage docs on the registry.

This is not a runtime bug; impact is on production readiness, distribution quality, and license discoverability.

## Resolution

### Step 1 — Add a top-level `LICENSE.md` file

Create `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/LICENSE.md` with the same MIT text already inlined in the README so the `[MIT](LICENSE.md)` link resolves and tooling can find it:

```markdown
MIT License

Copyright (c) 2024 UAB Synergy

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

The filename `LICENSE.md` matches the existing README link exactly. (If you prefer the more conventional extensionless `LICENSE`, also update the README link in Step 3 to point at `LICENSE`.)

### Step 2 — Expand the `package.json` `files` allowlist

`package.json:31-33`

BEFORE:
```json
	"files": [
		"dist"
	],
```

AFTER:
```json
	"files": [
		"dist",
		"LICENSE.md",
		"README.md",
		"CHANGELOG.md"
	],
```

This guarantees the license, docs, and changelog are explicitly included in the npm tarball rather than relying on npm's auto-detection. (Using the `LICENSE*` glob is also valid: `"LICENSE*"` would match either `LICENSE` or `LICENSE.md`.)

### Step 3 — (Only if you chose extensionless `LICENSE` in Step 1) fix the README link

If you named the file `LICENSE` instead of `LICENSE.md`, update the link so it does not stay broken:

`README.md:1561`

BEFORE:
```markdown
[MIT](LICENSE.md)
```

AFTER:
```markdown
[MIT](LICENSE)
```

If you kept `LICENSE.md` (Step 1 as written), no README change is needed — the existing link already matches.

### Step 4 — (Optional, related) populate the empty CHANGELOG

`CHANGELOG.md` is currently 0 bytes. AGENTS.md requires keeping `CHANGELOG.md` updated when bumping versions. Add at least a `1.0.7` entry so the shipped changelog is not empty, e.g.:

```markdown
# Changelog

## [1.0.7]
- Refactor API request handling in Ivanti Neurons for ITSM nodes.
```

## Verification

1. **License file exists and link resolves:**
   ```bash
   ls -l /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/LICENSE.md
   ```
   Confirm the file is non-empty. On GitHub, the README "License" section link should no longer 404.

2. **Tarball contents include the new files:**
   ```bash
   cd /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm
   npm pack --dry-run
   ```
   Confirm the printed `Tarball Contents` list includes `LICENSE.md`, `README.md`, and `CHANGELOG.md` in addition to the `dist/` tree, and that `npm notice license: MIT` is reported without a "license file not found" warning.

3. **Build still succeeds (no regressions from package.json edit):**
   ```bash
   npm run build
   ```
   The `n8n-node build` step should complete cleanly, confirming the JSON is still valid.

4. **Manual JSON sanity check** that `files` now lists four entries and `license` is unchanged (`"MIT"`) at `package.json:5`.

## Related findings

None.
