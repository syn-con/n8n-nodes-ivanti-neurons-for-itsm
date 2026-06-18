# Finding 52: Main node sets usableAsTool: true while exposing binary attachment operations tools cannot handle

| Field | Value |
|---|---|
| Category | n8n Node Conventions / UX Guidelines |
| Severity | low |
| Status | Confirmed |
| Confidence | medium |
| Affected files | nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.ts:50, nodes/IvantiNeuronsForITSM/actions/attachment/uploadAttachment.operation.ts:101-109, nodes/IvantiNeuronsForITSM/actions/attachment/readAttachment.operation.ts:73-83 |

## Problem

The project rulebook `.agents/nodes.md:73-77` states:

```
- `usableAsTool`
  - Set to `true` to allow n8n to use this node as a tool for the AI
    agent.
  - Set to `false` or omit this if node works heavily with **binary
    data** which tools don't support
```

The main node opts in to tool usage unconditionally at `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.ts:50`:

```typescript
        outputs: ['main'],
        usableAsTool: true,
```

But the same node exposes an `Attachment` resource (`actions/attachment/index.ts`) whose `upload` and `read` operations work directly with binary data. The Upload operation **reads** binary input (`uploadAttachment.operation.ts:101-109`):

```typescript
            const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
            const fileBuffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

            const formData = new FormData();
            formData.append('businessObjectId', businessObjectId);
            formData.append('objectType', objectType.replace(/s$/, '#'));

            const blob = new Blob([fileBuffer], { type: binaryData.mimeType });
            formData.append('file', blob, binaryData.fileName ?? 'upload');
```

And the Read operation **returns** binary output (`readAttachment.operation.ts:73-83`):

```typescript
            const binaryData = await this.helpers.prepareBinaryData(
                response.body,
                attachmentName as string,
                contentType as string,
            );
            returnData.push({
                json: items[i].json,
                binary: {
                    data: binaryData,
                },
            });
```

When an AI agent calls a node as a tool, the interface only passes/returns JSON-serializable parameters and text. There is no binary item channel: the agent cannot supply a `binaryPropertyName` that points at real binary data, and any binary item the Read operation emits cannot be returned to the agent. So while these operations *appear* in the tool surface, they cannot function correctly through it. This is exactly the situation the rulebook warns against.

Note this is a single, multi-resource node, so the trade-off is real: the non-binary resources (Business Object, Relationship, Search, Service Request, Quick Action) are genuinely useful as agent tools, while only the two Attachment binary operations are unusable. Setting `usableAsTool: false` wholesale would disable the entire (mostly useful) node for agents, which is why the recommended resolution is to document/guard rather than blanket-disable.

## Why it matters

- **UX / correctness for AI agents**: An agent that picks the `upload` or `read` Attachment operation will fail or produce broken output, because binary data cannot cross the tool boundary. The failure is non-obvious to users building agent workflows.
- **Convention compliance**: Directly contradicts the documented project rule in `.agents/nodes.md:76-77`. If the package is submitted for n8n Cloud verification, reviewers apply the same UX guideline.
- This is low severity: it does not affect normal (non-tool) workflow execution and does not cause data loss; it only degrades the AI-tool experience for two of the node's operations.

## Resolution

There are three viable approaches. The recommended one (Option A) keeps the node usable as a tool for its JSON operations while clearly documenting the binary limitation; Option B is the strongest convention-compliant split; Option C is the simplest but blunt.

### Option A (recommended): keep `usableAsTool: true`, document the binary limitation

Make the limitation explicit in code comments and in the operation descriptions/hints so both maintainers and agent builders understand the constraint. Leave `usableAsTool: true` so the node remains useful as a tool for all JSON-only resources.

BEFORE — `nodes/IvantiNeuronsForITSM/IvantiNeuronsForItsm.node.ts:48-50`:

```typescript
        inputs: ['main'],
        outputs: ['main'],
        usableAsTool: true,
```

AFTER:

```typescript
        inputs: ['main'],
        outputs: ['main'],
        // Exposed as an AI-agent tool for all JSON-based resources (Business Object,
        // Relationship, Search, Service Request, Quick Action). NOTE: the Attachment
        // resource's "Upload" and "Read" operations move binary data, which cannot
        // cross the tool interface (see .agents/nodes.md). Those two operations are
        // only fully functional in normal (non-tool) workflow execution.
        usableAsTool: true,
```

Additionally, surface the constraint in the Attachment operation option descriptions so it is visible in the UI. BEFORE — `nodes/IvantiNeuronsForITSM/actions/attachment/index.ts:20-31`:

```typescript
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
```

AFTER:

```typescript
            {
                value: 'read',
                name: 'Read Attachment',
                description: 'Retrieve an existing attachment. Returns binary data, so this operation is not usable when the node is called as an AI-agent tool.',
                action: 'Read an attachment',
            },
            {
                value: 'upload',
                name: 'Upload Attachment',
                description: 'Upload a new attachment. Reads binary input, so this operation is not usable when the node is called as an AI-agent tool.',
                action: 'Upload an attachment',
            },
```

### Option B: split binary operations into a dedicated node

Move the Attachment `upload` and `read` operations into a separate node (e.g. `IvantiNeuronsForItsmAttachment`) that omits `usableAsTool` (defaults to not-a-tool), and keep the rest of the resources on the main node with `usableAsTool: true`. This is the cleanest match to the rulebook but is a larger refactor: it requires a new node file, a new `actions/router.ts` + `node.type.ts` for that node, and registering the new node path in `package.json` under `n8n.nodes`. Delete-attachment is JSON-only and could stay on the main node. Choose this only if a clean tool surface is a priority.

### Option C: guard binary operations at runtime when invoked as a tool

In both binary operations, detect tool invocation and fail fast with a clear message. n8n does not expose a stable public "am I a tool" flag, so this is the least reliable option and is **not recommended**; prefer Option A or B.

## Verification

1. Lint and build to confirm no regressions from the edits:
   - `npx n8n-node lint` (or the repo's configured lint script)
   - `npx n8n-node build` (or `npm run build`)
2. For Option A: open the node in the n8n editor, select the Attachment resource, and confirm the updated Read/Upload descriptions render. Confirm the node still appears in the AI Agent's tool list and that the JSON resources (e.g. Business Object → Read) function as a tool.
3. For Option B: confirm `package.json` `n8n.nodes` lists the new attachment node's compiled path, that both nodes appear in n8n, and that the new attachment node is NOT offered to the AI Agent as a tool.
4. Manual confirmation of the underlying limitation: add the main node as a tool to an AI Agent, instruct the agent to upload/read an attachment, and observe that binary data cannot be supplied/returned — confirming why these operations must be documented or split.

## Related findings

None.
