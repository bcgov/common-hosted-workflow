# DMN Decision Table

The DMN Decision Table node evaluates a DMN-style decision table against each input item and writes the resulting outputs back to the item JSON. Tables can be built in the node UI, supplied as JSON, or imported from DMN 1.x XML exported by BPMN tools such as Camunda Modeler.

This is a standalone decision-table adapter with a limited expression language, not a full DMN/FEEL engine or visual BPMN modeler. The tests cover supported examples and regressions; they are not DMN conformance certification.

## Quick Start

1. Add the **DMN Decision Table** node.
2. Pick a **Table Source**: build **Manually**, paste **JSON**, or paste **DMN XML** and set **Decision ID**.
3. Declare **Inputs** (read from the item JSON by name, or set a per-input **Value** with a constant or expression such as `{{ $json.customer.status }}`) and **Outputs** (written to each item).
4. Add **Rules**. Rules are evaluated top to bottom; empty cells match anything.
5. Choose a **Hit Policy** for resolving multiple matches and a **No Match Behavior** for items no rule matches.

## Table Sources

- **Build Manually**: inputs, outputs, and rules are defined in the node UI. Hit policy and (for COLLECT) aggregation are separate options.
- **JSON**: the full table as `{ hitPolicy, inputs, outputs, rules, defaultOutput?, aggregation?, outputPriorities? }`. `hitPolicy` and `aggregation` are case-insensitive. A non-empty **Default Output (JSON)** parameter overrides the embedded `defaultOutput` (manual tables use **Default Output Entries** instead). Switching sources keeps each source's own draft — hidden parameters are preserved, not cleared.
- **DMN XML**: paste DMN 1.x XML. The decision matching **Decision ID** is imported (first decision when blank). Both default-namespace and `dmn:`-prefixed documents work. Input references are preserved separately from display labels: `applicant.age` reads `item.json.applicant.age`, even if the column label is `Age`. Names with spaces are supported; computed input expressions are rejected. Output `name` takes precedence over its label. Only `decisionTable` decisions are supported.

XML imports default to **UNIQUE** when `hitPolicy` is omitted (the DMN default); the manual UI defaults to **FIRST**. XML must be well formed and each rule must have exactly one cell per declared column. An explicitly empty input cell is a wildcard; an absent positional cell is an error.

JSON inputs may specify `{ "name": "Age", "type": "number", "expression": "applicant.age" }`. Without `expression`, the input name is an exact top-level JSON key. Path lookup only reads own properties and rejects prototype-related path segments. Declared types are informational; the matcher retains its documented string/number/boolean leniency.

JSON inputs also accept a static constant `value` (e.g. `{ "name": "programYear", "type": "string", "value": "2025-26" }`), which wins over item lookup and any `expression` path for that input. Missing, `null`, or empty-string values fall back to item lookup; `0` and `false` still apply. Constants resolve once with the table definition, so per-item expressions belong in manual Input Values instead — or reshape upstream with a Set/Code node.

## Hit Policies

| Policy       | Behaviour                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------ |
| FIRST        | First matching rule in table order wins                                                          |
| UNIQUE       | At most one rule may match; more than one is an error                                            |
| ANY          | Any number may match, but all matches must agree on outputs                                      |
| PRIORITY     | Highest-priority match wins, using `<outputValues>` ordering; without it behaves like FIRST      |
| COLLECT      | Gathers all matches as lists, or reduces them with an aggregation (`SUM`, `COUNT`, `MIN`, `MAX`) |
| RULE ORDER   | Gathers all matches as lists in rule order                                                       |
| OUTPUT ORDER | Gathers all matches ordered by output priority; without `<outputValues>` behaves like RULE ORDER |

## Cell Expressions

Input cells support the following expression subset. Use only these forms; this is not a complete FEEL parser:

- Wildcards: empty, `-`, `any`
- Equality: `"quoted"`, barewords, numbers, `true`/`false` (string `'true'`/`'false'` inputs match boolean cells)
- Explicit null: `null` matches only null/undefined input
- Ordered comparisons: `>`, `<`, `>=`, `<=` — numbers with numbers, ISO dates with dates, `HH:MM` times with times; mixing domains never matches
- Equality operators: `=`, `==`, `!=`, `<>` use the equality/coercion rules above; `!=` and `<>` negate equality
- Ranges: `[a..b]`, `(a..b)`, `[a..b)`, `(a..b]`
- Lists: `"a","b"` or `["a","b"]` — each option is a full test (`>5, <1` works); comma means OR
- Negation: `not(...)` around any of the above
- FEEL constructors: `date("2026-01-01")`, `time("09:00")`, `date and time("...")` (alias `datetime("...")`) unwrap one quoted or bare scalar literal
- Escapes: `\"`, `\'`, `\\` inside quoted strings

Unquoted FEEL boolean logic (`and`/`or`/`in`/`between`/...) is rejected loudly — quote such text to match it literally. Output values follow the declared output type: parsed as JSON, except `string`/`date` outputs also accept bare text (`premium` needs no quotes). `null` works for any type; anything else that does not fit the type throws.

Comparison operands, both range bounds, and constructor arguments use the same literal grammar as standalone equality: one complete quoted string, or bare text using letters/numbers, spaces and `_ . @ + / : -` (without FEEL keywords). Constructors accept a single scalar literal, including existing bare forms such as `date(2026-01-01)`; nested calls, lists, multiple arguments and computed arguments are unsupported. They remain literal wrappers, not full temporal validators.

Unsupported syntax such as `!= foo(bar)`, `not(> foo(bar))`, `[1..foo(bar)]` or `date(foo(bar))` raises an error when evaluated. All alternatives within an evaluated list are checked, even if an earlier alternative matches. To match function-like text literally, quote it: `"foo(bar)"` or `!= "foo(bar)"`. Syntactically valid but incomparable literals remain ordinary nonmatches for ordered comparisons/ranges; for example, `> "not-a-time"` and a number compared to `time("09:00")` return false. `not()` still negates that false result.

## No Match Behavior

- **Use Default Output**: emits the configured default (or nothing when empty). Resolution order per source: manual reads Default Output Entries, then the JSON default, then the embedded default; JSON/XML read the JSON default, then fitting entries, then the embedded default. Foreign entries apply only when every entry fits the current table, otherwise they are skipped — so configured defaults survive source switches.
- **Null Outputs**: sets every declared output to `null`.
- **Throw Error**: fails the item (recoverable per item with **Continue On Fail**).

The node-level default is resolved independently for each item. An empty object uses the JSON table's embedded default, if present. Every default key must name a declared output. An empty default on a later item never inherits an earlier item's node-level default.

Leaving Default Output Entries untouched (`{}`), omitted, or with an empty `definitions` array is supported for every source. Collections must otherwise contain the expected row array and object rows; malformed containers, unexpected collection options and nonstring text fields raise contextual errors when read. Well-formed foreign entries that do not fit the selected table still follow the source-switch fallback policy above.

## Errors and Item Pairing

Expression errors identify the one-based rule number and input name, for example `Rule 2 input "spend": Unsupported cell expression...`. Per-item expression, input-value and default errors stop execution unless **Continue On Fail** is enabled; with it, the failed item emits `{ "error": "..." }` and later items continue. Both errors and successful outputs retain input-item pairing. Invalid shared table structure (including malformed manual rule collections) fails before the item loop, even with Continue On Fail.

## Output Modes

- **Merge Into Item**: spreads result fields into the item JSON.
- **Single Result Key**: nests the result object under Result Key (replacing any existing field with that name).
- **Envelope With Metadata**: nests the whole envelope — `decisionId`, `tableVersion`, and the result object under `data` — under Result Key, e.g. `{ "spend": 1200, "band": { "decisionId": "discountBand", "tableVersion": "v1.2", "data": { "discount": 0.2 } } }`.
- An empty **Result Key** always merges into the item, regardless of mode; Merge Into Item ignores Result Key entirely.

Multi-hit output uses one array per declared output, e.g. `{ "grade": ["A", "B"], "fee": [10, 20] }`, rather than a DMN list of row contexts. Every rule must supply every declared output; use the JSON literal `null` where appropriate to preserve row alignment.

## Limitations

- Full FEEL is not evaluated. Arithmetic, general functions, FEEL contexts and complete temporal semantics are unsupported. Output cells accept JSON literals (`string`/`date` outputs also accept bare text), not FEEL output expressions. String coercion and null handling differ from strict FEEL semantics.
- PRIORITY and OUTPUT ORDER need output value ordering (`<outputValues>` in DMN XML, `outputPriorities` in JSON); otherwise they degrade to FIRST / RULE ORDER.
- Decision requirements (chained decisions/DRDs) are not followed — each decision is evaluated standalone against the item JSON.
- The table definition is resolved from the first input item for the batch. Result key and node-level defaults are resolved per item. The UI uses n8n collections, not a graphical DMN table editor.
- COLLECT aggregation is applied per output column, an extension to DMN's single-output aggregation restriction. COUNT counts matching output entries; string MIN/MAX use lexicographic ordering. The configured no-match policy takes precedence over aggregation on empty results.
- XML imports do not evaluate input-value constraints, XML default output entries, custom item definitions, or alternate expression languages. Review these constructs before migrating a model.

## Resource and Validation Limits

- XML: at most 5,000,000 characters; DOCTYPE declarations are rejected before parsing.
- Input cell expressions: at most 100,000 characters and 64 nesting levels.
- JSON output numbers must be finite; SUM overflow raises an error.
- FIRST stops after the first matching rule; later input and output expressions are not evaluated. Input tests within a rule stop on the first nonmatch, and outputs are parsed only for matching rules. Structural validation still runs on the whole table.

## More Information

- [Table source examples](table-source-examples.md)
- [Node operations](node-operations.md)
- [Release notes](release-notes.md)
