// Modelo ArchiMate de ejemplo por nodo del Atlas.
// En producción esto se levanta del .archimate (XML Open Exchange Format)
// exportado desde Archi (open source) y versionado en GitLab.

export type ArchiLayer = 'motivation' | 'business' | 'application' | 'technology'

export interface ArchiElement {
  id: string
  name: string
  /** tipo ArchiMate, p.ej. 'ApplicationComponent', 'BusinessProcess' */
  type: string
  layer: ArchiLayer
  x: number
  y: number
  w?: number
  h?: number
}

export interface ArchiRelation {
  source: string
  target: string
  /** serving | flow | realization | assignment | composition | trigger */
  kind: 'serving' | 'flow' | 'realization' | 'assignment' | 'composition' | 'trigger'
  label?: string
}

export interface ArchiView {
  name: string
  source: string
  updatedAt: string
  elements: ArchiElement[]
  relations: ArchiRelation[]
}

export const ARCHI_LAYER_META: Record<ArchiLayer, { label: string; fill: string; text: string }> =
  {
    // colores estándar de la notación ArchiMate
    motivation: { label: 'Motivación', fill: 'oklch(0.86 0.06 300)', text: 'oklch(0.25 0.05 300)' },
    business: { label: 'Negocio', fill: 'oklch(0.9 0.09 95)', text: 'oklch(0.3 0.06 80)' },
    application: { label: 'Aplicación', fill: 'oklch(0.86 0.07 230)', text: 'oklch(0.28 0.06 250)' },
    technology: { label: 'Tecnología', fill: 'oklch(0.88 0.08 150)', text: 'oklch(0.28 0.06 160)' },
  }

// Vista de ejemplo para GCC (Web de Pedidos como flujo destacado)
const GCC_VIEW: ArchiView = {
  name: 'GCC · Vista de integración de pedidos',
  source: 'gcc/arquitectura · gcc.archimate',
  updatedAt: 'feb 2026',
  elements: [
    { id: 'a1', name: 'Gestión de Pedidos', type: 'BusinessProcess', layer: 'business', x: 40, y: 40, w: 200 },
    { id: 'a2', name: 'Vendedor', type: 'BusinessRole', layer: 'business', x: 300, y: 40, w: 160 },
    { id: 'a3', name: 'Web de Pedidos', type: 'ApplicationComponent', layer: 'application', x: 40, y: 170, w: 200 },
    { id: 'a4', name: 'GCC Gateway', type: 'ApplicationComponent', layer: 'application', x: 300, y: 170, w: 160 },
    { id: 'a5', name: 'API Sales Order', type: 'ApplicationService', layer: 'application', x: 520, y: 170, w: 180 },
    { id: 'a6', name: 'SAP S/4HANA', type: 'Node', layer: 'technology', x: 520, y: 320, w: 180 },
    { id: 'a7', name: 'SAP CPI', type: 'SystemSoftware', layer: 'technology', x: 300, y: 320, w: 160 },
    { id: 'a8', name: 'SQL Server', type: 'Node', layer: 'technology', x: 40, y: 320, w: 200 },
  ],
  relations: [
    { source: 'a2', target: 'a1', kind: 'assignment' },
    { source: 'a1', target: 'a3', kind: 'serving', label: 'usa' },
    { source: 'a3', target: 'a4', kind: 'flow', label: 'POST pedido' },
    { source: 'a4', target: 'a5', kind: 'serving' },
    { source: 'a5', target: 'a7', kind: 'flow', label: 'vía CPI' },
    { source: 'a7', target: 'a6', kind: 'flow', label: 'Sales Order' },
    { source: 'a3', target: 'a8', kind: 'serving', label: 'lee crédito' },
  ],
}

const SAP_VIEW: ArchiView = {
  name: 'SAP S/4HANA · Contexto de integración',
  source: 'arquitectura/core · sap.archimate',
  updatedAt: 'ene 2026',
  elements: [
    { id: 's1', name: 'ERP Central', type: 'BusinessFunction', layer: 'business', x: 260, y: 40, w: 200 },
    { id: 's2', name: 'SAP S/4HANA', type: 'ApplicationComponent', layer: 'application', x: 260, y: 170, w: 200 },
    { id: 's3', name: 'Web Dispatcher', type: 'SystemSoftware', layer: 'technology', x: 40, y: 320, w: 180 },
    { id: 's4', name: 'SAP CPI', type: 'SystemSoftware', layer: 'technology', x: 260, y: 320, w: 200 },
    { id: 's5', name: 'BigQuery (réplica)', type: 'Node', layer: 'technology', x: 500, y: 320, w: 180 },
  ],
  relations: [
    { source: 's1', target: 's2', kind: 'realization' },
    { source: 's3', target: 's2', kind: 'serving', label: 'externo' },
    { source: 's4', target: 's2', kind: 'serving', label: 'APIs' },
    { source: 's2', target: 's5', kind: 'flow', label: 'toolkit' },
  ],
}

const ARCHI_VIEWS: Record<string, ArchiView> = {
  gcc: GCC_VIEW,
  wp: GCC_VIEW,
  sap: SAP_VIEW,
}

export function getArchiView(nodeId: string): ArchiView | null {
  return ARCHI_VIEWS[nodeId] ?? null
}
