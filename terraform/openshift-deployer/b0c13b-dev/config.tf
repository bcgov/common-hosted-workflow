terraform {
  required_version = "1.14.3"

  backend "kubernetes" {
    namespace     = "b0c13b-dev"
    secret_suffix = "state" # pragma: allowlist secret
    config_path   = "~/.kube/config"
  }
}

provider "kubernetes" {
  config_path = "~/.kube/config"
}
