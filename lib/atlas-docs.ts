import {
  DOC_STATUS_META,
  type DocSource,
  type DocSourceKind,
  type DocStatus,
} from './atlas-types'
import { ATLAS_NODES } from './atlas-data'

const ALL_SOURCES: DocSourceKind[] = ['sharepoint', 'gitlab', 'archimate']

/**
 * SharePoint compartido a nivel familia: GCC y todos sus hijos usan el mismo
 * sitio de SharePoint contra SAP. Se define una vez y se hereda.
 */
const SHARED_SHAREPOINT_GCC: DocSource = {
  kind: 'sharepoint',
  status: 'parcial',
  url: '#',
  updatedAt: 'dic 2025',
  note: 'Sitio único de la familia GCC contra SAP. Manual de usuario, falta técnico.',
}

/** Ids de la familia GCC que comparten el SharePoint contra SAP. */
const GCC_FAMILY = new Set([
  'gcc',
  'wp',
  'smart-panel',
  'mobile',
  'autogestion',
  'web-empleados',
])

/**
 * Cobertura documental cargada por desarrollo (SharePoint, GitLab, ArchiMate).
 * Lo que no aparezca se considera "faltante". El SharePoint de la familia GCC
 * se resuelve como compartido en `getDocCoverage`.
 * En producción: SharePoint (Graph), GitLab (repos/wiki) y ArchiMate
 * (Open Exchange / Archi).
 */
const RAW_DOCS: Record<string, DocSource[]> = {
  'sap-s4': [
    { kind: 'sharepoint', status: 'completo', url: '#', updatedAt: 'mar 2026', note: 'Landscape y contratos de servicio.' },
    { kind: 'gitlab', status: 'faltante', note: 'ABAP no versionado en GitLab.' },
    { kind: 'archimate', status: 'completo', url: '#', updatedAt: 'feb 2026', note: 'Capa de aplicación modelada.' },
  ],
  cpi: [
    { kind: 'sharepoint', status: 'desactualizado', url: '#', updatedAt: 'ago 2025', note: 'Matriz de iFlows vieja.' },
    { kind: 'gitlab', status: 'parcial', url: '#', updatedAt: 'feb 2026', note: 'Solo scripts de despliegue.' },
    { kind: 'archimate', status: 'parcial', url: '#', updatedAt: 'nov 2025', note: 'Flujos de integración a medias.' },
  ],
  // GCC: el SharePoint es compartido (heredado); GitLab/ArchiMate propios.
  gcc: [
    { kind: 'gitlab', status: 'completo', url: '#', updatedAt: 'mar 2026', note: 'README + wiki por servicio.' },
    { kind: 'archimate', status: 'desactualizado', url: '#', updatedAt: 'jul 2025', note: 'No incluye ramas nuevas.' },
  ],
  wp: [
    { kind: 'gitlab', status: 'completo', url: '#', updatedAt: 'mar 2026' },
    { kind: 'archimate', status: 'faltante', note: 'No modelado.' },
  ],
  'smart-panel': [
    { kind: 'gitlab', status: 'parcial', url: '#', updatedAt: 'feb 2026', note: 'README mínimo.' },
    { kind: 'archimate', status: 'faltante', note: 'No modelado.' },
  ],
  mobile: [
    { kind: 'gitlab', status: 'completo', url: '#', updatedAt: 'mar 2026' },
    { kind: 'archimate', status: 'faltante', note: 'No modelado.' },
  ],
  autogestion: [
    { kind: 'gitlab', status: 'parcial', url: '#', updatedAt: 'feb 2026' },
    { kind: 'archimate', status: 'faltante' },
  ],
  'web-empleados': [
    { kind: 'gitlab', status: 'completo', url: '#', updatedAt: 'mar 2026' },
    { kind: 'archimate', status: 'desactualizado', url: '#', updatedAt: 'jun 2025' },
  ],
  'loader-sql': [
    { kind: 'sharepoint', status: 'faltante' },
    { kind: 'gitlab', status: 'completo', url: '#', updatedAt: 'mar 2026' },
    { kind: 'archimate', status: 'faltante' },
  ],
  bigquery: [
    { kind: 'sharepoint', status: 'parcial', url: '#', updatedAt: 'dic 2025' },
    { kind: 'gitlab', status: 'faltante' },
    { kind: 'archimate', status: 'parcial', url: '#', updatedAt: 'nov 2025' },
  ],
  'sap-toolkit': [
    { kind: 'sharepoint', status: 'desactualizado', url: '#', updatedAt: 'jul 2025', note: 'Guía de instalación vieja.' },
    { kind: 'gitlab', status: 'faltante', note: 'Config no versionada.' },
    { kind: 'archimate', status: 'faltante' },
  ],
  'builder-comercial': [
    { kind: 'sharepoint', status: 'faltante' },
    { kind: 'gitlab', status: 'completo', url: '#', updatedAt: 'mar 2026' },
    { kind: 'archimate', status: 'faltante' },
  ],
  sqlserver: [
    { kind: 'sharepoint', status: 'parcial', url: '#', updatedAt: 'dic 2025' },
    { kind: 'gitlab', status: 'faltante' },
    { kind: 'archimate', status: 'parcial', url: '#', updatedAt: 'nov 2025' },
  ],
}

/** Mejor estado gana (faltante < desactualizado < parcial < completo). */
const STATUS_ORDER: DocStatus[] = ['faltante', 'desactualizado', 'parcial', 'completo']
function best(a: DocStatus, b: DocStatus): DocStatus {
  return STATUS_ORDER.indexOf(a) >= STATUS_ORDER.indexOf(b) ? a : b
}

/** Todos los descendientes (recursivo) de un nodo. */
function descendantsOf(nodeId: string): string[] {
  const out: string[] = []
  const stack = ATLAS_NODES.filter((n) => n.parentId === nodeId).map((n) => n.id)
  while (stack.length) {
    const cur = stack.pop() as string
    out.push(cur)
    for (const n of ATLAS_NODES) if (n.parentId === cur) stack.push(n.id)
  }
  return out
}

/**
 * Cobertura de un nodo (3 fuentes), resolviendo:
 * - SharePoint compartido de la familia GCC (heredado).
 * - Rollup del padre: GCC agrega el peor estado propio + de sus hijos.
 */
export function getDocCoverage(nodeId: string): DocSource[] {
  const raw = RAW_DOCS[nodeId] ?? []
  const byKind = new Map(raw.map((d) => [d.kind, d]))

  // SharePoint compartido para la familia GCC
  if (GCC_FAMILY.has(nodeId) && !byKind.has('sharepoint')) {
    byKind.set('sharepoint', {
      ...SHARED_SHAREPOINT_GCC,
      shared: true,
      via: nodeId === 'gcc' ? undefined : 'GCC',
    })
  }

  let coverage = ALL_SOURCES.map(
    (kind) => byKind.get(kind) ?? ({ kind, status: 'faltante' as DocStatus }),
  )

  // Padre (ej. GCC): "tiene todo lo de los hijos" → mejor estado del árbol.
  const kids = descendantsOf(nodeId)
  if (kids.length > 0) {
    coverage = coverage.map((d) => {
      let st = d.status
      let rolled = false
      for (const kidId of kids) {
        const kidRaw = RAW_DOCS[kidId] ?? []
        const kidDoc = kidRaw.find((k) => k.kind === d.kind)
        const kidStatus =
          kidDoc?.status ??
          (GCC_FAMILY.has(kidId) && d.kind === 'sharepoint'
            ? SHARED_SHAREPOINT_GCC.status
            : 'faltante')
        const merged = best(st, kidStatus)
        if (merged !== st) rolled = true
        st = merged
      }
      return rolled ? { ...d, status: st, rollup: true } : d
    })
  }

  return coverage
}

/** % de completitud 0-100 según pesos por estado. */
export function getDocCompleteness(nodeId: string): number {
  const cov = getDocCoverage(nodeId)
  const sum = cov.reduce((acc, d) => acc + DOC_STATUS_META[d.status].weight, 0)
  return Math.round((sum / cov.length) * 100)
}

/** Ids de nodos que tienen cobertura cargada (los "desarrollos" documentables). */
export const DOCUMENTED_NODE_IDS = Object.keys(RAW_DOCS)
