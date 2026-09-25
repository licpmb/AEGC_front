import type { AtlasEdge, AtlasNode, Endpoint, EndpointVariant, HttpMethod } from './atlas-types'
import type { ReconcileItem, ReconcileResult } from './atlas-reconcile'

export type TechnicalImportSource = 'appsettings' | 'postman'

type ImportableNodePatch = Partial<Pick<AtlasNode, 'label' | 'kind' | 'owner' | 'description' | 'domain' | 'status' | 'country' | 'tech' | 'endpoints' | 'environments'>>

export type ImportMutation =
  | { kind: 'patch-node'; nodeId: string; patch: ImportableNodePatch }
  | { kind: 'upsert-node'; node: AtlasNode }
  | { kind: 'upsert-edge'; edge: AtlasEdge }

export type TechnicalReconcileItem = ReconcileItem & { mutations?: ImportMutation[] }
export type TechnicalReconcileResult = Omit<ReconcileResult, 'source' | 'items'> & {
  source: TechnicalImportSource
  items: TechnicalReconcileItem[]
  secretsDetected: number
}

const SENSITIVE = /(secret|password|passwd|pwd|token|api.?key|client.?secret|authorization|connectionstring)/i

function sanitizeSensitiveValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeSensitiveValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        SENSITIVE.test(key) ? '[REDACTED]' : sanitizeSensitiveValue(child),
      ]),
    )
  }
  return value
}

function sanitizeRawBody(raw?: string): string | undefined {
  if (!raw) return undefined
  try {
    return JSON.stringify(sanitizeSensitiveValue(JSON.parse(raw)))
  } catch {
    // Fallback conservador para cuerpos que no sean JSON válido.
    return raw
      .replace(/("(?:password|passwd|pwd|token|api.?key|client.?secret|authorization)"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"')
      .replace(/((?:password|passwd|pwd|token|api.?key|client.?secret|authorization)\s*[=:]\s*)[^&\s,;]+/gi, '$1[REDACTED]')
  }
}

function slug(value: string) {
  return value.toLowerCase().replace(/https?:\/\//g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72)
}

function safeUrl(raw: string) {
  try { return new URL(raw) } catch { return null }
}

function environmentFrom(value: string) {
  const s = value.toLowerCase()

  // La semántica específica del servicio/path manda sobre el hostname genérico.
  // Ej.: apisdev.grupocepas.com/Gw.SapS4hana_test/ es QAS, no DEV.
  if (/(?:^|[\/_\-.])(qas|qa|test|aeq)(?:$|[\/_\-.])/.test(s)) return 'QA' as const
  if (/(?:^|[\/_\-.])(prd|prod|production)(?:$|[\/_\-.])/.test(s)) return 'Producción' as const
  if (/(?:^|[\/_\-.])(dev|labo|development)(?:$|[\/_\-.])/.test(s)) return 'Desarrollo' as const

  // Fallback por hostname/texto cuando no hay un marcador específico.
  if (/(qas|qa|test|aeq)/.test(s)) return 'QA' as const
  if (/(prod|prd)/.test(s)) return 'Producción' as const
  if (/(dev|labo)/.test(s)) return 'Desarrollo' as const
  return undefined
}

function protocolFrom(url: URL): AtlasEdge['protocol'] {
  const p = url.pathname.toLowerCase()
  if (p.includes('/odata/') || p.includes('api_sales_') || p.includes('api_customer_')) return 'OData'
  return 'REST'
}

function findNodeByText(nodes: AtlasNode[], text: string) {
  const q = text.toLowerCase()
  const direct = nodes.find(n => q.includes(n.id.toLowerCase()) || q.includes(n.label.toLowerCase()))
  if (direct) return { node: direct, confidence: 0.95 }

  const aliases: Array<{ pattern: RegExp; id: string; confidence: number }> = [
    { pattern: /gw[._-]?sap(?:s?4)?hana|gws4hana|saps4hana/, id: 'gw-sap4hana', confidence: 0.99 },
    { pattern: /gw[._-]?gcc[._-]?smartpanel|gcc[._-]?smartpanel/, id: 'gw-gcc-smartpanel', confidence: 0.99 },
    { pattern: /gw[._-]?mobile[._-]?gc|mobile[._-]?gc/, id: 'gw-mobile-gc', confidence: 0.99 },
    { pattern: /gw[._-]?web[._-]?empleados|web[._-]?empleados/, id: 'gw-web-empleados', confidence: 0.99 },
    { pattern: /gw[._-]?webpedidos|web[._-]?pedidos/, id: 'gw-web-pedidos', confidence: 0.98 },
    { pattern: /gw[._-]?dmp|dmp(?:_dev|_test)?/, id: 'dmp-gw', confidence: 0.98 },
    { pattern: /api[._-]?consumolinea|consumolinea/, id: 'api-consumo-linea', confidence: 0.98 },
    { pattern: /api[._-]?employee|cepas[._-]?employee/, id: 'api-employee', confidence: 0.98 },
    { pattern: /api[._-]?ketan|cepas[._-]?ketan/, id: 'api-ketan', confidence: 0.98 },
    { pattern: /api[._-]?orders[._-]?v2|orders[._-]?v2/, id: 'api-orders-v2', confidence: 0.98 },
    { pattern: /api[._-]?productimage|productimage/, id: 'api-product-image', confidence: 0.98 },
    { pattern: /cepas[._-]?order[._-]?api|cepasorderurl|orderapi/, id: 'cepas-order-api', confidence: 0.96 },
    { pattern: /identityurl|cepasidentity/, id: 'identity', confidence: 0.98 },
    { pattern: /api[._-]?gvd|\bgvd\b/, id: 'api-gvd', confidence: 0.95 },
  ]

  for (const alias of aliases) {
    if (!alias.pattern.test(q)) continue
    const n = nodes.find(node => node.id === alias.id)
    if (n) return { node: n, confidence: alias.confidence }
  }

  if (/sap.*s4|s4hana|sapqas/.test(q)) {
    const n = nodes.find(n => n.id === 'sap-s4')
    if (n) return { node: n, confidence: 0.9 }
  }
  return null
}

function scan(value: unknown, path: string[] = [], out: Array<{ path: string; value: string }> = [], secrets = { count: 0 }) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => scan(v, [...path, String(i)], out, secrets))
  } else if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      if (SENSITIVE.test(k) && typeof v === 'string' && v) secrets.count += 1
      scan(v, [...path, k], out, secrets)
    })
  } else if (typeof value === 'string') {
    out.push({ path: path.join(':'), value })
  }
  return { out, secrets: secrets.count }
}

export function parseAppSettings(text: string, fileName: string, nodes: AtlasNode[]): TechnicalReconcileResult {
  const json = JSON.parse(text)
  const { out, secrets } = scan(json)
  const items: TechnicalReconcileItem[] = []
  const urls = out.filter(x => /^https?:\/\//i.test(x.value))

  for (const entry of urls) {
    const url = safeUrl(entry.value)
    if (!url) continue
    const target = findNodeByText(nodes, entry.path + ' ' + entry.value)
    const env = environmentFrom(entry.value)
    const hostLabel = url.hostname + (url.port ? ':' + url.port : '')
    const id = 'app-url-' + slug(entry.path + '-' + hostLabel + url.pathname)

    if (target) {
      const envs = env ? [{ name: env, server: hostLabel, url: url.origin, status: 'ok' as const }] : undefined
      items.push({
        id,
        entity: 'relación',
        label: entry.path + ' → ' + target.node.label,
        status: 'modificado',
        matchedAtlasId: target.node.id,
        matchReason: 'URL/configuración coincide con un nodo existente.',
        confidence: target.confidence,
        changes: [
          { field: 'configKey', before: null, after: entry.path },
          { field: 'url', before: null, after: url.origin + url.pathname },
          ...(env ? [{ field: 'ambiente', before: null, after: env }] : []),
        ],
        defaultAction: 'aplicar',
        mutations: envs ? [{ kind: 'patch-node', nodeId: target.node.id, patch: { environments: envs } }] : [],
      })
    } else {
      const nodeId = 'discovered-' + slug(hostLabel + url.pathname.split('/').slice(0, 2).join('-'))
      const node: AtlasNode = {
        id: nodeId,
        label: entry.path.split(':').at(-1) || hostLabel,
        kind: /api|gw/i.test(entry.path + url.pathname) ? 'api' : 'external',
        status: 'dev',
        domain: 'Descubierto',
        owner: 'Pendiente',
        description: 'Descubierto desde ' + fileName + ' · ' + entry.path,
        x: 1500,
        y: 250 + items.length * 80,
        tech: [url.protocol.replace(':','').toUpperCase(), hostLabel],
        environments: env ? [{ name: env, server: hostLabel, url: url.origin, status: 'ok' }] : undefined,
      }
      items.push({
        id,
        entity: 'nodo',
        label: node.label,
        status: 'falta_en_modelo',
        matchReason: 'Se detectó una dependencia HTTP sin nodo equivalente en el Atlas.',
        confidence: 0,
        changes: [
          { field: 'host', before: null, after: hostLabel },
          { field: 'path', before: null, after: url.pathname },
          { field: 'configKey', before: null, after: entry.path },
        ],
        defaultAction: 'revisar',
        mutations: [{ kind: 'upsert-node', node }],
      })
    }
  }

  const sapVersion = out.find(x => /sapversion$/i.test(x.path))
  if (sapVersion) {
    const sap = nodes.find(n => n.id === 'sap-s4')
    if (sap) items.push({
      id: 'app-sap-version',
      entity: 'nodo',
      label: 'SAP version = ' + sapVersion.value,
      status: 'sin_cambios',
      matchedAtlasId: sap.id,
      matchReason: 'La configuración declara SAP ' + sapVersion.value + ' y el Atlas ya contiene SAP S/4HANA.',
      confidence: 0.98,
      defaultAction: 'omitir',
    })
  }

  const emptyConnections = out.filter(x => /connectionstrings?:/i.test(x.path) && !x.value)
  if (emptyConnections.length) items.push({
    id: 'app-empty-db',
    entity: 'datastore',
    label: 'ConnectionStrings detectado sin destino resoluble',
    status: 'ambiguo',
    matchReason: 'La cadena está vacía; no se puede identificar servidor/base y no se crea ningún datastore.',
    confidence: 0,
    defaultAction: 'omitir',
  })

  const detectedEnvs = Array.from(new Set(
    urls
      .map((entry) => environmentFrom(entry.value))
      .filter((env): env is NonNullable<ReturnType<typeof environmentFrom>> => Boolean(env)),
  ))
  if (detectedEnvs.length > 0) {
    items.unshift({
      id: 'app-environments',
      entity: 'ambiente',
      label: detectedEnvs.length === 1
        ? `Ambiente detectado: ${detectedEnvs[0]}`
        : `Ambientes detectados: ${detectedEnvs.join(' / ')}`,
      status: detectedEnvs.length === 1 ? 'sin_cambios' : 'ambiguo',
      matchReason: detectedEnvs.length === 1
        ? 'Inferido a partir de hosts/rutas configuradas en el AppSettings.'
        : 'El mismo archivo contiene referencias a más de un ambiente; se muestran por relación y no se fuerza un ambiente global.',
      confidence: detectedEnvs.length === 1 ? 0.9 : 0.6,
      defaultAction: 'omitir',
    })
  }

  return { source:'appsettings', fileName, scannedAt:'recién', items, secretsDetected: secrets }
}

type PostmanItem = { name?: string; request?: any; response?: any[]; item?: PostmanItem[] }

function flatten(items: PostmanItem[], path: string[] = []): Array<{ item: PostmanItem; path: string[] }> {
  return items.flatMap(item => item.item ? flatten(item.item, [...path, item.name || 'grupo']) : [{ item, path }])
}

function rawBody(req: any): string | undefined {
  const raw = req?.body?.raw
  return typeof raw === 'string' && raw.trim() ? raw : undefined
}

function orderTypeFromBody(raw?: string) {
  if (!raw) return undefined
  const m = raw.match(/"(?:SalesOrderType|CustomerReturnType)"\s*:\s*"([^"]+)"/i)
  return m?.[1]
}

function targetForPostman(name: string, rawUrl: string) {
  const s = (name + ' ' + rawUrl).toUpperCase()

  // APIs estándar SAP / API Management
  if (s.includes('CUSTOMER_RETURN_SIMULATION')) return 'api-customer-return-simulate'
  if (s.includes('CUSTOMER_RETURN')) return 'api-customer-return'
  if (s.includes('SALES_ORDER_SIMULATION')) return 'api-sales-order-simulate'
  if (s.includes('SALES_ORDER')) return 'api-sales-order'

  // Catálogo técnico Cepas: Postman operativo de Gw.SapS4hana / microservicios.
  // El host/ruta define qué nodo se enriquece; no se crean clones DEV/TEST/PRD.
  if (/CEPASIDENTITY|IDENTITY\/AUTHENTICATION/.test(s)) return 'identity'
  if (/MICROSERVICES:8036|\/V1\/KETAN\//.test(s)) return 'api-ketan'
  if (/MICROSERVICES:8039|CEPAS\.CONSUMOLINEA|\/V1\/CONSUMO-LINEA\//.test(s)) return 'api-consumo-linea'
  if (/GW\.SAPS4HANA|GW\.SAPS4HANA_|GWSAPS4HANA|\/SAPS4HANA\//.test(s)) return 'gw-sap4hana'

  return undefined
}

function postmanEndpointTarget(targetId: string) {
  if (targetId === 'identity') return { target: 'Identity', scope: 'internal' as const }
  if (targetId === 'api-ketan') return { target: 'KETAN', scope: 'internal' as const }
  if (targetId === 'api-consumo-linea') return { target: 'Consumo en Línea', scope: 'internal' as const }
  if (targetId === 'gw-sap4hana') return { target: 'Gateway SAP S/4HANA', scope: 'internal' as const }
  return { target: 'SAP S/4HANA', scope: 'sap' as const }
}

export function parsePostman(text: string, fileName: string, nodes: AtlasNode[]): TechnicalReconcileResult {
  const json = JSON.parse(text)
  const flattened = flatten(json.item ?? [])
  const byTarget = new Map<string, Endpoint[]>()
  const items: TechnicalReconcileItem[] = []
  let secrets = 0

  for (const { item } of flattened) {
    const req = item.request
    if (!req) continue
    if (req.auth && JSON.stringify(req.auth).match(SENSITIVE)) secrets += 1
    const requestBodyRaw = rawBody(req)
    if (requestBodyRaw && SENSITIVE.test(requestBodyRaw)) secrets += 1
    const rawUrl: string = req.url?.raw ?? ''
    const targetId = targetForPostman(item.name ?? '', rawUrl)
    if (!targetId) continue
    const targetNode = nodes.find(n => n.id === targetId)
    if (!targetNode) continue

    const method = (String(req.method || 'GET').toUpperCase() as HttpMethod)
    const body = rawBody(req)
    const sanitizedBody = sanitizeRawBody(body)
    const orderType = orderTypeFromBody(body)
    const url = safeUrl(rawUrl)
    const variant: EndpointVariant | undefined = orderType ? {
      orderType,
      requestBody: sanitizedBody,
      note: item.name,
    } : undefined

    const endpointTarget = postmanEndpointTarget(targetId)
    const endpoint: Endpoint = {
      id: slug((item.name || method) + '-' + rawUrl),
      method,
      path: url?.pathname ?? rawUrl,
      target: endpointTarget.target,
      scope: endpointTarget.scope,
      auth: req.auth?.type === 'bearer' ? 'Bearer / OAuth2' : req.auth?.type,
      headers: Object.fromEntries((req.header ?? []).filter((h:any) => !SENSITIVE.test(h.key ?? '')).map((h:any) => [h.key, h.value])),
      envUrls: url ? [{ env: environmentFrom(rawUrl) ?? 'QA', baseUrl: url.origin }] : undefined,
      variants: variant ? [variant] : undefined,
    }

    const list = byTarget.get(targetId) ?? []
    const existing = list.find(e => e.method === endpoint.method && e.path === endpoint.path)
    if (existing && variant) {
      existing.variants = [...(existing.variants ?? []).filter(v => v.orderType !== variant.orderType), variant]
    } else if (!existing) list.push(endpoint)
    byTarget.set(targetId, list)

    items.push({
      id: 'pm-' + slug((item.name || method) + '-' + rawUrl),
      entity: 'endpoint',
      label: orderType ? (item.name || method) + ' · ' + orderType : (item.name || method),
      status: 'modificado',
      matchedAtlasId: targetId,
      matchReason: orderType
        ? 'Request de Postman asociado por servicio OData SAP.'
        : 'Request de Postman asociado a un componente técnico conocido del Atlas.',
      confidence: 0.99,
      changes: [
        { field:'método', before:null, after:method },
        ...(orderType ? [{ field:'tipo', before:null, after:orderType }] : []),
        { field:'path', before:null, after:endpoint.path },
      ],
      defaultAction:'aplicar',
    })
  }

  for (const [targetId, endpoints] of byTarget) {
    const targetNode = nodes.find(n => n.id === targetId)!
    const existing = targetNode.endpoints ?? []
    const merged = [...existing]
    for (const ep of endpoints) {
      const idx = merged.findIndex(x => x.method === ep.method && x.path === ep.path)
      if (idx >= 0) {
        const variants = [...(merged[idx].variants ?? [])]
        for (const v of ep.variants ?? []) if (!variants.some(x => x.orderType === v.orderType)) variants.push(v)
        merged[idx] = { ...merged[idx], ...ep, variants }
      } else merged.push(ep)
    }
    items.unshift({
      id:'pm-node-' + targetId,
      entity:'nodo',
      label:targetNode.label,
      status:'modificado',
      matchedAtlasId:targetId,
      matchReason:'La colección aporta contratos/operaciones para esta API SAP.',
      confidence:1,
      changes:[{ field:'endpoints', before:String(existing.length), after:String(merged.length) }],
      defaultAction:'aplicar',
      mutations:[{ kind:'patch-node', nodeId:targetId, patch:{ endpoints:merged } }],
    })
  }

  const apiMgmt = flattened.map(x => x.item.request?.url?.raw).find((u:unknown) => typeof u === 'string' && u.includes('apimanagement'))
  if (typeof apiMgmt === 'string') {
    const u = safeUrl(apiMgmt)
    if (u) {
      const existing = nodes.find(n => n.id === 'sap-api-management')
      const node: AtlasNode = existing ?? {
        id:'sap-api-management', label:'SAP API Management', kind:'middleware', status:'dev',
        domain:'Plataforma / Middleware', owner:'Integraciones',
        description:'SAP API Management detectado desde colección Postman de GCC.',
        x:430, y:-260, tech:['SAP Integration Suite · API Management'],
        environments:[{ name:environmentFrom(apiMgmt) ?? 'QA', server:u.hostname, url:u.origin, status:'ok' }],
      }
      items.unshift({
        id:'pm-api-mgmt', entity:'nodo', label:'SAP API Management',
        status: existing ? 'modificado' : 'falta_en_modelo',
        matchedAtlasId: existing?.id,
        matchReason:'Host *.apimanagement.* detectado en las URLs de la colección.',
        confidence:0.99,
        changes:[{ field:'host', before:null, after:u.hostname }],
        defaultAction: existing ? 'aplicar' : 'revisar',
        mutations:[ existing ? { kind:'patch-node', nodeId:existing.id, patch:{ environments:node.environments } } : { kind:'upsert-node', node } ],
      })

      for (const targetId of byTarget.keys()) {
        const edgeId = 'import-apim-' + targetId
        items.push({
          id:'pm-rel-' + targetId,
          entity:'relación',
          label:'SAP API Management → ' + (nodes.find(n => n.id === targetId)?.label ?? targetId),
          status:'falta_en_modelo',
          matchReason:'La colección invoca este servicio a través del host de SAP API Management.',
          confidence:0.99,
          changes:[
            { field:'origen', before:null, after:'SAP API Management' },
            { field:'destino', before:null, after:nodes.find(n => n.id === targetId)?.label ?? targetId },
            { field:'protocolo', before:null, after:'OData' },
          ],
          defaultAction:'revisar',
          mutations:[{ kind:'upsert-edge', edge:{
            id:edgeId,
            source:'sap-api-management',
            target:targetId,
            label:'OData vía API Management',
            direction:'bidireccional',
            protocol:'OData',
            health:'sin_dato',
          }}],
        })
      }
    }
  }

  return { source:'postman', fileName, scannedAt:'recién', items, secretsDetected:secrets }
}
