# Table Source Examples

This page configures the same decision table with each **Table Source**. The examples select a shipping service from an order total:

| Order total | Shipping service | Shipping cost |
| ----------- | ---------------- | ------------- |
| `>= 100`    | `free`           | `0`           |
| `< 100`     | `standard`       | `10`          |
| No match    | `review`         | `null`        |

Use this input item to try any example:

```json
{
  "orderId": "A-1001",
  "orderTotal": 125
}
```

Keep **No Match Behavior** set to **Use Default Output** and **Output Mode** set to **Merge Into Item**. The resulting item is:

```json
{
  "orderId": "A-1001",
  "orderTotal": 125,
  "shippingService": "free",
  "shippingCost": 0
}
```

## Build Manually

Set the node properties as follows:

| Property      | Value              |
| ------------- | ------------------ |
| Table Source  | `Build Manually`   |
| Decision ID   | `shippingDecision` |
| Table Version | `1.0`              |
| Hit Policy    | `FIRST`            |

Add one **Input**:

| Name         | Type     | Value |
| ------------ | -------- | ----- |
| `orderTotal` | `Number` | Empty |

Leaving **Value** empty reads `orderTotal` from each input item's top-level JSON.

Add two **Outputs**:

| Name              | Type     |
| ----------------- | -------- |
| `shippingService` | `String` |
| `shippingCost`    | `Number` |

Add these **Rules** in order:

| Description                    | Input name   | Expression | Output name       | Value      | Output name    | Value |
| ------------------------------ | ------------ | ---------- | ----------------- | ---------- | -------------- | ----- |
| Free shipping for large orders | `orderTotal` | `>= 100`   | `shippingService` | `free`     | `shippingCost` | `0`   |
| Standard shipping              | `orderTotal` | `< 100`    | `shippingService` | `standard` | `shippingCost` | `10`  |

Add these **Default Output Entries**:

| Output name       | Value    |
| ----------------- | -------- |
| `shippingService` | `review` |
| `shippingCost`    | `null`   |

Each rule needs both output entries. The output values `free`, `standard`, and `review` can be bare text because `shippingService` is declared as a string.

## JSON

Set **Table Source** to **JSON** and paste the following into **Table JSON**:

```json
{
  "decisionId": "shippingDecision",
  "version": "1.0",
  "hitPolicy": "FIRST",
  "inputs": [
    {
      "name": "orderTotal",
      "type": "number"
    }
  ],
  "outputs": [
    {
      "name": "shippingService",
      "type": "string"
    },
    {
      "name": "shippingCost",
      "type": "number"
    }
  ],
  "rules": [
    {
      "description": "Free shipping for large orders",
      "inputEntries": [
        {
          "inputName": "orderTotal",
          "expression": ">= 100"
        }
      ],
      "outputEntries": [
        {
          "outputName": "shippingService",
          "value": "free"
        },
        {
          "outputName": "shippingCost",
          "value": "0"
        }
      ]
    },
    {
      "description": "Standard shipping",
      "inputEntries": [
        {
          "inputName": "orderTotal",
          "expression": "< 100"
        }
      ],
      "outputEntries": [
        {
          "outputName": "shippingService",
          "value": "standard"
        },
        {
          "outputName": "shippingCost",
          "value": "10"
        }
      ]
    }
  ],
  "defaultOutput": {
    "shippingService": "review",
    "shippingCost": null
  }
}
```

Leave **Default Output (JSON)** as `{}` to use the embedded `defaultOutput`. A non-empty value in that node property overrides the embedded value.

## DMN XML

Set **Table Source** to **DMN XML**, set **Decision ID** to `shippingDecision`, set **Table Version** to `1.0`, and paste the following into **DMN XML**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<definitions
  xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"
  id="shippingDefinitions"
  name="Shipping decisions"
  namespace="https://example.gov.bc.ca/dmn/shipping"
>
  <decision id="shippingDecision" name="Shipping Decision">
    <decisionTable id="shippingDecisionTable" hitPolicy="FIRST">
      <input id="input_order_total" label="Order total">
        <inputExpression id="expression_order_total" typeRef="number">
          <text>orderTotal</text>
        </inputExpression>
      </input>
      <output
        id="output_shipping_service"
        label="Shipping service"
        name="shippingService"
        typeRef="string"
      />
      <output
        id="output_shipping_cost"
        label="Shipping cost"
        name="shippingCost"
        typeRef="number"
      />
      <rule id="rule_free_shipping">
        <description>Free shipping for large orders</description>
        <inputEntry id="input_entry_free">
          <text>&gt;= 100</text>
        </inputEntry>
        <outputEntry id="service_entry_free">
          <text>free</text>
        </outputEntry>
        <outputEntry id="cost_entry_free">
          <text>0</text>
        </outputEntry>
      </rule>
      <rule id="rule_standard_shipping">
        <description>Standard shipping</description>
        <inputEntry id="input_entry_standard">
          <text>&lt; 100</text>
        </inputEntry>
        <outputEntry id="service_entry_standard">
          <text>standard</text>
        </outputEntry>
        <outputEntry id="cost_entry_standard">
          <text>10</text>
        </outputEntry>
      </rule>
    </decisionTable>
  </decision>
</definitions>
```

DMN XML import does not read default output entries, so set **Default Output (JSON)** separately:

```json
{
  "shippingService": "review",
  "shippingCost": null
}
```

The node selects a decision by matching **Decision ID** against the XML decision's `id` or `name`. If **Decision ID** is empty, it imports the first decision. Rule cells are positional in XML, so every rule must contain one `inputEntry` per input and one `outputEntry` per output.

## Reading Previous-Node Values

By default an input `name` is both the rule reference and the top-level `item.json` key. Change only the input declaration to read nested data; rules keep using the same `name`.

For a previous-node item like:

```json
{
  "orderId": "A-1001",
  "order": {
    "total": 125
  }
}
```

| Table Source   | Change this                                            | Example                                             |
| -------------- | ------------------------------------------------------ | --------------------------------------------------- |
| Build Manually | Input **Value** to `{{ $json.order.total }}`           | Name stays `orderTotal`                             |
| JSON           | Add `"expression": "order.total"` to the input         | Rules still use `"inputName": "orderTotal"`         |
| DMN XML        | Set `<text>order.total</text>` in the input expression | Imported `expression` reads `item.json.order.total` |

JSON declaration for the nested case:

```json
{
  "name": "orderTotal",
  "type": "number",
  "expression": "order.total"
}
```

To read from another node, use `{{ $('Get Order').item.json.order.total }}` as the manual **Value**. Manual **Value** resolves separately for each item; falsy-but-set values such as `0` and `false` still apply.

Use JSON `value` only for static constants. It takes precedence over `expression` and item lookup:

```json
{
  "name": "programYear",
  "type": "string",
  "value": "2026-27"
}
```

Do not put per-item `{{ $json... }}` inside **Table JSON** `value`. The JSON table resolves once from the first item, so that value freezes for the whole batch. For per-item data use manual **Input Value**, or reshape upstream with a Set/Code node.

## Try Other Inputs

| Input `orderTotal` | Expected decision output                                |
| ------------------ | ------------------------------------------------------- |
| `125`              | `{ "shippingService": "free", "shippingCost": 0 }`      |
| `75`               | `{ "shippingService": "standard", "shippingCost": 10 }` |
| `"not available"`  | `{ "shippingService": "review", "shippingCost": null }` |

For more expression forms, hit policies, and output modes, see the [DMN Decision Table overview](README.md) and [node operations](node-operations.md).
