$applicationName4azuread = ""
$resourceGroupName = ""
$appServiceName = ""

az ad app create --display-name "${applicationName4azuread}" --sign-in-audience "AzureADandPersonalMicrosoftAccount"

az ad app credential reset --id "xxxx"

##{
##    "appId": "xxxx",
##    "password": "xxxx",
##    "tenant": "xx"
##}

az deployment group create --resource-group "${resourceGroupName}" --template-file "deploymentTemplates\deployUseExistResourceGroup\template-AzureBot-with-rg.json" --parameters "deploymentTemplates\deployUseExistResourceGroup\parameters-for-template-AzureBot-with-rg.json"

az deployment group create --resource-group "${resourceGroupName}" --template-file "deploymentTemplates\deployUseExistResourceGroup\template-BotApp-with-rg.json" --parameters "deploymentTemplates\deployUseExistResourceGroup\parameters-for-template-BotApp-with-rg.json"

az bot prepare-deploy --lang Javascript --code-dir "."

Compress-Archive -Path .\* -DestinationPath ..\azure_openai_botservice.zip -Force 

az webapp deployment source config-zip --resource-group "${resourceGroupName}" --name "${appServiceName}" --src ..\azure_openai_botservice.zip

az bot update --resource-group "${resourceGroupName}" --name "openaibotservicejp" --endpoint "https://${appServiceName}.azurewebsites.net/api/messages"