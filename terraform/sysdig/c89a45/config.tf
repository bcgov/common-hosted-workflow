terraform {
  required_version = "~> 1.15"

  required_providers {
    sysdig = {
      source  = "sysdiglabs/sysdig"
      version = "~> 1.0"
    }
  }

  backend "kubernetes" {
    namespace     = "c89a45-tools"
    secret_suffix = "sysdig-state" # pragma: allowlist secret
    config_path   = "~/.kube/config"
  }
}

provider "sysdig" {
  sysdig_monitor_api_token = var.sysdig_monitor_api_token
}

variable "sysdig_monitor_api_token" {
  description = "Sysdig Monitor API token — inject via TF_VAR_sysdig_monitor_api_token environment variable"
  type        = string
  sensitive   = true
}

variable "alert_email_recipients" {
  description = "Email addresses to notify on alerts — inject via TF_VAR_alert_email_recipients environment variable"
  type        = list(string)
}

variable "alert_webhook_url" {
  description = "Webhook URL to receive alert callbacks — inject via TF_VAR_alert_webhook_url environment variable (optional)"
  type        = string
  default     = null
}

variable "alert_webhook_authorization" {
  description = "Value of the Authorization header for webhook notifications — inject via TF_VAR_alert_webhook_authorization environment variable (mandatory when alert_webhook_url is set)"
  type        = string
  sensitive   = true
  default     = null
}
