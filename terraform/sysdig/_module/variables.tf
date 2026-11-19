variable "workspace" {
  description = "Workspace slug used to name and scope the Sysdig resources (e.g. b0c13b, c89a45)"
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", var.workspace))
    error_message = "workspace must use only lowercase letters, digits, and internal hyphens."
  }
}

variable "alert_environments" {
  description = "Environment suffixes for the dashboard and both kinds of alert; namespaces are named <workspace>-<suffix>"
  type        = list(string)
  default     = ["dev", "test", "prod"]
  nullable    = false

  validation {
    condition = length(var.alert_environments) > 0 && length(distinct(var.alert_environments)) == length(var.alert_environments) && alltrue([
      for environment in var.alert_environments : can(regex("^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", environment))
    ])
    error_message = "alert_environments must contain unique, non-empty suffixes using only lowercase letters, digits, and internal hyphens."
  }
}

variable "alert_workloads" {
  description = "Map of component name to a kube_workload_name regex; each component gets its own alert pair in each monitored namespace. Set to {} to disable component alerts."
  type        = map(string)
  nullable    = false
  default = {
    n8n = "chwf-n8n(-.*)?"
    pgo = "chwf-pgo(-.*)?"
  }

  validation {
    condition = alltrue([
      for component, pattern in var.alert_workloads :
      can(regex("^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", component)) && can(regexall(pattern, "")) && !can(regex("^(${pattern})$", ""))
    ])
    error_message = "alert_workloads keys must use only lowercase letters, digits, and internal hyphens. Patterns must be valid regexes that do not match an empty workload name."
  }
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
  description = "CPU alert threshold as a percentage of a container's quota or fallback budget"
  type        = number
  default     = 85
  nullable    = false

  validation {
    condition     = var.cpu_alert_threshold > 0 && var.cpu_alert_threshold < 100
    error_message = "cpu_alert_threshold must be greater than 0 and less than 100."
  }
}

variable "memory_alert_threshold" {
  description = "Memory alert threshold as a percentage of a container's limit or fallback budget"
  type        = number
  default     = 85
  nullable    = false

  validation {
    condition     = var.memory_alert_threshold > 0 && var.memory_alert_threshold < 100
    error_message = "memory_alert_threshold must be greater than 0 and less than 100."
  }
}

variable "cpu_alert_fallback_cores" {
  description = "Per-container CPU usage budget, in cores, when no CPU quota utilization is reported"
  type        = number
  default     = 1
  nullable    = false

  validation {
    condition     = var.cpu_alert_fallback_cores > 0
    error_message = "cpu_alert_fallback_cores must be greater than 0."
  }
}

variable "memory_alert_fallback_mib" {
  description = "Per-container memory usage budget, in MiB, when no memory limit utilization is reported"
  type        = number
  default     = 1024
  nullable    = false

  validation {
    condition     = var.memory_alert_fallback_mib > 0
    error_message = "memory_alert_fallback_mib must be greater than 0."
  }
}
