// See https://docs.sysdig.com/en/administration/configure-a-webhook-channel/#description-of-post-data

export interface SysdigAlertPayload {
  /** Time when the alert triggered in microseconds */
  timestamp: number;
  /** Range of the alert in microseconds */
  timespan: number;
  alert: SysdigAlertDetails;
  event: SysdigEvent;
  state: 'ACTIVE' | 'OK';
  resolved: boolean;
  entities: AlertEntity[];
  endEntities: AlertEntity[];
  condition: string;
  source: string;
  labels: Record<string, string>;
}

export interface SysdigAlertDetails {
  /** Severity level from 0 to 7 */
  severity: number;
  editUrl: string;
  severityLabel: 'Low' | 'Medium' | 'High' | 'Critical' | string;
  subject: string;
  scope: string | null;
  name: string;
  description: string | null;
  id: number;
  body: string;
}

export interface SysdigEvent {
  id: number;
  url: string;
}

export interface AlertEntity {
  entity: string;
  metricValues: MetricValue[];
}

export interface MetricValue {
  metric: string;
  aggregation: string;
  groupAggregation: string;
  value: number;
}
