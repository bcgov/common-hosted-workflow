module "sysdig" {
  source = "../_module"

  workspace                   = "c89a45"
  alert_email_recipients      = var.alert_email_recipients
  alert_webhook_url           = var.alert_webhook_url
  alert_webhook_authorization = var.alert_webhook_authorization
  cpu_alert_threshold         = 85
}

output "dashboard_id" {
  value = module.sysdig.dashboard_id
}

output "alert_ids" {
  value = module.sysdig.alert_ids
}

output "memory_alert_ids" {
  value = module.sysdig.memory_alert_ids
}
