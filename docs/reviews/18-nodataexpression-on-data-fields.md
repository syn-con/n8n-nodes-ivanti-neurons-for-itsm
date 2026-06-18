# Finding 18: noDataExpression: true applied to value/data fields, disabling expression mapping

| Field | Value |
|---|---|
| Category | n8n Node Conventions / UX Guidelines |
| Severity | high |
| Status | Confirmed |
| Confidence | high |
| Affected files | nodes/IvantiNeuronsForITSM/actions/object/create.operation.ts:29,40,54; nodes/IvantiNeuronsForITSM/actions/object/getByRecId.operation.ts:26; nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation.ts:35,47,57,67; nodes/IvantiNeuronsForITSM/actions/object/searchByKeyword.operation.ts:27,36,43,68,77,92; nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:65 |

## Problem

The project rulebook (`.agents/nodes.md`) shows `noDataExpression: true` only on the **Resource** selector (line 55) and the **Operation** selector (line 92) — the two selectors whose value an expression would break because they drive the `displayOptions` show/hide routing. `.agents/properties.md` adds one further legitimate use, the `resourceMapper` type (line 142). It is applied nowhere else in the rulebook.

In this codebase `noDataExpression: true` has leaked onto ordinary **data input** fields across multiple operations. These are values the user (or an AI agent) will frequently want to set from an expression mapped off upstream data. Setting `noDataExpression: true` removes the `fx` (expression) toggle from the field in the editor, forcing a hard-coded literal.

Examples (verbatim from the repo):

`nodes/IvantiNeuronsForITSM/actions/object/create.operation.ts:23-30`
```ts
{
	displayName: "Business Object",
	name: "object",
	type: "string",
	default: "",
	required: true,
	noDataExpression: true,
	description: "The business object to create, e.g., 'Incident'. Should end with 's' like 'Incidents' or 'Changes'.",
},
```

Same file, the `mode` selector (line 40) and even the `fields` fixedCollection container (line 54) carry it:
```ts
{
	displayName: 'Fields',
	name: 'fields',
	placeholder: 'Add Field',
	type: 'fixedCollection',
	default: [],
	noDataExpression: true,
	...
```

`nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation.ts:31-39` — all four data fields (`businessObject`, `recordId`, `quickAction`, `quickActionId`) carry it:
```ts
{
	displayName: 'Business Object',
	name: 'businessObject',
	type: 'string',
	noDataExpression: true,
	required: true,
	default: '',
	description: 'The business object to run the quick action on',
},
```

`nodes/IvantiNeuronsForITSM/actions/object/searchByKeyword.operation.ts` — `object` (27), `returnAll` (36), `limit` (43), `selectAllFields` (68), the `selectFields` fixedCollection (77), and a **nested leaf** `name` field inside that collection (87-93):
```ts
{
	displayName: 'Name',
	name: 'name',
	type: 'string',
	default: 'Name',
	noDataExpression: true,

},
```

`nodes/IvantiNeuronsForITSM/actions/object/getByRecId.operation.ts:20-29` — `businessObject` carries it (the `recordId` field at line 32 correctly does **not**, which shows the inconsistency).

`nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts:59-68` — the trigger's `object` field:
```ts
{
	displayName: 'Business Object',
	name: 'object',
	type: 'string',
	default: 'Incidents',
	required: true,
	noDataExpression: true,
	placeholder: 'Incidents',
	description: "The plural OData entity name to poll, e.g. 'Incidents', 'Changes', 'Problems'",
},
```

**Important distinction — what should stay:** The `mode` field in `create.operation.ts:40` *does* drive `displayOptions` (it shows/hides `fields` vs `json`), so keeping `noDataExpression` on it is defensible per the same rationale as Operation. Likewise the nested `operation` selector inside the trigger's `odataFilter` collection (`IvantiNeuronsForItsmTrigger.node.ts:180`) drives the show/hide of the sibling `value` leaf (lines 200-204), so it is correctly kept. Those two are the *only* selector-style fields where the flag is justified; every other field listed above is a plain data input and the flag should be removed.

## Why it matters

- **Breaks expression mapping (UX):** Without the `fx` toggle, users cannot reference `{{ $json.object }}`, `{{ $node["..."] }}`, or any upstream value in these fields. They are stuck typing static literals, which defeats the purpose of a workflow automation node where the whole point is to pipe data between nodes.
- **Especially harmful for AI-agent use:** The main action node sets `usableAsTool: true` (`nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.ts:50`). When an LLM agent invokes the node as a tool, n8n maps the agent's chosen arguments into the node parameters via expressions. Fields with `noDataExpression: true` cannot receive `$fromAI(...)` / expression-driven values, so the agent effectively cannot drive `object`, `recordId`, `quickAction`, `searchText`, etc. — crippling the tool.
- **Convention violation:** It contradicts the authoritative `.agents/nodes.md` / `.agents/properties.md` guidance, which restricts the flag to Resource, Operation, and resourceMapper selectors.
- **Inconsistency / maintainability:** Within the same operation files some fields have it and some do not (e.g. `getByRecId` `businessObject` has it but `recordId` does not), signalling it was applied by copy/paste rather than intent.

## Resolution

Remove the `noDataExpression: true` line from every plain data/value field. Keep it only on (a) the top-level `resource` and `operation` option selectors (which already live in the resource/operation property files, not in these operation files), (b) the `mode` selector in `create.operation.ts` and (c) the nested `operation` selector in the trigger's `odataFilter` collection — both of which drive `displayOptions` routing.

### 1. `nodes/IvantiNeuronsForITSM/actions/object/create.operation.ts`

Remove from `object` (line 29) and the `fields` fixedCollection (line 54). Keep it on `mode` (line 40).

BEFORE (object field):
```ts
{
	displayName: "Business Object",
	name: "object",
	type: "string",
	default: "",
	required: true,
	noDataExpression: true,
	description: "The business object to create, e.g., 'Incident'. Should end with 's' like 'Incidents' or 'Changes'.",
},
```
AFTER:
```ts
{
	displayName: "Business Object",
	name: "object",
	type: "string",
	default: "",
	required: true,
	description: "The business object to create, e.g., 'Incident'. Should end with 's' like 'Incidents' or 'Changes'.",
},
```

BEFORE (fields collection):
```ts
{
	displayName: 'Fields',
	name: 'fields',
	placeholder: 'Add Field',
	type: 'fixedCollection',
	default: [],
	noDataExpression: true,
	typeOptions: {
		multipleValues: true,
	},
```
AFTER:
```ts
{
	displayName: 'Fields',
	name: 'fields',
	placeholder: 'Add Field',
	type: 'fixedCollection',
	default: [],
	typeOptions: {
		multipleValues: true,
	},
```

### 2. `nodes/IvantiNeuronsForITSM/actions/object/getByRecId.operation.ts`

Remove from `businessObject` (line 26).

BEFORE:
```ts
{
	displayName: "Business Object",
	name: "businessObject",
	default: "",
	type: "string",
	required: true,
	noDataExpression: true,
	description: "The business object to retrieve, e.g., 'Incident'. Should be end 's' like 'Incidents' or 'Changes'.",
	placeholder: "Incidents",
},
```
AFTER:
```ts
{
	displayName: "Business Object",
	name: "businessObject",
	default: "",
	type: "string",
	required: true,
	description: "The business object to retrieve, e.g., 'Incident'. Should be end 's' like 'Incidents' or 'Changes'.",
	placeholder: "Incidents",
},
```

### 3. `nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation.ts`

Remove from all four fields: `businessObject` (line 35), `recordId` (line 47), `quickAction` (line 57), `quickActionId` (line 67).

BEFORE (businessObject, representative):
```ts
{
	displayName: 'Business Object',
	name: 'businessObject',
	type: 'string',
	noDataExpression: true,
	required: true,
	default: '',
	description: 'The business object to run the quick action on',
},
```
AFTER:
```ts
{
	displayName: 'Business Object',
	name: 'businessObject',
	type: 'string',
	required: true,
	default: '',
	description: 'The business object to run the quick action on',
},
```
Apply the identical deletion (drop the `noDataExpression: true,` line) to `recordId`, `quickAction`, and `quickActionId`.

### 4. `nodes/IvantiNeuronsForITSM/actions/object/searchByKeyword.operation.ts`

Remove from `object` (line 27), `returnAll` (line 36), `limit` (line 43), `selectAllFields` (line 68), the `selectFields` fixedCollection (line 77), and the nested leaf `name` field (line 92).

BEFORE (nested name leaf — note the trailing blank line):
```ts
{
	displayName: 'Name',
	name: 'name',
	type: 'string',
	default: 'Name',
	noDataExpression: true,

},
```
AFTER:
```ts
{
	displayName: 'Name',
	name: 'name',
	type: 'string',
	default: 'Name',
},
```
Apply the same single-line deletion to `object`, `returnAll`, `limit`, `selectAllFields`, and the `selectFields` collection container.

### 5. `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsmTrigger.node.ts`

Remove from the `object` field (line 65). Keep the nested `operation` selector's flag (line 180) since it drives the `hide` rule on the sibling `value` field (lines 200-204).

BEFORE:
```ts
{
	displayName: 'Business Object',
	name: 'object',
	type: 'string',
	default: 'Incidents',
	required: true,
	noDataExpression: true,
	placeholder: 'Incidents',
	description: "The plural OData entity name to poll, e.g. 'Incidents', 'Changes', 'Problems'",
},
```
AFTER:
```ts
{
	displayName: 'Business Object',
	name: 'object',
	type: 'string',
	default: 'Incidents',
	required: true,
	placeholder: 'Incidents',
	description: "The plural OData entity name to poll, e.g. 'Incidents', 'Changes', 'Problems'",
},
```

No shared helper/type/module is required — these are localized property-definition edits.

## Verification

1. Grep to confirm only the legitimate occurrences remain:
   ```bash
   grep -rn "noDataExpression" /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/
   ```
   Expected remaining hits: the `resource` and `operation` selectors in the resource/operation property files, the `mode` field in `create.operation.ts`, and the nested `operation` selector in `IvantiNeuronsForItsmTrigger.node.ts` (line ~180). No `noDataExpression` should remain on `object`, `businessObject`, `recordId`, `quickAction`, `quickActionId`, `searchText`, `returnAll`, `limit`, `selectAllFields`, `selectFields`, or any leaf `name` field.
2. Build / lint (the `noDataExpression` change is type-safe, so this just confirms no syntax breakage):
   ```bash
   npx n8n-node build
   npx n8n-node lint
   ```
   or, per `package.json` scripts, `npm run build` and `npm run lint`.
3. Manual UI check (dev mode via `npx n8n-node dev`): open the Ivanti Neurons for ITSM action node, select the Create / Get By Record ID / Quick Action / Search By Keyword operations, and confirm each data field now shows the `fx` expression toggle. Repeat for the Polling Trigger's Business Object field.

## Related findings

None.
