import type { DocSourceKind } from './atlas-types'

/** Fuente desde la que se importa/reconcilia. */
export type ImportSource = 'archimate' | 'openapi' | 'sharepoint'

/**
 * Estado de reconciliación de cada elemento propuesto por la fuente,
 * SIEMPRE evaluado contra lo que ya existe en el Atlas.
 * La filosofía es corregir/enriquecer lo existente, no duplicar.
 */
export type ReconcileStatus =
  | 'sin_cambios' // coincide y no hay nada que actualizar
  | 'modificado' // existe en el Atlas; la fuente trae datos distintos/más ricos
  | 'falta_en_modelo' // la fuente lo tiene y el Atlas no → alta propuesta (a revisar)
  | 'falta_en_fuente' // el Atlas lo tiene y la fuente no → informativo, no borra
  | 'ambiguo' // no se pudo matchear con confianza → requiere mapeo manual

export interface FieldChange {
  field: string
  before: string | null
  after: string | null
}

export interface ReconcileItem {
  id: string
  /** qué tipo de entidad: nodo, relación, endpoint, documento… */
  entity: 'nodo' | 'relación' | 'endpoint' | 'documento' | 'ambiente'
  /** nombre legible del elemento en la fuente */
  label: string
  status: ReconcileStatus
  /** id del nodo/entidad del Atlas con el que matcheó (si aplica) */
  matchedAtlasId?: string
  /** cómo se hizo el match, para que el usuario confíe o corrija */
  matchReason?: string
  /** confianza del match 0..1 */
  confidence?: number
  /** cambios campo a campo cuando status = modificado */
  changes?: FieldChange[]
  /** para documentos SharePoint: el resumen interpretado por IA */
  aiSummary?: string
  /** acción por defecto sugerida */
  defaultAction: 'aplicar' | 'revisar' | 'omitir'
}

export interface ReconcileResult {
  source: ImportSource
  fileName: string
  scannedAt: string
  items: ReconcileItem[]
}

export const IMPORT_SOURCE_META: Record<
  ImportSource,
  { label: string; accept: string; hint: string; docKind?: DocSourceKind }
> = {
  archimate: {
    label: 'ArchiMate',
    accept: '.archimate, .xml (Open Exchange)',
    hint: 'Modelo de arquitectura de Archi. Define nodos y relaciones del universo.',
    docKind: 'archimate',
  },
  openapi: {
    label: 'OpenAPI / Swagger',
    accept: '.json, .yaml',
    hint: 'Spec de una API. Aporta endpoints, métodos, bodies y parámetros.',
    docKind: 'gitlab',
  },
  sharepoint: {
    label: 'SharePoint',
    accept: '.docx, .pdf, .xlsx, .vsdx',
    hint: 'Documentos de proceso. La IA los interpreta para corregir/enriquecer lo existente.',
    docKind: 'sharepoint',
  },
}

export const RECONCILE_META: Record<
  ReconcileStatus,
  { label: string; color: string; desc: string }
> = {
  sin_cambios: {
    label: 'Sin cambios',
    color: 'var(--muted-foreground)',
    desc: 'Coincide con el Atlas. Nada para hacer.',
  },
  modificado: {
    label: 'Modificado',
    color: 'var(--chart-2)',
    desc: 'Existe en el Atlas; la fuente trae datos distintos. Se corrige lo existente.',
  },
  falta_en_modelo: {
    label: 'Falta en el modelo',
    color: 'var(--chart-3)',
    desc: 'La fuente lo tiene y el Atlas no. Alta propuesta, a revisar.',
  },
  falta_en_fuente: {
    label: 'Falta en la fuente',
    color: 'var(--chart-1)',
    desc: 'El Atlas lo tiene y la fuente no. No se borra; solo se avisa.',
  },
  ambiguo: {
    label: 'Requiere mapeo',
    color: 'var(--destructive)',
    desc: 'No se pudo asociar con confianza. Elegí a mano contra qué nodo va.',
  },
}

/* ------------------------------------------------------------------ */
/* Datasets de ejemplo por fuente (simulan el resultado de un escaneo)  */
/* ------------------------------------------------------------------ */

const ARCHIMATE_RESULT: ReconcileResult = {
  source: 'archimate',
  fileName: 'GrupoCepas-Arquitectura.archimate',
  scannedAt: 'recién',
  items: [
    {
      id: 'am-1',
      entity: 'nodo',
      label: 'GCC (Application Component)',
      status: 'sin_cambios',
      matchedAtlasId: 'gcc',
      matchReason: 'Coincide por nombre exacto "GCC".',
      confidence: 1,
      defaultAction: 'omitir',
    },
    {
      id: 'am-2',
      entity: 'nodo',
      label: 'SAP S/4HANA (System Software)',
      status: 'modificado',
      matchedAtlasId: 'sap',
      matchReason: 'Coincide por nombre "SAP S/4HANA".',
      confidence: 0.98,
      changes: [
        { field: 'tech', before: 'ABAP · Fiori', after: 'ABAP · Fiori · CDS Views' },
        { field: 'owner', before: 'Equipo SAP', after: 'CoE SAP · Grupo Cepas' },
      ],
      defaultAction: 'aplicar',
    },
    {
      id: 'am-3',
      entity: 'relación',
      label: 'GCC —flow→ SAP CPI',
      status: 'sin_cambios',
      matchedAtlasId: 'e15',
      matchReason: 'Ya existe una arista GCC → CPI.',
      confidence: 0.95,
      defaultAction: 'omitir',
    },
    {
      id: 'am-4',
      entity: 'nodo',
      label: 'Data Lake Regional (Node)',
      status: 'falta_en_modelo',
      matchReason: 'No hay ningún nodo equivalente en el Atlas.',
      confidence: 0,
      changes: [
        { field: 'kind', before: null, after: 'datastore' },
        { field: 'domain', before: null, after: 'Datos & Analytics' },
      ],
      defaultAction: 'revisar',
    },
    {
      id: 'am-5',
      entity: 'relación',
      label: 'Web de Pedidos —serving→ Vendedor',
      status: 'ambiguo',
      matchReason: '"Vendedor" es un actor de negocio sin nodo técnico asociado.',
      confidence: 0.3,
      defaultAction: 'revisar',
    },
    {
      id: 'am-6',
      entity: 'nodo',
      label: 'Web de Cobranzas',
      status: 'falta_en_fuente',
      matchedAtlasId: 'web-cobranzas',
      matchReason: 'Existe en el Atlas pero no aparece en el modelo ArchiMate.',
      confidence: 1,
      defaultAction: 'omitir',
    },
  ],
}

const OPENAPI_RESULT: ReconcileResult = {
  source: 'openapi',
  fileName: 'web-pedidos-api.openapi.yaml',
  scannedAt: 'recién',
  items: [
    {
      id: 'oa-1',
      entity: 'endpoint',
      label: 'POST /v1/pedidos',
      status: 'modificado',
      matchedAtlasId: 'wp-api',
      matchReason: 'Coincide con endpoint existente en WP · API.',
      confidence: 0.97,
      changes: [
        { field: 'auth', before: 'Bearer (Azure AD)', after: 'OAuth2 authorization_code + PKCE' },
        { field: 'headers', before: 'Content-Type, X-Country', after: 'Content-Type, X-Country, X-Idempotency-Key' },
        { field: 'variants', before: '3 tipos', after: '4 tipos (agrega "Muestra sin cargo")' },
      ],
      defaultAction: 'aplicar',
    },
    {
      id: 'oa-2',
      entity: 'endpoint',
      label: 'GET /v1/pedidos/{id}/estado',
      status: 'sin_cambios',
      matchedAtlasId: 'wp-api',
      matchReason: 'Idéntico al del Atlas.',
      confidence: 1,
      defaultAction: 'omitir',
    },
    {
      id: 'oa-3',
      entity: 'endpoint',
      label: 'DELETE /v1/pedidos/{id}',
      status: 'falta_en_modelo',
      matchReason: 'La spec expone este endpoint; el Atlas no lo tiene cargado.',
      confidence: 0,
      changes: [
        { field: 'method', before: null, after: 'DELETE' },
        { field: 'scope', before: null, after: 'interno' },
        { field: 'auth', before: null, after: 'Bearer (Azure AD)' },
      ],
      defaultAction: 'revisar',
    },
    {
      id: 'oa-4',
      entity: 'endpoint',
      label: 'GET /v1/clientes/{id}/credito',
      status: 'falta_en_fuente',
      matchedAtlasId: 'wp-api',
      matchReason: 'Está en el Atlas pero no en esta spec (¿versión vieja?).',
      confidence: 0.9,
      defaultAction: 'omitir',
    },
  ],
}

const SHAREPOINT_RESULT: ReconcileResult = {
  source: 'sharepoint',
  fileName: 'Proceso_Pedidos_GCC_v3.docx',
  scannedAt: 'recién',
  items: [
    {
      id: 'sp-1',
      entity: 'documento',
      label: 'Proceso de alta de pedidos (funcional)',
      status: 'modificado',
      matchedAtlasId: 'gcc',
      matchReason: 'El documento describe el flujo de GCC → CPI → SAP.',
      confidence: 0.92,
      aiSummary:
        'Alta de pedidos desde GCC: el vendedor carga el pedido, GCC valida crédito contra SQL, envía POST a CPI y CPI mapea a la OData A_SalesOrder de SAP. Incluye reglas de bonificación y notas de crédito.',
      changes: [
        {
          field: 'description',
          before: 'Interfaz comercial de la compañía. Extrae datos desde SQL e inyecta transacciones hacia SAP vía CPI.',
          after:
            'Interfaz comercial de la compañía. Valida crédito contra SQL, arma el pedido y lo inyecta a SAP vía CPI (A_SalesOrder), soportando pedidos de venta, notas de crédito y bonificaciones.',
        },
      ],
      defaultAction: 'aplicar',
    },
    {
      id: 'sp-2',
      entity: 'documento',
      label: 'Instructivo de conciliación de cobranzas',
      status: 'modificado',
      matchedAtlasId: 'web-cobranzas',
      matchReason: 'El documento menciona explícitamente "Web de Cobranzas".',
      confidence: 0.88,
      aiSummary:
        'Conciliación diaria de cobranzas: la Web de Cobranzas toma pagos, los concilia contra documentos abiertos de SAP FI y actualiza el estado del cliente.',
      changes: [
        { field: 'owner', before: 'Equipo GCC', after: 'Equipo Finanzas · Cobranzas' },
      ],
      defaultAction: 'aplicar',
    },
    {
      id: 'sp-3',
      entity: 'documento',
      label: 'Manual de despliegue (genérico, sin dueño claro)',
      status: 'ambiguo',
      matchReason: 'Describe un pipeline pero no nombra la interfaz. No se pudo asociar.',
      confidence: 0.25,
      aiSummary:
        'Procedimiento de despliegue con GitLab CI hacia ambientes prod/staging. No identifica a qué desarrollo pertenece.',
      defaultAction: 'revisar',
    },
  ],
}

export const RECONCILE_RESULTS: Record<ImportSource, ReconcileResult> = {
  archimate: ARCHIMATE_RESULT,
  openapi: OPENAPI_RESULT,
  sharepoint: SHAREPOINT_RESULT,
}
