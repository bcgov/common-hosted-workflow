output "dashboard_id" {
  description = "Sysdig Monitor dashboard ID"
  value       = sysdig_monitor_dashboard.cluster_health.id
}

output "alert_id" {
  description = "Sysdig Monitor CPU alert ID"
  value       = sysdig_monitor_alert_v2_prometheus.high_cpu.id
}

output "memory_alert_id" {
  description = "Sysdig Monitor memory alert ID"
  value       = sysdig_monitor_alert_v2_prometheus.high_memory.id
}

output "webhook_channel_id" {
  description = "Sysdig Monitor webhook notification channel ID (empty list when no webhook URL is configured)"
  value       = sysdig_monitor_notification_channel_webhook.alerts[*].id
}
