# Code Review — `@syn-con/n8n-nodes-ivanti-neurons-for-itsm`

_Generated 2026-06-13 via a multi-agent review: 12 dimension reviewers (DRY, SOLID/SRP, dead code, TypeScript, structure & naming, bugs, security, comments, tests, production readiness, n8n conventions, docs) → synthesis & de-duplication → per-finding verification against the source._

**53 findings**, all individually re-verified against the code (52 high-confidence, 1 medium-confidence, **0 false positives**). Each finding has a dedicated file in this folder with step-by-step resolution instructions (problem → impact → before/after code → verification).

## Overview

This is a functional but pre-production-quality n8n community node package. The architecture is reasonable (declarative resource/operation modules dispatched by a typed router, shared transport helpers, a common.ts), and the code is heavily JSDoc-commented. However, the package carries several genuinely broken paths: the "Return All" pagination helper never works (it relies on @odata.count without ever requesting $count), the getRelated $select is sent as the request body, boolean filter parsing inverts "false", and two CI/publish workflow secret expressions are truncated. Security hygiene is weak (OData string/identifier injection, length-only GUID checks, non-constant-time webhook auth, blanket TLS-skip). Cross-cutting concerns (OData query building, tenant/URL construction, business-object validation, response typing) are duplicated rather than shared, with copies that have already diverged in security-relevant ways. There are zero automated tests, an empty CHANGELOG, no LICENSE file, and documentation (README + class JSDoc) that materially contradicts the code (most notably promising polling deduplication that does not exist). Fixing the correctness/security bugs and the docs/code drift is required before this can be considered production-ready.

## Summary

| Severity | Count |
|---|---:|
| 🔴 Critical | 2 |
| 🟠 High | 18 |
| 🟡 Medium | 19 |
| 🔵 Low | 14 |
| **Total** | **53** |

| Category | Count |
|---|---:|
| Bugs / Correctness | 11 |
| n8n Node Conventions / UX Guidelines | 8 |
| Security | 7 |
| DRY / Duplication | 5 |
| Documentation Accuracy (README/CHANGELOG) | 5 |
| Production Readiness | 4 |
| TypeScript Quality | 4 |
| Comments & Doc-Comment Accuracy | 2 |
| SOLID (esp. Single Responsibility) | 2 |
| Folder/File Structure & Naming | 2 |
| Dead Code | 2 |
| Tests & Coverage | 1 |

## Suggested fix order

1. **Critical bugs** (#1, #2) — broken core paths that silently fail.
2. **High-severity bugs & security** — correctness and injection/auth issues.
3. **DRY/SRP refactors** — consolidate the duplicated OData/URL/validation logic (several high-severity bugs are duplicated copies that have already diverged, so fixing the duplication prevents regressions).
4. **Tests** — add the regression suite (#14) so the above fixes stay fixed.
5. **Docs, conventions, dead code, comments** — lower-risk cleanups for production readiness.

## Findings

### 🔴 Critical (2)

| # | Finding | Category | Key file(s) |
|---|---|---|---|
| 01 | [**"Return All" pagination silently returns [] because $count=true is never requested**](./01-returnall-pagination-broken-no-odata-count.md) | Bugs / Correctness | `nodes/IvantiNeuronsForITSM/transports/index.ts:119-140<br>nodes/IvantiNeuronsForITSM/methods/listSearch.ts:156` |
| 02 | [**CI and publish workflows have truncated ${{ }} expressions (NPM_TOKEN: $ and group: ci-$)**](./02-ci-publish-truncated-expressions.md) | Production Readiness | `.github/workflows/publish.yml:99<br>.github/workflows/ci.yml:11` |

### 🟠 High (18)

| # | Finding | Category | Key file(s) |
|---|---|---|---|
| 03 | [**OData $filter string values interpolated without escaping single quotes (injection / broken filters)**](./03-odata-string-value-injection-unescaped-quotes.md) | Security | `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:334-336<br>nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:356-358` |
| 04 | [**Field names, $orderby, $select, recordId, relationship, quickAction and savedSearch names interpolated into OData URL/query without validation**](./04-odata-identifier-and-path-segment-injection.md) | Security | `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:373<br>nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:295` |
| 05 | [**Webhook x-transaction-id validated only by length === 32 before OData interpolation (injection on authenticated path)**](./05-webhook-transaction-id-length-only-check.md) | Security | `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:335<br>nodes/IvantiNeuronsForItsmConnector/actions/automation/update.operation.ts:89` |
| 06 | [**getRelated passes $select as the body argument instead of qs, so $select is silently ignored**](./06-getrelated-select-passed-as-body.md) | Bugs / Correctness | `nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts:137<br>nodes/IvantiNeuronsForITSM/transports/index.ts:36` |
| 07 | [**Boolean OData filter parsing uses Boolean(value), so "false" becomes true**](./07-boolean-filter-coercion-always-true.md) | Bugs / Correctness | `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:344-350<br>nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:366-368` |
| 08 | [**quickAction run uses businessObject.replace('s', '#') (unanchored), corrupting names like 'Tasks'**](./08-quickaction-unanchored-replace.md) | Bugs / Correctness | `nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation.ts:119<br>nodes/IvantiNeuronsForITSM/actions/attachment/uploadAttachment.operation.ts:106` |
| 09 | [**Polling trigger does NOT deduplicate, contradicting README, FAQ, and its own class JSDoc**](./09-polling-trigger-no-dedup-vs-docs.md) | Bugs / Correctness | `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:13-35<br>nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:262-279` |
| 10 | [**ivantiApiRequest error handler calls error.message.join() and throws TypeError on non-array error bodies**](./10-error-handler-message-join-crashes.md) | Bugs / Correctness | `nodes/IvantiNeuronsForITSM/transports/index.ts:59-62<br>nodes/IvantiNeuronsForITSM/transports/index.ts:218-223` |
| 11 | [**Transport helpers have no return type, leaking any across the whole package**](./11-transport-helpers-untyped-any.md) | TypeScript Quality | `nodes/IvantiNeuronsForITSM/transports/index.ts:31-37<br>nodes/IvantiNeuronsForItsmConnector/transports/index.ts:24-48` |
| 12 | [**Tenant normalization + base-URL building duplicated across 5+ sites, with the connector trigger missing normalization**](./12-tenant-url-building-duplicated-with-trigger-bug.md) | DRY / Duplication | `nodes/IvantiNeuronsForITSM/transports/index.ts:44-56<br>nodes/IvantiNeuronsForITSM/transports/index.ts:163-172` |
| 13 | [**OData query builder (parseValue + buildQuery) duplicated between getMany and the polling trigger, already divergent**](./13-odata-query-builder-duplicated-divergent.md) | DRY / Duplication | `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:332-403<br>nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:268-377` |
| 14 | [**No automated tests exist and CI does not run or gate on tests before deploy-on-main**](./14-no-tests-and-ci-not-gated.md) | Tests & Coverage | `package.json:22<br>.github/workflows/ci.yml` |
| 15 | [**No retry/backoff on 429/5xx although README documents exponential backoff as a feature**](./15-no-retry-backoff-vs-readme-claim.md) | Production Readiness | `nodes/IvantiNeuronsForITSM/transports/index.ts:59-62<br>README.md:1408` |
| 16 | [**README install instructions and badge use the unscoped package name, not the published @syn-con scope**](./16-install-instructions-wrong-package-name.md) | Documentation Accuracy (README/CHANGELOG) | `README.md:3<br>README.md:52` |
| 17 | [**Connector action node JSDoc/name copied from main node, documents six resources it does not implement**](./17-connector-node-jsdoc-and-name-copied-from-main.md) | Comments & Doc-Comment Accuracy | `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnector.node.ts:11-25<br>nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnector.node.ts:36` |
| 18 | [**noDataExpression: true applied to value/data fields, disabling expression mapping**](./18-nodataexpression-on-data-fields.md) | n8n Node Conventions / UX Guidelines | `nodes/IvantiNeuronsForITSM/actions/object/create.operation.ts:24-54<br>nodes/IvantiNeuronsForITSM/actions/object/getByRecId.operation.ts:21-27` |
| 19 | [**ivantiApiRequestAllItems loop has no break on empty/short page (infinite-loop / memory hazard)**](./19-allitems-no-break-on-short-page.md) | Bugs / Correctness | `nodes/IvantiNeuronsForITSM/transports/index.ts:133-138` |
| 20 | [**Connector Auth credential conflates inbound webhook auth with outbound API auth (SRP/ISP)**](./20-connector-auth-credential-conflates-inbound-outbou.md) | SOLID (esp. Single Responsibility) | `credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:36-142<br>nodes/IvantiNeuronsForItsmConnectorTrigger.node.ts:291-311` |

### 🟡 Medium (19)

| # | Finding | Category | Key file(s) |
|---|---|---|---|
| 21 | [**CHANGELOG.md is empty despite version 1.0.7 and an explicit AGENTS.md requirement**](./21-changelog-empty.md) | Documentation Accuracy (README/CHANGELOG) | `CHANGELOG.md<br>package.json:3` |
| 22 | [**LICENSE file referenced by README does not exist and would not ship in the npm tarball**](./22-missing-license-file.md) | Production Readiness | `README.md:1561<br>package.json:5` |
| 23 | [**Webhook auth tokens compared with non-constant-time !== (timing side-channel)**](./23-webhook-auth-non-constant-time.md) | Security | `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:296-311` |
| 24 | [**skipSslVerification disables TLS validation for all authenticated requests, exposing the API key to MITM**](./24-skip-ssl-exposes-api-key.md) | Security | `nodes/IvantiNeuronsForITSM/transports/index.ts:53<br>nodes/IvantiNeuronsForItsmConnector/transports/index.ts:45` |
| 25 | [**getMany wraps the whole item loop in one try/catch, swallows non-Error throws, and ignores continueOnFail**](./25-getmany-swallows-errors-ignores-continueonfail.md) | Bugs / Correctness | `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:287-316<br>nodes/IvantiNeuronsForITSM/actions/search/savedsearch.operation.ts:89-102` |
| 26 | [**Multi-item operations read parameters at index 0 inside per-item loops, ignoring per-item expressions**](./26-params-read-at-index-0-in-loops.md) | Bugs / Correctness | `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:279-280<br>nodes/IvantiNeuronsForITSM/actions/object/searchByKeyword.operation.ts:130-160` |
| 27 | [**Connector trigger subtitle calls .join() on $parameter["updates"], an options string, throwing in the editor**](./27-connector-trigger-subtitle-join-on-string.md) | Bugs / Correctness | `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:45` |
| 28 | [**Inconsistent acronym/casing across node folders, credential filenames, operation files, and resource folder**](./28-node-folder-and-credential-file-casing.md) | Folder/File Structure & Naming | `nodes/IvantiNeuronsForITSM<br>credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts` |
| 29 | [**Undocumented 761KB packages/N8N_Connector.MetadataPatch committed at repo root**](./29-stray-metadatapatch-binary.md) | Dead Code | `packages/N8N_Connector.MetadataPatch` |
| 30 | [**resourceMapper field schemas typed as any[] with eslint-disable instead of n8n's ResourceMapperField**](./30-resourcemapper-fields-typed-any.md) | TypeScript Quality | `nodes/IvantiNeuronsForITSM/methods/listSearch.ts:149-162` |
| 31 | [**router uses getNodeParameter<Ivanti>('resource', 0) with the wrong generic argument**](./31-router-getnodeparameter-wrong-generic.md) | TypeScript Quality | `nodes/IvantiNeuronsForITSM/actions/router.ts:30-56<br>nodes/IvantiNeuronsForItsmConnector/actions/router.ts` |
| 32 | [**Operation options arrays not sorted alphabetically by display name**](./32-operation-options-not-alphabetical.md) | n8n Node Conventions / UX Guidelines | `nodes/IvantiNeuronsForITSM/actions/attachment/index.ts:18-38<br>nodes/IvantiNeuronsForITSM/actions/serviceReq/index.ts:21-26` |
| 33 | [**'Business object must end with s' validation hand-rolled across 8 sites with drifting messages and poor UX**](./33-business-object-name-validation-duplicated.md) | DRY / Duplication | `nodes/IvantiNeuronsForITSM/actions/object/create.operation.ts:137<br>nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:284` |
| 34 | [**deleteByRecId Business Object default 'incident' fails its own endsWith('s') validation**](./34-deletebyrecid-invalid-default.md) | n8n Node Conventions / UX Guidelines | `nodes/IvantiNeuronsForITSM/actions/object/deleteByRecId.operation.ts:19-28` |
| 35 | [**Same Business Object field uses internal name 'object' in some operations and 'businessObject' in others**](./35-business-object-param-name-inconsistent.md) | n8n Node Conventions / UX Guidelines | `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:28<br>nodes/IvantiNeuronsForITSM/actions/object/getByRecId.operation.ts:22` |
| 36 | [**README 'Endpoints Used' table does not match the code (paths, methods, casing, double /api prefix)**](./36-readme-endpoint-table-inaccurate.md) | Documentation Accuracy (README/CHANGELOG) | `README.md:1379-1396<br>nodes/IvantiNeuronsForITSM/actions/relationship/link.operation.ts:103` |
| 37 | [**Service Request 'Raw JSON' example and parameters table do not match what the node sends**](./37-readme-servicereq-json-example-wrong.md) | Documentation Accuracy (README/CHANGELOG) | `README.md:668-679<br>nodes/IvantiNeuronsForITSM/actions/serviceReq/create.operation.ts:205-298` |
| 38 | [**Connector trigger JSDoc references credential 'automationAuthApi' that does not exist**](./38-connector-trigger-jsdoc-wrong-credential-name.md) | Comments & Doc-Comment Accuracy | `nodes/IvantiNeuronsForItsmConnectorTrigger.node.ts:24<br>nodes/IvantiNeuronsForItsmConnectorTrigger.node.ts:283` |
| 39 | [**transports/index.ts mixes credential reading, URL building, three request variants, two pagination algorithms, and error handling**](./39-transports-srp-multi-responsibility.md) | SOLID (esp. Single Responsibility) | `nodes/IvantiNeuronsForITSM/transports/index.ts<br>nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:274-318` |

### 🔵 Low (14)

| # | Finding | Category | Key file(s) |
|---|---|---|---|
| 40 | [**SearchResponse and encodeBasicAuth re-declared locally instead of imported from common.ts**](./40-searchresponse-and-encodebasicauth-redeclared.md) | DRY / Duplication | `nodes/IvantiNeuronsForITSM/actions/object/searchByKeyword.operation.ts:205-209<br>nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts:180-183` |
| 41 | [**Authorization header and tenant baseURL test expression duplicated verbatim across both credentials**](./41-credential-auth-and-baseurl-expression-duplicated.md) | DRY / Duplication | `credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts:55<br>credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:150` |
| 42 | [**Dead commented imports, stray scratch comment, unreachable parseValue branch, and explicit usableAsTool: undefined**](./42-dead-code-comments-and-unreachable-branches.md) | Dead Code | `nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation.ts:12<br>nodes/IvantiNeuronsForITSM/actions/search/savedsearch.operation.ts:2` |
| 43 | [**Orphan ivanti.svg icon and misspelled 'ivant-neurons-for-itsm' icon filenames**](./43-orphan-and-misspelled-icons.md) | Folder/File Structure & Naming | `nodes/IvantiNeuronsForITSM/ivanti.svg<br>icons/ivant-neurons-for-itsm.svg` |
| 44 | [**continueOnFail and includeInputFields output items omit pairedItem metadata**](./44-continueonfail-missing-paireditem.md) | Bugs / Correctness | `nodes/IvantiNeuronsForITSM/actions/object/create.operation.ts:180-184<br>nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts:149-157` |
| 45 | [**Webhook returns 400 with WWW-Authenticate: Basic for all failures and echoes internal error detail**](./45-webhook-401-vs-400-and-info-leak.md) | Security | `nodes/IvantiNeuronsForItsmConnectorTrigger.node.ts:211-220` |
| 46 | [**Credential 'Header' field documented as a header value but used as the header name**](./46-header-auth-field-description-mismatch.md) | Security | `credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:77-88<br>nodes/IvantiNeuronsForItsmConnectorTrigger.node.ts:305-311` |
| 47 | [**tsconfig missing noUncheckedIndexedAccess/noUnusedParameters and disables useUnknownInCatchVariables; eslint config not extended**](./47-tsconfig-missing-strict-flags.md) | TypeScript Quality | `tsconfig.json:9<br>eslint.config.mjs` |
| 48 | [**package.json missing engines field; build:watch uses bare tsc and won't copy icon assets**](./48-package-engines-and-buildwatch.md) | Production Readiness | `package.json:22-30` |
| 49 | [**Return All / Limit field definitions inconsistent across operations (spurious required, stray noDataExpression)**](./49-limit-field-inconsistencies.md) | n8n Node Conventions / UX Guidelines | `nodes/IvantiNeuronsForITSM/actions/search/fulltextsearchinsingleobject.operation.ts:42-65<br>nodes/IvantiNeuronsForITSM/actions/object/searchByKeyword.operation.ts:39-54` |
| 50 | [**Connector Trigger defaults.name drops 'Connector', colliding with the polling trigger label**](./50-connector-trigger-defaults-name-collision.md) | n8n Node Conventions / UX Guidelines | `nodes/IvantiNeuronsForItsmConnectorTrigger.node.ts:48` |
| 51 | [**README 'Report Transaction' Status options and field name do not match the node**](./51-readme-report-transaction-status-options.md) | Documentation Accuracy (README/CHANGELOG) | `README.md:778-780<br>nodes/IvantiNeuronsForItsmConnector/actions/automation/update.operation.ts:41-55` |
| 52 | [**Main node sets usableAsTool: true while exposing binary attachment operations tools cannot handle**](./52-usableastool-true-with-binary-attachments.md) | n8n Node Conventions / UX Guidelines | `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.ts:50<br>nodes/IvantiNeuronsForITSM/actions/attachment/uploadAttachment.operation.ts` |
| 53 | [**Property/operation descriptions inconsistent: missing periods, mixed verb tense, ungrammatical phrasing**](./53-descriptions-not-sentence-case.md) | n8n Node Conventions / UX Guidelines | `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:43<br>nodes/IvantiNeuronsForITSM/actions/object/getByRecId.operation.ts:27` |

## All findings (detail summaries)

#### 🔴 01. ["Return All" pagination silently returns [] because $count=true is never requested](./01-returnall-pagination-broken-no-odata-count.md)

- **Severity:** Critical | **Category:** Bugs / Correctness | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Bugs / Correctness, Production Readiness
- **Files:** `nodes/IvantiNeuronsForITSM/transports/index.ts:119-140`, `nodes/IvantiNeuronsForITSM/methods/listSearch.ts:156`
- ivantiApiRequestAllItems (transports/index.ts:119-140) derives the total from responseCount["@odata.count"], but never adds $count=true to the query string. In OData v4 the server omits @odata.count unless explicitly requested, so count is undefined, the loop condition `returnData.length < count` is `0 < undefined === false`, the paging loop never runs, and the function returns an empty array. This breaks every Return All path: businessobject getMany (returnAll), searchByKeyword (returnAll), the polling trigger (returnAll), and it also breaks service-request parameter discovery (getServiceReqParams / create fetchParameterTypes) and the resourceMapper schema builders in methods/listSearch.ts, all of which call this helper unconditionally. Fix by either adding qs["$count"] = true with a guard, or (better) page until a short/empty page like ivantiApiRequestAllItemsWithLimit already does.

#### 🔴 02. [CI and publish workflows have truncated ${{ }} expressions (NPM_TOKEN: $ and group: ci-$)](./02-ci-publish-truncated-expressions.md)

- **Severity:** Critical | **Category:** Production Readiness | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Production Readiness
- **Files:** `.github/workflows/publish.yml:99`, `.github/workflows/ci.yml:11`
- Two GitHub Actions expressions have been stripped to a literal `$`. publish.yml:99 sets `NPM_TOKEN: $` instead of `${{ secrets.NPM_TOKEN }}`, so the documented token-based publish fallback (the guard `[ -n "$NPM_TOKEN" ]` at line 96) can never authenticate, breaking token-based npm releases. ci.yml:11 sets `group: ci-$` instead of `ci-${{ github.ref }}`, so all branches/PRs share one concurrency group with cancel-in-progress: true, meaning an unrelated branch's run cancels another. Both are the same root cause (a templating/processing step that ate the `${{ }}`) and should be restored and audited together.

#### 🟠 03. [OData $filter string values interpolated without escaping single quotes (injection / broken filters)](./03-odata-string-value-injection-unescaped-quotes.md)

- **Severity:** High | **Category:** Security | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Security, Bugs / Correctness, Tests & Coverage
- **Files:** `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:334-336`, `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:356-358`, `nodes/IvantiNeuronsForITSM/actions/serviceReq/getServiceReqParams.operation.ts:56`, `nodes/IvantiNeuronsForITSM/actions/serviceReq/create.simplified.operation.ts:171`
- parseValue wraps user filter values as `'${value}'` with no doubling of embedded single quotes (OData requires '' escaping). This breaks legitimate values like O'Brien (Name eq 'O'Brien') and allows OData injection: a value such as `x' or RecId ne null or '` rewrites the server-side filter. The same unescaped interpolation appears in getMany (getMany.operation.ts:334-336, 391-392), the polling trigger (IvantiNeuronsForItsmTrigger.node.ts:356-358), and in $filter literals built in service-request operations (getServiceReqParams.operation.ts:56 ParentLink_RecID, create.simplified.operation.ts:171 LoginID). Fix with `"'" + value.replace(/'/g, "''") + "'"` in a shared escape helper used by all paths.

#### 🟠 04. [Field names, $orderby, $select, recordId, relationship, quickAction and savedSearch names interpolated into OData URL/query without validation](./04-odata-identifier-and-path-segment-injection.md)

- **Severity:** High | **Category:** Security | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Security, Tests & Coverage
- **Files:** `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:373`, `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:295`, `nodes/IvantiNeuronsForITSM/actions/object/getByRecId.operation.ts:86`, `nodes/IvantiNeuronsForITSM/actions/relationship/link.operation.ts:103`, `nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts:131`, `nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation.ts:108`, `nodes/IvantiNeuronsForITSM/actions/search/savedsearch.operation.ts:91`, `nodes/IvantiNeuronsForITSM/common.ts:64`
- assertSafeFieldName (common.ts:64, regex /^[A-Za-z0-9_]+$/) exists but is only applied to filter field names in getMany.operation.ts:381. The $select field list, the $orderby field, and the orderDirection are concatenated raw (getMany.operation.ts:373, 397-401); the polling trigger validates NO identifier at all (IvantiNeuronsForItsmTrigger.node.ts:279, 295/302, 309-311). Separately, recordId/targetRecordId are placed inside OData key literals `('...')` and relationship/quickAction/savedSearchName/businessObject are appended as raw path segments with only an emptiness (and sometimes endsWith('s')) check (getByRecId.operation.ts:86, link.operation.ts:103, getRelated.operation.ts:131, run.operation.ts:108, savedsearch.operation.ts:91), enabling key/path-segment injection. Validate every interpolated identifier with assertSafeFieldName (shared between both nodes), validate recordId against the documented 32-char GUID format, and/or encodeURIComponent path segments.

#### 🟠 05. [Webhook x-transaction-id validated only by length === 32 before OData interpolation (injection on authenticated path)](./05-webhook-transaction-id-length-only-check.md)

- **Severity:** High | **Category:** Security | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Security
- **Files:** `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:335`, `nodes/IvantiNeuronsForItsmConnector/actions/automation/update.operation.ts:89`
- validateAutomationTransaction accepts any 32-character string as the transaction ID (ConnectorTrigger.node.ts:335) with no charset check, then interpolates it into an OData key literal `IVNT_Automation_Transactionss('...')` (line 347) on an authenticated outbound request. A 32-char string can contain single quotes/OData operators, enabling injection. The connector's Automation "Report Transaction" operation has the identical length-only check and raw interpolation (update.operation.ts:89-92). Validate against the real GUID charset (e.g. /^[A-Fa-f0-9]{32}$/) before building the URL, in both places.

#### 🟠 06. [getRelated passes $select as the body argument instead of qs, so $select is silently ignored](./06-getrelated-select-passed-as-body.md)

- **Severity:** High | **Category:** Bugs / Correctness | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Bugs / Correctness, TypeScript Quality
- **Files:** `nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts:137`, `nodes/IvantiNeuronsForITSM/transports/index.ts:36`
- ivantiApiRequest's signature is (method, endpoint, qs, body). getRelated builds qs with $select but calls `ivantiApiRequest.call(this, 'GET', url, undefined, qs)` (getRelated.operation.ts:137), passing qs into the body slot and undefined into the qs slot. The $select projection is never sent on the query string (it is attached as a body on a GET, which OData ignores), so the "Select Fields" option does nothing. The root cause is partly the loose ivantiApiRequest signature where `body` has no default (transports/index.ts:36) while qs does; giving body a default and fixing the call to `...url, qs)` resolves it.

#### 🟠 07. [Boolean OData filter parsing uses Boolean(value), so "false" becomes true](./07-boolean-filter-coercion-always-true.md)

- **Severity:** High | **Category:** Bugs / Correctness | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Bugs / Correctness, Dead Code, Tests & Coverage
- **Files:** `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:344-350`, `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:366-368`
- In parseValue's boolean branch, `Boolean(value)` is truthy for any non-empty string, so a filter value of "false" returns true and `IsActive eq false` is silently sent as `IsActive eq true`, returning the opposite records. The guard `if (boolean === undefined)` (getMany.operation.ts:344-350) is dead code because Boolean() never returns undefined. The polling trigger has the same bug without even the dead guard (IvantiNeuronsForItsmTrigger.node.ts:366-368). Parse explicitly (e.g. value.trim().toLowerCase() === 'true', else throw) in both copies (or in one shared helper).

#### 🟠 08. [quickAction run uses businessObject.replace('s', '#') (unanchored), corrupting names like 'Tasks'](./08-quickaction-unanchored-replace.md)

- **Severity:** High | **Category:** Bugs / Correctness | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Bugs / Correctness
- **Files:** `nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation.ts:119`, `nodes/IvantiNeuronsForITSM/actions/attachment/uploadAttachment.operation.ts:106`
- To derive actualObjectType, run.operation.ts:119 calls `businessObject.replace('s', '#')`. String.replace with a string replaces only the FIRST occurrence and is not end-anchored, so 'Tasks' -> 'Ta#ks', 'Releases'/'Assets' break, etc. The attachment upload operation does this correctly with the anchored regex `objectType.replace(/s$/, '#')` (uploadAttachment.operation.ts:106), confirming the intended behavior is to strip only the trailing plural 's'. Use the anchored regex.

#### 🟠 09. [Polling trigger does NOT deduplicate, contradicting README, FAQ, and its own class JSDoc](./09-polling-trigger-no-dedup-vs-docs.md)

- **Severity:** High | **Category:** Bugs / Correctness | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Bugs / Correctness, Comments & Doc-Comment Accuracy, Documentation Accuracy (README/CHANGELOG), Production Readiness
- **Files:** `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:13-35`, `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:262-279`, `README.md:142-146`, `README.md:1472-1474`
- The trigger's class JSDoc (IvantiNeuronsForItsmTrigger.node.ts:13-35), the README Smart Polling feature (README.md:34, 142-146), and the README FAQ (README.md:1472-1474) all promise RecId-based deduplication stored in workflow static data, emitting only new records. poll() (lines 248-336) never calls getWorkflowStaticData, never tracks RecIds, and returns the full result of every query each cycle; buildQuery even force-injects RecId 'so deduplication across poll cycles works' (line 275) that is never used. The method-level comment (lines 244-246) even contradicts the class doc by admitting dedup is NOT performed. In production this re-emits all matching records every interval, causing duplicate downstream executions (e.g. duplicate tickets/notifications). Either implement the documented dedup (gated on getMode() !== 'manual') or remove the dedup claims from all three docs and the misleading inline comments.

#### 🟠 10. [ivantiApiRequest error handler calls error.message.join() and throws TypeError on non-array error bodies](./10-error-handler-message-join-crashes.md)

- **Severity:** High | **Category:** Bugs / Correctness | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Bugs / Correctness, TypeScript Quality, Dead Code
- **Files:** `nodes/IvantiNeuronsForITSM/transports/index.ts:59-62`, `nodes/IvantiNeuronsForITSM/transports/index.ts:218-223`
- On a non-2xx response, ivantiApiRequest casts response.body to IVantiApiError and calls `error.message.join(', ')` (transports/index.ts:59-62), assuming message is always string[]. Because the request uses json:false and ignoreHttpStatusErrors:true, many real failures (HTTP 500 HTML pages, gateway/proxy errors, 401/403, any non-JSON body) yield a string or an object without a message array, so .join throws a TypeError that masks the real status and defeats continueOnFail handling. Build the message defensively (Array.isArray check, string fallback, JSON.stringify) and include response.statusCode. The interface is also misspelled IVantiApiError and declares unused fields (code/description/help) when only message is read.

#### 🟠 11. [Transport helpers have no return type, leaking any across the whole package](./11-transport-helpers-untyped-any.md)

- **Severity:** High | **Category:** TypeScript Quality | **Confidence:** high | **Status:** Confirmed
- **Raised by:** TypeScript Quality
- **Files:** `nodes/IvantiNeuronsForITSM/transports/index.ts:31-37`, `nodes/IvantiNeuronsForItsmConnector/transports/index.ts:24-48`, `nodes/IvantiNeuronsForITSM/actions/serviceReq/create.operation.ts:235-237`, `nodes/IvantiNeuronsForITSM/actions/relationship/link.operation.ts:110-111`, `nodes/IvantiNeuronsForITSM/actions/search/savedsearch.operation.ts:91-93`
- None of the transport functions declare a return type; httpRequestWithAuthentication returns Promise<any> and ivantiApiRequest returns response.body (typed any). Because the result is any, every downstream member access (response.value, response.IsSuccess, response.code, response.data, response.totalRows) compiles with zero checking and the `as SearchResponse`/`as IDataObject` casts at call sites are vacuous. This is the root cause of pervasive unchecked any access across operations (serviceReq create.operation.ts:235-237, relationship link.operation.ts:110-111, search savedsearch.operation.ts:91-93 returnJsonArray(response.value) with no cast, fulltextsearch data/totalRows, etc.). The connector's separate ivantiApiRequest has the identical issue. Add explicit return types (Promise<IDataObject[]> for the collection helpers; a generic ivantiApiRequest<T>(...) or a typed IN8nHttpFullResponse for the single-request helper) and define small response interfaces (ServiceRequestResult, RelationshipResult, FulltextSearchResponse) in common.ts.

#### 🟠 12. [Tenant normalization + base-URL building duplicated across 5+ sites, with the connector trigger missing normalization](./12-tenant-url-building-duplicated-with-trigger-bug.md)

- **Severity:** High | **Category:** DRY / Duplication | **Confidence:** high | **Status:** Confirmed
- **Raised by:** DRY / Duplication, SOLID (esp. Single Responsibility), Production Readiness
- **Files:** `nodes/IvantiNeuronsForITSM/transports/index.ts:44-56`, `nodes/IvantiNeuronsForITSM/transports/index.ts:163-172`, `nodes/IvantiNeuronsForITSM/transports/index.ts:202-214`, `nodes/IvantiNeuronsForItsmConnector/transports/index.ts:36-48`, `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:342-346`
- The block that reads credentials, strips protocol/trailing-slash from tenant, computes the on-prem /HEAT/api path and builds the URL is copy-pasted in ivantiApiRequest/ivantiApiRequestFormData/ivantiApiRequestBinary (transports/index.ts:44-51, 163-168, 202-208), the connector transport (Connector/transports/index.ts:36-43), and ConnectorTrigger.validateAutomationTransaction. Critically the ConnectorTrigger copy does NOT normalize tenant: `const tenant = credentials.tenant as string;` (ConnectorTrigger.node.ts:342) then builds `https://${tenant}${isOnPrem ? '/HEAT' : ''}/api` (line 346), so a user who pastes a tenant with an https:// prefix gets a broken URL there while every other path silently fixes it. Error/status handling and ignoreHttpStatusErrors are also inconsistently present (only ivantiApiRequest checks status; the form-data, binary, connector, and trigger paths omit it). Extract a shared buildBaseUrl(credential)/normalizeTenant helper and a single error-mapping function used by all request variants and the trigger.

#### 🟠 13. [OData query builder (parseValue + buildQuery) duplicated between getMany and the polling trigger, already divergent](./13-odata-query-builder-duplicated-divergent.md)

- **Severity:** High | **Category:** DRY / Duplication | **Confidence:** high | **Status:** Confirmed
- **Raised by:** DRY / Duplication, SOLID (esp. Single Responsibility), Tests & Coverage
- **Files:** `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:332-403`, `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:268-377`
- The OData $select/$filter/$orderby assembly and the parseValue literal coercion exist as two near-identical copies: getMany.operation.ts (parseValue 332-359, buildODataQuery 368-403) and the trigger's inline buildQuery + parseValue (IvantiNeuronsForItsmTrigger.node.ts:268-314, 351-377). They have already drifted in security-relevant ways: getMany calls assertSafeFieldName on filter field names (line 381) but the trigger never does; the trigger always prepends RecId to $select while getMany does not. The shared OData property block (Business Object/Return All/Limit/Select/Filter/Order By UI) is also copy-pasted between the two files. Extract a single exported query-builder module and a reusable property array consumed by getMany, searchByKeyword, the trigger, and future list ops, baking assertSafeFieldName into the shared builder so both paths get the safety check.

#### 🟠 14. [No automated tests exist and CI does not run or gate on tests before deploy-on-main](./14-no-tests-and-ci-not-gated.md)

- **Severity:** High | **Category:** Tests & Coverage | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Tests & Coverage
- **Files:** `package.json:22`, `.github/workflows/ci.yml`, `nodes/IvantiNeuronsForITSM/methods/listSearch.ts:62-129`, `nodes/IvantiNeuronsForITSM/actions/serviceReq/create.operation.ts:337`
- There are zero test files (*.test.ts/*.spec.ts, no __tests__) and no test runner config; package.json has no test script. CI (ci.yml) runs only lint + build and then dispatches a homelab rebuild on push to main, so untested changes reaching main are immediately redeployed with no behavioral verification. A package shipping OData filter assembly, value coercion, ConfigOptions JSON parsing, and webhook auth has no regression safety net, which is exactly why bugs like the boolean coercion and the broken Return-All paging went unnoticed. The highest-value pure functions are also module-private and unexported (parseValue/buildODataQuery in getMany, coerceParameterValue in serviceReq create, extractBoName/resolveDropdownDisplayType/buildDropdownDisplayNames/mapFieldType in listSearch, and the connector's local encodeBasicAuth), so they cannot be unit-tested without first exporting them. Add a runner (vitest or jest), export the pure helpers, add unit tests for them, and insert a test step in CI before the deploy dispatch.

#### 🟠 15. [No retry/backoff on 429/5xx although README documents exponential backoff as a feature](./15-no-retry-backoff-vs-readme-claim.md)

- **Severity:** High | **Category:** Production Readiness | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Production Readiness
- **Files:** `nodes/IvantiNeuronsForITSM/transports/index.ts:59-62`, `README.md:1408`
- The README Rate Limits section lists 'Implement exponential backoff on 429 errors' and the Features list claims 'Comprehensive Error Handling' (README.md:1408), but no transport helper implements any retry, backoff, or Retry-After handling. ivantiApiRequest makes a single request and throws on any non-2xx (transports/index.ts:59-62). For a node that pages through large OData result sets against a documented 100-req/min cloud limit, a single 429 mid-pagination aborts the whole operation and loses partial progress. Either implement retry-with-backoff (honor Retry-After, capped exponential backoff with jitter, max attempts) or remove the backoff claim from the README so docs match behavior.

#### 🟠 16. [README install instructions and badge use the unscoped package name, not the published @syn-con scope](./16-install-instructions-wrong-package-name.md)

- **Severity:** High | **Category:** Documentation Accuracy (README/CHANGELOG) | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Documentation Accuracy (README/CHANGELOG), Production Readiness
- **Files:** `README.md:3`, `README.md:52`, `package.json:2`
- The published name is @syn-con/n8n-nodes-ivanti-neurons-for-itsm (package.json:2) but every README install reference uses the unscoped 'n8n-nodes-ivanti-neurons-for-itsm' — the Community Nodes search string (README.md:52), npm install command (README.md:64), the Docker N8N_COMMUNITY_PACKAGES env var (README.md:79), and the npm version badge URL (README.md:3). Users following these will fail to find/install the package or install the wrong one. Replace all occurrences with the scoped name (URL-encode the scope for the badge). The repository/issues metadata is also inconsistent (package.json repository points at github.com/syn-con while README issues link points at github.com/KonstantinShturo; homepage is empty), so canonicalize the org across package.json repository/bugs/homepage and the README.

#### 🟠 17. [Connector action node JSDoc/name copied from main node, documents six resources it does not implement](./17-connector-node-jsdoc-and-name-copied-from-main.md)

- **Severity:** High | **Category:** Comments & Doc-Comment Accuracy | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Comments & Doc-Comment Accuracy, Dead Code, n8n Node Conventions / UX Guidelines
- **Files:** `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnector.node.ts:11-25`, `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnector.node.ts:36`
- IvantiNeuronsForItsmConnector.node.ts:11-25 is the verbatim 'Main action node ... Exposes all CRUD and search operations' JSDoc from the main node, listing Business Object, Attachment, Relationship, Service Request, Search, and Quick Action. The Connector node only registers the single Automation resource (lines 53-59) and exposes only that operation. Additionally its defaults.name is 'Ivanti Neurons for ITSM' (line 36), identical to the main node and not matching its own displayName 'Ivanti Neurons for ITSM Connector', so both nodes get the same canvas label. Rewrite the JSDoc/description to the Connector's actual scope (reporting automation transaction status) and set defaults.name to match its displayName.

#### 🟠 18. [noDataExpression: true applied to value/data fields, disabling expression mapping](./18-nodataexpression-on-data-fields.md)

- **Severity:** High | **Category:** n8n Node Conventions / UX Guidelines | **Confidence:** high | **Status:** Confirmed
- **Raised by:** n8n Node Conventions / UX Guidelines
- **Files:** `nodes/IvantiNeuronsForITSM/actions/object/create.operation.ts:24-54`, `nodes/IvantiNeuronsForITSM/actions/object/getByRecId.operation.ts:21-27`, `nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation.ts:31-68`, `nodes/IvantiNeuronsForITSM/actions/object/searchByKeyword.operation.ts:87-93`, `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:60-67`
- Per .agents/nodes.md, noDataExpression belongs only on the Resource and Operation selectors (where an expression would break show/hide routing). It is applied here to ordinary data inputs — Business Object, Record ID, Quick Action, Mode, Fields, search text, and even a nested fixedCollection leaf field (searchByKeyword 'name' field) and the trigger's object field. This disables the fx toggle so users cannot map upstream data into those fields. It is especially harmful because the main action node sets usableAsTool: true, where an AI agent commonly needs these expression-driven. Remove noDataExpression from all value/data fields, keeping it only on Resource and the top-level Operation options.

#### 🟠 19. [ivantiApiRequestAllItems loop has no break on empty/short page (infinite-loop / memory hazard)](./19-allitems-no-break-on-short-page.md)

- **Severity:** High | **Category:** Bugs / Correctness | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Bugs / Correctness, Production Readiness
- **Files:** `nodes/IvantiNeuronsForITSM/transports/index.ts:133-138`
- Even if $count=true were added, the loop `while (returnData.length < count)` (transports/index.ts:133-138) only terminates by count and accumulates the entire result set in memory with no break on an empty or short page. If the server returns fewer rows than @odata.count reports (permission-trimmed results, concurrent deletes, server-side $skip cap, or a page of value:[]), returnData stops growing while still < count and the loop spins forever, hammering the API. ivantiApiRequestAllItemsWithLimit already has the correct safety net (`if (response.value.length < ODATA_BATCH_SIZE) break;`). Add a break when a page returns fewer than ODATA_BATCH_SIZE records (or zero), and consider a hard cap for very large objects.

#### 🟠 20. [Connector Auth credential conflates inbound webhook auth with outbound API auth (SRP/ISP)](./20-connector-auth-credential-conflates-inbound-outbou.md)

- **Severity:** High | **Category:** SOLID (esp. Single Responsibility) | **Confidence:** high | **Status:** Confirmed
- **Raised by:** SOLID (esp. Single Responsibility)
- **Files:** `credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:36-142`, `nodes/IvantiNeuronsForItsmConnectorTrigger.node.ts:291-311`
- IvantiNeuronsForItsmConnectorAuthApi carries two orthogonal auth concerns: inbound webhook validation fields (type/username/password/header/webhookApiKey, lines 36-105) consumed manually by the trigger's validateRequestAuth, and outbound OData API fields (tenant/apiKey/isOnPrem/skipSslVerification, lines 108-142) used by the authenticate+test blocks. The credential test only exercises the outbound apiKey, so the inbound fields are never validated and the UX is confusing. This also drives a real bug: the connector's outbound transport reads tenant/isOnPrem/skipSslVerification from this same credential (Connector/transports/index.ts:32-43), which is fine here because they coexist, but the split-concern design and the 'Report Transaction' path's reliance on it are fragile. Consider splitting into an inbound-webhook credential and an outbound-API credential (the trigger can declare both) so each consumer depends only on the fields it uses and the test validates what it claims.

#### 🟡 21. [CHANGELOG.md is empty despite version 1.0.7 and an explicit AGENTS.md requirement](./21-changelog-empty.md)

- **Severity:** Medium | **Category:** Documentation Accuracy (README/CHANGELOG) | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Documentation Accuracy (README/CHANGELOG), Production Readiness, Dead Code, Folder/File Structure & Naming
- **Files:** `CHANGELOG.md`, `package.json:3`
- CHANGELOG.md is a 0-byte file even though package.json is at 1.0.7 with several version bumps in git history. AGENTS.md mandates updating CHANGELOG.md on every version change, the README Maintenance section tells users to 'Review changelog for breaking changes', and publish.yml documents that `npm run release` updates the changelog. The empty file is a broken reference and leaves npm consumers with no record of what changed. Backfill with at least the 1.0.x entries (Keep a Changelog format) and wire release-it's changelog plugin so future releases append automatically.

#### 🟡 22. [LICENSE file referenced by README does not exist and would not ship in the npm tarball](./22-missing-license-file.md)

- **Severity:** Medium | **Category:** Production Readiness | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Production Readiness, Documentation Accuracy (README/CHANGELOG)
- **Files:** `README.md:1561`, `package.json:5`, `package.json:31`
- README links the license as [MIT](LICENSE.md) (README.md:1561) and package.json declares license MIT, but there is no LICENSE/LICENSE.md/LICENSE.txt in the repo root (confirmed by ls), so the link is dead. The full MIT text is inlined in the README, but a standalone license file is the convention scanners/tooling expect. The `files: ["dist"]` allowlist in package.json also means even if a LICENSE existed it would not be published; README/CHANGELOG/LICENSE should be added to files. Add a top-level LICENSE(.md) and include LICENSE*, README.md, CHANGELOG.md in the package.json files array.

#### 🟡 23. [Webhook auth tokens compared with non-constant-time !== (timing side-channel)](./23-webhook-auth-non-constant-time.md)

- **Severity:** Medium | **Category:** Security | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Security
- **Files:** `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:296-311`
- The inbound webhook validates Basic, apiKey, and header auth modes with JavaScript !== (ConnectorTrigger.node.ts:296-311), which short-circuits on the first differing byte and leaks token length and a per-character timing oracle to a remote unauthenticated attacker. Because this is a publicly reachable webhook protecting downstream automation, compare secrets with a constant-time comparison (e.g. crypto.timingSafeEqual on equal-length Buffers / hashes) in all three branches.

#### 🟡 24. [skipSslVerification disables TLS validation for all authenticated requests, exposing the API key to MITM](./24-skip-ssl-exposes-api-key.md)

- **Severity:** Medium | **Category:** Security | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Security
- **Files:** `nodes/IvantiNeuronsForITSM/transports/index.ts:53`, `nodes/IvantiNeuronsForItsmConnector/transports/index.ts:45`, `nodes/IvantiNeuronsForItsmConnectorTrigger.node.ts:344-352`
- skipSslVerification is forwarded as skipSslCertificateValidation on every request including authenticated OData calls carrying the API key (transports/index.ts:53, 171, 210; Connector/transports/index.ts:45) and the webhook's transaction lookup (ConnectorTrigger.node.ts:352). With TLS verification off, a MITM can present any cert and capture the API key / Basic credentials. The credential description only says it is 'useful for self-signed certificates' and does not surface the blast radius. Strengthen the field description to warn about API-key exposure, prefer a CA/cert-pin option over a blanket skip, and document the risk in the README (default stays false).

#### 🟡 25. [getMany wraps the whole item loop in one try/catch, swallows non-Error throws, and ignores continueOnFail](./25-getmany-swallows-errors-ignores-continueonfail.md)

- **Severity:** Medium | **Category:** Bugs / Correctness | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Bugs / Correctness
- **Files:** `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:287-316`, `nodes/IvantiNeuronsForITSM/actions/search/savedsearch.operation.ts:89-102`, `nodes/IvantiNeuronsForITSM/actions/search/fulltextsearchacrossallobjects.operation.ts:51-72`
- getMany wraps the entire per-item loop in a single try/catch whose handler only rethrows when error instanceof Error (getMany.operation.ts:287-316); any non-Error throw is silently swallowed and partial returnData is returned with no error surfaced. It also never honors this.continueOnFail(), and because the loop is inside the try, a failure on one item aborts all remaining items — inconsistent with operations that wrap each item individually. savedsearch.operation.ts and fulltextsearchacrossallobjects.operation.ts share the same loop-outside-try, unconditional-rethrow, no-continueOnFail pattern. Move the try/catch inside the loop and add the standard continueOnFail branch per item.

#### 🟡 26. [Multi-item operations read parameters at index 0 inside per-item loops, ignoring per-item expressions](./26-params-read-at-index-0-in-loops.md)

- **Severity:** Medium | **Category:** Bugs / Correctness | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Bugs / Correctness
- **Files:** `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:279-280`, `nodes/IvantiNeuronsForITSM/actions/object/searchByKeyword.operation.ts:130-160`, `nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts:115-121`, `nodes/IvantiNeuronsForITSM/actions/search/savedsearch.operation.ts`
- Several operations loop over items but read key value-bearing parameters once with hardcoded index 0, so per-item expression values are evaluated only against the first item and applied to all. Examples: getMany reads object/returnAll at 0 (getMany.operation.ts:279-280); searchByKeyword reads object/selectAllFields/select/limit/searchText/returnAll all at 0 then loops (and, because the query is constant, re-issues the identical search once per input item, performing N identical API calls and emitting N copies of the result set); getRelated reads relationship/businessObject/selectFields at 0; link/unlink read relationship/businessObject at 0; savedsearch reads all three at 0; fulltextsearchinsingleobject reads searchObject/returnAll at 0. Read per-item params with the loop index i; keep only genuinely node-global validation outside the loop.

#### 🟡 27. [Connector trigger subtitle calls .join() on $parameter["updates"], an options string, throwing in the editor](./27-connector-trigger-subtitle-join-on-string.md)

- **Severity:** Medium | **Category:** Bugs / Correctness | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Bugs / Correctness
- **Files:** `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:45`
- The subtitle expression `=Updates: {{$parameter["updates"].join(", ")}}` (ConnectorTrigger.node.ts:45) calls .join on the 'updates' parameter, which is type:'options' with a single string default 'OnAutomationTransaction' (lines 67-77), not a multiOptions array. Calling .join on a string throws TypeError, so the subtitle fails to render. Reference the string directly (`{{$parameter["updates"]}}`) or change updates to multiOptions if multiple selections are intended.

#### 🟡 28. [Inconsistent acronym/casing across node folders, credential filenames, operation files, and resource folder](./28-node-folder-and-credential-file-casing.md)

- **Severity:** Medium | **Category:** Folder/File Structure & Naming | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Folder/File Structure & Naming
- **Files:** `nodes/IvantiNeuronsForITSM`, `credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts`, `nodes/IvantiNeuronsForITSM/actions/search/fulltextsearchinsingleobject.operation.ts`, `nodes/IvantiNeuronsForITSM/actions/object/index.ts`, `package.json:38-46`
- Naming is inconsistent across several axes. Node folders mix 'IvantiNeuronsForITSM' (all-caps acronym) and 'IvantiNeuronsForItsmConnector' (Title-cased), and even inside the all-caps folder the node file is 'IvantiNeuronsForItsm.node.ts'. Credential files mix camelCase 'ivantiNeuronsForItsmApiKeyApi.credentials.ts' with PascalCase 'IvantiNeuronsForItsmConnectorAuthApi.credentials.ts' (n8n convention is PascalCase file matching the class). The 'search' operation files use run-together lowercase (fulltextsearchinsingleobject, savedsearch) while everything else is camelCase, and these names propagate into operation values and node.type.ts. The Business Object resource folder is 'object/' though its resource value/key is 'businessobject'. Standardize on one acronym casing ('Itsm') and camelCase operation files; note that changing operation values is a breaking workflow change requiring a CHANGELOG entry, and package.json n8n.nodes/credentials paths must be updated in lockstep.

#### 🟡 29. [Undocumented 761KB packages/N8N_Connector.MetadataPatch committed at repo root](./29-stray-metadatapatch-binary.md)

- **Severity:** Medium | **Category:** Dead Code | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Dead Code
- **Files:** `packages/N8N_Connector.MetadataPatch`
- packages/N8N_Connector.MetadataPatch is a ~761KB opaque binary not referenced by package.json, README, or .gitignore and not part of the n8n build (confirmed it exists; package.json files allowlist is dist only). It appears to be an Ivanti-side metadata artifact accidentally committed. Remove it from the repo (move to an Ivanti-side repo if needed) or at minimum gitignore it and document its purpose.

#### 🟡 30. [resourceMapper field schemas typed as any[] with eslint-disable instead of n8n's ResourceMapperField](./30-resourcemapper-fields-typed-any.md)

- **Severity:** Medium | **Category:** TypeScript Quality | **Confidence:** high | **Status:** Confirmed
- **Raised by:** TypeScript Quality
- **Files:** `nodes/IvantiNeuronsForITSM/methods/listSearch.ts:149-162`
- Both resourceMapping methods declare their field arrays as any[] and suppress the linter (listSearch.ts:149-150, 161-162). n8n-workflow exports ResourceMapperField/ResourceMapperFields, so the field literals and the Promise return can be fully typed, and mapFieldType's return can be the FieldType union instead of string — catching invalid mapper types and typo'd field keys at compile time. Import the types, type as Promise<ResourceMapperFields> / ResourceMapperField[], and remove the eslint-disable comments.

#### 🟡 31. [router uses getNodeParameter<Ivanti>('resource', 0) with the wrong generic argument](./31-router-getnodeparameter-wrong-generic.md)

- **Severity:** Medium | **Category:** TypeScript Quality | **Confidence:** high | **Status:** Confirmed
- **Raised by:** TypeScript Quality, SOLID (esp. Single Responsibility)
- **Files:** `nodes/IvantiNeuronsForITSM/actions/router.ts:30-56`, `nodes/IvantiNeuronsForItsmConnector/actions/router.ts`
- getNodeParameter's type parameter is the return value type, but router.ts:30 passes the full Ivanti union for a call that only fetches the 'resource' string, so resource is typed as the whole object even though it is a string at runtime. The code then rebuilds the object and re-casts `as Ivanti`, making the generic misleading (the switch narrows only because of the cast). Type the individual params as their primitives (Ivanti['resource'], string) and keep the single `as Ivanti` on the assembled object, or drop the generic. The connector router has the same pattern. The switch also has no default branch, so an unknown resource silently returns []; a resource->module map with an explicit not-implemented throw would be both safer and more open/closed.

#### 🟡 32. [Operation options arrays not sorted alphabetically by display name](./32-operation-options-not-alphabetical.md)

- **Severity:** Medium | **Category:** n8n Node Conventions / UX Guidelines | **Confidence:** high | **Status:** Confirmed
- **Raised by:** n8n Node Conventions / UX Guidelines
- **Files:** `nodes/IvantiNeuronsForITSM/actions/attachment/index.ts:18-38`, `nodes/IvantiNeuronsForITSM/actions/serviceReq/index.ts:21-26`, `nodes/IvantiNeuronsForITSM/actions/search/index.ts:17-38`
- n8n UX guidelines (and the Business Object/Relationship resources and the Resource selector in this package) sort options alphabetically by name. The attachment, serviceReq, and search operation lists violate this: attachment is Read/Upload/Delete, serviceReq has the two Create entries and Get entries out of order, and search lists 'in Single' before 'Across All'. Reorder each options array alphabetically by name.

#### 🟡 33. ['Business object must end with s' validation hand-rolled across 8 sites with drifting messages and poor UX](./33-business-object-name-validation-duplicated.md)

- **Severity:** Medium | **Category:** DRY / Duplication | **Confidence:** high | **Status:** Confirmed
- **Raised by:** DRY / Duplication, n8n Node Conventions / UX Guidelines
- **Files:** `nodes/IvantiNeuronsForITSM/actions/object/create.operation.ts:137`, `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:284`, `nodes/IvantiNeuronsForITSM/actions/object/update.operation.ts:150`, `nodes/IvantiNeuronsForITSM/actions/object/deleteByRecId.operation.ts:70`, `nodes/IvantiNeuronsForITSM/actions/object/getByRecId.operation.ts:72`, `nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation.ts:101`, `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:255`
- The endsWith('s') guard (plus a preceding empty-check) is duplicated in at least 8 operations and the trigger with three spellings of the condition (!object.endsWith('s') vs object.endsWith('s') === false) and inconsistent messages (an "s" vs "s"; 'parameter is required!' vs 'is required'). It is also poor UX: users only learn the rule at runtime, and the same plural requirement is implemented differently in attachment/quickAction (which strip the trailing s and append #). Extract a single common.ts helper (non-empty + trailing-s check, one canonical message) used everywhere, and consider auto-normalizing the name or making the field a known-objects list rather than hard-failing; fix the ungrammatical 'Should be end s' field descriptions.

#### 🟡 34. [deleteByRecId Business Object default 'incident' fails its own endsWith('s') validation](./34-deletebyrecid-invalid-default.md)

- **Severity:** Medium | **Category:** n8n Node Conventions / UX Guidelines | **Confidence:** high | **Status:** Confirmed
- **Raised by:** n8n Node Conventions / UX Guidelines
- **Files:** `nodes/IvantiNeuronsForITSM/actions/object/deleteByRecId.operation.ts:19-28`
- The Delete By Record ID operation ships default 'incident' for the Business Object field (deleteByRecId.operation.ts:19-28), but execute() rejects any value not ending in 's' (lines 70-72), so the out-of-the-box default is invalid and the operation fails until the user edits it. Other operations default this field to empty string (e.g. getByRecId.operation.ts:23). Change the default to '' or a valid plural like 'Incidents'.

#### 🟡 35. [Same Business Object field uses internal name 'object' in some operations and 'businessObject' in others](./35-business-object-param-name-inconsistent.md)

- **Severity:** Medium | **Category:** n8n Node Conventions / UX Guidelines | **Confidence:** high | **Status:** Confirmed
- **Raised by:** n8n Node Conventions / UX Guidelines
- **Files:** `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:28`, `nodes/IvantiNeuronsForITSM/actions/object/getByRecId.operation.ts:22`, `nodes/IvantiNeuronsForITSM/actions/object/deleteByRecId.operation.ts:21`
- Within the same resource, the Business Object field is named 'object' (getMany, create, update, searchByKeyword) and 'businessObject' (getByRecId, deleteByRecId), with 'searchObject' in single-object full-text search. n8n preserves a parameter value when switching operations only if the internal name matches, so the user's entered value is lost when switching between, e.g., Get Many and Get By Record ID, and expressions referencing $parameter differ. Standardize on one internal name across the resource.

#### 🟡 36. [README 'Endpoints Used' table does not match the code (paths, methods, casing, double /api prefix)](./36-readme-endpoint-table-inaccurate.md)

- **Severity:** Medium | **Category:** Documentation Accuracy (README/CHANGELOG) | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Documentation Accuracy (README/CHANGELOG)
- **Files:** `README.md:1379-1396`, `nodes/IvantiNeuronsForITSM/actions/relationship/link.operation.ts:103`, `nodes/IvantiNeuronsForITSM/actions/attachment/uploadAttachment.operation.ts:111`
- The README endpoints table (README.md:1379-1396) is wrong on nearly every relationship/attachment/search/service-request row vs the code: link uses PATCH on .../{relationship}('{targetId}')/$Ref and unlink uses DELETE on the same (not POST/DELETE .../$ref); attachments use /rest/Attachment and /rest/Attachment?ID= (not /api/attachment/{id}); single-object search is POST /rest/search/fulltext and across-all is POST /rest/Search; create service request is POST /rest/ServiceRequest/new; templates/subscriptions are GET /rest/Template/{employeeId}/_All_. All '/api/...' rows are also double-prefixed because the transport already prepends /api (or /HEAT/api). Rewrite the table to match the code and add the saved-search endpoint.

#### 🟡 37. [Service Request 'Raw JSON' example and parameters table do not match what the node sends](./37-readme-servicereq-json-example-wrong.md)

- **Severity:** Medium | **Category:** Documentation Accuracy (README/CHANGELOG) | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Documentation Accuracy (README/CHANGELOG)
- **Files:** `README.md:668-679`, `nodes/IvantiNeuronsForITSM/actions/serviceReq/create.operation.ts:205-298`
- The README Service Request -> Create 'Raw JSON Example' (README.md:668-679) shows a top-level body with ServiceReqTemplateId/RequestedFor/Parameters of friendly names, but the node always builds a fixed envelope (formName, saveReqState, serviceReqData with ProfileLink_RecID/Category/Subject/Symptom, subscriptionId, strUserId) and JSON-mode input only supplies the inner 'parameters' object keyed by par-{recId}/par-{recId}-recId identifiers (create.operation.ts:205-219, 277-298). The parameters table (lines 661-665) also omits the required Employee RecId and Subscription ID fields and mislabels mode options as 'Resource Mapper/Raw JSON' when the UI uses 'Manual'/'JSON'. Update the example and table to match.

#### 🟡 38. [Connector trigger JSDoc references credential 'automationAuthApi' that does not exist](./38-connector-trigger-jsdoc-wrong-credential-name.md)

- **Severity:** Medium | **Category:** Comments & Doc-Comment Accuracy | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Comments & Doc-Comment Accuracy
- **Files:** `nodes/IvantiNeuronsForItsmConnectorTrigger.node.ts:24`, `nodes/IvantiNeuronsForItsmConnectorTrigger.node.ts:283`
- The class JSDoc (ConnectorTrigger.node.ts:24) and validateRequestAuth JSDoc (line 283) refer to a credential named 'automationAuthApi'. No such credential exists; the node consistently uses 'ivantiNeuronsForItsmConnectorAuthApi' (declared line 54, fetched lines 292/338/354). Replace both occurrences with the real name. The validateRequestAuth JSDoc also documents only base/header modes while the code also handles apiKey.

#### 🟡 39. [transports/index.ts mixes credential reading, URL building, three request variants, two pagination algorithms, and error handling](./39-transports-srp-multi-responsibility.md)

- **Severity:** Medium | **Category:** SOLID (esp. Single Responsibility) | **Confidence:** high | **Status:** Confirmed
- **Raised by:** SOLID (esp. Single Responsibility)
- **Files:** `nodes/IvantiNeuronsForITSM/transports/index.ts`, `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:274-318`
- The ~220-line transports/index.ts owns six unrelated reasons to change in one module: credential+URL construction (triplicated, see the tenant-URL finding), three request variants, two distinct pagination algorithms (count-then-page vs accumulate-to-limit) sitting beside the low-level request, status/error handling present only in ivantiApiRequest, and the IVantiApiError interface. Separate concerns: a buildRequestOptions/resolveBaseUrl helper used by all variants, a single uniformly-applied error mapper, and a pagination.ts that depends on the request abstraction. Relatedly, getMany.execute() also colocates input validation, the >100 transport-selection branching (a magic-number business rule), SearchResponse unwrapping, and metadata construction; factor the returnAll/limit/$top selection into one shared fetchRecords helper.

#### 🔵 40. [SearchResponse and encodeBasicAuth re-declared locally instead of imported from common.ts](./40-searchresponse-and-encodebasicauth-redeclared.md)

- **Severity:** Low | **Category:** DRY / Duplication | **Confidence:** high | **Status:** Confirmed
- **Raised by:** DRY / Duplication, Dead Code, Tests & Coverage
- **Files:** `nodes/IvantiNeuronsForITSM/actions/object/searchByKeyword.operation.ts:205-209`, `nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts:180-183`, `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnectorTrigger.node.ts:361-363`, `nodes/IvantiNeuronsForITSM/common.ts:40-56`
- common.ts exports SearchResponse (lines 40-44) and encodeBasicAuth (lines 54-56). searchByKeyword.operation.ts re-declares an identical, unused, exported SearchResponse (lines 205-209); getRelated.operation.ts declares GetRelatedResponse (lines 180-183) which is SearchResponse minus @odata.count; and ConnectorTrigger.node.ts re-declares a byte-identical private encodeBasicAuth (lines 361-363) used at line 297 instead of importing the shared one. Delete the local SearchResponse, reuse SearchResponse (or make @odata.count optional) for getRelated, and import encodeBasicAuth from common (consider moving truly cross-node helpers to a top-level shared module).

#### 🔵 41. [Authorization header and tenant baseURL test expression duplicated verbatim across both credentials](./41-credential-auth-and-baseurl-expression-duplicated.md)

- **Severity:** Low | **Category:** DRY / Duplication | **Confidence:** high | **Status:** Confirmed
- **Raised by:** DRY / Duplication
- **Files:** `credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts:55`, `credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:150`
- Both credential classes embed the identical authenticate header `Authorization: rest_api_key=<apiKey>` (ivantiNeuronsForItsmApiKeyApi.credentials.ts:55, IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:150) and an identical escape-heavy test.request.baseURL expression that strips protocol/trailing-slash and appends /HEAT (lines 62 and 159). Since credential expressions cannot import TS helpers, the risk is maintenance: a fix to the auth scheme or the tenant-normalization regex must be made in both, and kept in sync with the runtime buildBaseUrl helper. Factor the shared strings into exported consts in a credentials helper module or at minimum cross-link them with a comment.

#### 🔵 42. [Dead commented imports, stray scratch comment, unreachable parseValue branch, and explicit usableAsTool: undefined](./42-dead-code-comments-and-unreachable-branches.md)

- **Severity:** Low | **Category:** Dead Code | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Dead Code, n8n Node Conventions / UX Guidelines
- **Files:** `nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation.ts:12`, `nodes/IvantiNeuronsForITSM/actions/search/savedsearch.operation.ts:2`, `nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts:131`, `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:358`, `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:49`
- Several small dead-code items: quickAction/run.operation.ts:12 has a commented import for a non-existent path '../../transport/ivanti.rest.api' plus 4 stray leading blank lines; savedsearch.operation.ts:2 has a commented-out unused IDataObject import; getRelated.operation.ts:131 has a trailing scratch comment `///${relationship}`; parseValue's trailing `return null` (and the `Date` in the getMany return type) is unreachable since the UI only offers boolean/date/number/string (getMany.operation.ts:358, trigger 376); and both trigger nodes set `usableAsTool: undefined` (IvantiNeuronsForItsmTrigger.node.ts:49, ConnectorTrigger.node.ts:40), a no-op key (trigger nodes cannot be tools) that should be omitted. Remove these.

#### 🔵 43. [Orphan ivanti.svg icon and misspelled 'ivant-neurons-for-itsm' icon filenames](./43-orphan-and-misspelled-icons.md)

- **Severity:** Low | **Category:** Folder/File Structure & Naming | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Folder/File Structure & Naming
- **Files:** `nodes/IvantiNeuronsForITSM/ivanti.svg`, `icons/ivant-neurons-for-itsm.svg`, `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.ts:41`, `credentials/ivantiNeuronsForItsmApiKeyApi.credentials.ts:11`
- nodes/IvantiNeuronsForITSM/ivanti.svg is not referenced by any node/credential/package.json (grep finds no use) and is dead weight. Separately, the icon files icons/ivant-neurons-for-itsm.svg / .dark.svg misspell the vendor name ('ivant' missing the trailing 'i'); this typo is hard-coded into the main node and the API-key credential icon paths. (Note: the connector node, connector trigger, and connector credential reference icons/synergy.svg, which exists and is spelled correctly, so the misspelling is scoped to the two ivant-* references.) Delete the orphan svg and rename the icon files to 'ivanti-neurons-for-itsm.svg', updating the two references.

#### 🔵 44. [continueOnFail and includeInputFields output items omit pairedItem metadata](./44-continueonfail-missing-paireditem.md)

- **Severity:** Low | **Category:** Bugs / Correctness | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Bugs / Correctness
- **Files:** `nodes/IvantiNeuronsForITSM/actions/object/create.operation.ts:180-184`, `nodes/IvantiNeuronsForITSM/actions/relationship/getRelated.operation.ts:149-157`
- In continueOnFail branches the error item is pushed as `{ json: { error } }` with no pairedItem/itemData (create.operation.ts:180-184, update, getByRecId, getRelated, quickAction/run), and getRelated's includeInputFields path pushes a bare `{ json }` without pairedItem (getRelated.operation.ts:149-157), while the success paths use constructExecutionMetaData with itemData:{item:i}. Missing pairedItem breaks downstream item linking. Add `pairedItem: { item: i }` to these output objects.

#### 🔵 45. [Webhook returns 400 with WWW-Authenticate: Basic for all failures and echoes internal error detail](./45-webhook-401-vs-400-and-info-leak.md)

- **Severity:** Low | **Category:** Security | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Security
- **Files:** `nodes/IvantiNeuronsForItsmConnectorTrigger.node.ts:211-220`
- On any NodeOperationError the webhook responds 400 with 'WWW-Authenticate: Basic realm="Webhook"' (ConnectorTrigger.node.ts:211-220). Auth failures should be 401, and advertising Basic is incorrect when the configured mode is apiKey/header. Echoing error.message for every failure to an unauthenticated caller also discloses internal validation detail (missing-parameter names, transaction-state semantics). Return 401 for auth failures (Basic challenge only in base mode), 400 for malformed body, and a generic 'Unauthorized' for auth.

#### 🔵 46. [Credential 'Header' field documented as a header value but used as the header name](./46-header-auth-field-description-mismatch.md)

- **Severity:** Low | **Category:** Security | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Security
- **Files:** `credentials/IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:77-88`, `nodes/IvantiNeuronsForItsmConnectorTrigger.node.ts:305-311`
- In 'header' auth mode the credential's `header` property is described as 'The raw header value for the Header auth mode' (IvantiNeuronsForItsmConnectorAuthApi.credentials.ts:81), but the trigger uses it as the header NAME to look up (`headers[credentials.header]`) and compares against the separate webhookApiKey secret (ConnectorTrigger.node.ts:305-311). A user following the description will misconfigure the credential, weakening or breaking webhook auth. Fix the description/displayName to state it is the header NAME, and normalize to lowercase before lookup (n8n lowercases header keys) and reject an empty name.

#### 🔵 47. [tsconfig missing noUncheckedIndexedAccess/noUnusedParameters and disables useUnknownInCatchVariables; eslint config not extended](./47-tsconfig-missing-strict-flags.md)

- **Severity:** Low | **Category:** TypeScript Quality | **Confidence:** high | **Status:** Confirmed
- **Raised by:** TypeScript Quality
- **Files:** `tsconfig.json:9`, `eslint.config.mjs`
- strict:true is on but several high-value flags that would catch real issues here are absent: noUncheckedIndexedAccess (the code does displayType.split(' ')[1], contentDisposition.split('filename=')[1], match index access without guards) and noUnusedParameters (only noUnusedLocals is set). useUnknownInCatchVariables:false forces every catch to treat error as any (hence the ubiquitous (error as Error).message). eslint.config.mjs just re-exports the node-cli config with no project rules, so there is no second line of defence for the any/cast patterns. Add the two flags, consider removing useUnknownInCatchVariables:false, and extend eslint to flag unchecked any access.

#### 🔵 48. [package.json missing engines field; build:watch uses bare tsc and won't copy icon assets](./48-package-engines-and-buildwatch.md)

- **Severity:** Low | **Category:** Production Readiness | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Production Readiness
- **Files:** `package.json:22-30`
- There is no engines field, so npm/n8n cannot warn on unsupported Node versions even though CI pins lts/*. build and dev use the n8n-node CLI (which compiles AND copies non-TS assets like the SVG icons into dist), but build:watch uses bare `tsc --watch` (package.json:24), which won't copy the icons every node references via file:../../icons/..., so a developer using watch mode gets a dist missing icons. Add an engines field matching n8n's runtime and replace build:watch with `n8n-node dev` (or the CLI's watch) so dev and production outputs stay identical.

#### 🔵 49. [Return All / Limit field definitions inconsistent across operations (spurious required, stray noDataExpression)](./49-limit-field-inconsistencies.md)

- **Severity:** Low | **Category:** n8n Node Conventions / UX Guidelines | **Confidence:** high | **Status:** Confirmed
- **Raised by:** n8n Node Conventions / UX Guidelines
- **Files:** `nodes/IvantiNeuronsForITSM/actions/search/fulltextsearchinsingleobject.operation.ts:42-65`, `nodes/IvantiNeuronsForITSM/actions/object/searchByKeyword.operation.ts:39-54`
- The Return All/Limit pair is defined inconsistently: fulltextsearchinsingleobject marks both returnAll and limit required:true (a defaulted boolean never needs required, and Limit is hidden when returnAll is true yet still required); searchByKeyword puts noDataExpression:true on its Limit while getMany does not; no file sets maxValue. Standardize on the n8n pattern: boolean Return All without required; Limit with typeOptions { minValue: 1 }, no required, no noDataExpression, description 'Max number of results to return'.

#### 🔵 50. [Connector Trigger defaults.name drops 'Connector', colliding with the polling trigger label](./50-connector-trigger-defaults-name-collision.md)

- **Severity:** Low | **Category:** n8n Node Conventions / UX Guidelines | **Confidence:** high | **Status:** Confirmed
- **Raised by:** n8n Node Conventions / UX Guidelines
- **Files:** `nodes/IvantiNeuronsForItsmConnectorTrigger.node.ts:48`
- The webhook trigger's displayName is 'Ivanti Neurons for ITSM Connector Trigger' but its defaults.name is 'Ivanti Neurons for ITSM Trigger' (ConnectorTrigger.node.ts:48), dropping the distinguishing 'Connector' word and nearly colliding with the polling trigger's default on the canvas. Set defaults.name to match the displayName.

#### 🔵 51. [README 'Report Transaction' Status options and field name do not match the node](./51-readme-report-transaction-status-options.md)

- **Severity:** Low | **Category:** Documentation Accuracy (README/CHANGELOG) | **Confidence:** high | **Status:** Confirmed
- **Raised by:** Documentation Accuracy (README/CHANGELOG)
- **Files:** `README.md:778-780`, `nodes/IvantiNeuronsForItsmConnector/actions/automation/update.operation.ts:41-55`
- The README documents the Automation 'Report Transaction' Status dropdown as 'Completed, Failed, or Aborted' (README.md:778-780), but the node offers Pending/In Progress/Completed/Failed (update.operation.ts:41-46) — 'Aborted' is only a terminal-state guard, not selectable, and Pending/In Progress are omitted from the docs. The README also calls the field 'Job Result' while the node names it 'Result'. Update the docs to match.

#### 🔵 52. [Main node sets usableAsTool: true while exposing binary attachment operations tools cannot handle](./52-usableastool-true-with-binary-attachments.md)

- **Severity:** Low | **Category:** n8n Node Conventions / UX Guidelines | **Confidence:** medium | **Status:** Confirmed
- **Raised by:** n8n Node Conventions / UX Guidelines
- **Files:** `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.ts:50`, `nodes/IvantiNeuronsForITSM/actions/attachment/uploadAttachment.operation.ts`
- .agents/nodes.md says usableAsTool should be false/omitted when a node works heavily with binary data. The main node sets usableAsTool: true (IvantiNeuronsForItsm.node.ts:50) but the Attachment resource's Upload reads binary input (uploadAttachment.operation.ts) and Read returns binary output (readAttachment.operation.ts), which cannot pass/return correctly via the tool interface. Document this limitation, split binary operations into a separate node, or guard them.

#### 🔵 53. [Property/operation descriptions inconsistent: missing periods, mixed verb tense, ungrammatical phrasing](./53-descriptions-not-sentence-case.md)

- **Severity:** Low | **Category:** n8n Node Conventions / UX Guidelines | **Confidence:** high | **Status:** Confirmed
- **Raised by:** n8n Node Conventions / UX Guidelines
- **Files:** `nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:43`, `nodes/IvantiNeuronsForITSM/actions/object/getByRecId.operation.ts:27`, `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.ts:44`
- n8n UX guidelines want descriptions as full sentences ending with a period and operation descriptions in a consistent imperative form. Many here omit periods (getMany.operation.ts:43,53; node-level description), mix tenses across sibling options ('Retrieves...' vs 'Create...'), and include ungrammatical text ('Should be end \'s\'' in getByRecId.operation.ts:27). Normalize to sentence case with periods and a consistent imperative verb form.

