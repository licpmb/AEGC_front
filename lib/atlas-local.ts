'use client'

import { useEffect, useMemo, useState } from 'react'
import type { AtlasEdge, AtlasNode } from './atlas-types'
import { ATLAS_NODES } from './atlas-data'

const KEY = 'aegc:atlas-node-overrides:v1'
const IMPORTED_NODES_KEY = 'aegc:atlas-imported-nodes:v1'
const IMPORTED_EDGES_KEY = 'aegc:atlas-imported-edges:v1'
const EVENT = 'aegc:atlas-node-overrides-changed'
const IMPORT_EVENT = 'aegc:atlas-imports-changed'

export type AtlasNodeOverride = Partial<Pick<AtlasNode,
  'label' | 'kind' | 'owner' | 'description' | 'domain' | 'status' | 'country' | 'tech' | 'endpoints' | 'environments'
>> & {
  environmentsReplace?: boolean
}

export function loadAtlasNodeOverrides(): Record<string, AtlasNodeOverride> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function mergeEnvironments(
  base: AtlasNode['environments'] = [],
  incoming: AtlasNode['environments'] = [],
): AtlasNode['environments'] {
  const merged = [...base]
  for (const env of incoming) {
    const exact = merged.findIndex((item) =>
      item.name === env.name &&
      item.server === env.server &&
      (item.url ?? '') === (env.url ?? '')
    )
    if (exact >= 0) {
      merged[exact] = { ...merged[exact], ...env }
      continue
    }

    // Si es el mismo ambiente y mismo host, actualizamos; si cambia host/URL,
    // conservamos ambos porque pueden ser componentes distintos dentro del ambiente.
    const sameHost = merged.findIndex((item) =>
      item.name === env.name && item.server === env.server
    )
    if (sameHost >= 0) merged[sameHost] = { ...merged[sameHost], ...env }
    else merged.push(env)
  }
  return merged
}

export function saveAtlasNodeOverride(id: string, value: AtlasNodeOverride) {
  const current = loadAtlasNodeOverrides()
  const previous = current[id] ?? {}
  const nextValue: AtlasNodeOverride = {
    ...previous,
    ...value,
    ...(value.environments
      ? { environments: mergeEnvironments(previous.environments, value.environments) }
      : {}),
  }
  const next = { ...current, [id]: nextValue }
  localStorage.setItem(KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(EVENT))
}

export function useAtlasNodes() {
  const [overrides, setOverrides] = useState<Record<string, AtlasNodeOverride>>({})
  const [importedNodes, setImportedNodes] = useState<AtlasNode[]>([])

  useEffect(() => {
    const sync = () => {
      setOverrides(loadAtlasNodeOverrides())
      setImportedNodes(loadImportedNodes())
    }
    sync()
    window.addEventListener(EVENT, sync)
    window.addEventListener(IMPORT_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener(IMPORT_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  return useMemo(
    () => [...ATLAS_NODES, ...importedNodes.filter((n) => !ATLAS_NODES.some((base) => base.id === n.id))]
      .map((node) => {
        const override = overrides[node.id] ?? {}
        return {
          ...node,
          ...override,
          environments: override.environmentsReplace
            ? (override.environments ?? [])
            : mergeEnvironments(node.environments, override.environments),
        }
      }),
    [overrides, importedNodes],
  )
}


export function loadImportedNodes(): AtlasNode[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(IMPORTED_NODES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function loadImportedEdges(): AtlasEdge[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(IMPORTED_EDGES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function upsertImportedNode(node: AtlasNode) {
  const current = loadImportedNodes()
  const next = [...current.filter((n) => n.id !== node.id), node]
  localStorage.setItem(IMPORTED_NODES_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(IMPORT_EVENT))
}

export function upsertImportedEdge(edge: AtlasEdge) {
  const current = loadImportedEdges()
  const next = [...current.filter((e) => e.id !== edge.id), edge]
  localStorage.setItem(IMPORTED_EDGES_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(IMPORT_EVENT))
}

export function useImportedEdges() {
  const [edges, setEdges] = useState<AtlasEdge[]>([])
  useEffect(() => {
    const sync = () => setEdges(loadImportedEdges())
    sync()
    window.addEventListener(IMPORT_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(IMPORT_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return edges
}


export function saveAtlasNodeEnvironments(id: string, environments: NonNullable<AtlasNode['environments']>) {
  const current = loadAtlasNodeOverrides()
  const previous = current[id] ?? {}
  const next = {
    ...current,
    [id]: {
      ...previous,
      environments,
      environmentsReplace: true,
    },
  }
  localStorage.setItem(KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(EVENT))
}
