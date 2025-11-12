# Storage Account
resource "azurerm_storage_account" "tfstate" {
  name                     = "hackevaltfdev001" # must be globally unique
  resource_group_name      = azurerm_resource_group.hackeval.name
  location                 = azurerm_resource_group.hackeval.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

# Storage Container
resource "azurerm_storage_container" "tfstate" {
  name                  = "tfstate"
  storage_account_name  = azurerm_storage_account.tfstate.name
  container_access_type = "private"
}
