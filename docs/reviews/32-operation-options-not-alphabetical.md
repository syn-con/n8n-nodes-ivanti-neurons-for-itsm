# Finding 32: Operation options arrays not sorted alphabetically by display name

| Field | Value |
|---|---|
| Category | n8n Node Conventions / UX Guidelines |
| Severity | medium |
| Status | Confirmed |
| Confidence | high |
| Affected files | nodes/IvantiNeuronsForITSM/actions/attachment/index.ts:18-38, nodes/IvantiNeuronsForITSM/actions/serviceReq/index.ts:21-26, nodes/IvantiNeuronsForITSM/actions/search/index.ts:17-38 |

## Problem
n8n's UX guidelines and the bundled lint rule `n8n-nodes-base/node-param-options-type-unsorted-items` (delivered via `@n8n/node-cli/eslint`, which `eslint.config.mjs` re-exports verbatim) require the `options` array of an `options`/`multiOptions` parameter to be sorted alphabetically (case-insensitive `localeCompare`) by the `name` (display name) field. This package already follows that convention in three places:

- The Resource selector in `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.ts:64-87` is Attachment, Business Object, Quick Action, Relationship, Search, Service Request.
- The Business Object operations in `actions/object/index.ts:21-56` are Create, Delete By Record ID, Get By Record ID, Get Many, Search By Keyword, Update.
- The Relationship operations in `actions/relationship/index.ts:20-37` are Get Related, Link, Unlink.

Three operation lists break the convention.

1. Attachment — `nodes/IvantiNeuronsForITSM/actions/attachment/index.ts:18-38` is ordered Read, Upload, Delete:

```ts
options: [
    //get attachment
    {
        value: 'read',
        name: 'Read Attachment',
        ...
    },
    {
        value: 'upload',
        name: 'Upload Attachment',
        ...
    },
    {
        value: 'deleteOp',
        name: 'Delete Attachment',
        ...
    }
],
```

Alphabetical by name should be Delete Attachment, Read Attachment, Upload Attachment.

2. Service Request — `nodes/IvantiNeuronsForITSM/actions/serviceReq/index.ts:21-26`:

```ts
options: [
    { name: 'Create Service Request (Advanced)', value: 'create', action: 'Create a service request with advanced mode' },
    { name: 'Create Service Request', value: 'createSimplified', action: 'Create a service request' },
    { name: 'Get Subscription', value: 'getSubscription', action: 'Get a subscription' },
    { name: 'Get Service Request Parameters', value: 'getServiceReqParams', action: 'Get service request parameters' },
],
```

Two problems: `Create Service Request (Advanced)` is listed before `Create Service Request` (the bare string sorts first because `(` is compared against end-of-string), and `Get Subscription` is listed before `Get Service Request Parameters`. Correct order: Create Service Request, Create Service Request (Advanced), Get Service Request Parameters, Get Subscription.

3. Search — `nodes/IvantiNeuronsForITSM/actions/search/index.ts:17-38` lists `Full Text Search in Single Object` before `Full Text Search Across All Objects`:

```ts
options: [
    {
        name: 'Full Text Search in Single Object',
        value: 'fulltextsearchinsingleobject',
        ...
    },
    {
        name: 'Full Text Search Across All Objects',
        value: 'fulltextsearchacrossallobjects',
        ...
    },
    //saved search
    {
        name: 'Saved Search',
        value: 'savedsearch',
        ...
    }
],
```

`Across` sorts before `in`, so the correct order is Full Text Search Across All Objects, Full Text Search in Single Object, Saved Search.

## Why it matters
- Lint failure: `node-param-options-type-unsorted-items` is an error-level rule in the n8n base config. Because `eslint.config.mjs` is just `export default config;` from `@n8n/node-cli/eslint`, running `npx @n8n/node-cli lint` (or `eslint`) will report these three arrays as unsorted, blocking a clean lint and any n8n Cloud verification that gates on lint.
- UX inconsistency: the operation dropdowns appear in an arbitrary order while every other selector in the same node is alphabetical, making the operation list harder to scan.
- Maintainability: a mix of sorted and unsorted lists invites future drift and noisy diffs when someone "fixes" ordering ad hoc.

Note: reordering only changes display order; it does not change `value` strings, so existing saved workflows are unaffected. Where each array also declares a `default`, that `default` references a `value` (`'read'`, `'getSubscription'`, `'fulltextsearchinsingleobject'`) and therefore stays valid regardless of position.

## Resolution
Reorder each `options` array alphabetically by `name`. Do not change `value`, `default`, `action`, or `description` text. Reordering the corresponding `...x.description` spreads below each array is optional (it does not affect lint or runtime) but recommended for readability.

### 1. `nodes/IvantiNeuronsForITSM/actions/attachment/index.ts`

BEFORE (lines 18-38):

```ts
        options: [
            //get attachment
            {
                value: 'read',
                name: 'Read Attachment',
                description: 'Retrieve an existing attachment',
                action: 'Read an attachment',
            },
            {
                value: 'upload',
                name: 'Upload Attachment',
                description: 'Upload a new attachment',
                action: 'Upload an attachment',
            },
            {
                value: 'deleteOp',
                name: 'Delete Attachment',
                description: 'Delete an existing attachment',
                action: 'Delete an attachment',
            }
        ],
```

AFTER:

```ts
        options: [
            {
                value: 'deleteOp',
                name: 'Delete Attachment',
                description: 'Delete an existing attachment',
                action: 'Delete an attachment',
            },
            {
                value: 'read',
                name: 'Read Attachment',
                description: 'Retrieve an existing attachment',
                action: 'Read an attachment',
            },
            {
                value: 'upload',
                name: 'Upload Attachment',
                description: 'Upload a new attachment',
                action: 'Upload an attachment',
            },
        ],
```

`default: 'read'` (line 39) is unchanged and remains valid.

### 2. `nodes/IvantiNeuronsForITSM/actions/serviceReq/index.ts`

BEFORE (lines 21-26):

```ts
        options: [
            { name: 'Create Service Request (Advanced)', value: 'create', action: 'Create a service request with advanced mode' },
            { name: 'Create Service Request', value: 'createSimplified', action: 'Create a service request' },
            { name: 'Get Subscription', value: 'getSubscription', action: 'Get a subscription' },
            { name: 'Get Service Request Parameters', value: 'getServiceReqParams', action: 'Get service request parameters' },
        ],
```

AFTER:

```ts
        options: [
            { name: 'Create Service Request', value: 'createSimplified', action: 'Create a service request' },
            { name: 'Create Service Request (Advanced)', value: 'create', action: 'Create a service request with advanced mode' },
            { name: 'Get Service Request Parameters', value: 'getServiceReqParams', action: 'Get service request parameters' },
            { name: 'Get Subscription', value: 'getSubscription', action: 'Get a subscription' },
        ],
```

`default: 'getSubscription'` (line 27) is unchanged and remains valid.

### 3. `nodes/IvantiNeuronsForITSM/actions/search/index.ts`

BEFORE (lines 17-38):

```ts
        options: [

            {
                name: 'Full Text Search in Single Object',
                value: 'fulltextsearchinsingleobject',
                description: 'Searches a specific business object for the provided text',
                action: 'Perform a full text search in a single object',
            },
            {
                name: 'Full Text Search Across All Objects',
                value: 'fulltextsearchacrossallobjects',
                description: 'Searches all business objects for the provided text',
                action: 'Perform a full text search across all objects',
            },
            //saved search
            {
                name: 'Saved Search',
                value: 'savedsearch',
                description: 'Searches for a saved search by name and GUID',
                action: 'Perform a saved search',
            }
        ],
```

AFTER:

```ts
        options: [
            {
                name: 'Full Text Search Across All Objects',
                value: 'fulltextsearchacrossallobjects',
                description: 'Searches all business objects for the provided text',
                action: 'Perform a full text search across all objects',
            },
            {
                name: 'Full Text Search in Single Object',
                value: 'fulltextsearchinsingleobject',
                description: 'Searches a specific business object for the provided text',
                action: 'Perform a full text search in a single object',
            },
            //saved search
            {
                name: 'Saved Search',
                value: 'savedsearch',
                description: 'Searches for a saved search by name and GUID',
                action: 'Perform a saved search',
            },
        ],
```

`default: 'fulltextsearchinsingleobject'` (line 39) is unchanged and remains valid.

No shared helper or type needs to be created; these are pure data reorderings inside existing arrays.

## Verification
1. Install deps if needed (`npm install`), then run the package lint: `npx @n8n/node-cli lint` (or `npx eslint nodes/IvantiNeuronsForITSM/actions/attachment/index.ts nodes/IvantiNeuronsForITSM/actions/serviceReq/index.ts nodes/IvantiNeuronsForITSM/actions/search/index.ts`). Before the fix this reports `node-param-options-type-unsorted-items` errors on each of the three files; after the fix it reports none.
2. Build to confirm no type/regression: `npx @n8n/node-cli build` (or the project's `tsc` build). It should compile cleanly.
3. Manual check: open each operation dropdown in n8n and confirm Attachment shows Delete/Read/Upload; Service Request shows Create Service Request, Create Service Request (Advanced), Get Service Request Parameters, Get Subscription; Search shows Across All Objects, in Single Object, Saved Search. Confirm the previously selected default operation still loads (values were not changed).

## Related findings
None.
