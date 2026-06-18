# Finding 43: Orphan ivanti.svg icon and misspelled 'ivant-neurons-for-itsm' icon filenames

| Field | Value |
|---|---|
| Category | Folder/File Structure & Naming |
| Severity | low |
| Status | Confirmed |
| Confidence | high |
| Affected files | `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/ivanti.svg`, `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/icons/ivant-neurons-for-itsm.svg`, `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/icons/ivant-neurons-for-itsm.dark.svg`, `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.ts:41`, `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:41`, `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts:11` |

## Problem

Two distinct, related hygiene issues exist around icon assets.

**1. Orphan `ivanti.svg`.** The file `nodes/IvantiNeuronsForITSM/ivanti.svg` exists on disk (2493 bytes) but is referenced nowhere in the source. A repo-wide grep (excluding `dist/` and `node_modules/`) returns zero hits:

```
$ grep -rn "ivanti\.svg" --include='*.ts' --include='*.json' --include='*.md' .
(no output)
```

Every node/credential icon instead points at files under the top-level `icons/` directory, so this stray SVG is dead weight.

**2. Misspelled vendor name in the icon filename.** The actual icon files are named with `ivant` (missing the trailing `i` of "Ivanti"):

```
$ ls icons/
ivant-neurons-for-itsm.dark.svg
ivant-neurons-for-itsm.svg
synergy.dark.svg
synergy.svg
```

This typo is hard-coded into the icon paths of three source files (the canonical finding listed two; in fact the polling trigger node also references it):

`nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.ts:41`
```ts
        icon: { light: 'file:../../icons/ivant-neurons-for-itsm.svg', dark: 'file:../../icons/ivant-neurons-for-itsm.dark.svg' },
```

`nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:41`
```ts
		icon: { light: 'file:../../icons/ivant-neurons-for-itsm.svg', dark: 'file:../../icons/ivant-neurons-for-itsm.dark.svg' },
```

`credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts:11`
```ts
	icon: Icon = { light: 'file:../icons/ivant-neurons-for-itsm.svg', dark: 'file:../icons/ivant-neurons-for-itsm.dark.svg' };
```

The connector node, connector trigger, and connector credential all reference `icons/synergy.svg` / `synergy.dark.svg`, which exist and are spelled correctly, so the misspelling is scoped to the three `ivant-*` references above.

## Why it matters

- **Maintainability / professionalism.** A misspelled vendor name baked into asset filenames and three node descriptors looks sloppy and is the kind of thing reviewers (including the n8n Cloud verification process) and end users notice. The displayed brand is "Ivanti", so the asset should match.
- **Dead weight.** The orphan `nodes/IvantiNeuronsForITSM/ivanti.svg` is shipped-irrelevant clutter that can mislead future maintainers into thinking it is the live icon, and adds noise to the repo. (It is not packaged into the published artifact since `files` is `["dist"]` and nothing references it, but it remains a source-tree liability.)
- No runtime failure today: the paths consistently point at the misspelled files that actually exist, so icons render. The risk is purely cosmetic/maintenance, hence the low severity.

## Resolution

The fix is a rename + reference update + delete. Use `git mv` so history is preserved, and update all three references in lockstep so the icon keeps resolving.

### Step 1 — Rename the two icon files (correct spelling)

```bash
git mv icons/ivant-neurons-for-itsm.svg      icons/ivanti-neurons-for-itsm.svg
git mv icons/ivant-neurons-for-itsm.dark.svg icons/ivanti-neurons-for-itsm.dark.svg
```

Resulting `icons/` directory:
```
icons/ivanti-neurons-for-itsm.svg
icons/ivanti-neurons-for-itsm.dark.svg
icons/synergy.svg
icons/synergy.dark.svg
```

### Step 2 — Update the main node reference

`nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.ts:41`

BEFORE:
```ts
        icon: { light: 'file:../../icons/ivant-neurons-for-itsm.svg', dark: 'file:../../icons/ivant-neurons-for-itsm.dark.svg' },
```
AFTER:
```ts
        icon: { light: 'file:../../icons/ivanti-neurons-for-itsm.svg', dark: 'file:../../icons/ivanti-neurons-for-itsm.dark.svg' },
```

### Step 3 — Update the polling trigger node reference

`nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:41`

BEFORE:
```ts
		icon: { light: 'file:../../icons/ivant-neurons-for-itsm.svg', dark: 'file:../../icons/ivant-neurons-for-itsm.dark.svg' },
```
AFTER:
```ts
		icon: { light: 'file:../../icons/ivanti-neurons-for-itsm.svg', dark: 'file:../../icons/ivanti-neurons-for-itsm.dark.svg' },
```

### Step 4 — Update the API-key credential reference

`credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts:11`

BEFORE:
```ts
	icon: Icon = { light: 'file:../icons/ivant-neurons-for-itsm.svg', dark: 'file:../icons/ivant-neurons-for-itsm.dark.svg' };
```
AFTER:
```ts
	icon: Icon = { light: 'file:../icons/ivanti-neurons-for-itsm.svg', dark: 'file:../icons/ivanti-neurons-for-itsm.dark.svg' };
```

### Step 5 — Delete the orphan SVG

```bash
git rm nodes/IvantiNeuronsForITSM/ivanti.svg
```

### Notes

- No build-config changes are needed. The package builds via `"build": "n8n-node build"` (see `package.json` scripts) and the n8n CLI copies icons based on the `file:` references in the node/credential descriptors, so once the three references match the new filenames the icons are copied into `dist` automatically. There is no gulpfile or explicit copy script that hard-codes the old name (confirmed: `ls gulpfile*` → no matches; no `icons`/`.svg`/`copyfiles` entries in `package.json`).
- `package.json` `files` is `["dist"]`, so neither the orphan SVG nor the source `icons/` names affect the published tarball beyond what the build emits; this is a source-tree cleanup.

## Verification

1. Confirm no remaining references to the misspelled name and no orphan, excluding build output:
   ```bash
   grep -rn "ivant-neurons-for-itsm" --include='*.ts' --include='*.json' .  | grep -v node_modules | grep -v '/dist/'   # expect: no output
   grep -rn "ivanti\.svg" --include='*.ts' --include='*.json' .            | grep -v node_modules | grep -v '/dist/'   # expect: no output
   ls nodes/IvantiNeuronsForITSM/ivanti.svg                                                                            # expect: No such file or directory
   ls icons/                                                                                                           # expect: ivanti-neurons-for-itsm.svg, ivanti-neurons-for-itsm.dark.svg, synergy.svg, synergy.dark.svg
   ```
2. Build and lint to confirm the icon paths resolve and nothing broke:
   ```bash
   npm run build   # n8n-node build — should copy icons/ivanti-neurons-for-itsm*.svg into dist without "icon not found" errors
   npm run lint    # n8n-node lint — should pass
   ```
3. After build, confirm the renamed icons landed in the output and the old name is gone:
   ```bash
   find dist -name '*ivant*neurons*for*itsm*.svg'   # expect only the corrected 'ivanti-...' filenames
   ```
4. Optional manual check: load the package in n8n (`npm run dev`) and confirm the Ivanti node, polling trigger, and the "Ivanti Neurons for ITSM API" credential all still display their icon in both light and dark themes.

## Related findings

None.
