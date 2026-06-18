# Finding 17: Connector action node JSDoc/name copied from main node, documents six resources it does not implement

| Field | Value |
|---|---|
| Category | Comments & Doc-Comment Accuracy |
| Severity | high |
| Status | Confirmed |
| Confidence | high |
| Affected files | /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnector.node.ts:11-25, /Users/tyrunasj/code/n8n-nodes-ivanti-neurons-for-itsm/nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnector.node.ts:36 |

## Problem

`IvantiNeuronsForItsmConnector.node.ts` carries a class-level JSDoc that was copied verbatim from the main node (`IvantiNeuronsForItsm.node.ts:20-33`). It claims the node is the "Main action node" exposing "all CRUD and search operations" across seven resources, six of which the Connector node never registers.

Connector node JSDoc (lines 11-25):

```ts
/**
 * Main action node for Ivanti Neurons for ITSM.
 *
 * Exposes all CRUD and search operations across the following resources:
 * - **Business Object** – create, read, update, delete, and keyword-search OData entities
 * - **Attachment** – upload, read, and delete file attachments
 * - **Relationship** – link, unlink, and traverse object relationships
 * - **Automation** – report transaction status back to an Ivanti automation job
 * - **Service Request** – create service requests, list subscriptions, and inspect parameters
 * - **Search** – full-text search (single object or global) and saved-search execution
 * - **Quick Action** – trigger a named quick action on a business-object record
 *
 * The node delegates execution to the {@link router} function, which dispatches to the
 * appropriate operation module based on the `resource` and `operation` parameters.
 */
```

In reality the Connector node registers exactly one resource and one operation. From the same file (lines 53-59):

```ts
options: [
    {
        name: 'Automation',
        value: 'automation',
    },
],
default: 'automation',
```

…and the only operation (from `actions/automation/index.ts:19`) is `Update Automation Transaction`. So Business Object, Attachment, Relationship, Service Request, Search, and Quick Action are all documented but absent.

Second defect, line 36 — `defaults.name` does not match the node's own `displayName`:

```ts
displayName: 'Ivanti Neurons for ITSM Connector',   // line 28
...
defaults: {
    name: 'Ivanti Neurons for ITSM',                 // line 36  <-- same as the main node
},
```

The main node (`IvantiNeuronsForItsm.node.ts:46`) also uses `name: 'Ivanti Neurons for ITSM'`, so both nodes drop onto the canvas with the identical default label.

## Why it matters

- Maintainability / correctness of docs: the JSDoc is the first thing a developer reads. It describes a node that does not exist, so anyone extending or debugging the Connector node is actively misled into expecting six resources and a `router` that dispatches across them. The Connector's `router` only ever handles `automation`.
- UX / n8n convention: `defaults.name` is the label shown on the workflow canvas when the node is added. With both the main action node and the Connector node defaulting to `'Ivanti Neurons for ITSM'`, a user who drops both onto a canvas sees two identically named nodes, which is confusing and violates the n8n UX guideline that the default name should reflect the node. The node's own `displayName` already distinguishes it ("...Connector"), so the mismatch is purely an oversight.

## Resolution

1. Replace the copied JSDoc (lines 11-25) with one that describes the Connector node's actual single-resource scope.

   BEFORE (`nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnector.node.ts:11-25`):

   ```ts
   /**
    * Main action node for Ivanti Neurons for ITSM.
    *
    * Exposes all CRUD and search operations across the following resources:
    * - **Business Object** – create, read, update, delete, and keyword-search OData entities
    * - **Attachment** – upload, read, and delete file attachments
    * - **Relationship** – link, unlink, and traverse object relationships
    * - **Automation** – report transaction status back to an Ivanti automation job
    * - **Service Request** – create service requests, list subscriptions, and inspect parameters
    * - **Search** – full-text search (single object or global) and saved-search execution
    * - **Quick Action** – trigger a named quick action on a business-object record
    *
    * The node delegates execution to the {@link router} function, which dispatches to the
    * appropriate operation module based on the `resource` and `operation` parameters.
    */
   ```

   AFTER:

   ```ts
   /**
    * Connector action node for Ivanti Neurons Workflow Automation.
    *
    * Exposes a single resource:
    * - **Automation** – report the outcome of an Ivanti automation transaction back to the
    *   platform (the `Update Automation Transaction` operation), setting its `Status`,
    *   `JobResult`, and a `ReturnPayload` containing the n8n execution URL for traceability.
    *
    * The node delegates execution to the {@link router} function, which dispatches to the
    * `automation` operation module based on the `resource` and `operation` parameters.
    */
   ```

2. Set `defaults.name` to match this node's `displayName` so the canvas label is distinct from the main node.

   BEFORE (`nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnector.node.ts:35-37`):

   ```ts
   defaults: {
       name: 'Ivanti Neurons for ITSM',
   },
   ```

   AFTER:

   ```ts
   defaults: {
       name: 'Ivanti Neurons for ITSM Connector',
   },
   ```

No shared helper/type is needed; both edits are local to `IvantiNeuronsForItsmConnector.node.ts`. The existing `description` field on line 34 (`"Interact with Ivanti Neurons Workflow Automation Block."`) already reflects the connector scope and does not need to change.

## Verification

1. Confirm the edits compile and lint cleanly:
   - `npm run build` (or `npx n8n-node build`) from the repo root — must finish without TypeScript errors.
   - `npm run lint` (or `npx n8n-node lint`) — must report no new errors/warnings for the file.
2. Manual confirmation of the doc/name correctness:
   - Open `nodes/IvantiNeuronsForItsmConnector/IvantiNeuronsForItsmConnector.node.ts` and verify the JSDoc now lists only the `Automation` resource, matching the single resource option at lines 53-59 and the single operation `Update Automation Transaction` in `actions/automation/index.ts:19`.
   - Verify `defaults.name` (line 36) now reads `'Ivanti Neurons for ITSM Connector'`, equal to `displayName` (line 28) and different from the main node's `defaults.name` (`IvantiNeuronsForItsm.node.ts:46`).
3. Optional UI check: load the package in n8n, add both the main and Connector nodes to a canvas, and confirm they now show distinct default labels.

## Related findings

None.
