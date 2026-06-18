# Finding 31: router uses `getNodeParameter<Ivanti>('resource', 0)` with the wrong generic argument

| Field | Value |
|---|---|
| Category | TypeScript Quality |
| Severity | medium |
| Status | Confirmed |
| Confidence | high |
| Affected files | `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/actions/router.ts:30-56`, `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForItsmConnector/actions/router.ts:26-39` |

## Problem

`IExecuteFunctions.getNodeParameter<T>(...)`'s type parameter `T` is the **return-value type** of that single parameter lookup. In both routers the generic is set to `Ivanti`, which is the full discriminated-union object type (`{ resource; operation }` via `AllEntities<NodeMap>`), even though the call only fetches the `resource` string.

`nodes/IvantiNeuronsForITSM/actions/router.ts:30-35`:

```ts
const resource = this.getNodeParameter<Ivanti>('resource', 0);
const operation = this.getNodeParameter('operation', 0);
const ivanti = {
	resource,
	operation,
} as Ivanti;
```

So `resource` is statically typed as the entire `Ivanti` object while at runtime it is a plain `string` (e.g. `'search'`). The code then rebuilds an object from `resource` + `operation` and force-casts the whole thing `as Ivanti`. That cast is what actually makes the `switch (ivanti.resource)` narrow `ivanti.operation` per-branch — the `<Ivanti>` generic contributes nothing correct; it is purely misleading.

Two concrete problems:

1. **Misleading generic.** `getNodeParameter<Ivanti>('resource', 0)` claims the result is an `Ivanti` object when it is a string. `operation` is left untyped (inferred `NodeParameterValueType`), so the two values being assembled into `ivanti` are inconsistent, and only the trailing `as Ivanti` keeps the build passing.

2. **No `default` branch in the main router (silent failure).** `nodes/IvantiNeuronsForITSM/actions/router.ts:37-56`:

```ts
switch (ivanti.resource) {
	case 'search':
		returnData = await search[ivanti.operation].execute.call(this);
		break;
	// ... businessobject, attachment, relationship, serviceReq, quickAction ...
	case 'quickAction':
		returnData = await quickAction[ivanti.operation].execute.call(this);
		break;
}
```

If an unrecognized `resource` ever arrives (typo in node properties, future resource added without a case), the `switch` falls through, `returnData` stays `[]`, and the node returns empty output with **no error** — a silent no-op that is hard to diagnose. The connector router (`nodes/IvantiNeuronsForItsmConnector/actions/router.ts:37-38`) already does the right thing with a `default` that throws, so the two routers are inconsistent.

> Note on the `businessobject` case: `node.type.ts` defines the resource key as `businessobject`, and `router.ts:41` matches `case 'businessobject'`. That is consistent and not part of this finding.

## Why it matters

- **Maintainability / type safety.** The generic argument lies about the runtime shape. A future maintainer reading `getNodeParameter<Ivanti>('resource', 0)` will reasonably assume `resource` is an object and may try `resource.operation`, which compiles but is `undefined` at runtime. The real type safety comes only from the `as Ivanti` cast, not from the generic, so the generic is dead weight that obscures intent.
- **Silent data loss in the main router.** An unknown `resource` produces empty output with no error, instead of failing loudly. This is exactly the class of bug that is painful in production workflows: downstream nodes receive nothing and the user has no indication why.
- **Inconsistency between the two routers.** One throws on unknown resources, the other silently returns `[]`. Aligning them removes a foot-gun and makes the dispatch open/closed-friendly.

## Resolution

Type the individual parameters as their primitives (`Ivanti['resource']` and `Ivanti['operation']`), keep the single `as Ivanti` on the assembled object, and add an explicit `default` branch that throws for unhandled resources.

### Step 1 — Fix the main node router

File: `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForITSM/actions/router.ts`

BEFORE (lines 30-56):

```ts
const resource = this.getNodeParameter<Ivanti>('resource', 0);
const operation = this.getNodeParameter('operation', 0);
const ivanti = {
	resource,
	operation,
} as Ivanti;

switch (ivanti.resource) {
	case 'search':
		returnData = await search[ivanti.operation].execute.call(this);
		break;
	case 'businessobject':
		returnData = await object[ivanti.operation].execute.call(this);
		break;
	case 'attachment':
		returnData = await attachment[ivanti.operation].execute.call(this);
		break;
	case 'relationship':
		returnData = await relationship[ivanti.operation].execute.call(this);
		break;
	case 'serviceReq':
		returnData = await serviceReq[ivanti.operation].execute.call(this);
		break;
	case 'quickAction':
		returnData = await quickAction[ivanti.operation].execute.call(this);
		break;
}
```

AFTER:

```ts
const resource = this.getNodeParameter<Ivanti['resource']>('resource', 0);
const operation = this.getNodeParameter<string>('operation', 0);
const ivanti = {
	resource,
	operation,
} as Ivanti;

switch (ivanti.resource) {
	case 'search':
		returnData = await search[ivanti.operation].execute.call(this);
		break;
	case 'businessobject':
		returnData = await object[ivanti.operation].execute.call(this);
		break;
	case 'attachment':
		returnData = await attachment[ivanti.operation].execute.call(this);
		break;
	case 'relationship':
		returnData = await relationship[ivanti.operation].execute.call(this);
		break;
	case 'serviceReq':
		returnData = await serviceReq[ivanti.operation].execute.call(this);
		break;
	case 'quickAction':
		returnData = await quickAction[ivanti.operation].execute.call(this);
		break;
	default:
		throw new NodeOperationError(
			this.getNode(),
			`The resource "${(ivanti as Ivanti).resource}" is not implemented`,
		);
}
```

Notes:
- `Ivanti['resource']` is the union of all resource string literals (`'search' | 'businessobject' | ...`), which is the actual runtime type, and still lets the `switch` narrow `ivanti.operation` per-branch thanks to the `as Ivanti` cast on the assembled object.
- `NodeOperationError` is already imported at `router.ts:2`, so no new import is needed. `NodeOperationError`'s second argument accepts a `string` message (as the connector router already relies on), so `new NodeOperationError(this.getNode(), \`...\`)` is valid. The `(ivanti as Ivanti).resource` cast in the message avoids the `never` type TypeScript infers for `ivanti` inside an exhaustive `default`.
- The existing outer `try/catch` at `router.ts:59-61` will re-wrap this throw, which is acceptable; the key behavioral change is that an unknown resource now fails loudly instead of returning `[]`.

### Step 2 — Align the connector router's generic

File: `/Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForItsmConnector/actions/router.ts`

This router already has a correct `default` branch (lines 37-38), so only the misleading generic needs fixing.

BEFORE (lines 26-31):

```ts
const resource = this.getNodeParameter<Ivanti>('resource', 0);
const operation = this.getNodeParameter('operation', 0);
const ivanti = {
	resource,
	operation,
} as Ivanti;
```

AFTER:

```ts
const resource = this.getNodeParameter<Ivanti['resource']>('resource', 0);
const operation = this.getNodeParameter<string>('operation', 0);
const ivanti = {
	resource,
	operation,
} as Ivanti;
```

No other change is required in the connector router; its `default` at line 37-38 already throws `Invalid resource: ...`.

### Optional (does not need to be done to close this finding)

The finding mentions a `resource -> module` map as a more open/closed alternative to the `switch`. That is a larger refactor (it would need a uniform typing for the operation modules, each of which currently exposes `description` and per-operation namespaces). Given the two-node scope here, the `switch` + explicit `default` throw above already removes the silent-failure risk and is the minimal, safe fix. A map-based dispatcher can be considered later but is out of scope for this correctness/type fix.

## Verification

1. Type-check / lint the package (the project standardizes on the `n8n-node` CLI per `AGENTS.md`):
   - `npx n8n-node lint` (or the repo's configured lint script in `package.json`), expecting no new errors/warnings.
   - `npx tsc --noEmit` (or the repo build) to confirm both routers still compile. The `Ivanti['resource']` generic must compile cleanly and the `switch` must still narrow `ivanti.operation` in each `case` (i.e. `search[ivanti.operation]`, `object[ivanti.operation]`, etc. must still type-check).
2. Confirm the new exhaustiveness behavior: temporarily set `resource` to a value not in the `switch` (or reason through it) and verify the main router now throws a `NodeOperationError` (`The resource "..." is not implemented`) instead of returning an empty array. Revert the temporary change afterwards.
3. Confirm no behavioral change for valid resources: a run with each existing resource (`search`, `businessobject`, `attachment`, `relationship`, `serviceReq`, `quickAction` on the main node; `automation` on the connector) still dispatches to the same operation module's `execute` as before.

## Related findings

None.
