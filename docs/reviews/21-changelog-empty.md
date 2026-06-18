# Finding 21: CHANGELOG.md is empty despite version 1.0.7 and an explicit AGENTS.md requirement

| Field | Value |
|---|---|
| Category | Documentation Accuracy (README/CHANGELOG) |
| Severity | medium |
| Status | Confirmed |
| Confidence | high |
| Affected files | `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/CHANGELOG.md` (0 bytes), `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/package.json:3`, `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/AGENTS.md:80-81`, `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/README.md:1353`, `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/.github/workflows/publish.yml:52` |

## Problem

`CHANGELOG.md` exists but is a 0-byte file:

```
-rw-r--r--@ 1 tyrunasj  staff  0 Jun 13 06:58 CHANGELOG.md
```

Meanwhile the package is well past its first release. `package.json:3`:

```json
"version": "1.0.7",
```

and git history shows a string of version bumps (1.0.1, 1.0.3, 1.0.5, 1.0.6, 1.0.7) that were never recorded:

```
15210e9 Update version to 1.0.6 in package.json
6025059 Update version to 1.0.7 and refactor API request handling ...
cf4ae4d Update version to 1.0.5 and improve error response handling ...
811534d Update version to 1.0.3 and enhance display names in credentials ...
497c4d9 Update package version to 1.0.1 and correct node paths ...
```

Three places in the repo reference this empty file as if it had content, making the empty file a broken reference:

- `AGENTS.md:80-81` (a hard project rule):
  ```
  - If you are updating the npm package version, make sure to **update
    CHANGELOG.md** in the root of the repository
  ```
- `README.md:1353` (Maintenance > Updates section), instructing consumers:
  ```
     - Review changelog for breaking changes
  ```
- `.github/workflows/publish.yml:52` documents that the release flow maintains it:
  ```
  # This will lint, build, prompt for a version bump, update the changelog,
  # commit, tag, and push — which triggers this workflow to publish to npm.
  ```

The release tooling itself is also not actually wired to produce a changelog. `release-it` is listed as a devDependency (`package.json:52`, `"release-it": "^19.0.4"`) and `npm run release` maps to `n8n-node release` (`package.json:28`), but there is no `.release-it.*` config file in the repo and no `release-it` config block inside `package.json`. So even if a maintainer runs the documented command, nothing appends to the changelog.

## Why it matters

- **Broken documentation reference**: The README explicitly directs npm consumers to "Review changelog for breaking changes." Opening `CHANGELOG.md` yields nothing, so the maintenance instructions cannot be followed.
- **No upgrade safety for consumers**: npm users jumping between 1.0.x versions have zero record of what changed (e.g. the 1.0.7 "refactor API request handling," the 1.0.5 error-response handling change). They cannot assess upgrade risk.
- **Violates an explicit project rule**: `AGENTS.md:80-81` mandates updating the changelog on every version bump; the rule has been silently broken across at least five releases.
- **False promise in CI docs**: `publish.yml` tells maintainers `npm run release` "update[s] the changelog," but no changelog plugin/config exists, so the claim is inaccurate and the file will stay empty on the next release too.

## Resolution

Two parts: (1) backfill the historical changelog in Keep a Changelog format, and (2) wire `release-it` so future releases append automatically.

### Step 1 — Backfill `CHANGELOG.md`

Replace the empty `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/CHANGELOG.md` with the entries reconstructed from git history. Dates can be taken from the commit log if exact release dates are unknown; below uses the version-bump commits as the source of truth.

**BEFORE** (`CHANGELOG.md`): empty (0 bytes)

**AFTER** (`CHANGELOG.md`):

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.7]
### Changed
- Refactored API request handling in the Ivanti Neurons for ITSM nodes.

## [1.0.6]
### Changed
- Improved parameter validation in the Ivanti Neurons for ITSM Connector Trigger.

## [1.0.5]
### Fixed
- Improved error response handling in the Ivanti Neurons for ITSM Connector Trigger
  (now returns a JSON response on error).

## [1.0.3]
### Changed
- Clarified display names in the Ivanti Neurons for ITSM credentials.
- Clarified authentication options in `IvantiNeuronsForItsmConnectorAuthApi`.

## [1.0.1]
### Changed
- Corrected node and credential paths in `package.json`.
- Updated repository and package name metadata.

## [1.0.0]
### Added
- Initial release of `@syn-con/n8n-nodes-ivanti-neurons-for-itsm`.
- Action node: Business Object CRUD, Attachment, Relationship, Service Request,
  Search, and Quick Action operations.
- Connector action node: Automation report.
- Polling trigger and inbound webhook (Connector) trigger nodes.
- Two credential types: API key and Connector auth.
```

> Note: 1.0.2 and 1.0.4 do not appear in git history (versions appear to have been skipped). Omit them, or merge their notes into the adjacent released versions. Keep the entry list consistent with what was actually published to npm — verify with `npm view @syn-con/n8n-nodes-ivanti-neurons-for-itsm versions` before finalizing.

### Step 2 — Wire `release-it` to auto-update the changelog

So that `publish.yml:52`'s promise ("update the changelog") becomes true, add a `release-it` config that uses the conventional-changelog plugin. Create `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/.release-it.json`:

```json
{
  "git": {
    "commitMessage": "chore: release v${version}",
    "tagName": "${version}",
    "requireCleanWorkingDir": true
  },
  "github": {
    "release": false
  },
  "npm": {
    "publish": false
  },
  "plugins": {
    "@release-it/conventional-changelog": {
      "infile": "CHANGELOG.md",
      "preset": {
        "name": "conventionalcommits"
      },
      "header": "# Changelog\n\nAll notable changes to this project will be documented in this file."
    }
  }
}
```

Notes on the config choices:
- `npm.publish` is `false` and `github.release` is `false` because publishing is handled by `.github/workflows/publish.yml` when the tag is pushed (`on: push: tags: ['*.*.*']`). `release-it` only needs to bump the version, regenerate the changelog, commit, tag, and push.
- `tagName` is `${version}` (no `v` prefix) to match the workflow tag glob `*.*.*` in `publish.yml:62`.

Add the changelog plugin to `devDependencies` in `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/package.json`:

**BEFORE** (`package.json:48-54`):

```json
	"devDependencies": {
		"@n8n/node-cli": "*",
		"eslint": "9.32.0",
		"prettier": "3.6.2",
		"release-it": "^19.0.4",
		"typescript": "5.9.2"
	},
```

**AFTER**:

```json
	"devDependencies": {
		"@n8n/node-cli": "*",
		"@release-it/conventional-changelog": "^10.0.0",
		"eslint": "9.32.0",
		"prettier": "3.6.2",
		"release-it": "^19.0.4",
		"typescript": "5.9.2"
	},
```

> Caveat: `npm run release` is wired to `n8n-node release` (`package.json:28`), not directly to `release-it`. Confirm that `@n8n/node-cli`'s `release` command honors a project-level `.release-it.json` (it wraps release-it). If it does not pick up the config, either pass the config through the CLI's documented mechanism or change the script to `"release": "release-it"`. Verify against the `@n8n/node-cli` docs before relying on auto-generation; the manual backfill in Step 1 is the load-bearing fix regardless.

Going forward, contributors should write Conventional Commit messages (`feat:`, `fix:`, etc.) so the plugin can categorize entries; the existing free-form messages ("Update version to 1.0.6...") will not be categorized automatically.

## Verification

1. **File is non-empty**: `wc -c /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/CHANGELOG.md` returns a non-zero byte count (was `0`).
2. **Top entry matches package version**: confirm the highest released entry in `CHANGELOG.md` equals `package.json` `version` (`1.0.7`):
   `grep '"version"' package.json` and check the first `## [x.y.z]` heading in `CHANGELOG.md` line up.
3. **Cross-references resolve**: re-read `README.md:1353` and `publish.yml:52` — the "Review changelog" / "update the changelog" statements now point to a file with real content.
4. **Released versions are accurate** (no fabricated entries): `npm view @syn-con/n8n-nodes-ivanti-neurons-for-itsm versions` and confirm every `## [x.y.z]` in the changelog corresponds to a published version.
5. **Release tooling (if Step 2 applied)**: run a dry run — `npx release-it --dry-run` (or `npm run release -- --dry-run` if the CLI forwards flags) — and confirm it reports it would write to `CHANGELOG.md` without error and without publishing to npm/GitHub.
6. **Lint/build unaffected**: `npm run lint` and `npm run build` still pass (changelog/config changes are non-code, so these should be unaffected — this just confirms no JSON syntax error was introduced into `package.json` or `.release-it.json`).

## Related findings

None.
