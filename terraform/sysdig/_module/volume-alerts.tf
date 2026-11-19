locals {
  volume_namespace_scopes = {
    for environment, namespace in local.environment_namespaces : environment => {
      label    = namespace
      selector = "namespace=${jsonencode(namespace)},persistentvolumeclaim!=\"\""
    }
  }

  volume_component_scopes = {
    for pair in setproduct(keys(local.environment_namespaces), keys(var.alert_volume_claims)) : "${pair[0]}/${pair[1]}" => {
      label    = "${local.environment_namespaces[pair[0]]} (${pair[1]})"
      selector = "namespace=${jsonencode(local.environment_namespaces[pair[0]])},persistentvolumeclaim=~${jsonencode(var.alert_volume_claims[pair[1]])}"
    }
  }

  volume_alert_scopes = merge(local.volume_namespace_scopes, local.volume_component_scopes)
}

resource "sysdig_monitor_alert_v2_prometheus" "high_volume" {
  for_each = local.volume_alert_scopes

  name        = "High PVC Utilization - ${each.value.label}"
  description = "A persistent volume claim in ${each.value.label} is above ${var.volume_alert_threshold}% of its capacity for 5 minutes"
  severity    = "high"

  # Pair used and positive capacity samples from the same reporter before
  # collapsing multiple reports of the same claim. Keep the clusters distinct
  # and accept the Prometheus cluster label when Sysdig's label is not present.
  query = trimspace(<<-PROMQL
    max by (kube_cluster_name, namespace, persistentvolumeclaim) (
      100 * kubelet_volume_stats_used_bytes{${each.value.selector},kube_cluster_name!=""}
      / (kubelet_volume_stats_capacity_bytes{${each.value.selector},kube_cluster_name!=""} > 0)
      or label_replace(
        100 * kubelet_volume_stats_used_bytes{${each.value.selector},kube_cluster_name="",cluster!=""}
        / (kubelet_volume_stats_capacity_bytes{${each.value.selector},kube_cluster_name="",cluster!=""} > 0),
        "kube_cluster_name", "$1", "cluster", "(.+)"
      )
    ) > ${var.volume_alert_threshold}
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
