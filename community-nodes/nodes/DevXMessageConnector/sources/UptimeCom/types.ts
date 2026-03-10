// See https://support.uptime.com/hc/en-us/articles/115002560845-Configuring-Custom-Postback-URL-Webhooks#h_01H9KPK2P2RF20ZKF4Y0B4G91P
// See https://support.atlassian.com/opsgenie/docs/integrate-opsgenie-with-uptime/#Sample-Webhook-Message-from-Opsgenie-Uptime.com

export interface MonitoringPayload {
  data: MonitoringData;
  event: string;
}

export interface MonitoringData {
  account: Account;
  service: Service;
  integration: Integration;
  date: string; // ISO 8601 Format
  alert: Alert;
  global_alert_state: GlobalAlertState;
  device: Device;
  locations: string[];
  links: Links;
}

export interface Account {
  id: number;
  name: string;
  brand: string;
  site_url: string;
}

export interface Service {
  id: number;
  name: string;
  device_id: number;
  monitoring_service_type: string;
  is_paused: boolean;
  msp_address: string;
  msp_interval: number;
  msp_sensitivity: number;
  msp_num_retries: number;
  msp_url_scheme: string;
  msp_url_path: string;
  msp_port: number;
  msp_protocol: string;
  msp_username: string;
  msp_dns_server: string;
  msp_dns_record_type: string;
  msp_send_string: string;
  msp_expect_string: string;
  msp_expect_string_type: string;
  msp_encryption: string;
  msp_threshold: number;
  msp_notes: string;
  msp_include_in_global_metrics: boolean;
  msp_use_ip_version: string;
  monitoring_service_type_display: string;
  display_name: string;
  short_name: string;
  tags: string[];
}

export interface Integration {
  id: number;
  name: string;
  module: string;
  module_verbose_name: string;
  is_enabled: boolean;
  is_errored: boolean;
  is_test_supported: boolean;
  postback_url: string;
  headers: string;
  use_legacy_payload: boolean;
}

export interface Alert {
  id: number;
  created_at: string;
  state: string;
  output: string;
  short_output: string;
  is_up: boolean;
}

export interface GlobalAlertState {
  id: number;
  created_at: string;
  num_locations_down: number;
  state_is_up: boolean;
  state_has_changed: boolean;
  ignored: boolean;
}

export interface Device {
  id: number;
  name: string;
  address: string;
  is_paused: boolean;
  display_name: string;
}

export interface Links {
  alert_details: string;
  real_time_analysis: string;
}
