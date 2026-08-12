export type NodeKind =
  | 'erp'
  | 'middleware'
  | 'dispatcher'
  | 'interface'
  | 'front'
  | 'gateway'
  | 'api'
  | 'endpoint'
  | 'datastore'
  | 'loader'
  | 'builder'
  | 'external'

export type NodeStatus = 'prod' | 'staging' | 'dev' | 'deprecated'

export type FlowDirection = 'extraccion' | 'inyeccion' | 'bidireccional'

/** País donde vive el desarrollo. Sin país = compartido / regional. */
export type CountryCode = 'AR' | 'CL' | 'UY'

export interface Environment {
  name: 'Producción' | 'Staging' | 'QA' | 'Desarrollo'
  server: string
  url?: string
  status: 'ok' | 'degradado' | 'caido'
}

export type DocSourceKind = 'sharepoint' | 'gitlab' | 'archimate'

/** Estado de una fuente de documentación para un desarrollo. */
export type DocStatus = 'completo' | 'parcial' | 'desactualizado' | 'faltante'

export interface DocSource {
  kind: DocSourceKind
  status: DocStatus
  url?: string
  /** última actualización conocida en el origen */
  updatedAt?: string
  /** nota sobre qué falta o qué contiene */
  note?: string
  /** true si se hereda de un padre/familia (ej: SharePoint compartido contra SAP) */
  shared?: boolean
  /** etiqueta del nodo del que se hereda cuando shared=true */
  via?: string
  /** true si el estado es un rollup agregado de los hijos */
  rollup?: boolean
}

export const DOC_SOURCE_META: Record<
  DocSourceKind,
  { label: string; short: string; color: string }
> = {
  sharepoint: { label: 'SharePoint', short: 'SP', color: 'var(--chart-1)' },
  gitlab: { label: 'GitLab', short: 'GL', color: 'var(--chart-3)' },
  archimate: { label: 'ArchiMate', short: 'AM', color: 'var(--chart-4)' },
}

export const DOC_STATUS_META: Record<
  DocStatus,
  { label: string; color: string; weight: number }
> = {
  completo: { label: 'Completo', color: 'var(--chart-4)', weight: 1 },
  parcial: { label: 'Parcial', color: 'var(--chart-1)', weight: 0.5 },
  desactualizado: { label: 'Desactualizado', color: 'var(--chart-2)', weight: 0.35 },
  faltante: { label: 'Faltante', color: 'var(--destructive)', weight: 0 },
}

export type IssueKind = 'fix' | 'mejora' | 'incidente'
export type IssueSeverity = 'bloqueante' | 'alta' | 'media' | 'baja'
export type IssueState = 'abierto' | 'en_curso' | 'review' | 'cerrado'

export interface GitlabIssue {
  id: string
  iid: number
  title: string
  kind: IssueKind
  severity: IssueSeverity
  state: IssueState
  sprint: string
  assignee: string
  project: string
  nodeId: string
}

export interface GitlabProject {
  id: string
  path: string
  branch: string
  lastPipeline: 'passed' | 'failed' | 'running'
  openIssues: number
  /** issues cerrados del sprint activo, para calcular avance */
  closedIssues?: number
  sprint?: string
  syncedAt?: string
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Endpoint interno del desarrollo vs. endpoint contra SAP. */
export type EndpointScope = 'interno' | 'sap'

/** URL base del endpoint por ambiente (misma ruta, distinto host). */
export interface EndpointEnvUrl {
  env: Environment['name']
  baseUrl: string
}

/** Variante del endpoint por tipo de pedido / operación (body distinto). */
export interface EndpointVariant {
  /** ej: "Pedido de venta", "Nota de crédito", "Devolución" */
  orderType: string
  requestBody?: string
  responseBody?: string
  note?: string
}

export interface Endpoint {
  id?: string
  method: HttpMethod
  path: string
  target: string
  /** interno = expuesto por la app; sap = llamada hacia SAP */
  scope?: EndpointScope
  avgMs?: number
  note?: string
  auth?: string
  headers?: Record<string, string>
  /** host base por ambiente */
  envUrls?: EndpointEnvUrl[]
  /** ejemplos de body por tipo de pedido */
  variants?: EndpointVariant[]
}

export interface AtlasNode {
  id: string
  label: string
  kind: NodeKind
  status: NodeStatus
  domain: string
  owner: string
  description: string
  /** posición en el "universo" */
  x: number
  y: number
  parentId?: string
  /** país del desarrollo; vacío = regional / compartido */
  country?: CountryCode
  tech?: string[]
  gitlab?: GitlabProject
  endpoints?: Endpoint[]
  environments?: Environment[]
  sla?: string
  volume?: string
  /** tamaño manual del nodo en el mapa (px); opcional */
  width?: number
  height?: number
}

export interface AtlasEdge {
  id: string
  source: string
  target: string
  label?: string
  direction: FlowDirection
  protocol: 'IDoc' | 'OData' | 'REST' | 'SOAP' | 'JDBC' | 'Batch' | 'CDC' | 'SFTP'
  health: 'ok' | 'degradado' | 'caido'
}

export const KIND_META: Record<
  NodeKind,
  { label: string; color: string; group: 'core' | 'integracion' | 'aplicacion' | 'datos' }
> = {
  erp: { label: 'ERP', color: 'var(--chart-1)', group: 'core' },
  dispatcher: { label: 'Web Dispatcher', color: 'var(--chart-1)', group: 'core' },
  middleware: { label: 'Middleware', color: 'var(--chart-2)', group: 'integracion' },
  external: { label: 'Externo', color: 'var(--chart-2)', group: 'integracion' },
  interface: { label: 'Interfaz', color: 'var(--chart-3)', group: 'aplicacion' },
  front: { label: 'Front', color: 'var(--chart-3)', group: 'aplicacion' },
  gateway: { label: 'Gateway', color: 'var(--chart-3)', group: 'aplicacion' },
  api: { label: 'API', color: 'var(--chart-3)', group: 'aplicacion' },
  endpoint: { label: 'Endpoint', color: 'var(--chart-3)', group: 'aplicacion' },
  datastore: { label: 'Datastore', color: 'var(--chart-4)', group: 'datos' },
  loader: { label: 'Loader', color: 'var(--chart-4)', group: 'datos' },
  builder: { label: 'Builder', color: 'var(--chart-4)', group: 'datos' },
}

export const GROUP_META = {
  core: { label: 'Core SAP', color: 'var(--chart-1)' },
  integracion: { label: 'Integración', color: 'var(--chart-2)' },
  aplicacion: { label: 'Aplicaciones', color: 'var(--chart-3)' },
  datos: { label: 'Datos & Analytics', color: 'var(--chart-4)' },
} as const

export const COUNTRY_META: Record<CountryCode, { label: string; flag: string }> = {
  AR: { label: 'Argentina', flag: '🇦🇷' },
  CL: { label: 'Chile', flag: '🇨🇱' },
  UY: { label: 'Uruguay', flag: '🇺🇾' },
}
