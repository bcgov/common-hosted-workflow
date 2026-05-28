terraform {
  required_version = "1.15.4"

  backend "kubernetes" {
    namespace     = "c89a45-test"
    secret_suffix = "state" # pragma: allowlist secret
    config_path   = "~/.kube/config"
  }
}

provider "kubernetes" {
  config_path = "~/.kube/config"
}
