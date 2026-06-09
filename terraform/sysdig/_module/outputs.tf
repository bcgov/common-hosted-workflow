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
