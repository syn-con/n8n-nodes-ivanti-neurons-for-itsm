# Finding 16: README install instructions and badge use the unscoped package name, not the published @syn-con scope

| Field | Value |
|---|---|
| Category | Documentation Accuracy (README/CHANGELOG) |
| Severity | high |
| Status | Confirmed |
| Confidence | high |
| Affected files | /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/package.json:2, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/package.json:6, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/package.json:18-21, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/README.md:3, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/README.md:52, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/README.md:64, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/README.md:79, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/README.md:1524 |

## Problem

The package is published under a scoped name, but every install-related reference in `README.md` uses the unscoped name. They do not match.

The published name (`package.json:2`):

```json
	"name": "@syn-con/n8n-nodes-ivanti-neurons-for-itsm",
```

But the README install/discovery references all drop the `@syn-con/` scope:

`README.md:3` (npm version badge — both the shield image URL and the npm link):

```markdown
[![NPM Version](https://img.shields.io/npm/v/n8n-nodes-ivanti-neurons-for-itsm?style=flat-square)](https://www.npmjs.com/package/n8n-nodes-ivanti-neurons-for-itsm)
```

`README.md:52` (Community Nodes search string):

```markdown
3. Enter `n8n-nodes-ivanti-neurons-for-itsm` in the search field
```

`README.md:64` (npm install command):

```bash
npm install n8n-nodes-ivanti-neurons-for-itsm
```

`README.md:79` (Docker `N8N_COMMUNITY_PACKAGES` env var):

```yaml
      - N8N_COMMUNITY_PACKAGES=n8n-nodes-ivanti-neurons-for-itsm
```

Additionally, the org/repo metadata is inconsistent across the project:

- `package.json:6` — `homepage` is empty: `"homepage": "",`
- `package.json:18-21` — repository points at the `syn-con` org:

```json
	"repository": {
		"type": "git",
		"url": "https://github.com/syn-con/n8n-nodes-ivanti-neurons-for-itsm.git"
	},
```

- `README.md:1524` — issues link points at a different org (`KonstantinShturo`):

```markdown
3. **Issues**: Report bugs on [GitHub Issues](https://github.com/KonstantinShturo/n8n-nodes-ivanti-neurons-for-itsm/issues)
```

## Why it matters

- A user who follows the README's Community Nodes step (`README.md:52`) types `n8n-nodes-ivanti-neurons-for-itsm` into n8n's install dialog. n8n installs exactly the string entered; the unscoped name is a different (or non-existent) npm package, so the install either fails ("package not found") or silently pulls the wrong package. The same applies to the manual `npm install` (`README.md:64`) and the Docker `N8N_COMMUNITY_PACKAGES` env var (`README.md:79`), which n8n passes verbatim to npm.
- The npm version badge (`README.md:3`) points at `npmjs.com/package/n8n-nodes-ivanti-neurons-for-itsm` and the shields.io endpoint `npm/v/n8n-nodes-ivanti-neurons-for-itsm`. Neither resolves to the actual `@syn-con/...` package, so the badge shows "not found"/"invalid" and the link 404s.
- The repository (`package.json:18`) and the README issues link (`README.md:1524`) point at two different GitHub orgs (`syn-con` vs `KonstantinShturo`), and `homepage` is empty. Bug reporters land in the wrong (or a dead) repo, and npm shows no homepage. This is a documentation-accuracy / production-readiness defect: it directly breaks the primary install path and the support path.

## Resolution

Canonicalize on the scoped npm name `@syn-con/n8n-nodes-ivanti-neurons-for-itsm` and a single GitHub org. Below I use `syn-con` as the canonical org to match `package.json:18` — if the real repo lives under `KonstantinShturo`, substitute that org consistently everywhere instead. Pick one and apply it uniformly.

1. Fix the npm badge and link (`README.md:3`). The scope `@` and `/` must be URL-encoded as `%40` and `%2F` in both the shields.io path and the npm package URL.

BEFORE:
```markdown
[![NPM Version](https://img.shields.io/npm/v/n8n-nodes-ivanti-neurons-for-itsm?style=flat-square)](https://www.npmjs.com/package/n8n-nodes-ivanti-neurons-for-itsm)
```

AFTER:
```markdown
[![NPM Version](https://img.shields.io/npm/v/%40syn-con%2Fn8n-nodes-ivanti-neurons-for-itsm?style=flat-square)](https://www.npmjs.com/package/@syn-con/n8n-nodes-ivanti-neurons-for-itsm)
```

Note: shields.io requires the encoded form (`%40syn-con%2F...`); the npmjs.com URL accepts the literal `@syn-con/...` form shown above.

2. Fix the Community Nodes search string (`README.md:52`).

BEFORE:
```markdown
3. Enter `n8n-nodes-ivanti-neurons-for-itsm` in the search field
```

AFTER:
```markdown
3. Enter `@syn-con/n8n-nodes-ivanti-neurons-for-itsm` in the search field
```

3. Fix the manual npm install command (`README.md:64`).

BEFORE:
```bash
npm install n8n-nodes-ivanti-neurons-for-itsm
```

AFTER:
```bash
npm install @syn-con/n8n-nodes-ivanti-neurons-for-itsm
```

4. Fix the Docker `N8N_COMMUNITY_PACKAGES` env var (`README.md:79`).

BEFORE:
```yaml
      - N8N_COMMUNITY_PACKAGES=n8n-nodes-ivanti-neurons-for-itsm
```

AFTER:
```yaml
      - N8N_COMMUNITY_PACKAGES=@syn-con/n8n-nodes-ivanti-neurons-for-itsm
```

5. Canonicalize the org for the README issues link (`README.md:1524`) so it matches `package.json` repository.

BEFORE:
```markdown
3. **Issues**: Report bugs on [GitHub Issues](https://github.com/KonstantinShturo/n8n-nodes-ivanti-neurons-for-itsm/issues)
```

AFTER:
```markdown
3. **Issues**: Report bugs on [GitHub Issues](https://github.com/syn-con/n8n-nodes-ivanti-neurons-for-itsm/issues)
```

6. Populate `homepage` and add an explicit `bugs` field in `package.json` so npm and tooling have a canonical home/support URL that agrees with `repository`.

BEFORE (`package.json:6` and `package.json:18-21`):
```json
	"homepage": "",
```
```json
	"repository": {
		"type": "git",
		"url": "https://github.com/syn-con/n8n-nodes-ivanti-neurons-for-itsm.git"
	},
```

AFTER:
```json
	"homepage": "https://github.com/syn-con/n8n-nodes-ivanti-neurons-for-itsm#readme",
```
```json
	"repository": {
		"type": "git",
		"url": "https://github.com/syn-con/n8n-nodes-ivanti-neurons-for-itsm.git"
	},
	"bugs": {
		"url": "https://github.com/syn-con/n8n-nodes-ivanti-neurons-for-itsm/issues"
	},
```

(Keep the existing comma/formatting; `bugs` is inserted as a sibling of `repository`.)

No shared helper/module is required — these are documentation and metadata edits only.

## Verification

1. Confirm no unscoped occurrences remain in the README install/discovery surface. From the repo root, the following should return only intentional, scoped matches (or nothing for the unscoped form):
   - `grep -nE 'n8n-nodes-ivanti-neurons-for-itsm' README.md` — every install/badge/search/Docker line should now read `@syn-con/n8n-nodes-ivanti-neurons-for-itsm` (or the URL-encoded `%40syn-con%2F...` in the shields.io badge).
   - `grep -nE 'KonstantinShturo' README.md` — should return nothing once the org is canonicalized.
2. Confirm `package.json` is still valid JSON and the metadata agrees: `node -e "const p=require('./package.json'); console.log(p.name, p.homepage, p.repository.url, p.bugs && p.bugs.url)"` — `name` must be `@syn-con/...`, and `homepage`/`repository.url`/`bugs.url` must all reference the same org.
3. Run the project linter to ensure nothing was broken by the `package.json` edit: `npm run lint` (which runs `n8n-node lint`).
4. Manual check: open the rendered README on GitHub and confirm the NPM Version badge loads (not "invalid"/"not found") and the badge link, install command, and Community Nodes search string all resolve to `npmjs.com/package/@syn-con/n8n-nodes-ivanti-neurons-for-itsm`.

## Related findings

None.
