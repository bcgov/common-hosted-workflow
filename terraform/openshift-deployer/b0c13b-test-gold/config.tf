terraform {
  required_version = "1.14.9"

  backend "kubernetes" {
    namespace     = "b0c13b-test"
    secret_suffix = "state" # pragma: allowlist secret
    config_path   = "~/.kube/config"
  }
}

provider "kubernetes" {
  config_path = "~/.kube/config"
}
