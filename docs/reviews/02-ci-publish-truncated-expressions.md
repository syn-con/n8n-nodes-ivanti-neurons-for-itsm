# Finding 2: CI and publish workflows have truncated `${{ }}` expressions (NPM_TOKEN: $ and group: ci-$)

| Field | Value |
|---|---|
| Category | Production Readiness |
| Severity | critical |
| Status | Confirmed |
| Confidence | high |
| Affected files | /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/.github/workflows/publish.yml:99, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/.github/workflows/ci.yml:11 |

## Problem
Two GitHub Actions expressions in the workflow files have been stripped down to a bare literal `$` — the surrounding `${{ ... }}` template body is gone. Both occurrences were confirmed by reading the files.

**`.github/workflows/publish.yml` (lines 95–99):**

```yaml
        run: |
          [ -n "$NPM_TOKEN" ] && npm config set //registry.npmjs.org/:_authToken "$NPM_TOKEN"
          npm run release
        env:
          NPM_TOKEN: $
```

The `env.NPM_TOKEN` value should be `${{ secrets.NPM_TOKEN }}`. As written, the environment variable is set to the literal string `$`. The release step's own comments (lines 91–94) document that "Option B (token): set NPM_TOKEN in repo secrets — it is written to .npmrc here before publishing," and the guard on line 96 is `[ -n "$NPM_TOKEN" ]`. With `NPM_TOKEN` always equal to `$`, the guard is technically non-empty, so it would attempt `npm config set //registry.npmjs.org/:_authToken "$"` — writing a literal `$` as the auth token, which is not a valid npm token. The intended Option B (token-based) publish fallback can therefore never authenticate.

**`.github/workflows/ci.yml` (lines 9–12):**

```yaml
# Cancel in-progress runs for the same branch/PR to avoid wasting CI minutes.
concurrency:
  group: ci-$
  cancel-in-progress: true
```

The concurrency group should be `ci-${{ github.ref }}` (per the comment, "for the same branch/PR"). As written, every branch and PR resolves to the same static group `ci-$`. Combined with `cancel-in-progress: true`, a CI run on one branch will cancel an in-progress run on a completely unrelated branch or PR.

Both are the same root cause: a templating/processing step (likely a scaffolding or find/replace pass) consumed the `${{ }}` and left only the leading `$`.

## Why it matters
- **publish.yml (release breakage):** Anyone relying on the documented Option B npm Automation Token flow gets a broken publish. The workflow writes an invalid auth token (`$`) into npm config and `npm run release` will fail to authenticate against the registry, blocking token-based releases. This is a release-pipeline failure that only surfaces at tag-push time, when a release is most time-sensitive. (Note: the OIDC Trusted Publishing path, Option A, does not read `NPM_TOKEN` and is unaffected — but the package documents and supports both paths.)
- **ci.yml (cross-branch cancellation):** A single shared concurrency group with `cancel-in-progress: true` means CI runs interfere across unrelated branches/PRs. A push to `main` can cancel a contributor's PR check (and vice versa), producing confusing "cancelled" statuses, masking real lint/build failures, and undermining branch protection that depends on CI completing. This is a correctness bug in the CI gating, not just wasted minutes.

## Resolution

1. Fix the concurrency expression in `.github/workflows/ci.yml`.

   BEFORE (`.github/workflows/ci.yml`, lines 9–12):
   ```yaml
   # Cancel in-progress runs for the same branch/PR to avoid wasting CI minutes.
   concurrency:
     group: ci-$
     cancel-in-progress: true
   ```

   AFTER:
   ```yaml
   # Cancel in-progress runs for the same branch/PR to avoid wasting CI minutes.
   concurrency:
     group: ci-${{ github.ref }}
     cancel-in-progress: true
   ```

   Use `${{ github.ref }}` so each branch/PR gets its own group. (`github.workflow`-prefixed forms such as `${{ github.workflow }}-${{ github.ref }}` are also acceptable, but `ci-${{ github.ref }}` matches the existing `ci-` prefix and the stated intent.)

2. Fix the token expression in `.github/workflows/publish.yml`.

   BEFORE (`.github/workflows/publish.yml`, lines 95–99):
   ```yaml
           run: |
             [ -n "$NPM_TOKEN" ] && npm config set //registry.npmjs.org/:_authToken "$NPM_TOKEN"
             npm run release
           env:
             NPM_TOKEN: $
   ```

   AFTER:
   ```yaml
           run: |
             [ -n "$NPM_TOKEN" ] && npm config set //registry.npmjs.org/:_authToken "$NPM_TOKEN"
             npm run release
           env:
             NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
   ```

   With `${{ secrets.NPM_TOKEN }}`, when the secret is unset (Option A / OIDC) the variable expands to an empty string, the `[ -n "$NPM_TOKEN" ]` guard is false, and the token step is correctly skipped. When the secret is set (Option B), the real token is written to npm config as intended.

3. Audit the rest of both workflow files for any other surviving `$`-truncation from the same root cause. A quick scan confirms the remaining `${{ ... }}` expressions in `ci.yml` are intact, specifically:
   - `ci.yml:39` — `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` (no `${{ }}` needed in an `if:`, correct as-is)
   - `ci.yml:41` — `GH_TOKEN: ${{ secrets.HOMELAB_DISPATCH_PAT }}` (intact)

   You can grep for the truncation pattern to be sure no other instance was missed:
   ```bash
   grep -rnE ':\s*\$$|-\$$|\$\s*$' /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/.github/workflows/
   ```
   After the two fixes above, this should return no lines (a bare trailing `$` indicates a stripped expression).

## Verification
1. Apply both edits, then confirm the literal `$` truncations are gone:
   ```bash
   grep -nE 'NPM_TOKEN: \$$|group: ci-\$$' /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/.github/workflows/*.yml
   ```
   Expect no output.

2. Confirm the corrected expressions are present:
   ```bash
   grep -n 'github.ref' /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/.github/workflows/ci.yml
   grep -n 'secrets.NPM_TOKEN' /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/.github/workflows/publish.yml
   ```
   Expect `group: ci-${{ github.ref }}` and `NPM_TOKEN: ${{ secrets.NPM_TOKEN }}` respectively.

3. Validate YAML/Actions syntax. If `actionlint` is available:
   ```bash
   actionlint /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/.github/workflows/ci.yml \
              /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/.github/workflows/publish.yml
   ```
   Otherwise, a YAML parse check (e.g. `python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" <file>`) confirms the files still parse.

4. Manual/behavioral confirmation:
   - **ci.yml:** Push two commits to two different branches in quick succession (or open two PRs) and confirm both CI runs proceed independently rather than one cancelling the other.
   - **publish.yml (Option B only):** With an `NPM_TOKEN` secret configured, push a `*.*.*` tag and confirm the Release step authenticates and publishes (the `npm config set` line runs and `npm run release` succeeds). For Option A (OIDC), confirm the token step is skipped and provenance publish still works.

## Related findings
None.
