module "oc_deployer" {
  source = "../_module"

  name                  = "oc-deployer"
  namespace             = "c89a45-test"
  privileged_namespaces = ["c89a45-test"]
}

output "service_account_id" {
  value = module.oc_deployer.service_account_id
}
