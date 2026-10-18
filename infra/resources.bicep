param location string
param foundryLocation string
param tags object
param abbrs object
param resourceToken string
param principalId string
param realtimeModelName string
param realtimeModelVersion string
param realtimeCapacity int
param enableSupadata bool
param enableCaptionRelay bool
param enableAccessCode bool
param maxVoiceSessions int
param enableOpenAi bool
param webExists bool

var transcribeModelName = 'gpt-4o-mini-transcribe'
var appPort = 3000
var webName = '${abbrs.appContainerApps}web-${resourceToken}'
var foundryName = '${abbrs.cognitiveServicesAccounts}${resourceToken}'
var placeholderImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

// Built-in role definition ids
var roles = {
  acrPull: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
  openAiUser: '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
  keyVaultSecretsUser: '4633458b-17de-408a-b874-0445c86b69e6' // gitleaks:allow (public built-in role id)
  keyVaultSecretsOfficer: 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7' // gitleaks:allow (public built-in role id)
  monitoringMetricsPublisher: '3913510d-42f4-4e42-8a64-420c390055eb'
}
func roleId(id string) string => subscriptionResourceId('Microsoft.Authorization/roleDefinitions', id)

// ---------- Observability ----------

module logs 'br/public:avm/res/operational-insights/workspace:0.16.1' = {
  name: 'logs'
  params: {
    name: '${abbrs.operationalInsightsWorkspaces}${resourceToken}'
    location: location
    tags: tags
    dataRetention: 30
  }
}

module appInsights 'br/public:avm/res/insights/component:0.8.0' = {
  name: 'app-insights'
  params: {
    name: '${abbrs.insightsComponents}${resourceToken}'
    location: location
    tags: tags
    workspaceResourceId: logs.outputs.resourceId
    disableLocalAuth: true
    roleAssignments: [
      {
        principalId: identity.outputs.principalId
        principalType: 'ServicePrincipal'
        roleDefinitionIdOrName: roleId(roles.monitoringMetricsPublisher)
      }
    ]
  }
}

// ---------- Identity and registry ----------

module identity 'br/public:avm/res/managed-identity/user-assigned-identity:0.6.0' = {
  name: 'identity'
  params: {
    name: '${abbrs.managedIdentityUserAssignedIdentities}web-${resourceToken}'
    location: location
    tags: tags
  }
}

module registry 'br/public:avm/res/container-registry/registry:0.13.1' = {
  name: 'registry'
  params: {
    name: '${abbrs.containerRegistryRegistries}${resourceToken}'
    location: location
    tags: tags
    acrSku: 'Basic'
    acrAdminUserEnabled: false
    roleAssignments: [
      {
        principalId: identity.outputs.principalId
        principalType: 'ServicePrincipal'
        roleDefinitionIdOrName: roleId(roles.acrPull)
      }
    ]
  }
}

// ---------- Key Vault (optional third-party keys only) ----------

module keyVault 'br/public:avm/res/key-vault/vault:0.14.2' = {
  name: 'key-vault'
  params: {
    name: '${abbrs.keyVaultVaults}${resourceToken}'
    location: location
    tags: tags
    enableRbacAuthorization: true
    enablePurgeProtection: false
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
    networkAcls: { defaultAction: 'Allow', bypass: 'AzureServices' }
    roleAssignments: concat(
      [
        {
          principalId: identity.outputs.principalId
          principalType: 'ServicePrincipal'
          roleDefinitionIdOrName: roleId(roles.keyVaultSecretsUser)
        }
      ],
      empty(principalId)
        ? []
        : [
            {
              principalId: principalId
              roleDefinitionIdOrName: roleId(roles.keyVaultSecretsOfficer)
            }
          ]
    )
  }
}

// ---------- Foundry (AI Services) with realtime + transcription deployments ----------

module foundry 'br/public:avm/res/cognitive-services/account:0.19.1' = {
  name: 'foundry'
  params: {
    name: foundryName
    location: foundryLocation
    tags: tags
    kind: 'AIServices'
    sku: 'S0'
    customSubDomainName: foundryName
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
    deployments: [
      {
        name: realtimeModelName
        model: { format: 'OpenAI', name: realtimeModelName, version: realtimeModelVersion }
        sku: { name: 'GlobalStandard', capacity: realtimeCapacity }
        raiPolicyName: 'Microsoft.DefaultV2' // Azure default content filter, pinned explicitly (feature 003)
      }
      {
        name: transcribeModelName
        model: { format: 'OpenAI', name: transcribeModelName, version: '2025-12-15' }
        sku: { name: 'GlobalStandard', capacity: 50 }
        raiPolicyName: 'Microsoft.DefaultV2'
      }
    ]
    roleAssignments: concat(
      [
        {
          principalId: identity.outputs.principalId
          principalType: 'ServicePrincipal'
          roleDefinitionIdOrName: roleId(roles.openAiUser)
        }
      ],
      empty(principalId)
        ? []
        : [
            {
              principalId: principalId
              roleDefinitionIdOrName: roleId(roles.openAiUser)
            }
          ]
    )
  }
}

// ---------- Container Apps ----------

module containerEnv 'br/public:avm/res/app/managed-environment:0.16.0' = {
  name: 'container-env'
  params: {
    name: '${abbrs.appManagedEnvironments}${resourceToken}'
    location: location
    tags: tags
    zoneRedundant: false
    publicNetworkAccess: 'Enabled'
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsWorkspaceResourceId: logs.outputs.resourceId
    }
  }
}

resource existingWeb 'Microsoft.App/containerApps@2025-01-01' existing = if (webExists) {
  name: webName
}

var optionalSecrets = concat(
  enableSupadata
    ? [
        {
          name: 'supadata-api-key'
          keyVaultUrl: '${keyVault.outputs.uri}secrets/supadata-api-key'
          identity: identity.outputs.resourceId
        }
      ]
    : [],
  enableCaptionRelay
    ? [
        {
          name: 'caption-relay-secret'
          keyVaultUrl: '${keyVault.outputs.uri}secrets/caption-relay-secret'
          identity: identity.outputs.resourceId
        }
      ]
    : [],
  enableAccessCode
    ? [
        {
          name: 'access-code'
          keyVaultUrl: '${keyVault.outputs.uri}secrets/access-code'
          identity: identity.outputs.resourceId
        }
      ]
    : [],
  enableOpenAi
    ? [
        {
          name: 'openai-api-key'
          keyVaultUrl: '${keyVault.outputs.uri}secrets/openai-api-key'
          identity: identity.outputs.resourceId
        }
      ]
    : []
)

var optionalEnv = concat(
  enableSupadata ? [{ name: 'SUPADATA_API_KEY', secretRef: 'supadata-api-key' }] : [],
  enableCaptionRelay ? [{ name: 'CAPTION_RELAY_SECRET', secretRef: 'caption-relay-secret' }] : [],
  enableAccessCode ? [{ name: 'ACCESS_CODE', secretRef: 'access-code' }] : [],
  enableOpenAi ? [{ name: 'OPENAI_API_KEY', secretRef: 'openai-api-key' }] : []
)

var healthProbes = [
  {
    type: 'Liveness'
    httpGet: { path: '/api/health', port: appPort }
    periodSeconds: 30
  }
  {
    type: 'Readiness'
    httpGet: { path: '/api/health', port: appPort }
    periodSeconds: 10
  }
]

module web 'br/public:avm/res/app/container-app:0.23.0' = {
  name: 'web'
  params: {
    name: webName
    location: location
    tags: union(tags, { 'azd-service-name': 'web' })
    environmentResourceId: containerEnv.outputs.resourceId
    managedIdentities: { userAssignedResourceIds: [identity.outputs.resourceId] }
    registries: [{ server: registry.outputs.loginServer, identity: identity.outputs.resourceId }]
    ingressExternal: true
    ingressTargetPort: appPort
    ingressAllowInsecure: false
    ingressTransport: 'auto'
    stickySessionsAffinity: 'sticky'
    activeRevisionsMode: 'Single'
    scaleSettings: {
      minReplicas: 1
      maxReplicas: 3
      rules: [{ name: 'http', http: { metadata: { concurrentRequests: '30' } } }]
    }
    secrets: optionalSecrets
    containers: [
      {
        name: 'web'
        image: webExists ? existingWeb!.properties.template.containers[0].image : placeholderImage
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: concat(
          [
            { name: 'PORT', value: string(appPort) }
            { name: 'AZURE_CLIENT_ID', value: identity.outputs.clientId }
            { name: 'REALTIME_PROVIDER', value: 'azure' }
            { name: 'AZURE_OPENAI_ENDPOINT', value: 'https://${foundryName}.openai.azure.com' }
            { name: 'AZURE_OPENAI_REALTIME_DEPLOYMENT', value: realtimeModelName }
            { name: 'AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT', value: transcribeModelName }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.outputs.connectionString }
            { name: 'MAX_VOICE_SESSIONS', value: string(maxVoiceSessions) }
          ],
          optionalEnv
        )
        probes: webExists ? healthProbes : []
      }
    ]
  }
  dependsOn: [foundry]
}

output registryLoginServer string = registry.outputs.loginServer
output openAiEndpoint string = 'https://${foundryName}.openai.azure.com'
output realtimeDeployment string = realtimeModelName
output transcribeDeployment string = transcribeModelName
output keyVaultName string = keyVault.outputs.name
output webName string = web.outputs.name
output webUri string = 'https://${web.outputs.fqdn}'
