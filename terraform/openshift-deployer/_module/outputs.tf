output "service_account_id" {
  description = "Service account ID"
  value       = kubernetes_service_account_v1.this.id
}

output "service_account_secret_data" {
  description = "Service account secret data"
  value       = kubernetes_secret_v1.this.data
}
