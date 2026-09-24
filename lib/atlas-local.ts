'use client'

import { useEffect, useMemo, useState } from 'react'
import type { AtlasNode } from './atlas-types'
import { ATLAS_NODES } from './atlas-data'

const KEY = 'aegc:atlas-node-overrides:v1'
const EVENT = 'aegc:atlas-node-overrides-changed'

export type AtlasNodeOverride = Partial<Pick<AtlasNode,
  'label' | 'owner' | 'description' | 'domain' | 'status' | 'country' | 'tech'
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

  useEffect(() => {
    const sync = () => setOverrides(loadAtlasNodeOverrides())
    sync()
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  return useMemo(
    () => ATLAS_NODES.map((node) => ({ ...node, ...(overrides[node.id] ?? {}) })),
    [overrides],
  )
}
