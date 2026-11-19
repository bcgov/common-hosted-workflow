output "dashboard_id" {
  description = "Sysdig Monitor dashboard ID"
  value       = sysdig_monitor_dashboard.cluster_health.id
}

output "alert_ids" {
  description = "Sysdig Monitor CPU alert IDs keyed by environment or environment/component"
  value       = { for scope, alert in sysdig_monitor_alert_v2_prometheus.high_cpu : scope => alert.id }
}

output "memory_alert_ids" {
  description = "Sysdig Monitor memory alert IDs keyed by environment or environment/component"
  value       = { for scope, alert in sysdig_monitor_alert_v2_prometheus.high_memory : scope => alert.id }
}

output "volume_alert_ids" {
  description = "Sysdig Monitor PVC alert IDs keyed by environment or environment/component"
  value       = { for scope, alert in sysdig_monitor_alert_v2_prometheus.high_volume : scope => alert.id }
}

output "webhook_channel_id" {
  description = "Sysdig Monitor webhook notification channel ID (empty list when no webhook URL is configured)"
  value       = sysdig_monitor_notification_channel_webhook.alerts[*].id
}
