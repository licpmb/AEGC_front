'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AtlasFlowNode, type AtlasFlowNodeData } from './atlas-node'
import { DetailPanel } from './detail-panel'
import { ArchimateViewer } from './archimate-viewer'
import { EndpointExplorer } from './endpoint-explorer'
import { MapToolbar, type MapFilters } from './map-toolbar'
import { ATLAS_EDGES, ATLAS_ISSUES, ATLAS_NODES } from '@/lib/atlas-data'
import { KIND_META, type AtlasNode } from '@/lib/atlas-types'

const HAS_ENDPOINTS = new Set(
  ATLAS_NODES.filter((n) => (n.endpoints?.length ?? 0) > 0).map((n) => n.id),
)

const nodeTypes = { atlas: AtlasFlowNode }

const HEALTH_COLOR: Record<string, string> = {
  ok: 'var(--flow-neutral)',
  degradado: 'var(--chart-1)',
  caido: 'var(--destructive)',
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

function MapInner() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [archimateFor, setArchimateFor] = useState<string | null>(null)
  const [endpointsView, setEndpointsView] = useState<{
    nodeId: string
    connectionToId?: string | null
  } | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [orient, setOrient] = useState<Record<string, 'h' | 'v'>>({})
  // reruteo manual de flechas: por id de arista → handles elegidos
  const [edgeHandles, setEdgeHandles] = useState<
    Record<string, { sourceHandle?: string; targetHandle?: string }>
  >({})
  const [filters, setFilters] = useState<MapFilters>({
    query: '',
    groups: ['core', 'integracion', 'aplicacion', 'datos'],
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

  const setOrientation = useCallback((id: string, o: 'h' | 'v') => {
    setOrient((prev) => ({ ...prev, [id]: o }))
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

  // Effective edges after applying collapse (remap endpoints, drop internals, dedupe)
  const effectiveEdges = useMemo<EffEdge[]>(() => {
    const seen = new Set<string>()
    const out: EffEdge[] = []
    for (const e of ATLAS_EDGES) {
      const s = representative(e.source, collapsed)
      const t = representative(e.target, collapsed)
      if (s === t) continue
      const aggregated = s !== e.source || t !== e.target
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
  }, [collapsed])

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
      ATLAS_NODES.filter((n) => {
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
  }, [filters, issueStats, collapsed, effectiveEdges])

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
      ATLAS_NODES.map((n) => ({
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
    [],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const autoArrange = useCallback(() => {
    const positions = alignToGrid(nodes, visibleIds)
    if (!positions.size) return

    setSelectedId(null)
    setSelectedEdgeId(null)
    setNodes((prev) =>
      prev.map((node) => {
        const position = positions.get(node.id)
        return position ? { ...node, position } : node
      }),
    )

    requestAnimationFrame(() => {
      void fitView({ duration: 400, padding: 0.15 })
    })
  }, [nodes, visibleIds, setNodes, fitView])

  // Clear selection if the selected node becomes hidden
  useEffect(() => {
    if (selectedId && !visibleIds.has(selectedId)) setSelectedId(null)
  }, [visibleIds, selectedId])

  // Recompute node data on filter / selection / collapse / orientation change
  useEffect(() => {
    setNodes((prev) =>
      prev.map((rf) => {
        const node = ATLAS_NODES.find((n) => n.id === rf.id) as AtlasNode
        const stats = issueStats.get(node.id) ?? { open: 0, blocking: 0 }
        const visible = visibleIds.has(node.id)
        const inFocus = focusSet ? focusSet.has(node.id) : true
        const o = orient[node.id] ?? 'h'
        const kids = CHILDREN_OF.get(node.id)?.length ?? 0
        return {
          ...rf,
          hidden: !visible,
          selected: node.id === selectedId,
          sourcePosition: o === 'v' ? Position.Bottom : Position.Right,
          targetPosition: o === 'v' ? Position.Top : Position.Left,
          data: {
            node,
            openIssues: stats.open,
            blocking: stats.blocking,
            dimmed: !inFocus,
            focused: node.id === selectedId,
            showIssues: filters.showIssues,
            orientation: o,
            hasChildren: kids > 0,
            collapsed: collapsed.has(node.id),
            hiddenChildren: collapsed.has(node.id) ? descendantCount(node.id) : 0,
            onToggleCollapse: toggleCollapse,
            onSetOrientation: setOrientation,
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
    orient,
    setNodes,
    toggleCollapse,
    setOrientation,
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
                  : 'var(--flow-bidirectional)'
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

  const selected = selectedId ? (ATLAS_NODES.find((n) => n.id === selectedId) ?? null) : null

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

  // Reruteo manual: solo permite mover a qué handle/lado se engancha la flecha,
  // manteniendo los mismos nodos de origen y destino.
  const onReconnect = useCallback((oldEdge: Edge, newConn: Connection) => {
    if (newConn.source !== oldEdge.source || newConn.target !== oldEdge.target) return
    setEdgeHandles((prev) => ({
      ...prev,
      [oldEdge.id]: {
        sourceHandle:
          newConn.sourceHandle ?? prev[oldEdge.id]?.sourceHandle ?? oldEdge.sourceHandle ?? undefined,
        targetHandle:
          newConn.targetHandle ?? prev[oldEdge.id]?.targetHandle ?? oldEdge.targetHandle ?? undefined,
      },
    }))
    setSelectedEdgeId(oldEdge.id)
  }, [])

  // Un click selecciona la relación y habilita el cambio manual del punto de
  // origen/destino. Doble click conserva el acceso al catálogo de endpoints.
  const handleEdgeClick = useCallback((_: unknown, edge: Edge) => {
    setSelectedId(null)
    setSelectedEdgeId(edge.id)
  }, [])

  const handleEdgeDoubleClick = useCallback((_: unknown, edge: Edge) => {
    const s = edge.source
    const t = edge.target
    const owner = HAS_ENDPOINTS.has(s) ? s : HAS_ENDPOINTS.has(t) ? t : null
    if (!owner) return
    setEndpointsView({ nodeId: owner, connectionToId: owner === s ? t : s })
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="relative min-w-0 flex-1">
        <MapToolbar
          filters={filters}
          onChange={setFilters}
          onFit={() => {
            setSelectedId(null)
            void fitView({ duration: 500, padding: 0.15 })
          }}
          onArrange={autoArrange}
          nodeCount={visibleIds.size}
          totalCount={ATLAS_NODES.length}
        />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={(_, n) => {
            setSelectedEdgeId(null)
            handleSelect(n.id)
          }}
          onEdgeClick={handleEdgeClick}
          onEdgeDoubleClick={handleEdgeDoubleClick}
          onReconnect={onReconnect}
          edgesReconnectable
          onPaneClick={() => {
            setSelectedId(null)
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
          nodes={ATLAS_NODES}
          edges={ATLAS_EDGES}
          issues={ATLAS_ISSUES}
          onClose={() => setSelectedId(null)}
          onSelect={handleSelect}
          onOpenArchimate={(id) => setArchimateFor(id)}
          onOpenEndpoints={(id) => setEndpointsView({ nodeId: id })}
        />
      )}

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
  const items = [
    { label: 'Core SAP', color: 'var(--map-node-core-border)' },
    { label: 'Integración', color: 'var(--map-node-integracion-border)' },
    { label: 'Aplicaciones', color: 'var(--map-node-aplicacion-border)' },
    { label: 'Datos', color: 'var(--map-node-datos-border)' },
  ]
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
