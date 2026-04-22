module "oc_deployer" {
  source = "../_module"

  name                  = "oc-deployer"
  namespace             = "b0c13b-prod"
  privileged_namespaces = ["b0c13b-prod"]
}

output "service_account_id" {
  value = module.oc_deployer.service_account_id
}
