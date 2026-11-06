# Create (Simplified): parameter types and dropdown answers

This guide covers the fix for [issue #17](https://github.com/syn-con/n8n-nodes-ivanti-neurons-for-itsm/issues/17).

## What was wrong

In **Service Request → Create (Simplified) → Manual**, the node looked for
`Dropdown`, `Picklist`, `List` or `Combo` anywhere in a parameter's displayed
name. A text field such as `ListName [Text]` therefore triggered a dropdown
lookup. If Ivanti returned an empty validation list, the node silently omitted
the answer—even when a required field had been filled in.

## How the fix works

The node reads `RecId` and `DisplayType` from the selected template's
`ServiceReqTemplateParams` metadata at execution time. A parameter's name or
saved mapper label no longer determines whether it is a dropdown.

- Text and other ordinary values are sent as `par-<parameter RecId>`.
- Real dropdowns still resolve an allowed display or alternate value to its
  RecId, sending both `par-<parameter RecId>` and `par-<parameter RecId>-recId`.
- A supplied dropdown answer with an empty validation list causes an error
  before the service request is submitted. Invalid answers also cause an error.
- Optional `null` or missing answers are omitted. An optional dropdown's empty
  string is omitted too; empty text, `false` and `0` are preserved.
- A supplied parameter whose type cannot be found causes an error asking you
  to refresh the Parameters fields.

The metadata lookup is paged for large templates. Types and validation lists
are cached for the current execution, separately for each template and set of
override headers. Each input item's answers are evaluated separately.

## Use it in a workflow

1. Install the package release that includes this fix, then restart n8n so it
   loads the updated node. Creating or merging the PR does not update an
   installed package automatically.
2. Select **Service Request → Create (Simplified)**.
3. Choose the template, set **Employee Login ID**, and select **Mode → Manual**.
4. Fill in the template's parameters. Literal values and n8n expressions both
   work. For example, use these expressions for a distribution-list offering:

   | Template parameter | Value in expression mode |
   |---|---|
   | `ListName` | `{{ $json.distributionListName }}` |
   | `ListMembers` | `{{ $json.members.join('\n') }}` |

5. Fill the offering's other required answers, using valid dropdown values,
   and execute the workflow.

There is no new toggle or node version to select. Existing saved mappings work
without renaming their fields or rebuilding the node. The runtime credential
must be allowed to read the template-parameter metadata, the same endpoint
used to populate the mapper in the editor.

## Empty or dependent dropdowns

The error `No validation options were returned for parameter '…'` means the
node cannot resolve the supplied answer to a valid RecId. Check the validation
list and any filters or dependencies in the Ivanti template.

This fix does not add support for passing dependent-field constraints to the
validation-list endpoint. A dropdown filtered by an earlier answer can still
return no options. The failure is now explicit rather than silently dropping
that answer.

For such an offering, **Mode → JSON** can carry a pair you have already obtained
from the correct, filtered validation list. Use the template parameter's RecId
in the property names and the selected option's RecId in the value:

```json
{
  "par-11111111111111111111111111111111": "Example department",
  "par-11111111111111111111111111111111-recId": "22222222222222222222222222222222",
  "par-33333333333333333333333333333333": "all-staff"
}
```

These are placeholder IDs. Replace them with the real IDs for the same offering
and include its other required answers. The JSON field is the inner parameters
object, not the whole service-request body. In JSON mode the node does not fetch
parameter types or resolve dropdown answers; it forwards the supplied object.

The fix also leaves the existing required-field and visibility rules unchanged.
It does not evaluate conditional form expressions or correct the separate
`RequiredExpression: "true"` versus `"$(true)"` mapper inconsistency observed
during reproduction. Ivanti can still reject an incomplete offering.

## Verification

[Regression tests](../test/serviceRequestSimplified.test.ts) exercise the actual
operation with saved and freshly loaded mapper schemas, misleading names,
dropdown validation failures, optional values, per-item expressions, caching,
override headers, metadata errors and JSON mode.

The fixed code was also checked against the staging **Create Distribution List**
template using live metadata and validation GET requests. `ListName` and
`ListMembers` remained in the captured request, a valid department retained its
value/RecId pair, and an empty dependent dropdown stopped submission with an
error. Every POST was intercepted locally: this validates request construction,
not successful creation of the complete offering in Ivanti.

Run the repository checks with:

```sh
npm run lint
npx tsc --noEmit -p .
npm run build
npm test
```
