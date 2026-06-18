# Finding 29: Undocumented 761KB packages/N8N_Connector.MetadataPatch committed at repo root

| Field | Value |
|---|---|
| Category | Dead Code |
| Severity | medium |
| Status | Confirmed |
| Confidence | high |
| Affected files | `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/packages/N8N_Connector.MetadataPatch` (761,884 bytes, 13,970 lines); `package.json:31-33`; `.gitignore:1-4` |

## Problem

A 748 KB (761,884 byte) file `packages/N8N_Connector.MetadataPatch` is committed and git-tracked at the repository root. It is **not** the opaque binary the original finding assumed — `file(1)` reports `XML 1.0 document text` — but the substance of the finding holds: it is an Ivanti/HEAT server-side metadata export artifact with no relationship to the n8n node build, and it is referenced nowhere in the project.

Header of the file (`packages/N8N_Connector.MetadataPatch:1-4`):

```xml
<?xml version="1.0" encoding="utf-8"?>
<Metadata Name="N8N_Connector" Description="" TimeZone="FLE Standard Time;..." TimeStamp="2026-04-22T09:45:56.7712834Z" ClientSchemaVersion="1.1" PackageType="incremental" Exported="True">
  <Source Host="uat-heat20254.synergy.lt" Role="Admin" RoleName="Admin" Username="HEATAdmin" TenantID="uat-heat20254.synergy.lt" ... />
  <Target Host="uat-heat20254.synergy.lt" Role="Admin" RoleName="Admin" Username="HEATAdmin" TenantID="uat-heat20254.synergy.lt" ... />
```

It was added in a single commit:

```
054b293 Add N8N_Connector metadata file for integration
```

Evidence that it is dead weight in this repo:

1. **No references in source/config/docs.** `grep -rn "MetadataPatch"` and `grep -rn "packages/"` across `*.ts`, `*.json`, `*.md`, `*.mjs`, `*.js` (excluding `node_modules`, `dist`, `.git`) return **zero** matches.
2. **Not part of the npm publish output.** The `files` allowlist in `package.json:31-33` ships only `dist`:

   ```json
   "files": [
       "dist"
   ],
   ```

   So the file is *not* in the published tarball — its only footprint is the git repository.
3. **Not ignored, not documented.** `.gitignore` (lines 1-4) lists only `node_modules`, `.npmrc`, and `/dist`; it does not cover `packages/`. README.md never mentions the file (the closest text, `README.md:158`, only says "Requires the Ivanti Neurons Connector package installed on your Ivanti instance").
4. **It is an Ivanti-side artifact, not n8n code.** The XML is a HEAT/Ivanti "incremental" metadata patch (Business Objects, Fields, an integration-connection definition, and an embedded server-side XSLT/JS sync script). It belongs to the Ivanti tenant configuration, not to the n8n community-node package.

Two aggravating details surfaced while reading the file:

- It leaks internal infrastructure identifiers: the host `uat-heat20254.synergy.lt` appears twice and the admin username `HEATAdmin` appears 16 times, plus tenant IDs.
- It embeds a server-side script (the `<XSLT>/<Second>` block near the end) that calls the n8n API with an `X-N8N-API-KEY` header. The script reads the key at runtime from `hostObject.Fields["APIKey"]` — a check confirmed **no hardcoded API-key value is present** (no literal token after `X-N8N-API-KEY`), so this is an info-disclosure / hygiene concern rather than a leaked-secret incident.

## Why it matters

- **Maintainability / repo hygiene:** 748 KB of unrelated XML inflates clone size and git history forever, and is dead code for an n8n package whose only shipped artifact is `dist`.
- **Confusion:** A `packages/` directory at the root of an n8n node package strongly implies (incorrectly) a monorepo/workspace layout. A future maintainer cannot tell whether the file is build-required, since nothing references or documents it.
- **Information disclosure:** Committing an internal Ivanti tenant export exposes a UAT hostname, the `HEATAdmin` username, tenant IDs, and the exact integration wiring — useful reconnaissance for an attacker and unnecessary in a public package's git history.
- It provides **zero runtime value** to the n8n nodes: it is never imported, bundled, or published.

## Resolution

There are two viable approaches. Approach A (remove and relocate) is recommended because the file does not belong in this repo at all.

### Approach A (recommended): remove from the repo, relocate to an Ivanti-side home

1. Move the artifact out of this repo into wherever Ivanti connector packages are maintained (an internal Ivanti/Synergy repo, a release-assets store, or a documented download). If consumers need it, the README already points them to UAB Synergy (`README.md:158`), so distribution does not require keeping it in git.

2. Remove the tracked file:

   ```bash
   git rm packages/N8N_Connector.MetadataPatch
   # if packages/ becomes empty, it disappears automatically (git does not track empty dirs)
   ```

3. Guard against re-adding it. Append to `.gitignore`:

   **BEFORE** (`.gitignore`, full current contents):
   ```gitignore
   node_modules
   .npmrc

   /dist
   ```

   **AFTER:**
   ```gitignore
   node_modules
   .npmrc

   /dist

   # Ivanti-side metadata exports (HEAT/Ivanti tenant artifacts, not part of the n8n build)
   /packages/
   *.MetadataPatch
   ```

4. (Optional but recommended, since the file contains internal hostnames/usernames and is already in public git history) purge it from history with `git filter-repo` so the 748 KB and the infra identifiers do not persist in clones:

   ```bash
   git filter-repo --path packages/N8N_Connector.MetadataPatch --invert-paths
   ```

   Coordinate this with collaborators because it rewrites history and requires a force-push.

### Approach B (minimum): keep it but document it and prevent accidental publish

If the team insists the file must live in this repo (e.g., as a versioned reference of the matching Ivanti connector package):

1. Keep it tracked, but document it. Add a short section to `README.md` near the existing Connector note (`README.md:158`) and a `packages/README.md`:

   ```markdown
   ## packages/N8N_Connector.MetadataPatch

   Ivanti/HEAT incremental metadata export ("N8N_Connector" package) that must be
   imported into your Ivanti Neurons for ITSM tenant to enable the Connector nodes.
   It is NOT part of the n8n build and is NOT published to npm (see the `files`
   allowlist in package.json). Import it via the Ivanti Configuration Console.
   ```

2. Confirm it stays out of the npm tarball — already true because `package.json:31-33` ships only `dist`. No change needed there, but keep it that way (do **not** add `packages` to `files`).

3. Scrub the embedded internal identifiers before keeping it public: replace the UAT host `uat-heat20254.synergy.lt`, the `HEATAdmin` username, and tenant IDs in the `<Source>/<Target>` headers with neutral placeholders, since they add no functional value to an import-time patch.

Whichever approach is chosen, also update `CHANGELOG.md` (per AGENTS.md, "If you are updating the npm package version, make sure to update CHANGELOG.md") if this change is tied to a version bump — e.g. an entry like "Removed unrelated Ivanti metadata export from the package repository."

## Verification

- **Tracking removed (Approach A):**
  ```bash
  git ls-files packages/        # expect: no output
  git status                    # expect: deletion staged, working tree otherwise clean
  ```
- **Ignore rule works:**
  ```bash
  touch packages/test.MetadataPatch
  git status --porcelain        # expect: NO entry for the new file (it is ignored)
  rm packages/test.MetadataPatch
  ```
- **Build/publish unaffected** (proves the file was never part of the build):
  ```bash
  npm run build                 # n8n-node build still succeeds
  npm run lint                  # n8n-node lint still passes
  npm pack --dry-run            # tarball lists only dist/** ; no packages/ entry
  ```
- **History purge (if Approach A step 4 done):**
  ```bash
  git log --oneline -- packages/N8N_Connector.MetadataPatch   # expect: empty
  ```
- **Documentation (Approach B):** confirm `README.md` / `packages/README.md` describe the file's purpose and that it is not bundled.

## Related findings

None. (This is a standalone repo-hygiene/dead-code item. If a separate finding covers committed secrets or info disclosure, cross-reference it there, since this file also leaks the `uat-heat20254.synergy.lt` host and `HEATAdmin` username.)
