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
>>

export function loadAtlasNodeOverrides(): Record<string, AtlasNodeOverride> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveAtlasNodeOverride(id: string, value: AtlasNodeOverride) {
  const current = loadAtlasNodeOverrides()
  const next = { ...current, [id]: { ...(current[id] ?? {}), ...value } }
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
      .map((node) => ({ ...node, ...(overrides[node.id] ?? {}) })),
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
