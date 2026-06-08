variable "alert_email_recipients" {
  description = "List of email addresses to notify on alerts"
  type        = list(string)
}

variable "cpu_alert_threshold" {
  description = "CPU utilization percentage threshold to trigger the alert"
  type        = number
  default     = 85
}
