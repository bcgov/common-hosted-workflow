terraform {
  required_version = "1.14.8"

  backend "kubernetes" {
    namespace     = "c89a45-prod"
    secret_suffix = "state" # pragma: allowlist secret
    config_path   = "~/.kube/config"
  }
}

provider "kubernetes" {
  config_path = "~/.kube/config"
}
