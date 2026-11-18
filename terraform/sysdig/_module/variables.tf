variable "workspace" {
  description = "Workspace slug used to name and scope the Sysdig resources (e.g. b0c13b, c89a45)"
  type        = string
}

variable "alert_email_recipients" {
  description = "List of email addresses to notify on alerts"
  type        = list(string)
}

variable "alert_webhook_url" {
  description = "Webhook URL to receive alert callbacks; when unset, no webhook channel is created"
  type        = string
  default     = null
}

variable "alert_webhook_authorization" {
  description = "Value of the Authorization header sent with webhook notifications (mandatory when a webhook URL is configured)"
  type        = string
  sensitive   = true
  default     = null

  validation {
    condition     = (var.alert_webhook_url == null || var.alert_webhook_url == "") || (var.alert_webhook_authorization != null && trimspace(var.alert_webhook_authorization) != "")
    error_message = "alert_webhook_authorization must be set when alert_webhook_url is configured."
  }
}

variable "alert_webhook_headers" {
  description = "Optional additional custom headers sent with webhook notifications; the Authorization header is managed by alert_webhook_authorization and cannot be overridden"
  type        = map(string)
  default     = {}
}

variable "cpu_alert_threshold" {
  description = "CPU utilization percentage threshold to trigger the alert"
  type        = number
  default     = 85
}

variable "memory_alert_threshold" {
  description = "Memory utilization percentage threshold to trigger the alert"
  type        = number
  default     = 85
}
