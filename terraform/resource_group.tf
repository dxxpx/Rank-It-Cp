resource "azurerm_resource_group" "hackeval" {
  name     = "rg-hackeval-dev"
  location = var.location
}
