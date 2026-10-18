targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the azd environment; used to name the resource group and generate a unique suffix.')
param environmentName string

@minLength(1)
@description('Primary location for all resources.')
param location string = 'canadacentral'

@description('Location for the Foundry (AI Services) account. Defaults to the primary location; set to eastus2 if realtime WebRTC is unavailable in the primary region.')
param foundryLocation string = ''

@description('Object id of the deploying user or CI principal. Granted Cognitive Services OpenAI User for local development.')
param principalId string = ''

@description('Realtime model name.')
param realtimeModelName string = 'gpt-realtime-2.1'

@description('Realtime model version.')
param realtimeModelVersion string = '2026-07-07'

@description('Realtime deployment capacity (GlobalStandard units).')
param realtimeCapacity int = 10

@description('Wire the optional Supadata transcript API key from Key Vault (secret supadata-api-key must exist).')
param enableSupadata bool = false

@description('Wire the outbound-only caption relay secret from Key Vault (secret caption-relay-secret must exist).')
param enableCaptionRelay bool = false

@description('Require the access code from Key Vault (secret access-code must exist) for every page and API (feature 003).')
param enableAccessCode bool = false

@description('Maximum concurrent live voice conversations per app instance (feature 003).')
@minValue(1)
@maxValue(50)
param maxVoiceSessions int = 3

@description('Wire the optional OpenAI API key from Key Vault (secret openai-api-key must exist).')
param enableOpenAi bool = false

@description('Custom hostname for the web app, e.g. talk-to-doc.hkaanturgut.com (feature 004). Empty = default FQDN only. DNS CNAME and asuid TXT must exist first.')
param customDomainName string = ''

@description('Name of the free managed certificate for customDomainName. Empty on the first provision (hostname added unbound); set it on the second to issue the certificate and bind it (SNI).')
param customDomainCertificateName string = ''

@description('Set by azd: true once the web container app exists, so provisioning keeps the deployed image.')
param webExists bool = false

var abbrs = loadJsonContent('abbreviations.json')
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = { 'azd-env-name': environmentName }

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: '${abbrs.resourcesResourceGroups}${environmentName}'
  location: location
  tags: tags
}

module resources 'resources.bicep' = {
  name: 'resources'
  scope: rg
  params: {
    location: location
    foundryLocation: empty(foundryLocation) ? location : foundryLocation
    tags: tags
    abbrs: abbrs
    resourceToken: resourceToken
    principalId: principalId
    realtimeModelName: realtimeModelName
    realtimeModelVersion: realtimeModelVersion
    realtimeCapacity: realtimeCapacity
    enableSupadata: enableSupadata
    enableCaptionRelay: enableCaptionRelay
    enableAccessCode: enableAccessCode
    maxVoiceSessions: maxVoiceSessions
    enableOpenAi: enableOpenAi
    customDomainName: customDomainName
    customDomainCertificateName: customDomainCertificateName
    webExists: webExists
  }
}

output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenant().tenantId
output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.registryLoginServer
output AZURE_OPENAI_ENDPOINT string = resources.outputs.openAiEndpoint
output AZURE_OPENAI_REALTIME_DEPLOYMENT string = resources.outputs.realtimeDeployment
output AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT string = resources.outputs.transcribeDeployment
output AZURE_KEY_VAULT_NAME string = resources.outputs.keyVaultName
output SERVICE_WEB_NAME string = resources.outputs.webName
output SERVICE_WEB_URI string = resources.outputs.webUri
output SERVICE_WEB_CUSTOM_URI string = resources.outputs.webCustomUri
