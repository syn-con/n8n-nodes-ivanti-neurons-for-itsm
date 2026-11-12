# Quick Action prompts (issue #46)

Some quick actions ask questions before they run, for example the cause code and
resolution of Resolve Incident. Over REST the answers are sent as `PromptParams`.
In **Quick Action → Run** they go in **Prompt Parameters (JSON)**.

Blank or `[]` means no prompts, and the node sends `promptParams: null`, as it
always did.

## Prompt Parameters (JSON)

The complete prompt array, sent as written: array order, hidden entries, metadata
and value types are kept. Every entry needs a `FieldName` and a `Value` (`null` is
allowed). Write it as JSON text, or switch the field to Expression to fill in values
from the input, or pass a whole array with `{{ $json.promptParams }}`.

A simple entry for the record the action runs on:

```json
{
  "__type": "DataLayer.PromptData",
  "ActionId": null,
  "ActionObjectId": null,
  "PromptObjectId": "<Record ID>",
  "ActionObjectType": "Incident#",
  "PromptObjectType": "Incident#",
  "Value": "Closed",
  "FieldName": "Status",
  "IsNewPrompt": true
}
```

`FieldName` is the Ivanti field name, not the label on the form: `Resolution`, not
`Resolution Details`.

### Resolve Incident example

A staging test showed that Resolve Incident needs five entries over REST, although
the form shows only two questions. Entries built from field names and values alone
were refused; the visible ones need the action metadata.

| FieldName | Value | Purpose |
| --- | --- | --- |
| `ActualCategory` | Current incident category | Hidden entry |
| `ActualService` | Current incident service | Hidden entry |
| `Status` | `Resolved` | Hidden action value |
| `CauseCode` | A valid cause code | Visible answer |
| `Resolution` | The resolution text | Visible answer |

Paste this into **Prompt Parameters (JSON)** in **Expression** mode. It expects the
input item to contain the incident's `Category` and `Service`, a `causeCode` and a
`generatedResolution`; the action and record IDs come from the node's parameters.
Check your tenant's action before reusing it.

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
    ['CauseCode', 'Select Cause Code', 'list', 'Incident Cause Code', 40, $json.causeCode],
    ['Resolution', 'Resolution Details', 'text', '', 4000, $json.generatedResolution],
  ].map(([FieldName, Label, FieldType, ValidList, FieldLength, Value]) => ({
    ...common, ActionId: actionId, ActionObjectId: recordId,
    FieldName, Label, FieldType, ValidList, FieldLength, Value,
    Precision: 0, FieldAreaWidth: 400, FieldAreaHeight: 200,
    Password: false, Required: true, DefaultValue: '', Hidden: false,
  }));
  return [...hidden, ...visible];
})() }}
```

Set **Quick Action** to the REST action name (`Resolve_Incident`) and **Quick Action
ID** to that tenant's action ID. A toolbar label is not necessarily a callable action.
Enable the credential's **Is On Prem** option when the API is under `/HEAT/api`.

## Values

Literal text stays text: typing `false`, `0` or `null` sends a string. To send the
JSON value, use an expression such as `{{ false }}`, `{{ 0 }}` or `{{ null }}`. An
empty string is a real answer.

In an AI Agent tool, a value can be `{{ $fromAI('resolution', 'Resolution text for the incident', 'string') }}`.

## Validation and output

- An item is refused before its request when it gets invalid JSON, something
  other than an array, an entry without `FieldName` or `Value`, or a value JSON
  cannot carry (undefined, a non-finite number, circular data). The error names the
  entry, not its answer.
- Header overrides, API-key authentication, error reporting and Continue On Fail
  work as in the other operations. The action is never retried.
- A successful empty answer (HTTP 200 or 204) returns `{}`. Read the record afterward
  when you need to confirm the effect. Ivanti may change stored rich text: a newline
  came back as `<br />` in the staging test.

References: [issue #46](https://github.com/syn-con/n8n-nodes-ivanti-neurons-for-itsm/issues/46),
[Ivanti Quick Actions REST API](https://help.ivanti.com/ht/help/en_US/ISM/2026/Admin-User/Content/Configure/API/Quick-Actions-API.htm),
[n8n AI parameter expressions](https://docs.n8n.io/advanced-ai/examples/using-the-fromai-function/).
