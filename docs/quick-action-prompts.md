# Quick Action prompt responses — issue #46

Quick Action → Run can now supply answers to prompted actions. It accepts a complete
**Prompt Parameters (JSON)** array and optional **Add Prompt Response** rows. Each row
has exactly two fields: **Field Name** and **Value**, both supporting n8n expressions.

## What was fixed

Previously, Run always sent `promptParams: null`. An authorized staging test of
`Resolve_Incident` returned HTTP 400 (`ISM_4000`) because prompt entries were missing.

The operation now reads the array for each input item, validates it, applies any
field/value overrides, and sends it as `PromptParams`. The complete metadata, array
order, hidden entries, and value types are preserved. Empty/default inputs still
send the original `promptParams: null` payload. A successful empty HTTP 200/204
response produces one empty JSON output item (`{}`), linked to its input item.

## Why the two fields need a template

Ivanti identifies prompts using more than their field names. A staging test with
entries generated only from field names, values, and the target record/action IDs
was rejected. Keeping the known action metadata and overriding only `Value` worked.

Set up **Prompt Parameters (JSON)** once for your actual action. Then use the
repeatable rows to map workflow variables without editing that metadata every time.
The node does not discover prompts, invent their metadata, or execute a preliminary
action to discover them.

For the tested Resolve Incident action, the UI asks only for Cause Code and
Resolution Details, but REST requires all five entries:

| FieldName | Value | Purpose |
| --- | --- | --- |
| `ActualCategory` | Current incident category | Hidden/pre-resolved entry |
| `ActualService` | Current incident service | Hidden/pre-resolved entry |
| `Status` | `Resolved` | Hidden action value |
| `CauseCode` | Your selected valid cause code | Visible answer |
| `Resolution` | Your resolution text | Visible answer |

Keep the three hidden entries in the template. Add only the two visible answer rows.
Other actions may need different metadata, record context, or sub-action identities;
use a payload known to belong to the selected action and current record.

## Using workflow variables

1. Select **Quick Action → Run**.
2. Set **Business Object**, **Record ID**, **Quick Action**, and **Quick Action ID**.
   Use the REST action name, for example `Resolve_Incident`, and that tenant's action
   ID. A business-rule name or toolbar label is not necessarily a callable action.
   Enable the credential's **Is On Prem** option when the API is under `/HEAT/api`.
3. Set **Prompt Parameters (JSON)** to the complete array, or switch it to Expression
   and use `{{ $json.promptParams }}` to receive that array from an upstream node.
   It must include `FieldName` and `Value` on every entry. Visible entries can use
   `Value: null` as placeholders when the rows below will replace them.
4. Click **Add Prompt Response** twice:

   | Field Name | Value, in Expression mode |
   | --- | --- |
   | `CauseCode` | `{{ $json.causeCode }}` |
   | `Resolution` | `{{ $json.generatedResolution }}` |

5. Run the workflow. Both fields and values are evaluated separately for each input
   item. The matching entry's `Value` is replaced; its other properties stay intact.

Field names must match `FieldName` exactly, including case. Use `Resolution`, not
the display label `Resolution Details`. A row must match exactly one template entry.
If a composite action has the same field on multiple sub-actions, set those entries'
values directly in JSON rather than using an ambiguous override row.

Literal input stays text: typing `false`, `0`, or `null` sends a string. To supply
their JSON types, use expressions such as `{{ false }}`, `{{ 0 }}`, or `{{ null }}`.
An empty string is a real answer. An undefined expression is rejected before the
request; it is not silently replaced with the old value.

For an AI Agent tool, the existing node remains usable as a tool. A Value expression
can use `{{ $fromAI('resolution', 'Resolution text for the incident', 'string') }}`.
Keep record/action metadata configured by the workflow. The full JSON parameter can
also be an expression. `$fromAI` is available only in an AI Agent tool context.

## Resolve Incident template example

This expression matches the definition exercised in the staging test. Check your
tenant's actual action before reusing it. It expects the input item to contain the
incident's `Category` and `Service`; the action and record IDs come from the node's
parameters. Do not reuse IDs captured from a different incident.

Paste the following into **Prompt Parameters (JSON)** in **Expression** mode, then
add the two response rows shown above:

```javascript
{{ (() => {
  const actionId = $parameter.quickActionId;
  const recordId = $parameter.recordId;
  const common = {
    __type: 'DataLayer.PromptData',
    ActionObjectType: 'Incident#',
    PromptObjectType: 'Incident#',
    PromptObjectId: recordId,
    IsNewPrompt: true,
  };
  const hidden = [
    ['ActualCategory', $json.Category],
    ['ActualService', $json.Service],
    ['Status', 'Resolved'],
  ].map(([FieldName, Value]) => ({
    ...common, ActionId: null, ActionObjectId: null,
    FieldName, Value, Hidden: true,
  }));
  const visible = [
    ['CauseCode', 'Select Cause Code', 'list', 'Incident Cause Code', 40],
    ['Resolution', 'Resolution Details', 'text', '', 4000],
  ].map(([FieldName, Label, FieldType, ValidList, FieldLength]) => ({
    ...common, ActionId: actionId, ActionObjectId: recordId,
    FieldName, Label, FieldType, ValidList, FieldLength, Value: null,
    Precision: 0, FieldAreaWidth: 400, FieldAreaHeight: 200,
    Password: false, Required: true, DefaultValue: '', Hidden: false,
  }));
  return [...hidden, ...visible];
})() }}
```

To use JSON without the response rows, supply the desired `Value` in each entry
directly. The entire array may be a literal JSON string or an evaluated array.
Blank input or `[]` means no prompts. An explicit top-level `null` is invalid;
`Value: null` inside an entry is allowed.

## Validation and output

- Invalid JSON, a non-array input, invalid entries, missing field names/values,
  undefined values, non-finite numbers, and circular data fail before that item's
  HTTP request. Error messages identify the item and the prompt/row position without
  printing the answer.
- Response rows require a template. Unknown, repeated, or ambiguous field names
  fail before sending. Entries and unknown metadata are never dropped or rebuilt.
- Text, boolean, numeric, null, and other JSON-compatible values retain their types.
- Existing header overrides, API-key authentication, error reporting, and
  Continue On Fail/item linking remain in place. The operation adds no retries.
- An empty success response returns `{}`. This confirms the request was accepted;
  read the record afterward when you need to verify the action's effect. Ivanti may
  normalize stored rich text: the live test converted a newline to `<br />`.

## Implementation and verification

- `nodes/IvantiNeuronsForITSM/actions/quickAction/run.operation.ts`: the two UI
  controls, per-item prompt handling, conditional payload casing, and empty output.
- `nodes/IvantiNeuronsForITSM/actions/quickAction/promptParameters.ts`: validation
  and immutable, unambiguous FieldName-to-Value overrides.
- `test/quickAction.test.ts`: request construction, old-workflow defaults, typed
  values, hidden/custom metadata, invalid inputs, expression evaluation, item
  linking, HTTP failures, empty success, and editor/tool property coverage.

On 2026-11-06, the compiled operation was exercised on a dedicated staging incident
using the real request builder/transport with curl as the HTTP adapter. A complete
five-entry template plus **only two response rows** returned HTTP 200 with an empty
body, emitted a valid linked `{}` item, and persisted Resolved status and both supplied
answers. The incident's customer and survey notification flags were false. The
fixture deliberately contained no real customer issue.

Automated tests also use n8n's expression evaluator to check per-item text, false,
zero, null, and empty-string answers. They do not replace an interactive editor or
AI Agent smoke test; those UI/agent workflows have not been exercised end to end.

Run the repository checks with `npm run lint`, `npx tsc --noEmit -p .`,
`npm run build`, and `npm test`. For an interactive n8n check, use the repository's
`npm run dev` command and configure the node as above with a disposable incident.

This is an additive optional feature. The empty/default request is unchanged, so no
new node type version is needed. A future package release should use a minor version
under this repository's release rules; this branch does not publish a package.

References: [issue #46](https://github.com/syn-con/n8n-nodes-ivanti-neurons-for-itsm/issues/46),
[Ivanti Quick Actions REST API](https://help.ivanti.com/ht/help/en_US/ISM/2026/Admin-User/Content/Configure/API/Quick-Actions-API.htm),
[n8n AI parameter expressions](https://docs.n8n.io/advanced-ai/examples/using-the-fromai-function/).
