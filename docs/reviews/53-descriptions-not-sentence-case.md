# Finding 53: Property/operation descriptions inconsistent: missing periods, mixed verb tense, ungrammatical phrasing

| Field | Value |
|---|---|
| Category | n8n Node Conventions / UX Guidelines |
| Severity | low |
| Status | Confirmed |
| Confidence | high |
| Affected files | nodes/IvantiNeuronsForITSM/actions/object/getMany.operation.ts:33,43,53,65,76; nodes/IvantiNeuronsForITSM/actions/object/getByRecId.operation.ts:27; nodes/IvantiNeuronsForITSM/actions/object/index.ts:24,30,36,42,48,54; nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.ts:44 |

## Problem
Three distinct issues with user-facing description text in the Business Object resource, all confirmed by reading the files.

**1. Ungrammatical phrasing.** `getByRecId.operation.ts:27`:

```ts
description: "The business object to retrieve, e.g., 'Incident'. Should be end 's' like 'Incidents' or 'Changes'.",
```

`"Should be end 's'"` is not grammatical English. (Note: the example value is also internally inconsistent — it says `'Incident'` then says the value should end in `s` like `'Incidents'`.)

**2. Missing trailing periods on parameter descriptions.** n8n's lint rule set (`@n8n/node-cli/eslint`, wired up in `eslint.config.mjs`) wants property `description` strings to read as full sentences ending with a period. Several in `getMany.operation.ts` omit it:

```ts
// line 33
description: "The business object to retrieve, e.g., 'Incident'",
// line 43
description: 'Whether to return all results or only up to a given limit',
// line 53
description: 'Max number of results to return',
// line 65
description: 'Whether to select all fields or not',
// line 76
description: 'The fields to select from the business object',
```

The node-level description is also bare (`IvantiNeuronsForItsm.node.ts:44`):

```ts
description: 'Interact with Ivanti Neurons for ITSM API',
```

**3. Mixed verb tense across sibling operation options.** In `actions/object/index.ts` the operation `description` fields mix imperative and third-person-singular forms for items in the same dropdown:

```ts
description: 'Create a record in a specified business object',          // imperative
description: 'Delete a record in a specified business object by its ID', // imperative
description: 'Retrieves a single record from a specified business object by its ID', // 3rd person
description: 'Retrieves many records from a specified business object',  // 3rd person
description: 'Searches for records in a specified business object by a keyword', // 3rd person
description: 'Update a record in a specified business object',          // imperative
```

The project's own convention doc shows the desired consistent imperative style (`.agents/nodes.md:99-102`): `description: 'Create a post'`, `'Get many posts'`, etc. — all imperative, no period (the period convention applies to *parameter* descriptions, not the short operation `name`/`action`/`description` summaries, which n8n keeps as short imperative fragments).

## Why it matters
Purely a polish / UX-consistency issue (severity low), but it has concrete consequences:

- **Lint/submission risk.** n8n's `eslint-plugin-n8n-nodes-base` enforces `node-param-description-miss-final-period` (and related) rules for parameter descriptions. Missing periods can surface as lint warnings/errors and are a common rejection reason during n8n Cloud community-node verification.
- **UI inconsistency.** Mixed tense ("Create a record" vs "Retrieves many records") reads as unpolished in the operation dropdown and tooltips users see.
- **Confusing copy.** `"Should be end 's'"` is broken English a user reads directly in the parameter hint, and the `'Incident'` vs `'Incidents'` mismatch actively contradicts the runtime validation (`if (!object.endsWith('s'))` in `getByRecId.operation.ts:72` and `getMany.operation.ts:284`), which rejects `Incident`.

## Resolution
Normalize all three. Parameter `description` strings → full sentences ending in a period; operation-option `description`/`action` short summaries → consistent imperative form (matching `.agents/nodes.md`); fix the broken sentence.

### Step 1 — Fix the ungrammatical / contradictory description in `getByRecId.operation.ts:27`

BEFORE:
```ts
        description: "The business object to retrieve, e.g., 'Incident'. Should be end 's' like 'Incidents' or 'Changes'.",
```
AFTER:
```ts
        description: "The plural name of the business object to retrieve. Must end in 's', e.g. 'Incidents' or 'Changes'.",
```

### Step 2 — Add trailing periods to parameter descriptions in `getMany.operation.ts`

Line 33 (also align the value with the `endsWith('s')` rule):
```ts
        // BEFORE
        description: "The business object to retrieve, e.g., 'Incident'",
        // AFTER
        description: "The plural name of the business object to retrieve, e.g. 'Incidents'.",
```
Line 43:
```ts
        // BEFORE
        description: 'Whether to return all results or only up to a given limit',
        // AFTER
        description: 'Whether to return all results or only up to a given limit.',
```
Line 53:
```ts
        // BEFORE
        description: 'Max number of results to return',
        // AFTER
        description: 'Max number of results to return.',
```
Line 65:
```ts
        // BEFORE
        description: 'Whether to select all fields or not',
        // AFTER
        description: 'Whether to select all fields or not.',
```
Line 76:
```ts
        // BEFORE
        description: 'The fields to select from the business object',
        // AFTER
        description: 'The fields to select from the business object.',
```

Note on the two `boolean` toggles: n8n's lint rule `node-param-description-boolean-without-whether` requires boolean descriptions to start with "Whether". Both already do (`returnAll`, `selectAllFields`), so only the period is added — do not rephrase them away from "Whether".

For consistency, also add periods to the remaining parameter descriptions in the same file that are full sentences, e.g. line 118 `'Name of the field to filter by'`, line 126 `'The type of the field'`, line 211 `'The value to compare the field against'`, line 231 `'Field to order results by'`, and the `getByRecId.operation.ts:37` record-ID description (already ends with a period — leave it).

### Step 3 — Make operation-option descriptions consistently imperative in `actions/object/index.ts`

BEFORE (lines 36, 42, 48):
```ts
                description: 'Retrieves a single record from a specified business object by its ID',
                ...
                description: 'Retrieves many records from a specified business object',
                ...
                description: 'Searches for records in a specified business object by a keyword',
```
AFTER (match the imperative form already used by Create/Update/Delete and by `.agents/nodes.md`):
```ts
                description: 'Get a single record from a specified business object by its ID',
                ...
                description: 'Get many records from a specified business object',
                ...
                description: 'Search for records in a specified business object by a keyword',
```
The corresponding `action` fields (lines 37, 43, 49) are already imperative (`'Get a record...'`, `'Get many records...'`, `'Search for records...'`) and need no change. Do not add periods to these short operation summaries — n8n keeps `name`/`action`/`description` for operation options as short imperative fragments, as shown in `.agents/nodes.md:99-102`.

### Step 4 — Add a trailing period to the node-level description in `IvantiNeuronsForItsm.node.ts:44`

BEFORE:
```ts
        description: 'Interact with Ivanti Neurons for ITSM API',
```
AFTER:
```ts
        description: 'Interact with the Ivanti Neurons for ITSM API.',
```

### Step 5 — Sweep the rest of the package for the same patterns
This finding cites the Business Object resource, but the same inconsistencies almost certainly exist in the sibling resources. Apply the same normalization to descriptions in `nodes/IvantiNeuronsForITSM/actions/{attachment,relationship,serviceReq,quickAction,search}/` and the second node `nodes/IvantiNeuronsForItsmConnector/`. Let the lint rule (Step in Verification) drive which ones need fixing rather than hand-auditing.

## Verification
1. Run the linter — this is the authoritative check, since the period rule is enforced by `@n8n/node-cli/eslint` (configured in `eslint.config.mjs`):
   ```bash
   npx n8n-node lint
   # or, equivalently
   npx eslint "nodes/**/*.ts" "credentials/**/*.ts"
   ```
   Confirm there are no `node-param-description-miss-final-period` (or related description) warnings on the touched files.
2. Build to ensure no TypeScript breakage from the string edits:
   ```bash
   npx n8n-node build
   ```
3. Manual grep to confirm the ungrammatical text and the inconsistent tense are gone:
   ```bash
   grep -rn "Should be end" nodes/        # expect: no matches
   grep -rn "Retrieves\|Searches" nodes/IvantiNeuronsForITSM/actions/object/index.ts  # expect: no matches
   ```
4. (Optional) Run the node in n8n dev mode (`npx n8n-node dev`) and visually confirm the Business Object operation dropdown tooltips and parameter hints read consistently.

## Related findings
None.
