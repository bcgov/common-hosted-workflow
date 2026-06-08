terraform {
  required_version = "~> 1.15"

  backend "kubernetes" {
    namespace     = "b0c13b-tools"
    secret_suffix = "state" # pragma: allowlist secret
    config_path   = "~/.kube/config"
  }
}

provider "kubernetes" {
  config_path = "~/.kube/config"
}
