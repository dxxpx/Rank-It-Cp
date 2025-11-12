resource "azurerm_function_app" "hackeval_function" {
  name                       = "hackeval-function-app"
  location                   = azurerm_resource_group.hackeval.location
  resource_group_name        = azurerm_resource_group.hackeval.name
  app_service_plan_id        = azurerm_app_service_plan.hackeval_plan.id
  storage_account_name       = azurerm_storage_account.tfstate.name
  storage_account_access_key = azurerm_storage_account.tfstate.primary_access_key
  version                    = "~4"

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on = true
  }

  # App settings go directly here
  app_settings = {
    FUNCTIONS_WORKER_RUNTIME = "dotnet"
    WEBSITE_RUN_FROM_PACKAGE = "1"   # optional if deploying zip package
  }

  tags = {
    environment = "dev"
    project     = "hackeval"
  }
}
