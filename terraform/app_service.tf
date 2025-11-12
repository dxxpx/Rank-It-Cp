resource "azurerm_app_service_plan" "hackeval_plan" {
  name                = "asp-hackeval-dev"
  location            = azurerm_resource_group.hackeval.location
  resource_group_name = azurerm_resource_group.hackeval.name
  kind                = "Windows"

  sku {
    tier = "Free"
    size = "F1"
  }
}

resource "azurerm_resource_group" "hackeval" {
  name     = "rg-hackeval-dev"
  location = var.location
}
