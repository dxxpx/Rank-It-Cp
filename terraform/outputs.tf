output "resource_group_name" {
  value = azurerm_resource_group.hackeval.name
}

output "storage_account_name" {
  value = azurerm_storage_account.tfstate.name
}

output "function_app_name" {
  value = azurerm_function_app.hackeval_function.name
}

output "cosmosdb_account_name" {
  value = azurerm_cosmosdb_account.hackeval_cosmos.name
}
