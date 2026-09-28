import type { Environment, RuntimeObservation } from './atlas-types'

export const RUNTIME_MONITOR_SOURCES = {
  prod: {
    server: 'sql-db',
    database: 'MS_Monitor',
    table: 'dbo.DD_GENERAL_LOG',
    environments: ['PRD'] as const,
  },
  nonprod: {
    server: 'sql-db-des',
    database: 'MS_Monitor',
    table: 'dbo.DD_GENERAL_LOG',
    environments: ['DEV', 'QAS'] as const,
  },
} as const

/**
 * El mismo componente aparece con nombres diferentes según app/logger/ambiente.
 * Estas reglas normalizan DD_GENERAL_LOG hacia un único nodo lógico del Atlas.
 * No crean arquitectura nueva: sólo asocian observaciones runtime.
 */
export const RUNTIME_COMPONENT_RULES: Array<{
  nodeId: string
  patterns: RegExp[]
}> = [
  {
    nodeId: 'gw-sap4hana',
    patterns: [
      /^GATEWAY\.Sap4Hana$/i,
      /^Gw\.SapS4Hana(?:_TEST|_DEV|_PROD)?$/i,
      /^Sap4Hana$/i,
    ],
  },
  {
    nodeId: 'api-ketan',
    patterns: [/^Api\.Ketan(?:_DEV|_TEST|_PROD)?$/i, /^ketan$/i],
  },
  {
    nodeId: 'api-consumo-linea',
    patterns: [/^Api\.ConsumoLinea(?:_DEV|_TEST|_PROD)?$/i, /^ConsumoLinea$/i],
  },
  {
    nodeId: 'api-orders-v2',
    patterns: [/^Api\.Orders_V2(?:_DEV|_TEST|_PROD)?$/i, /^Order$/i],
  },
  {
    nodeId: 'gw-gcc-smartpanel',
    patterns: [/^Api\.Gateway\.GCC\.SmartPanel$/i, /^WEBSmartPanel$/i],
  },
  {
    nodeId: 'gw-web-pedidos',
    patterns: [/^WEBPedidos$/i, /^GATEWAY\.Web\.Pedidos$/i],
  },
  {
    nodeId: 'identity',
    patterns: [/^Identity(?:\.Api)?(?:_DEV|_TEST|_PROD)?$/i],
  },
  {
    nodeId: 'dmp-api',
    patterns: [/^status-sync$/i, /^Api\.Employee(?:_DEV|_TEST|_PROD)?$/i],
  },
  {
    nodeId: 'loaders',
    patterns: [/^loader_/i, /^visma_process$/i, /^servicio_cot_process$/i, /^amc_process$/i],
  },
  {
    nodeId: 'builders',
    patterns: [/^builder_/i, /^bd_/i, /_process$/i],
  },
]

export function mapRuntimeComponent(component: string, name = ''): string | undefined {
  const haystack = component.trim()
  for (const rule of RUNTIME_COMPONENT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(haystack))) return rule.nodeId
  }

  // Algunas instalaciones registran el área genérica y dejan el componente en LogGralName.
  const combined = `${component} ${name}`
  for (const rule of RUNTIME_COMPONENT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(combined))) return rule.nodeId
  }
  return undefined
}

export function normalizeRuntimeEnvironment(input: {
  sourceDb: RuntimeObservation['sourceDb']
  rawEnvironment?: string | null
  component?: string | null
  name?: string | null
}): RuntimeObservation['environment'] {
  const marker = `${input.component ?? ''} ${input.name ?? ''}`.toUpperCase()

  // Marcadores técnicos específicos tienen prioridad sobre LogGralEnv porque
  // ya vimos filas _TEST registradas como DESARROLLO.
  if (/(^|[^A-Z])(TEST|QAS|QA|AEQ)([^A-Z]|$)|_TEST\b|_QAS\b|_QA\b/.test(marker)) return 'QAS'
  if (/(^|[^A-Z])(PROD|PRD|PRODUCCION|PRODUCCIÓN)([^A-Z]|$)|_PROD\b|_PRD\b/.test(marker)) return 'PRD'
  if (/(^|[^A-Z])(DEV|DESARROLLO|LABO)([^A-Z]|$)|_DEV\b/.test(marker)) return 'DEV'

  const raw = (input.rawEnvironment ?? '').toUpperCase()
  if (raw.includes('PROD')) return 'PRD'
  if (raw.includes('TEST') || raw.includes('QAS') || raw === 'QA') return 'QAS'
  if (raw.includes('DES') || raw.includes('DEV')) return 'DEV'

  return input.sourceDb === 'sql-db' ? 'PRD' : 'DEV'
}

export function extractHttpStatus(text?: string | null): number | undefined {
  if (!text) return undefined
  const match =
    text.match(/HTTP\s+(\d{3})/i) ??
    text.match(/StatusCode:\s*(\d{3})/i) ??
    text.match(/status code[^\d]*(\d{3})/i)
  return match ? Number(match[1]) : undefined
}

export function runtimeHealth(input: {
  result?: string | null
  httpStatus?: number
}): Environment['status'] {
  const result = (input.result ?? '').toLowerCase()

  // DD_GENERAL_LOG usa Warning para proxies que igualmente devolvieron 2xx.
  if (input.httpStatus && input.httpStatus >= 200 && input.httpStatus < 300) return 'ok'
  if (input.httpStatus && input.httpStatus >= 500) return 'caido'
  if (input.httpStatus && input.httpStatus >= 400) return 'degradado'
  if (result === 'error') return 'caido'
  if (result === 'warning') return 'degradado'
  if (result === 'success') return 'ok'
  return 'degradado'
}

export function sanitizeRuntimeOperation(name?: string | null): string | undefined {
  if (!name) return undefined
  // Conserva método + URL/path, elimina querystring para no filtrar parámetros.
  const match = name.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+([^\s]+)/i)
  if (!match) return name.slice(0, 180)
  try {
    const rawTarget = match[2]
    const parsed = rawTarget.startsWith('http://') || rawTarget.startsWith('https://')
      ? new URL(rawTarget)
      : null
    const target = parsed ? parsed.pathname : rawTarget.split('?')[0]
    return `${match[1].toUpperCase()} ${target}`
  } catch {
    return `${match[1].toUpperCase()} ${match[2].split('?')[0]}`
  }
}
