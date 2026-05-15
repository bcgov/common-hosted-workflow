import { describe, expect, it } from 'vitest';

import {
  createExecutionContext,
  createNode,
  executeNode,
  expectPostedToDevX,
  getSentContent,
  setupDevXConnectorEnv,
} from './helpers';

const sysdigSuccessPayload = {
  timestamp: 1620222000000000,
  timespan: 60000000,
  alert: {
    severity: 2,
    editUrl: 'https://app-staging.sysdigcloud.com/#/alerts/21998727',
    severityLabel: 'Medium',
    subject: 'CPU temp is High on homebridge:9100 is Triggered',
    scope: null,
    name: 'CPU temp is High',
    description: null,
    id: 21998727,
    body: `CPU temp is High on homebridge:9100 is Triggered


Event Generated:

Severity:         Medium
    Metric:
    node_hwmon_temp_celsius = 65.8121
Segment:
    instance = 'homebridge:9100'
Scope:
    Everywhere

Time:             05/05/2021 01:40 PM UTC
State:            Triggered
Notification URL: https://app-staging.sysdigcloud.com/#/events/notifications/l:2419200/14918845/details

------

Triggered by Alert:

Name:         CPU temp is High
Team:         Monitor Operations
Scope:
    Everywhere
Segment by:   instance
When:         avg(avg(node_hwmon_temp_celsius)) > 40
For at least: 1 m
Alert URL:    https://app-staging.sysdigcloud.com/#/alerts/21998727


`,
  },
  event: {
    id: 14918845,
    url: 'https://app-staging.sysdigcloud.com/#/events/notifications/l:604800/14918845/details',
  },
  state: 'ACTIVE' as const,
  resolved: true,
  entities: [
    {
      entity: "instance = 'homebridge:9100'",
      metricValues: [
        {
          metric: 'node_hwmon_temp_celsius',
          aggregation: 'avg',
          groupAggregation: 'avg',
          value: 65.812167,
        },
      ],
    },
  ],
  endEntities: [
    {
      entity: "instance = 'homebridge:9100'",
      metricValues: [
        {
          metric: 'node_hwmon_temp_celsius',
          aggregation: 'avg',
          groupAggregation: 'avg',
          value: 39.812167,
        },
      ],
    },
  ],
  condition: 'avg(avg(node_hwmon_temp_celsius)) > 40',
  source: 'Sysdig Cloud',
  labels: {
    instance: 'homebridge:9100',
  },
};

const expectedSysdigContent = {
  kind: 'template',
  template: 'sysdig',
  data: {
    severity: 2,
    state: 'active',
    alertName: 'CPU temp is High',
    scope: undefined,
    description: undefined,
    timestamp: '2021-05-05T13:40:00Z',
    url: 'https://app-staging.sysdigcloud.com/#/alerts/21998727',
  },
};

describe('DevXMessageConnector sysdig', () => {
  setupDevXConnectorEnv();

  it('maps a full sysdig success payload into the sysdig template', async () => {
    const { requestOptions } = await executeNode([
      {
        type: 'template',
        source: 'sysdig',
        payload: sysdigSuccessPayload,
      },
    ]);

    expectPostedToDevX(requestOptions);
    expect(getSentContent(requestOptions)).toEqual(expectedSysdigContent);
  });

  it('parses stringified sysdig success payloads', async () => {
    const { requestOptions } = await executeNode([
      {
        type: 'template',
        source: 'sysdig',
        payload: JSON.stringify(sysdigSuccessPayload),
      },
    ]);

    expectPostedToDevX(requestOptions);
    expect(getSentContent(requestOptions)).toEqual(expectedSysdigContent);
  });

  it('throws when a sysdig payload fails schema validation', async () => {
    const node = createNode();
    const context = createExecutionContext([
      {
        type: 'template',
        source: 'sysdig',
        payload: {
          ...sysdigSuccessPayload,
          alert: {
            ...sysdigSuccessPayload.alert,
            editUrl: 'not-a-url',
          },
        },
      },
    ]);

    await expect(node.execute.call(context as never)).rejects.toThrow();
    expect(context.helpers.httpRequest).not.toHaveBeenCalled();
  });
});
