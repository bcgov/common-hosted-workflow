import type { DecisionTable } from '../../nodes/DmnDecisionTable/shared/types';

/** Generic discount-band table (FIRST): spend + tier -> discount + label. */
export function discountBandTable(): DecisionTable {
  return {
    decisionId: 'discountBand',
    hitPolicy: 'FIRST',
    inputs: [
      { name: 'spend', type: 'number' },
      { name: 'tier', type: 'string' },
    ],
    outputs: [
      { name: 'discount', type: 'number' },
      { name: 'label', type: 'string' },
    ],
    rules: [
      {
        inputEntries: [
          { inputName: 'spend', expression: '>=1000' },
          { inputName: 'tier', expression: '"gold"' },
        ],
        outputEntries: [
          { outputName: 'discount', value: '0.2' },
          { outputName: 'label', value: '"vip"' },
        ],
      },
      {
        inputEntries: [
          { inputName: 'spend', expression: '>=500' },
          { inputName: 'tier', expression: '' },
        ],
        outputEntries: [
          { outputName: 'discount', value: '0.1' },
          { outputName: 'label', value: '"standard"' },
        ],
      },
      {
        inputEntries: [
          { inputName: 'spend', expression: '' },
          { inputName: 'tier', expression: '"gold","silver"' },
        ],
        outputEntries: [
          { outputName: 'discount', value: '0.05' },
          { outputName: 'label', value: '"member"' },
        ],
      },
    ],
    defaultOutput: { discount: 0, label: 'none' },
  };
}

/** Generic shipping table exercising ranges, dates, negation and wildcards. */
export function shippingTable(): DecisionTable {
  return {
    decisionId: 'shipping',
    hitPolicy: 'FIRST',
    inputs: [
      { name: 'weight', type: 'number' },
      { name: 'shippedOn', type: 'date' },
      { name: 'region', type: 'string' },
    ],
    outputs: [{ name: 'fee', type: 'number' }],
    rules: [
      {
        inputEntries: [
          { inputName: 'weight', expression: '[0..5]' },
          { inputName: 'shippedOn', expression: '>=2026-01-01' },
          { inputName: 'region', expression: 'not("remote")' },
        ],
        outputEntries: [{ outputName: 'fee', value: '5' }],
      },
      {
        inputEntries: [
          { inputName: 'weight', expression: '(5..20]' },
          { inputName: 'shippedOn', expression: '-' },
          { inputName: 'region', expression: 'any' },
        ],
        outputEntries: [{ outputName: 'fee', value: '12' }],
      },
    ],
    defaultOutput: { fee: 25 },
  };
}

export const SAMPLE_DMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="sample" name="sample" namespace="urn:sample">
  <decision id="discountBand" name="discountBand">
    <decisionTable hitPolicy="FIRST">
      <input><inputExpression><text>spend</text></inputExpression></input>
      <input><inputExpression><text>tier</text></inputExpression></input>
      <output name="discount" typeRef="number" />
      <rule>
        <inputEntry><text>&gt;= 1000</text></inputEntry>
        <inputEntry><text>"gold"</text></inputEntry>
        <outputEntry><text>0.2</text></outputEntry>
      </rule>
      <rule>
        <inputEntry><text></text></inputEntry>
        <inputEntry><text></text></inputEntry>
        <outputEntry><text>0</text></outputEntry>
      </rule>
    </decisionTable>
  </decision>
  <decision id="other" name="other">
    <decisionTable hitPolicy="UNIQUE">
      <input><inputExpression><text>flag</text></inputExpression></input>
      <output name="result" typeRef="boolean" />
      <rule>
        <inputEntry><text>true</text></inputEntry>
        <outputEntry><text>true</text></outputEntry>
      </rule>
    </decisionTable>
  </decision>
</definitions>`;

/**
 * Camunda Modeler-style export: namespaced elements, display labels,
 * FEEL-qualified typeRefs, FEEL date() constructors in cells, and an
 * inputExpression path retained independently of its display label.
 */
export const NAMESPACED_DMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<dmn:definitions xmlns:dmn="https://www.omg.org/spec/DMN/20191111/MODEL/" id="ns" name="ns">
  <dmn:decision id="adultCheck" name="adultCheck">
    <dmn:decisionTable hitPolicy="FIRST">
      <dmn:input label="Age">
        <dmn:inputExpression typeRef="feel:integer"><dmn:text>applicant.age</dmn:text></dmn:inputExpression>
      </dmn:input>
      <dmn:input label="memberSince">
        <dmn:inputExpression typeRef="feel:date"><dmn:text>memberSince</dmn:text></dmn:inputExpression>
      </dmn:input>
      <dmn:output label="Band" name="band" typeRef="feel:string" />
      <dmn:rule>
        <dmn:inputEntry><dmn:text>&gt; 18</dmn:text></dmn:inputEntry>
        <dmn:inputEntry><dmn:text>&lt; date("2020-01-01")</dmn:text></dmn:inputEntry>
        <dmn:outputEntry><dmn:text>"senior"</dmn:text></dmn:outputEntry>
      </dmn:rule>
      <dmn:rule>
        <dmn:inputEntry><dmn:text>&gt; 18</dmn:text></dmn:inputEntry>
        <dmn:inputEntry><dmn:text>-</dmn:text></dmn:inputEntry>
        <dmn:outputEntry><dmn:text>"adult"</dmn:text></dmn:outputEntry>
      </dmn:rule>
    </dmn:decisionTable>
  </dmn:decision>
</dmn:definitions>`;

/** PRIORITY table with outputValues ordering: A outranks B outranks C. */
export const PRIORITY_DMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="pri" name="pri">
  <decision id="grading" name="grading">
    <decisionTable hitPolicy="PRIORITY">
      <input><inputExpression><text>score</text></inputExpression></input>
      <output name="grade" typeRef="string"><outputValues><text>"A", "B", "C"</text></outputValues></output>
      <rule>
        <inputEntry><text>&gt; 0</text></inputEntry>
        <outputEntry><text>"C"</text></outputEntry>
      </rule>
      <rule>
        <inputEntry><text>&gt; 80</text></inputEntry>
        <outputEntry><text>"A"</text></outputEntry>
      </rule>
    </decisionTable>
  </decision>
</definitions>`;

/** COLLECT table with a DMN aggregation attribute. */
export const COLLECT_SUM_DMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="agg" name="agg">
  <decision id="bonus" name="bonus">
    <decisionTable hitPolicy="COLLECT" aggregation="SUM">
      <input><inputExpression><text>years</text></inputExpression></input>
      <output name="points" typeRef="number" />
      <rule>
        <inputEntry><text>&gt; 1</text></inputEntry>
        <outputEntry><text>10</text></outputEntry>
      </rule>
      <rule>
        <inputEntry><text>&gt; 5</text></inputEntry>
        <outputEntry><text>25</text></outputEntry>
      </rule>
    </decisionTable>
  </decision>
</definitions>`;
