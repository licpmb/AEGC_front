'use client'

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AtlasFlowNode, type AtlasFlowNodeData } from './atlas-node'
import { DetailPanel } from './detail-panel'
import { ArchimateViewer } from './archimate-viewer'
import { EndpointExplorer } from './endpoint-explorer'
import { MapToolbar, type MapFilters } from './map-toolbar'
import { ATLAS_EDGES, ATLAS_ISSUES, ATLAS_NODES } from '@/lib/atlas-data'
import { GROUP_META, KIND_META, type AtlasEdge, type AtlasNode } from '@/lib/atlas-types'
import { useAtlasNodes } from '@/lib/atlas-local'
import { NodeEditor } from './node-editor'
import { RelationEditor } from './relation-editor'

const HAS_ENDPOINTS = new Set(
  ATLAS_NODES.filter((n) => (n.endpoints?.length ?? 0) > 0).map((n) => n.id),
)

const nodeTypes = { atlas: AtlasFlowNode }

const HEALTH_COLOR: Record<string, string> = {
  ok: 'var(--flow-neutral)',
  degradado: 'var(--chart-1)',
  caido: 'var(--destructive)',
  sin_dato: 'var(--flow-neutral)',
}

// ---- hierarchy helpers (static, derived from the dataset) ----
const PARENT_OF = new Map(ATLAS_NODES.map((n) => [n.id, n.parentId]))
const CHILDREN_OF = new Map<string, string[]>()
for (const n of ATLAS_NODES) {
  if (!n.parentId) continue
  const arr = CHILDREN_OF.get(n.parentId) ?? []
  arr.push(n.id)
  CHILDREN_OF.set(n.parentId, arr)
}
function descendantCount(id: string): number {
  let total = 0
  const stack = [...(CHILDREN_OF.get(id) ?? [])]
  while (stack.length) {
    const cur = stack.pop() as string
    total += 1
    stack.push(...(CHILDREN_OF.get(cur) ?? []))
  }
  return total
}
/** Visible stand-in for a node given the set of collapsed parents. */
function representative(id: string, collapsed: Set<string>): string {
  const chain: string[] = []
  let cur: string | undefined = id
  while (cur) {
    chain.push(cur)
    cur = PARENT_OF.get(cur)
  }
  // shallowest collapsed ancestor (closest to root) wins
  for (let i = chain.length - 1; i >= 1; i--) {
    if (collapsed.has(chain[i])) return chain[i]
  }
  return id
}

type EffEdge = {
  id: string
  source: string
  target: string
  direction: AtlasNode extends never ? never : (typeof ATLAS_EDGES)[number]['direction']
  health: (typeof ATLAS_EDGES)[number]['health']
  label?: string
  aggregated: boolean
}

const GRID_GAP = { x: 56, y: 44 } as const

/**
 * Alinea la disposición actual a una cuadrícula sin reinterpretar el grafo.
 * Mantiene el orden y la cercanía relativa de los artefactos; sólo corrige
 * coordenadas y evita que dos nodos terminen ocupando la misma celda.
 */
function alignToGrid(
  currentNodes: Node[],
  visibleIds: Set<string>,
): Map<string, { x: number; y: number }> {
  const visible = currentNodes.filter((n) => visibleIds.has(n.id))
  if (!visible.length) return new Map()

  const widthOf = (n: Node) =>
    n.measured?.width ??
    (typeof n.width === 'number' ? n.width : undefined) ??
    (typeof n.style?.width === 'number' ? n.style.width : undefined) ??
    190
  const heightOf = (n: Node) =>
    n.measured?.height ??
    (typeof n.height === 'number' ? n.height : undefined) ??
    (typeof n.style?.height === 'number' ? n.style.height : undefined) ??
    58

  const stepX = Math.max(...visible.map(widthOf)) + GRID_GAP.x
  const stepY = Math.max(...visible.map(heightOf)) + GRID_GAP.y
  const originX = Math.min(...visible.map((n) => n.position.x))
  const originY = Math.min(...visible.map((n) => n.position.y))

  // Prioridad manual: arriba→abajo y, dentro de la misma franja, izquierda→derecha.
  const ordered = [...visible].sort((a, b) => {
    const rowA = Math.round((a.position.y - originY) / stepY)
    const rowB = Math.round((b.position.y - originY) / stepY)
    if (rowA !== rowB) return rowA - rowB
    if (a.position.x !== b.position.x) return a.position.x - b.position.x
    return a.id.localeCompare(b.id)
  })

  const occupied = new Set<string>()
  const positions = new Map<string, { x: number; y: number }>()

  const nearestFree = (wantedX: number, wantedY: number) => {
    const candidates: Array<{ gx: number; gy: number; score: number }> = []
    for (let radius = 0; radius <= 12; radius++) {
      candidates.length = 0
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (radius > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
          const gx = Math.max(0, wantedX + dx)
          const gy = Math.max(0, wantedY + dy)
          const key = `${gx}:${gy}`
          if (occupied.has(key)) continue
          // Preferimos mínima desviación; en empate conserva izquierda→derecha / arriba→abajo.
          const score = dx * dx + dy * dy
          candidates.push({ gx, gy, score })
        }
      }
      if (candidates.length) {
        candidates.sort((a, b) => a.score - b.score || a.gy - b.gy || a.gx - b.gx)
        const best = candidates[0]
        occupied.add(`${best.gx}:${best.gy}`)
        return best
      }
    }
    const fallback = { gx: wantedX, gy: wantedY, score: 0 }
    occupied.add(`${fallback.gx}:${fallback.gy}`)
    return fallback
  }

  for (const node of ordered) {
    const wantedX = Math.max(0, Math.round((node.position.x - originX) / stepX))
    const wantedY = Math.max(0, Math.round((node.position.y - originY) / stepY))
    const cell = nearestFree(wantedX, wantedY)
    positions.set(node.id, {
      x: originX + cell.gx * stepX,
      y: originY + cell.gy * stepY,
    })
  }

  return positions
}

type MultiNodeAction =
  | 'align-left'
  | 'align-center-x'
  | 'align-right'
  | 'align-top'
  | 'align-center-y'
  | 'align-bottom'
  | 'distribute-horizontal'
  | 'distribute-vertical'
  | 'same-width'
  | 'same-height'
  | 'same-size'

function nodeWidth(n: Node): number {
  return (
    (typeof n.style?.width === 'number' ? n.style.width : undefined) ??
    (typeof n.width === 'number' ? n.width : undefined) ??
    n.measured?.width ??
    190
  )
}

function nodeHeight(n: Node): number {
  return (
    (typeof n.style?.height === 'number' ? n.style.height : undefined) ??
    (typeof n.height === 'number' ? n.height : undefined) ??
    n.measured?.height ??
    58
  )
}

type UndoSnapshot = {
  nodes: Array<{
    id: string
    position: { x: number; y: number }
    style?: Node['style']
  }>
  edgeHandles: Record<string, { sourceHandle?: string; targetHandle?: string }>
  edgeEndpoints: Record<string, { source: string; target: string }>
  createdEdges: AtlasEdge[]
  relationOverrides: Record<string, AtlasEdge>
  deletedEdgeIds: string[]
}

type PersistedLayout = UndoSnapshot & {
  version: 1
  savedAt: string
}

const LAYOUT_STORAGE_KEY = 'aegc:atlas-map:layout:v5'
const PREVIOUS_LAYOUT_STORAGE_KEY = 'aegc:atlas-map:layout:v4'

function MapInner() {
  const atlasNodes = useAtlasNodes()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [archimateFor, setArchimateFor] = useState<string | null>(null)
  const [endpointsView, setEndpointsView] = useState<{
    nodeId: string
    connectionToId?: string | null
  } | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(ATLAS_NODES.filter((n) => n.kind === 'interface' && ATLAS_NODES.some((c) => c.parentId === n.id)).map((n) => n.id)),
  )
  // reruteo manual de flechas: por id de arista → handles elegidos
  const [edgeHandles, setEdgeHandles] = useState<
    Record<string, { sourceHandle?: string; targetHandle?: string }>
  >({})
  const [edgeEndpoints, setEdgeEndpoints] = useState<
    Record<string, { source: string; target: string }>
  >({})
  const [createdEdges, setCreatedEdges] = useState<AtlasEdge[]>([])
  const [relationOverrides, setRelationOverrides] = useState<Record<string, AtlasEdge>>({})
  const [deletedEdgeIds, setDeletedEdgeIds] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<MapFilters>({
    query: '',
    groups: ['core', 'plataforma', 'integracion', 'aplicacion', 'datos', 'externo'],
    countries: [],
    direction: 'todos',
    showIssues: true,
    onlyWithIssues: false,
  })
  const { fitView } = useReactFlow()

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Issues abiertos por nodo, con rollup hacia los padres.
  const issueStats = useMemo(() => {
    const map = new Map<string, { open: number; blocking: number }>()
    const bump = (id: string, blocking: boolean) => {
      const cur = map.get(id) ?? { open: 0, blocking: 0 }
      cur.open += 1
      if (blocking) cur.blocking += 1
      map.set(id, cur)
    }
    for (const i of ATLAS_ISSUES) {
      if (i.state === 'cerrado') continue
      const blocking = i.severity === 'bloqueante'
      bump(i.nodeId, blocking)
      let parent = PARENT_OF.get(i.nodeId)
      const seen = new Set<string>([i.nodeId])
      while (parent && !seen.has(parent)) {
        seen.add(parent)
        bump(parent, blocking)
        parent = PARENT_OF.get(parent)
      }
    }
    return map
  }, [])

  const allRelations = useMemo<AtlasEdge[]>(() => {
    const base = ATLAS_EDGES
      .filter((edge) => !deletedEdgeIds.has(edge.id))
      .map((edge) => relationOverrides[edge.id] ?? edge)
    const local = createdEdges
      .filter((edge) => !deletedEdgeIds.has(edge.id))
      .map((edge) => relationOverrides[edge.id] ?? edge)
    return [...base, ...local]
  }, [createdEdges, relationOverrides, deletedEdgeIds])

  // Effective edges after applying collapse (remap endpoints, drop internals, dedupe)
  const effectiveEdges = useMemo<EffEdge[]>(() => {
    const seen = new Set<string>()
    const out: EffEdge[] = []
    for (const e of allRelations) {
      const endpointOverride = edgeEndpoints[e.id]
      const rawSource = endpointOverride?.source ?? e.source
      const rawTarget = endpointOverride?.target ?? e.target
      const s = representative(rawSource, collapsed)
      const t = representative(rawTarget, collapsed)
      if (s === t) continue
      const aggregated = s !== rawSource || t !== rawTarget
      const key = `${s}|${t}|${e.direction}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        id: `eff-${e.id}`,
        source: s,
        target: t,
        direction: e.direction,
        health: e.health,
        label: aggregated ? undefined : e.label,
        aggregated,
      })
    }
    return out
  }, [collapsed, edgeEndpoints, allRelations])

  // Which nodes pass the filters (collapse + group + country + direction + query + issues)
  const visibleIds = useMemo(() => {
    const q = filters.query.trim().toLowerCase()
    const dirNodes = new Set<string>()
    if (filters.direction !== 'todos') {
      for (const e of effectiveEdges) {
        if (e.direction === filters.direction || e.direction === 'bidireccional') {
          dirNodes.add(e.source)
          dirNodes.add(e.target)
        }
      }
    }
    return new Set(
      atlasNodes.filter((n) => {
        if (representative(n.id, collapsed) !== n.id) return false // hidden under a collapsed parent
        if (!filters.groups.includes(KIND_META[n.kind].group)) return false
        if (filters.countries.length > 0 && n.country && !filters.countries.includes(n.country))
          return false
        if (filters.direction !== 'todos' && !dirNodes.has(n.id)) return false
        if (filters.onlyWithIssues && !(issueStats.get(n.id)?.open ?? 0)) return false
        if (q) {
          const hay = `${n.label} ${n.domain} ${n.owner} ${n.tech?.join(' ') ?? ''} ${n.gitlab?.path ?? ''} ${n.country ?? ''}`
          if (!hay.toLowerCase().includes(q)) return false
        }
        return true
      }).map((n) => n.id),
    )
  }, [filters, issueStats, collapsed, effectiveEdges, atlasNodes])

  // Neighbourhood of the selected node, for focus highlight
  const focusSet = useMemo(() => {
    if (!selectedId) return null
    const s = new Set<string>([selectedId])
    for (const e of effectiveEdges) {
      if (e.source === selectedId) s.add(e.target)
      if (e.target === selectedId) s.add(e.source)
    }
    return s
  }, [selectedId, effectiveEdges])

  const initialNodes: Node[] = useMemo(
    () =>
      atlasNodes.map((n) => ({
        id: n.id,
        type: 'atlas',
        position: { x: n.x, y: n.y },
        ...(n.width && n.height ? { style: { width: n.width, height: n.height } } : {}),
        data: {
          node: n,
          openIssues: 0,
          blocking: 0,
          dimmed: false,
          focused: false,
          showIssues: true,
        } satisfies AtlasFlowNodeData as unknown as Record<string, unknown>,
      })),
    [atlasNodes],
  )

  const [nodes, setNodes] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const undoStackRef = useRef<UndoSnapshot[]>([])
  const undoingRef = useRef(false)
  const nodesRef = useRef<Node[]>(nodes)
  const edgeHandlesRef = useRef(edgeHandles)
  const edgeEndpointsRef = useRef(edgeEndpoints)
  const createdEdgesRef = useRef(createdEdges)
  const relationOverridesRef = useRef(relationOverrides)
  const deletedEdgeIdsRef = useRef(deletedEdgeIds)
  const persistenceLoadedRef = useRef(false)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Refs vivos para que el callback de historial sea estable y no dispare efectos.
  nodesRef.current = nodes
  edgeHandlesRef.current = edgeHandles
  edgeEndpointsRef.current = edgeEndpoints
  createdEdgesRef.current = createdEdges
  relationOverridesRef.current = relationOverrides
  deletedEdgeIdsRef.current = deletedEdgeIds
  // React Flow guarda el resize principalmente en "measured/dimensions".
  // Lo normalizamos también a style.width/style.height para que sobreviva
  // desmontajes, cambios de vista y recargas.
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((prev) => {
      const applied = applyNodeChanges(changes, prev)
      const dimensions = new Map<string, { width: number; height: number }>()
      for (const change of changes) {
        if (change.type === 'dimensions' && change.dimensions) {
          dimensions.set(change.id, {
            width: change.dimensions.width,
            height: change.dimensions.height,
          })
        }
      }

      const next = dimensions.size
        ? applied.map((node) => {
            const size = dimensions.get(node.id)
            if (!size) return node
            return {
              ...node,
              style: {
                ...(node.style ?? {}),
                width: size.width,
                height: size.height,
              },
            }
          })
        : applied

      nodesRef.current = next
      return next
    })
  }, [setNodes])


  // Recupera el layout editado en este navegador: posiciones, tamaños y puntos
  // manuales de conexión. Se aplica una sola vez al montar el mapa.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
      const legacyRaw = window.localStorage.getItem(PREVIOUS_LAYOUT_STORAGE_KEY)
      if (raw || legacyRaw) {
        const saved = JSON.parse(raw ?? legacyRaw ?? '{}') as PersistedLayout
        const preserveLegacyPositions = Boolean(raw)
        if (saved?.version === 1 && Array.isArray(saved.nodes)) {
          const byId = new Map(saved.nodes.map((node) => [node.id, node]))
          setNodes((prev) =>
            prev.map((node) => {
              const persisted = byId.get(node.id)
              if (!persisted) return node
              return {
                ...node,
                position: preserveLegacyPositions ? { ...persisted.position } : node.position,
                style: persisted.style ? { ...persisted.style } : node.style,
              }
            }),
          )
          if (saved.edgeHandles && typeof saved.edgeHandles === 'object') {
            const restoredHandles = Object.fromEntries(
              Object.entries(saved.edgeHandles).map(([id, handles]) => [id, { ...handles }]),
            )
            edgeHandlesRef.current = restoredHandles
            setEdgeHandles(restoredHandles)
          }
          if (saved.edgeEndpoints && typeof saved.edgeEndpoints === 'object') {
            const restoredEndpoints = Object.fromEntries(
              Object.entries(saved.edgeEndpoints)
                .filter(([, value]) => value && typeof value.source === 'string' && typeof value.target === 'string')
                .map(([id, value]) => [id, { source: value.source, target: value.target }]),
            )
            edgeEndpointsRef.current = restoredEndpoints
            setEdgeEndpoints(restoredEndpoints)
          }
          if (Array.isArray(saved.createdEdges)) {
            createdEdgesRef.current = saved.createdEdges
            setCreatedEdges(saved.createdEdges)
          }
          if (saved.relationOverrides && typeof saved.relationOverrides === 'object') {
            relationOverridesRef.current = saved.relationOverrides
            setRelationOverrides(saved.relationOverrides)
          }
          if (Array.isArray(saved.deletedEdgeIds)) {
            const restoredDeleted = new Set(saved.deletedEdgeIds)
            deletedEdgeIdsRef.current = restoredDeleted
            setDeletedEdgeIds(restoredDeleted)
          }
        }
      }
    } catch {
      // Un dato local corrupto no debe impedir cargar el mapa.
    } finally {
      persistenceLoadedRef.current = true
    }
  }, [setNodes])

  const persistLayoutNow = useCallback(() => {
    if (!persistenceLoadedRef.current) return
    try {
      const payload: PersistedLayout = {
        version: 1,
        savedAt: new Date().toISOString(),
        nodes: nodesRef.current.map((node) => ({
          id: node.id,
          position: { ...node.position },
          style: {
            ...(node.style ?? {}),
            width: nodeWidth(node),
            height: nodeHeight(node),
          },
        })),
        edgeHandles: Object.fromEntries(
          Object.entries(edgeHandlesRef.current).map(([id, handles]) => [id, { ...handles }]),
        ),
        edgeEndpoints: Object.fromEntries(
          Object.entries(edgeEndpointsRef.current).map(([id, endpoints]) => [id, { ...endpoints }]),
        ),
        createdEdges: createdEdgesRef.current.map((edge) => ({ ...edge })),
      relationOverrides: Object.fromEntries(
        Object.entries(relationOverridesRef.current).map(([id, edge]) => [id, { ...edge }]),
      ),
      deletedEdgeIds: [...deletedEdgeIdsRef.current],
        relationOverrides: Object.fromEntries(
          Object.entries(relationOverridesRef.current).map(([id, edge]) => [id, { ...edge }]),
        ),
        deletedEdgeIds: [...deletedEdgeIdsRef.current],
      }
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Si el storage está bloqueado o lleno, el mapa sigue funcionando en memoria.
    }
  }, [])

  // Autoguardado local con debounce para no escribir durante cada frame de drag/resize.
  useEffect(() => {
    if (!persistenceLoadedRef.current) return
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)

    persistTimerRef.current = setTimeout(() => {
      persistLayoutNow()
      persistTimerRef.current = null
    }, 250)

    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    }
  }, [nodes, edgeHandles, edgeEndpoints, createdEdges, relationOverrides, deletedEdgeIds, persistLayoutNow])

  // Flush de seguridad: si el usuario sale, recarga o cierra la pestaña antes del
  // debounce, persistimos el último estado visible del mapa.
  useEffect(() => {
    const flush = () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current)
        persistTimerRef.current = null
      }
      persistLayoutNow()
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [persistLayoutNow])

  const pushUndoSnapshot = useCallback(() => {
    if (undoingRef.current) return
    const snapshot: UndoSnapshot = {
      nodes: nodesRef.current.map((node) => ({
        id: node.id,
        position: { ...node.position },
        style: {
          ...(node.style ?? {}),
          width: nodeWidth(node),
          height: nodeHeight(node),
        },
      })),
      edgeHandles: Object.fromEntries(
        Object.entries(edgeHandlesRef.current).map(([id, handles]) => [id, { ...handles }]),
      ),
      edgeEndpoints: Object.fromEntries(
        Object.entries(edgeEndpointsRef.current).map(([id, endpoints]) => [id, { ...endpoints }]),
      ),
      createdEdges: createdEdgesRef.current.map((edge) => ({ ...edge })),
    }

    const stack = undoStackRef.current
    const prev = stack[stack.length - 1]
    const serialized = JSON.stringify(snapshot)
    if (prev && JSON.stringify(prev) === serialized) return
    stack.push(snapshot)
    if (stack.length > 50) stack.shift()
  }, [])

  const undo = useCallback(() => {
    const snapshot = undoStackRef.current.pop()
    if (!snapshot) return

    undoingRef.current = true
    const byId = new Map(snapshot.nodes.map((node) => [node.id, node]))
    setNodes((prev) =>
      prev.map((node) => {
        const saved = byId.get(node.id)
        if (!saved) return node
        return {
          ...node,
          position: { ...saved.position },
          style: saved.style ? { ...saved.style } : undefined,
        }
      }),
    )
    const restoredHandles = Object.fromEntries(
      Object.entries(snapshot.edgeHandles).map(([id, handles]) => [id, { ...handles }]),
    )
    edgeHandlesRef.current = restoredHandles
    setEdgeHandles(restoredHandles)
    const restoredEndpoints = Object.fromEntries(
      Object.entries(snapshot.edgeEndpoints ?? {}).map(([id, endpoints]) => [id, { ...endpoints }]),
    )
    edgeEndpointsRef.current = restoredEndpoints
    setEdgeEndpoints(restoredEndpoints)
    const restoredCreatedEdges = (snapshot.createdEdges ?? []).map((edge) => ({ ...edge }))
    createdEdgesRef.current = restoredCreatedEdges
    setCreatedEdges(restoredCreatedEdges)
    const restoredOverrides = Object.fromEntries(
      Object.entries(snapshot.relationOverrides ?? {}).map(([id, edge]) => [id, { ...edge }]),
    )
    relationOverridesRef.current = restoredOverrides
    setRelationOverrides(restoredOverrides)
    const restoredDeleted = new Set(snapshot.deletedEdgeIds ?? [])
    deletedEdgeIdsRef.current = restoredDeleted
    setDeletedEdgeIds(restoredDeleted)
    requestAnimationFrame(() => {
      undoingRef.current = false
    })
  }, [setNodes])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) return

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo])

  const applyMultiNodeAction = useCallback(
    (action: MultiNodeAction) => {
      if (selectedNodeIds.length < 2) return
      pushUndoSnapshot()

      const selectedNodes = nodes.filter((n) => selectedNodeIds.includes(n.id))
      if (selectedNodes.length < 2) return

      // Sólo las acciones de tamaño toman al primer seleccionado como referencia.
      const reference = selectedNodes.find((n) => n.id === selectedNodeIds[0]) ?? selectedNodes[0]
      const refWidth = nodeWidth(reference)
      const refHeight = nodeHeight(reference)

      // Las acciones de alineación usan el conjunto completo seleccionado.
      const left = Math.min(...selectedNodes.map((n) => n.position.x))
      const right = Math.max(...selectedNodes.map((n) => n.position.x + nodeWidth(n)))
      const top = Math.min(...selectedNodes.map((n) => n.position.y))
      const bottom = Math.max(...selectedNodes.map((n) => n.position.y + nodeHeight(n)))
      const centerX = (left + right) / 2
      const centerY = (top + bottom) / 2
      const selected = new Set(selectedNodeIds)

      if (action === 'distribute-horizontal') {
        if (selectedNodes.length < 3) return
        const ordered = [...selectedNodes].sort((a, b) => a.position.x - b.position.x)
        const first = ordered[0]
        const last = ordered[ordered.length - 1]
        const start = first.position.x
        const end = last.position.x + nodeWidth(last)
        const totalWidths = ordered.reduce((sum, node) => sum + nodeWidth(node), 0)
        const gap = (end - start - totalWidths) / (ordered.length - 1)
        const xById = new Map<string, number>()
        let cursor = start
        for (const node of ordered) {
          xById.set(node.id, cursor)
          cursor += nodeWidth(node) + gap
        }
        setNodes((prev) =>
          prev.map((node) =>
            selected.has(node.id)
              ? { ...node, position: { ...node.position, x: xById.get(node.id) ?? node.position.x } }
              : node,
          ),
        )
        requestAnimationFrame(() => persistLayoutNow())
        return
      }

      if (action === 'distribute-vertical') {
        if (selectedNodes.length < 3) return
        const ordered = [...selectedNodes].sort((a, b) => a.position.y - b.position.y)
        const first = ordered[0]
        const last = ordered[ordered.length - 1]
        const start = first.position.y
        const end = last.position.y + nodeHeight(last)
        const totalHeights = ordered.reduce((sum, node) => sum + nodeHeight(node), 0)
        const gap = (end - start - totalHeights) / (ordered.length - 1)
        const yById = new Map<string, number>()
        let cursor = start
        for (const node of ordered) {
          yById.set(node.id, cursor)
          cursor += nodeHeight(node) + gap
        }
        setNodes((prev) =>
          prev.map((node) =>
            selected.has(node.id)
              ? { ...node, position: { ...node.position, y: yById.get(node.id) ?? node.position.y } }
              : node,
          ),
        )
        requestAnimationFrame(() => persistLayoutNow())
        return
      }

      setNodes((prev) =>
        prev.map((node) => {
          if (!selected.has(node.id)) return node

          const width = nodeWidth(node)
          const height = nodeHeight(node)

          if (action === 'same-width') {
            if (node.id === reference.id) return node
            return { ...node, style: { ...node.style, width: refWidth } }
          }
          if (action === 'same-height') {
            if (node.id === reference.id) return node
            return { ...node, style: { ...node.style, height: refHeight } }
          }
          if (action === 'same-size') {
            if (node.id === reference.id) return node
            return { ...node, style: { ...node.style, width: refWidth, height: refHeight } }
          }

          let x = node.position.x
          let y = node.position.y
          if (action === 'align-left') x = left
          if (action === 'align-center-x') x = centerX - width / 2
          if (action === 'align-right') x = right - width
          if (action === 'align-top') y = top
          if (action === 'align-center-y') y = centerY - height / 2
          if (action === 'align-bottom') y = bottom - height

          return { ...node, position: { x, y } }
        }),
      )
      requestAnimationFrame(() => persistLayoutNow())
    },
    [nodes, selectedNodeIds, setNodes, pushUndoSnapshot, persistLayoutNow],
  )

  const autoArrange = useCallback(() => {
    pushUndoSnapshot()
    const positions = alignToGrid(nodes, visibleIds)
    if (!positions.size) return

    setSelectedId(null)
    setSelectedNodeIds([])
    setSelectedEdgeId(null)
    setNodes((prev) =>
      prev.map((node) => {
        const position = positions.get(node.id)
        return position ? { ...node, position } : node
      }),
    )

    requestAnimationFrame(() => {
      persistLayoutNow()
      void fitView({ duration: 400, padding: 0.15 })
    })
  }, [nodes, visibleIds, setNodes, fitView, pushUndoSnapshot, persistLayoutNow])

  // Clear selection if the selected node becomes hidden
  useEffect(() => {
    if (selectedId && !visibleIds.has(selectedId)) setSelectedId(null)
  }, [visibleIds, selectedId])

  // Recompute node data on filter / selection / collapse / orientation change
  useEffect(() => {
    setNodes((prev) =>
      prev.map((rf) => {
        const node = atlasNodes.find((n) => n.id === rf.id) as AtlasNode
        const stats = issueStats.get(node.id) ?? { open: 0, blocking: 0 }
        const visible = visibleIds.has(node.id)
        const inFocus = focusSet ? focusSet.has(node.id) : true
        const kids = CHILDREN_OF.get(node.id)?.length ?? 0
        return {
          ...rf,
          hidden: !visible,
          data: {
            node,
            openIssues: stats.open,
            blocking: stats.blocking,
            dimmed: !inFocus,
            focused: node.id === selectedId,
            showIssues: filters.showIssues,
            hasChildren: kids > 0,
            collapsed: collapsed.has(node.id),
            hiddenChildren: collapsed.has(node.id) ? descendantCount(node.id) : 0,
            onToggleCollapse: toggleCollapse,
            onBeforeResize: pushUndoSnapshot,
            onAfterResize: () => requestAnimationFrame(() => persistLayoutNow()),
          } satisfies AtlasFlowNodeData as unknown as Record<string, unknown>,
        }
      }),
    )
  }, [
    visibleIds,
    focusSet,
    selectedId,
    issueStats,
    filters.showIssues,
    collapsed,
    setNodes,
    toggleCollapse,
    pushUndoSnapshot,
    persistLayoutNow,
    atlasNodes,
  ])

  useEffect(() => {
    setEdges(
      effectiveEdges
        .filter(
          (e) =>
            visibleIds.has(e.source) &&
            visibleIds.has(e.target) &&
            (filters.direction === 'todos' ||
              e.direction === filters.direction ||
              e.direction === 'bidireccional'),
        )
        .map((e) => {
          const sourceNode = nodes.find((n) => n.id === e.source)
          const targetNode = nodes.find((n) => n.id === e.target)
          const dx = (targetNode?.position.x ?? 0) - (sourceNode?.position.x ?? 0)
          const dy = (targetNode?.position.y ?? 0) - (sourceNode?.position.y ?? 0)
          const horizontal = Math.abs(dx) >= Math.abs(dy)

          // Por defecto, la relación sale y entra por el lado geométricamente correcto.
          // Así, dos nodos paralelos quedan unidos por una recta aun usando smoothstep.
          const defSource = horizontal
            ? dx >= 0 ? 's-right' : 's-left'
            : dy >= 0 ? 's-bottom' : 's-top'
          const defTarget = horizontal
            ? dx >= 0 ? 't-left' : 't-right'
            : dy >= 0 ? 't-top' : 't-bottom'

          const override = edgeHandles[e.id]
          const inFocus = focusSet ? focusSet.has(e.source) && focusSet.has(e.target) : true
          const stroke =
            inFocus && focusSet
              ? e.direction === 'inyeccion'
                ? 'var(--flow-injection)'
                : e.direction === 'extraccion'
                  ? 'var(--flow-extraction)'
                  : e.direction === 'bidireccional'
                    ? 'var(--flow-bidirectional)'
                    : 'var(--flow-neutral)'
              : HEALTH_COLOR[e.health]
          return {
            id: e.id,
            source: e.source,
            target: e.target,
            selected: e.id === selectedEdgeId,
            sourceHandle: override?.sourceHandle ?? defSource,
            targetHandle: override?.targetHandle ?? defTarget,
            type: 'smoothstep',
            animated: false,
            label: focusSet && inFocus ? e.label : undefined,
            labelStyle: {
              fill: 'var(--muted-foreground)',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
            },
            labelBgStyle: { fill: 'var(--background)', fillOpacity: 0.9 },
            labelBgPadding: [4, 2] as [number, number],
            labelBgBorderRadius: 3,
            className: inFocus && focusSet ? 'edge-animated' : undefined,
            style: {
              stroke,
              strokeWidth: inFocus && focusSet ? 2.1 : e.health === 'ok' ? 1.05 : 1.55,
              strokeDasharray: e.aggregated ? '2 3' : undefined,
              opacity: focusSet ? (inFocus ? 1 : 0.10) : e.health === 'ok' ? 0.42 : 0.72,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 14,
              height: 14,
              color: stroke,
            },
          } satisfies Edge
        }),
    )
  }, [effectiveEdges, visibleIds, focusSet, filters.direction, edgeHandles, selectedEdgeId, nodes, setEdges])

  const selected = selectedId ? (atlasNodes.find((n) => n.id === selectedId) ?? null) : null
  const selectedRelation = selectedEdgeId
    ? allRelations.find((edge) => edge.id === (selectedEdgeId.startsWith('eff-') ? selectedEdgeId.slice(4) : selectedEdgeId)) ?? null
    : null

  const handleSelect = useCallback(
    (id: string) => {
      // if selecting a hidden node (from the panel), reveal it by expanding ancestors
      const rep = representative(id, collapsed)
      if (rep !== id) {
        setCollapsed((prev) => {
          const next = new Set(prev)
          let cur: string | undefined = id
          while (cur) {
            next.delete(cur)
            cur = PARENT_OF.get(cur)
          }
          return next
        })
      }
      setSelectedId(id)
    },
    [collapsed],
  )

  const editRelation = useCallback((edgeId: string) => {
    setSelectedId(null)
    setSelectedNodeIds([])
    setSelectedEdgeId(edgeId.startsWith('eff-') ? edgeId : `eff-${edgeId}`)
  }, [])

  const saveRelation = useCallback((nextEdge: AtlasEdge) => {
    pushUndoSnapshot()
    const isCreated = createdEdgesRef.current.some((edge) => edge.id === nextEdge.id)

    if (isCreated) {
      setCreatedEdges((prev) => {
        const next = prev.map((edge) => edge.id === nextEdge.id ? nextEdge : edge)
        createdEdgesRef.current = next
        return next
      })
    } else {
      setRelationOverrides((prev) => {
        const next = { ...prev, [nextEdge.id]: nextEdge }
        relationOverridesRef.current = next
        return next
      })
    }

    setEdgeEndpoints((prev) => {
      const next = { ...prev, [nextEdge.id]: { source: nextEdge.source, target: nextEdge.target } }
      edgeEndpointsRef.current = next
      return next
    })

    setSelectedEdgeId(`eff-${nextEdge.id}`)
    requestAnimationFrame(() => persistLayoutNow())
  }, [pushUndoSnapshot, persistLayoutNow])

  const deleteRelation = useCallback((edgeId: string) => {
    pushUndoSnapshot()
    const baseId = edgeId.startsWith('eff-') ? edgeId.slice(4) : edgeId
    const isCreated = createdEdgesRef.current.some((edge) => edge.id === baseId)

    if (isCreated) {
      setCreatedEdges((prev) => {
        const next = prev.filter((edge) => edge.id !== baseId)
        createdEdgesRef.current = next
        return next
      })
    } else {
      setDeletedEdgeIds((prev) => {
        const next = new Set(prev)
        next.add(baseId)
        deletedEdgeIdsRef.current = next
        return next
      })
    }

    setRelationOverrides((prev) => {
      if (!(baseId in prev)) return prev
      const next = { ...prev }
      delete next[baseId]
      relationOverridesRef.current = next
      return next
    })
    setEdgeEndpoints((prev) => {
      if (!(baseId in prev)) return prev
      const next = { ...prev }
      delete next[baseId]
      edgeEndpointsRef.current = next
      return next
    })
    setSelectedEdgeId(null)
    requestAnimationFrame(() => persistLayoutNow())
  }, [pushUndoSnapshot, persistLayoutNow])

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return

    pushUndoSnapshot()
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const relation: AtlasEdge = {
      id,
      source: connection.source,
      target: connection.target,
      label: 'Nueva relación',
      direction: 'sin_definir',
      protocol: 'Por definir',
      health: 'sin_dato',
    }

    setCreatedEdges((prev) => {
      const next = [...prev, relation]
      createdEdgesRef.current = next
      return next
    })

    if (connection.sourceHandle || connection.targetHandle) {
      setEdgeHandles((prev) => {
        const next = {
          ...prev,
          [`eff-${id}`]: {
            sourceHandle: connection.sourceHandle ?? undefined,
            targetHandle: connection.targetHandle ?? undefined,
          },
        }
        edgeHandlesRef.current = next
        return next
      })
    }

    setSelectedEdgeId(`eff-${id}`)
    requestAnimationFrame(() => persistLayoutNow())
  }, [pushUndoSnapshot, persistLayoutNow])

  // Edición real de relaciones: se puede cambiar tanto el nodo de origen/destino
  // como el lado (handle) por el que entra o sale la flecha.
  const onReconnect = useCallback((oldEdge: Edge, newConn: Connection) => {
    const source = newConn.source
    const target = newConn.target
    if (!source || !target || source === target) return

    const baseId = oldEdge.id.startsWith('eff-') ? oldEdge.id.slice(4) : oldEdge.id
    pushUndoSnapshot()

    setEdgeEndpoints((prev) => {
      const next = { ...prev, [baseId]: { source, target } }
      edgeEndpointsRef.current = next
      return next
    })

    setEdgeHandles((prev) => {
      const next = {
        ...prev,
        [oldEdge.id]: {
          sourceHandle:
            newConn.sourceHandle ?? prev[oldEdge.id]?.sourceHandle ?? oldEdge.sourceHandle ?? undefined,
          targetHandle:
            newConn.targetHandle ?? prev[oldEdge.id]?.targetHandle ?? oldEdge.targetHandle ?? undefined,
        },
      }
      edgeHandlesRef.current = next
      return next
    })

    setSelectedEdgeId(oldEdge.id)
    requestAnimationFrame(() => persistLayoutNow())
  }, [pushUndoSnapshot, persistLayoutNow])

  // Un click selecciona la relación y habilita el cambio manual del punto de
  // origen/destino. Doble click conserva el acceso al catálogo de endpoints.
  const handleEdgeClick = useCallback((_: unknown, edge: Edge) => {
    editRelation(edge.id)
  }, [editRelation])

  const handleEdgeDoubleClick = useCallback((_: unknown, edge: Edge) => {
    const s = edge.source
    const t = edge.target
    const owner = HAS_ENDPOINTS.has(s) ? s : HAS_ENDPOINTS.has(t) ? t : null
    if (!owner) return
    setEndpointsView({ nodeId: owner, connectionToId: owner === s ? t : s })
  }, [])

  const handleSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
    const ids = selectedNodes.map((node) => node.id)

    setSelectedNodeIds((prev) => {
      const active = new Set(ids)
      const kept = prev.filter((id) => active.has(id))
      const added = ids.filter((id) => !kept.includes(id))
      const ordered = [...kept, ...added]

      if (
        ordered.length === prev.length &&
        ordered.every((id, index) => id === prev[index])
      ) return prev

      return ordered
    })

    const nextSelectedId =
      ids.length === 0 ? null :
      ids.length === 1 ? ids[0] :
      ids[ids.length - 1]

    setSelectedId((prev) => prev === nextSelectedId ? prev : nextSelectedId)
    setSelectedEdgeId((prev) => prev === null ? prev : null)
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="relative min-w-0 flex-1">
        <MapToolbar
          filters={filters}
          onChange={(next) => startTransition(() => setFilters(next))}
          onFit={() => {
            setSelectedId(null)
            setSelectedNodeIds([])
            void fitView({ duration: 500, padding: 0.15 })
          }}
          onArrange={autoArrange}
          selectionCount={selectedNodeIds.length}
          onMultiNodeAction={applyMultiNodeAction}
          nodeCount={visibleIds.size}
          totalCount={atlasNodes.length}
        />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={() => pushUndoSnapshot()}
          onNodeDragStop={() => {
            requestAnimationFrame(() => persistLayoutNow())
          }}
          nodeTypes={nodeTypes}
          onNodeClick={(event, n) => {
            const additive = event.shiftKey || event.ctrlKey || event.metaKey
            startTransition(() => {
              setSelectedEdgeId(null)
              setSelectedNodeIds((prev) => {
                if (!additive) return [n.id]
                if (prev.includes(n.id)) return prev.filter((id) => id !== n.id)
                return [...prev, n.id]
              })
              handleSelect(n.id)
            })
          }}
          onEdgeClick={handleEdgeClick}
          onEdgeDoubleClick={handleEdgeDoubleClick}
          onConnect={onConnect}
          onReconnect={onReconnect}
          edgesReconnectable
          reconnectRadius={24}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          panOnDrag={[1, 2]}
          multiSelectionKeyCode={['Shift', 'Control', 'Meta']}
          onSelectionChange={handleSelectionChange}
          onPaneClick={() => {
            setSelectedId(null)
            setSelectedNodeIds([])
            setSelectedEdgeId(null)
          }}
          onInit={(instance) => {
            // Encuadrar recién cuando el contenedor ya tiene dimensiones,
            // para que muestre todo el mapa y no un zoom sobre el origen (SAP).
            requestAnimationFrame(() => instance.fitView({ padding: 0.15 }))
          }}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          snapToGrid
          snapGrid={[20, 20]}
          minZoom={0.15}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          className="map-flow"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={26}
            size={1}
            color="var(--map-grid)"
          />
          <Controls
            showInteractive={false}
            className="!bottom-4 !left-4 !rounded-lg !border !border-border !bg-card !shadow-none [&_button]:!border-border [&_button]:!bg-card [&_button]:!text-foreground [&_button:hover]:!bg-accent [&_svg]:!fill-current"
          />
        </ReactFlow>

        <MapLegend />
      </div>

      {selected && (
        <DetailPanel
          node={selected}
          nodes={atlasNodes}
          edges={allRelations}
          issues={ATLAS_ISSUES}
          onClose={() => setSelectedId(null)}
          onSelect={handleSelect}
          onOpenArchimate={(id) => setArchimateFor(id)}
          onOpenEndpoints={(id) => setEndpointsView({ nodeId: id })}
          onEdit={(id) => setEditingId(id)}
          onEditRelation={editRelation}
        />
      )}

      {selectedRelation && (
        <RelationEditor
          edge={selectedRelation}
          nodes={atlasNodes}
          onSave={saveRelation}
          onDelete={deleteRelation}
          onClose={() => setSelectedEdgeId(null)}
        />
      )}

      {editingId && (() => {
        const node = atlasNodes.find((item) => item.id === editingId)
        return node ? <NodeEditor node={node} onClose={() => setEditingId(null)}/> : null
      })()}

      {archimateFor && (
        <ArchimateViewer nodeId={archimateFor} onClose={() => setArchimateFor(null)} />
      )}

      {endpointsView && (
        <EndpointExplorer
          nodeId={endpointsView.nodeId}
          connectionToId={endpointsView.connectionToId}
          onClose={() => setEndpointsView(null)}
        />
      )}
    </div>
  )
}

function MapLegend() {
  const items = Object.entries(GROUP_META).map(([key, meta]) => ({
    label: meta.label,
    color: `var(--map-node-${key}-border)`,
  }))
  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex flex-col gap-2 rounded-lg border border-border bg-card/85 px-3 py-2.5 backdrop-blur-sm">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Dominios
      </p>
      <div className="flex flex-col gap-1.5">
        {items.map((i) => (
          <div key={i.label} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: i.color }} />
            <span className="text-[11px]">{i.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex flex-col gap-1.5 border-t border-border pt-2">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-5 rounded-full" style={{ background: 'var(--flow-injection)' }} />
          <span className="text-[11px]">Inyección</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-5 rounded-full" style={{ background: 'var(--flow-extraction)' }} />
          <span className="text-[11px]">Extracción</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-5 rounded-full" style={{ background: 'var(--destructive)' }} />
          <span className="text-[11px]">Flujo caído</span>
        </div>
      </div>
    </div>
  )
}

export function AtlasMap() {
  return (
    <ReactFlowProvider>
      <MapInner />
    </ReactFlowProvider>
  )
}
