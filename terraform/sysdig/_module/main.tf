terraform {
  required_providers {
    sysdig = {
      source  = "sysdiglabs/sysdig"
      version = "~> 3.0"
    }
  }
}

locals {
  environment_namespaces = {
    for environment in var.alert_environments : environment => "${var.workspace}-${environment}"
  }

  dashboard_selector = "kube_namespace_name=~${jsonencode(join("|", values(local.environment_namespaces)))}"
  namespace_labels   = "kube_cluster_name, kube_namespace_name"
  container_labels   = "${local.namespace_labels}, container_id"

  environment_scopes = {
    for environment, namespace in local.environment_namespaces : environment => {
      label    = namespace
      selector = "kube_namespace_name=${jsonencode(namespace)},container_id!=\"\""
      group_by = local.namespace_labels
    }
  }

  component_scopes = {
    for pair in setproduct(keys(local.environment_namespaces), keys(var.alert_workloads)) : "${pair[0]}/${pair[1]}" => {
      label    = "${local.environment_namespaces[pair[0]]} (${pair[1]})"
      selector = "${local.environment_scopes[pair[0]].selector},kube_workload_name=~${jsonencode(var.alert_workloads[pair[1]])}"
      group_by = "${local.namespace_labels}, kube_workload_name"
    }
  }

  alert_scopes = merge(local.environment_scopes, local.component_scopes)
}

resource "sysdig_monitor_dashboard" "cluster_health" {
  name        = "${var.workspace} Cluster Health"
  description = "Real-time CPU, memory, and network metrics for ${var.workspace} namespaces"

  panel {
    pos_x  = 0
    pos_y  = 0
    width  = 12
    height = 6
    type   = "timechart"
    name   = "CPU Usage (cores)"

    query {
      unit   = "number"
      promql = "sum by (${local.namespace_labels}) (sysdig_container_cpu_cores_used{${local.dashboard_selector}})"

      format {
        input_format            = "1"
        display_format          = "auto"
        y_axis                  = "auto"
        decimals                = 3
        null_value_display_mode = "nullGap"
      }
    }
  }

  panel {
    pos_x  = 0
    pos_y  = 6
    width  = 6
    height = 6
    type   = "timechart"
    name   = "Memory Usage"

    query {
      unit   = "data"
      promql = "sum by (${local.namespace_labels}) (sysdig_container_memory_used_bytes{${local.dashboard_selector}})"
    }
  }

  panel {
    pos_x  = 6
    pos_y  = 6
    width  = 6
    height = 6
    type   = "timechart"
    name   = "Outbound Network Throughput (bytes/s)"

    query {
      unit   = "data rate"
      promql = "sum by (${local.namespace_labels}) (rate(sysdig_container_net_out_bytes{${local.dashboard_selector}}[5m]))"
    }
  }
}

resource "sysdig_monitor_notification_channel_email" "alerts" {
  name                    = "${var.workspace} Alert Email"
  recipients              = var.alert_email_recipients
  share_with_current_team = true
}

resource "sysdig_monitor_notification_channel_webhook" "alerts" {
  count = (var.alert_webhook_url != null && var.alert_webhook_url != "") ? 1 : 0

  name                    = "${var.workspace} Alert Webhook"
  url                     = var.alert_webhook_url
  enabled                 = true
  share_with_current_team = true

  additional_headers = merge(var.alert_webhook_headers, { Authorization = var.alert_webhook_authorization })
}

# Reuse the previous workspace-wide alerts for the production namespace.
moved {
  from = sysdig_monitor_alert_v2_prometheus.high_cpu
  to   = sysdig_monitor_alert_v2_prometheus.high_cpu["prod"]
}

moved {
  from = sysdig_monitor_alert_v2_prometheus.high_memory
  to   = sysdig_monitor_alert_v2_prometheus.high_memory["prod"]
}

resource "sysdig_monitor_alert_v2_prometheus" "high_cpu" {
  for_each = local.alert_scopes

  name        = "High CPU Utilization - ${each.value.label}"
  description = "Peak container CPU usage in ${each.value.label} is above ${var.cpu_alert_threshold}% of its quota or fallback budget (${var.cpu_alert_fallback_cores} cores) for 5 minutes"
  severity    = "high"

  # Resolve the fallback per container before grouping so a limited sidecar
  # cannot mask usage by a request-only container in the same workload.
  query = trimspace(<<-PROMQL
    max by (${each.value.group_by}) (
      (sysdig_container_cpu_quota_used_percent{${each.value.selector}} >= 0)
      or on (${local.container_labels})
      (100 * sysdig_container_cpu_cores_used{${each.value.selector}} / ${var.cpu_alert_fallback_cores})
    ) > ${var.cpu_alert_threshold}
  PROMQL
  )

  duration_seconds = 300

  notification_channels {
    id = sysdig_monitor_notification_channel_email.alerts.id
  }

  dynamic "notification_channels" {
    for_each = sysdig_monitor_notification_channel_webhook.alerts[*].id
    content {
      id = notification_channels.value
    }
  }
}

resource "sysdig_monitor_alert_v2_prometheus" "high_memory" {
  for_each = local.alert_scopes

  name        = "High Memory Utilization - ${each.value.label}"
  description = "Peak container memory usage in ${each.value.label} is above ${var.memory_alert_threshold}% of its limit or fallback budget (${var.memory_alert_fallback_mib} MiB) for 5 minutes"
  severity    = "high"

  # Sysdig's memory limit defaults to zero for a container without a limit.
  query = trimspace(<<-PROMQL
    max by (${each.value.group_by}) (
      ((sysdig_container_memory_limit_used_percent{${each.value.selector}} >= 0)
       and on (${local.container_labels})
       (sysdig_container_memory_limit_bytes{${each.value.selector}} > 0))
      or on (${local.container_labels})
      (100 * sysdig_container_memory_used_bytes{${each.value.selector}} / ${var.memory_alert_fallback_mib * 1048576})
    ) > ${var.memory_alert_threshold}
  PROMQL
  )

  duration_seconds = 300

  notification_channels {
    id = sysdig_monitor_notification_channel_email.alerts.id
  }

  dynamic "notification_channels" {
    for_each = sysdig_monitor_notification_channel_webhook.alerts[*].id
    content {
      id = notification_channels.value
    }
  }
}
