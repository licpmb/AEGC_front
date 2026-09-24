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

const AUTO_LAYOUT = {
  columnGap: 285,
  rowGap: 118,
  originX: 80,
  originY: 110,
} as const

/**
 * Layout por capas para lectura izquierda→derecha.
 * - Usa las conexiones para armar columnas.
 * - Dentro de cada columna conserva como desempate la prioridad visual manual
 *   existente: arriba→abajo y, en la misma fila, izquierda→derecha.
 * - Hace barridos baricéntricos para reducir cruces entre columnas.
 */
function buildAutoLayout(
  currentNodes: Node[],
  currentEdges: EffEdge[],
  visibleIds: Set<string>,
): Map<string, { x: number; y: number }> {
  const visible = currentNodes.filter((n) => visibleIds.has(n.id))
  if (visible.length === 0) return new Map()

  const nodeById = new Map(visible.map((n) => [n.id, n]))
  const manualOrder = [...visible]
    .sort((a, b) => {
      const ay = Math.round(a.position.y / 40)
      const by = Math.round(b.position.y / 40)
      if (ay !== by) return ay - by
      if (a.position.x !== b.position.x) return a.position.x - b.position.x
      return a.id.localeCompare(b.id)
    })
    .map((n, i) => [n.id, i] as const)
  const manualRank = new Map(manualOrder)

  const outgoing = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()
  const indegree = new Map<string, number>()
  for (const n of visible) {
    outgoing.set(n.id, [])
    incoming.set(n.id, [])
    indegree.set(n.id, 0)
  }

  // Evitamos duplicados; las aristas sólo participan si ambos extremos están visibles.
  const seen = new Set<string>()
  for (const edge of currentEdges) {
    if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue
    const key = `${edge.source}|${edge.target}`
    if (seen.has(key)) continue
    seen.add(key)
    outgoing.get(edge.source)?.push(edge.target)
    incoming.get(edge.target)?.push(edge.source)
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
  }

  // Kahn estable: cuando hay alternativas mantiene la prioridad visual manual.
  const queue = visible
    .filter((n) => (indegree.get(n.id) ?? 0) === 0)
    .sort((a, b) => (manualRank.get(a.id) ?? 0) - (manualRank.get(b.id) ?? 0))
    .map((n) => n.id)

  const layer = new Map<string, number>()
  for (const id of queue) layer.set(id, 0)
  const processed = new Set<string>()

  while (queue.length) {
    const id = queue.shift() as string
    processed.add(id)
    const nextLayer = (layer.get(id) ?? 0) + 1
    for (const target of outgoing.get(id) ?? []) {
      layer.set(target, Math.max(layer.get(target) ?? 0, nextLayer))
      indegree.set(target, (indegree.get(target) ?? 1) - 1)
      if ((indegree.get(target) ?? 0) === 0) {
        queue.push(target)
        queue.sort((a, b) => (manualRank.get(a) ?? 0) - (manualRank.get(b) ?? 0))
      }
    }
  }

  // Los ciclos no tienen orden topológico puro. Los ubicamos cerca de sus vecinos
  // ya resueltos y usamos la posición manual como desempate, sin bloquear el layout.
  const unresolved = visible
    .filter((n) => !processed.has(n.id))
    .sort((a, b) => (manualRank.get(a.id) ?? 0) - (manualRank.get(b.id) ?? 0))
  for (const n of unresolved) {
    const neighbourLayers = [
      ...(incoming.get(n.id) ?? []).map((id) => layer.get(id)).filter((v): v is number => v != null),
      ...(outgoing.get(n.id) ?? []).map((id) => layer.get(id)).filter((v): v is number => v != null),
    ]
    if (neighbourLayers.length) {
      layer.set(n.id, Math.max(0, Math.round(neighbourLayers.reduce((a, b) => a + b, 0) / neighbourLayers.length)))
    } else {
      layer.set(n.id, Math.max(0, Math.round(n.position.x / AUTO_LAYOUT.columnGap)))
    }
  }

  const maxLayer = Math.max(...visible.map((n) => layer.get(n.id) ?? 0))
  const columns: string[][] = Array.from({ length: maxLayer + 1 }, () => [])
  for (const n of visible) columns[layer.get(n.id) ?? 0].push(n.id)
  for (const col of columns) col.sort((a, b) => (manualRank.get(a) ?? 0) - (manualRank.get(b) ?? 0))

  const indexInColumns = () => {
    const result = new Map<string, number>()
    for (const col of columns) col.forEach((id, i) => result.set(id, i))
    return result
  }

  const reorder = (columnIndex: number, neighbourDirection: 'prev' | 'next') => {
    const col = columns[columnIndex]
    if (col.length < 2) return
    const index = indexInColumns()
    const scored = col.map((id) => {
      const neighbours =
        neighbourDirection === 'prev' ? (incoming.get(id) ?? []) : (outgoing.get(id) ?? [])
      const usable = neighbours.filter((n) => {
        const neighbourLayer = layer.get(n)
        return neighbourDirection === 'prev'
          ? neighbourLayer === columnIndex - 1
          : neighbourLayer === columnIndex + 1
      })
      const barycenter = usable.length
        ? usable.reduce((sum, n) => sum + (index.get(n) ?? 0), 0) / usable.length
        : Number.POSITIVE_INFINITY
      return { id, barycenter, manual: manualRank.get(id) ?? 0 }
    })
    scored.sort((a, b) => {
      if (a.barycenter !== b.barycenter) return a.barycenter - b.barycenter
      return a.manual - b.manual
    })
    columns[columnIndex] = scored.map((x) => x.id)
  }

  // Alternar sentidos ayuda a reducir cruces sin perder estabilidad visual.
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < columns.length; i++) reorder(i, 'prev')
    for (let i = columns.length - 2; i >= 0; i--) reorder(i, 'next')
  }

  const positions = new Map<string, { x: number; y: number }>()
  columns.forEach((col, xIndex) => {
    col.forEach((id, yIndex) => {
      positions.set(id, {
        x: AUTO_LAYOUT.originX + xIndex * AUTO_LAYOUT.columnGap,
        y: AUTO_LAYOUT.originY + yIndex * AUTO_LAYOUT.rowGap,
      })
    })
  })
  return positions
}

function MapInner() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
    const positions = buildAutoLayout(nodes, effectiveEdges, visibleIds)
    if (!positions.size) return

    setSelectedId(null)
    setOrient((prev) => {
      const next = { ...prev }
      for (const id of visibleIds) next[id] = 'h'
      return next
    })
    setEdgeHandles({})

    setNodes((prev) =>
      prev.map((node) => {
        const position = positions.get(node.id)
        return position ? { ...node, position } : node
      }),
    )

    requestAnimationFrame(() => {
      void fitView({ duration: 500, padding: 0.15 })
    })
  }, [nodes, effectiveEdges, visibleIds, setNodes, fitView])

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
          const srcO = orient[e.source] ?? 'h'
          const tgtO = orient[e.target] ?? 'h'
          const defSource = srcO === 'v' ? 's-bottom' : 's-right'
          const defTarget = tgtO === 'v' ? 't-top' : 't-left'
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
  }, [effectiveEdges, visibleIds, focusSet, filters.direction, orient, edgeHandles, setEdges])

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
        sourceHandle: newConn.sourceHandle ?? undefined,
        targetHandle: newConn.targetHandle ?? undefined,
      },
    }))
  }, [])

  // Click en una flecha: abre el catálogo de endpoints del nodo dueño,
  // enfocado en la conexión seleccionada.
  const handleEdgeClick = useCallback((_: unknown, edge: Edge) => {
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
          onNodeClick={(_, n) => handleSelect(n.id)}
          onEdgeClick={handleEdgeClick}
          onReconnect={onReconnect}
          edgesReconnectable
          onPaneClick={() => setSelectedId(null)}
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
