module "oc_deployer" {
  source = "../_module"

  name                  = "oc-deployer"
  namespace             = "c89a45-tools"
  privileged_namespaces = ["c89a45-tools"]
}

output "service_account_id" {
  value = module.oc_deployer.service_account_id
}
