# Finding 36: README 'Endpoints Used' table does not match the code (paths, methods, casing, double /api prefix)

| Field | Value |
|---|---|
| Category | Documentation Accuracy (README/CHANGELOG) |
| Severity | medium |
| Status | Confirmed |
| Confidence | high |
| Affected files | `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/README.md:1379-1396`, `nodes/IvantiNeuronsForITSM/transports/index.ts:46,51,168,208`, `nodes/IvantiNeuronsForITSM/actions/object/update.operation.ts:181`, `nodes/IvantiNeuronsForITSM/actions/relationship/link.operation.ts:103-105`, `nodes/IvantiNeuronsForITSM/actions/relationship/unlink.operation.ts:104-106`, `nodes/IvantiNeuronsForITSM/actions/attachment/uploadAttachment.operation.ts:111`, `nodes/IvantiNeuronsForITSM/actions/attachment/readAttachment.operation.ts:63`, `nodes/IvantiNeuronsForITSM/actions/attachment/delete.operation.ts:48`, `nodes/IvantiNeuronsForITSM/actions/search/fulltextsearchinsingleobject.operation.ts:115,132`, `nodes/IvantiNeuronsForITSM/actions/search/fulltextsearchacrossallobjects.operation.ts:58`, `nodes/IvantiNeuronsForITSM/actions/search/savedsearch.operation.ts:91`, `nodes/IvantiNeuronsForITSM/actions/serviceReq/getSubscription.operation.ts:69-70`, `nodes/IvantiNeuronsForITSM/actions/serviceReq/create.operation.ts:234`, `nodes/IvantiNeuronsForITSM/actions/serviceReq/create.simplified.operation.ts:373` |

## Problem

The "Endpoints Used" table in `README.md` (lines 1379-1396) is wrong on nearly every relationship/attachment/search/service-request row when compared with what the code actually sends. It is also internally inconsistent about the `/api` prefix.

Current README table (`README.md:1381-1396`):

```markdown
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/odata/businessobject/{object}` | GET | Query records |
| `/odata/businessobject/{object}` | POST | Create record |
| `/odata/businessobject/{object}('{id}')` | GET | Get single record |
| `/odata/businessobject/{object}('{id}')` | PATCH | Update record |
| `/odata/businessobject/{object}('{id}')` | DELETE | Delete record |
| `/odata/businessobject/{object}('{id}')/{relationship}` | GET | Get related records |
| `/odata/businessobject/{object}('{id}')/{relationship}/$ref` | POST | Link records |
| `/odata/businessobject/{object}('{id}')/{relationship}/$ref` | DELETE | Unlink records |
| `/api/attachment` | POST | Upload attachment |
| `/api/attachment/{id}` | GET | Download attachment |
| `/api/attachment/{id}` | DELETE | Delete attachment |
| `/api/search/fulltext` | POST | Full-text search |
| `/api/servicereq/template` | GET | Get templates |
| `/api/servicereq` | POST | Create service request |
```

What the code actually does (verbatim excerpts):

1. **Update uses PUT, not PATCH.** `actions/object/update.operation.ts:180-182`:
   ```ts
   const response = await ivantiApiRequest.call(this,
       'PUT',
       fullUrl,
   ```
   (`fullUrl` = `/odata/businessobject/${object}('${recordId}')`, line 163.)

2. **Link is PATCH on a keyed `$Ref` path, not POST `$ref`.** `actions/relationship/link.operation.ts:103-105`:
   ```ts
   const url = `/odata/businessobject/${businessObject}('${recordId}')/${relationship}('${targetRecordId}')/$Ref`;
   const response = await ivantiApiRequest.call(this, 'PATCH', url, {}, undefined);
   ```

3. **Unlink is DELETE on the same keyed `$Ref` path.** `actions/relationship/unlink.operation.ts:104-106`:
   ```ts
   const url = `/odata/businessobject/${businessObject}('${recordId}')/${relationship}('${targetRecordId}')/$Ref`;
   const response = await ivantiApiRequest.call(this, 'DELETE', url, {}, undefined);
   ```

4. **Attachment upload is `POST /rest/Attachment`.** `actions/attachment/uploadAttachment.operation.ts:111`:
   ```ts
   const response = await ivantiApiRequestFormData.call(this, 'POST', '/rest/Attachment', formData);
   ```

5. **Attachment download is `GET /rest/Attachment?ID=...`.** `actions/attachment/readAttachment.operation.ts:63`:
   ```ts
   const response = await ivantiApiRequestBinary.call(this, 'GET', `/rest/Attachment?ID=${attachmentId}`);
   ```

6. **Attachment delete is `DELETE /rest/Attachment?ID=...`.** `actions/attachment/delete.operation.ts:48`:
   ```ts
   await ivantiApiRequest.call(this, 'DELETE', `/rest/Attachment?ID=${attachmentId}`, {}, undefined);
   ```

7. **Search is split into two endpoints, neither matches `/api/search/fulltext`.** Single object — `actions/search/fulltextsearchinsingleobject.operation.ts:115`:
   ```ts
   const response = await ivantiApiRequest.call(this, 'POST', '/rest/search/fulltext', {}, body);
   ```
   Across all objects — `actions/search/fulltextsearchacrossallobjects.operation.ts:58`:
   ```ts
   const responseAllData = await ivantiApiRequest.call(this, 'POST', `/rest/Search`, {}, {
   ```

8. **Saved search exists but is missing from the table.** `actions/search/savedsearch.operation.ts:91`:
   ```ts
   const response = await ivantiApiRequest.call(this, 'GET', `/odata/businessobject/${searchObject}/${savedSearchName}`, {}, { ActionId: savedSearchGUID });
   ```

9. **"Get templates" is actually subscriptions via `GET /rest/Template/{employeeId}/_All_`.** `actions/serviceReq/getSubscription.operation.ts:69-70`:
   ```ts
   const fullUrl = `${baseUrl}/${employeeId}/_All_`;
   const response = await ivantiApiRequest.call(this, 'GET', fullUrl, {}, undefined) as IDataObject[];
   ```
   (`baseUrl = "/rest/Template"`, line 14.)

10. **Create service request is `POST /rest/ServiceRequest/new`.** `actions/serviceReq/create.operation.ts:234` and `create.simplified.operation.ts:373`:
    ```ts
    const response = await ivantiApiRequest.call(this, 'POST', '/rest/ServiceRequest/new', {}, body);
    ```

11. **Double `/api` prefix.** The transport already prepends `/api` (or `/HEAT/api` on-prem) to every endpoint, so any README row written as `/api/...` is double-prefixed. `transports/index.ts:46,51`:
    ```ts
    const tenantPath = isOnPrem ? '/HEAT/api' : '/api';
    ...
    url: `https://${tenant}${tenantPath}${endpoint}`,
    ```
    The same prefixing is in `ivantiApiRequestFormData` (`:165,168`) and `ivantiApiRequestBinary` (`:204,208`). Every endpoint string passed in code starts at `/odata/...` or `/rest/...`, never `/api/...`.

In short: the only fully-correct rows are Query (GET), Create (POST), Get single (GET), Delete (DELETE), and Get related (GET). Every other row is wrong on path, method, casing, or the double prefix, and the saved-search endpoint is omitted entirely.

## Why it matters

This is a maintainability / documentation-accuracy problem, not a runtime bug. Concrete impact:

- Anyone using the README's API Reference to debug traffic, write tests, build a proxy/allowlist, or extend the node will look for endpoints (`/api/attachment`, `/api/search/fulltext`, `POST .../$ref`, `PATCH` update) that the code never calls, and will miss the ones it does (`/rest/Attachment`, `/rest/Search`, `/rest/ServiceRequest/new`, `/rest/Template/.../_All_`).
- The double `/api` rows would, if copied literally into a manual API test, produce `/api/api/...` URLs that 404, sending readers down a false debugging path.
- It undermines trust in the rest of the docs, since the table claims to document "Endpoints Used" but documents endpoints that are not used.

## Resolution

Rewrite the table in `README.md` so each row matches the exact path and method emitted by the code. Express paths relative to the base URL (the transport already adds `/api` or `/HEAT/api`), matching the "Base URLs" section just above it at `README.md:1367-1377`. Keep the OData key syntax `('{id}')` literally so readers see what the code builds.

BEFORE (`README.md:1381-1396`):

```markdown
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/odata/businessobject/{object}` | GET | Query records |
| `/odata/businessobject/{object}` | POST | Create record |
| `/odata/businessobject/{object}('{id}')` | GET | Get single record |
| `/odata/businessobject/{object}('{id}')` | PATCH | Update record |
| `/odata/businessobject/{object}('{id}')` | DELETE | Delete record |
| `/odata/businessobject/{object}('{id}')/{relationship}` | GET | Get related records |
| `/odata/businessobject/{object}('{id}')/{relationship}/$ref` | POST | Link records |
| `/odata/businessobject/{object}('{id}')/{relationship}/$ref` | DELETE | Unlink records |
| `/api/attachment` | POST | Upload attachment |
| `/api/attachment/{id}` | GET | Download attachment |
| `/api/attachment/{id}` | DELETE | Delete attachment |
| `/api/search/fulltext` | POST | Full-text search |
| `/api/servicereq/template` | GET | Get templates |
| `/api/servicereq` | POST | Create service request |
```

AFTER:

```markdown
> All paths below are relative to the base URL above. The node automatically
> prepends `/api` (cloud) or `/HEAT/api` (on-premises) to every path, so do **not**
> add `/api` yourself.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/odata/businessobject/{object}` | GET | Query records (Get Many) |
| `/odata/businessobject/{object}` | POST | Create record |
| `/odata/businessobject/{object}('{id}')` | GET | Get single record |
| `/odata/businessobject/{object}('{id}')` | PUT | Update record |
| `/odata/businessobject/{object}('{id}')` | DELETE | Delete record |
| `/odata/businessobject/{object}('{id}')/{relationship}` | GET | Get related records |
| `/odata/businessobject/{object}('{recordId}')/{relationship}('{targetId}')/$Ref` | PATCH | Link records |
| `/odata/businessobject/{object}('{recordId}')/{relationship}('{targetId}')/$Ref` | DELETE | Unlink records |
| `/odata/businessobject/{object}('{recordId}')/{quickAction}` | POST | Run quick action |
| `/odata/businessobject/{object}/{savedSearchName}?ActionId={guid}` | GET | Run saved search |
| `/rest/Attachment` | POST | Upload attachment (multipart/form-data) |
| `/rest/Attachment?ID={id}` | GET | Download attachment |
| `/rest/Attachment?ID={id}` | DELETE | Delete attachment |
| `/rest/search/fulltext` | POST | Full-text search in a single object |
| `/rest/Search` | POST | Full-text search across all objects |
| `/odata/businessobject/ServiceReqTemplateParams` | GET | Get service request template parameters |
| `/rest/Template/{employeeId}/_All_` | GET | Get service request subscriptions/templates |
| `/rest/ServiceRequest/new` | POST | Create service request |
```

Notes on the rewrite:
- Update method changed `PATCH` → `PUT` (`update.operation.ts:181`).
- Link/Unlink paths now include the keyed `('{targetId}')` segment and `$Ref` (capital R), with methods `PATCH`/`DELETE` (`link.operation.ts:103-105`, `unlink.operation.ts:104-106`).
- Attachment rows now use `/rest/Attachment` with the `?ID=` query form, no leading `/api` (`uploadAttachment.operation.ts:111`, `readAttachment.operation.ts:63`, `delete.operation.ts:48`).
- Search split into `/rest/search/fulltext` (single object) and `/rest/Search` (across all) (`fulltextsearchinsingleobject.operation.ts:115`, `fulltextsearchacrossallobjects.operation.ts:58`).
- Added the previously-undocumented saved-search row (`savedsearch.operation.ts:91`), the quick-action row (`quickAction/run.operation.ts:108,124`), the template-params row (`getServiceReqParams.operation.ts:55`), and the subscriptions/templates row (`getSubscription.operation.ts:69-70`).
- Service request creation row corrected to `POST /rest/ServiceRequest/new` (`create.operation.ts:234`, `create.simplified.operation.ts:373`).

The quick-action and template-params rows are optional additions for completeness; the load-bearing corrections are the relationship, attachment, search, and service-request rows plus the `PUT` update method and the `/api` double-prefix note.

If you bump the package version for this doc fix, also add a `CHANGELOG.md` entry per the project guideline in `AGENTS.md` ("If you are updating the npm package version, make sure to update CHANGELOG.md"). A pure doc edit without a version bump does not require a changelog entry.

## Verification

This is a documentation change, so verify by cross-checking against the code rather than a build:

1. Confirm every path/method in the new table matches the code by grepping the operation files:
   ```bash
   grep -rn "ivantiApiRequest\(Binary\|FormData\|AllItems\(WithLimit\)\?\)\?\.call(this," \
     /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/actions
   ```
   Each emitted `'METHOD', '<path>'` pair should appear as a row in the table; no `/api/...` literal should appear in any operation file.
2. Confirm the transport still owns the prefix (so the table's "no `/api`" note stays true):
   ```bash
   grep -n "tenantPath\|/HEAT/api\|\${tenant}\${tenantPath}\${endpoint}" \
     /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/transports/index.ts
   ```
3. Optionally run the repo's lint/build to make sure the README edit did not break any markdown-aware tooling:
   ```bash
   npm run lint
   npm run build
   ```
   (These do not validate README content but confirm nothing else regressed.)
4. Manual spot check: open `README.md` around line 1379 and confirm the "Update" row reads `PUT`, the Link/Unlink rows read `PATCH`/`DELETE` on `.../{relationship}('{targetId}')/$Ref`, the attachment/search/service-request rows use `/rest/...`, and no row begins with `/api/`.

## Related findings

None.
