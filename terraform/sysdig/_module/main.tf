terraform {
  required_providers {
    sysdig = {
      source  = "sysdiglabs/sysdig"
      version = "~> 1.0"
    }
  }
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
    name   = "CPU Utilization (%)"

    query {
      unit   = "percent"
      promql = "avg(sysdig_container_cpu_used_percent) by (kube_namespace_label_environment, kubernetes_cluster_name)"
    }
  }

  panel {
    pos_x  = 0
    pos_y  = 6
    width  = 6
    height = 6
    type   = "timechart"
    name   = "Memory Usage (MiB)"

    query {
      unit   = "data"
      promql = "sum(sysdig_container_memory_used_bytes) by (kube_namespace_label_environment, kubernetes_cluster_name)"
    }
  }

  panel {
    pos_x  = 6
    pos_y  = 6
    width  = 6
    height = 6
    type   = "timechart"
    name   = "Network Throughput (bytes/s)"

    query {
      unit   = "data rate"
      promql = "sum(sysdig_container_net_out_bytes) by (kube_namespace_label_environment, kubernetes_cluster_name)"
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

resource "sysdig_monitor_alert_v2_prometheus" "high_cpu" {
  name        = "High CPU Utilization - ${var.workspace}"
  description = "CPU utilization has exceeded 85% for more than 5 minutes in a ${var.workspace} namespace"
  severity    = "high"

  query = "avg(sysdig_container_cpu_used_percent) by (kube_namespace_label_environment, kubernetes_cluster_name) > ${var.cpu_alert_threshold}"

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
  name        = "High Memory Utilization - ${var.workspace}"
  description = "Memory utilization has exceeded 80% for more than 5 minutes in a ${var.workspace} namespace"
  severity    = "high"

  query = "avg(sysdig_container_memory_used_percent) by (kube_namespace_label_environment, kubernetes_cluster_name) > ${var.memory_alert_threshold}"

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
