module "sysdig" {
  source = "../_module"

  alert_email_recipients = var.alert_email_recipients
  cpu_alert_threshold    = 85
}

output "dashboard_id" {
  value = module.sysdig.dashboard_id
}

output "alert_id" {
  value = module.sysdig.alert_id
}
