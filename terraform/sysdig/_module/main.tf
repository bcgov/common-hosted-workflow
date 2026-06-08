terraform {
  required_providers {
    sysdig = {
      source  = "sysdiglabs/sysdig"
      version = "~> 1.0"
    }
  }
}

resource "sysdig_monitor_dashboard" "cluster_health" {
  name        = "b0c13b Cluster Health"
  description = "Real-time CPU, memory, and network metrics for b0c13b namespaces"

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
  name                    = "b0c13b Alert Email"
  recipients              = var.alert_email_recipients
  share_with_current_team = true
}

resource "sysdig_monitor_alert_v2_prometheus" "high_cpu" {
  name        = "High CPU Utilization - b0c13b"
  description = "CPU utilization has exceeded 85% for more than 5 minutes in a b0c13b namespace"
  severity    = "high"

  query = "avg(sysdig_container_cpu_used_percent) by (kube_namespace_label_environment, kubernetes_cluster_name) > ${var.cpu_alert_threshold}"

  duration_seconds = 300

  notification_channels {
    id = sysdig_monitor_notification_channel_email.alerts.id
  }
}
