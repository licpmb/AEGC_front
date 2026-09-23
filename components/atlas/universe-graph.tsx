'use client'

import { useMemo } from 'react'
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { NativeModel } from '@/lib/native-archi'
import type { UniverseState } from '@/lib/archi-universe'

export function UniverseGraph({ model, universe, onAsset }: { model: NativeModel; universe: UniverseState; onAsset: (id: string) => void }) {
  const { nodes, edges } = useMemo(() => {
    const owner = new Map<string, string[]>()
    for (const asset of universe.assets) for (const id of asset.archiIds) owner.set(id, [...(owner.get(id) ?? []), asset.id])
    const nodes: Node[] = universe.assets.map((asset, index) => ({ id: asset.id,
      position: { x: (index % 4) * 285, y: Math.floor(index / 4) * 155 },
      data: { label: <div className="w-48 p-1"><b className="block text-[13px]">{asset.name}</b><span className="text-[10px] text-muted-foreground">{asset.kind} · {asset.archiIds.length} IDs Archi · {asset.interfaceIds.join(', ') || 'Sin interfaz'}</span></div> },
      style: { background: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 10, width: 230 } }))
    const edges: Edge[] = []
    const seen = new Set<string>()
    for (const relationship of model.relationships.values()) {
      for (const source of owner.get(relationship.source) ?? []) for (const target of owner.get(relationship.target) ?? []) {
        if (source === target) continue
        const key = `${source}|${target}|${relationship.type}`
        if (seen.has(key)) continue
        seen.add(key)
        edges.push({ id: key, source, target, label: relationship.type.replace('Relationship', ''),
          markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#67b8dc', strokeWidth: 1.5 },
          labelStyle: { fill: 'var(--foreground)', fontSize: 10 }, labelBgStyle: { fill: 'var(--card)' } })
      }
    }
    return { nodes, edges }
  }, [model, universe])
  if (!nodes.length) return <div className="grid h-full place-items-center p-8 text-center text-[13px] text-muted-foreground"><p>El universo aún no tiene activos vinculados. Elegí SAP, CPI, Gateway o un componente en la vista Archi y vinculalo desde la pestaña «Universo».</p></div>
  return <div className="h-full w-full"><ReactFlow nodes={nodes} edges={edges} fitView onNodeClick={(_, node) => onAsset(node.id)} nodesDraggable={false} nodesConnectable={false}>
    <Background gap={22} size={1}/><Controls showInteractive={false}/></ReactFlow></div>
}
