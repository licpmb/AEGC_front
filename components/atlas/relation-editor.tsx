'use client'

import { useEffect, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AtlasEdge, AtlasNode, FlowDirection } from '@/lib/atlas-types'

const PROTOCOLS: AtlasEdge['protocol'][] = ['Por definir','REST','OData','SOAP','IDoc','JDBC','Batch','CDC','SFTP','Manual']
const DIRECTIONS: Array<{ value: FlowDirection; label: string }> = [
  { value: 'sin_definir', label: 'Sin definir' },
  { value: 'inyeccion', label: 'Inyección' },
  { value: 'extraccion', label: 'Extracción' },
  { value: 'bidireccional', label: 'Bidireccional' },
]
const HEALTH: Array<{ value: AtlasEdge['health']; label: string }> = [
  { value: 'sin_dato', label: 'Sin dato' },
  { value: 'ok', label: 'OK' },
  { value: 'degradado', label: 'Degradado' },
  { value: 'caido', label: 'Caído' },
]

export function RelationEditor({
  edge,
  nodes,
  onSave,
  onDelete,
  onClose,
}: {
  edge: AtlasEdge
  nodes: AtlasNode[]
  onSave: (edge: AtlasEdge) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(edge)

  useEffect(() => setDraft(edge), [edge])

  const valid = draft.source && draft.target && draft.source !== draft.target

  return <aside className="flex h-full w-[390px] shrink-0 flex-col border-l border-border bg-card">
    <header className="flex items-center gap-2 border-b border-border px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Editar relación</p>
        <h2 className="truncate text-[15px] font-semibold">{draft.label || 'Relación sin nombre'}</h2>
      </div>
      <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar editor"><X size={15}/></Button>
    </header>

    <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4 text-[12px]">
      <label className="block">
        <span className="mb-1 block text-muted-foreground">Nombre / descripción corta</span>
        <Input value={draft.label ?? ''} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} placeholder="Ej. Pedido de venta"/>
      </label>

      <label className="block">
        <span className="mb-1 block text-muted-foreground">Origen</span>
        <select className="h-9 w-full rounded-md border border-border bg-background px-2" value={draft.source}
          onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))}>
          {nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-muted-foreground">Destino</span>
        <select className="h-9 w-full rounded-md border border-border bg-background px-2" value={draft.target}
          onChange={(e) => setDraft((d) => ({ ...d, target: e.target.value }))}>
          {nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="mb-1 block text-muted-foreground">Dirección</span>
          <select className="h-9 w-full rounded-md border border-border bg-background px-2" value={draft.direction}
            onChange={(e) => setDraft((d) => ({ ...d, direction: e.target.value as FlowDirection }))}>
            {DIRECTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-muted-foreground">Protocolo</span>
          <select className="h-9 w-full rounded-md border border-border bg-background px-2" value={draft.protocol}
            onChange={(e) => setDraft((d) => ({ ...d, protocol: e.target.value as AtlasEdge['protocol'] }))}>
            {PROTOCOLS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-muted-foreground">Estado técnico</span>
        <select className="h-9 w-full rounded-md border border-border bg-background px-2" value={draft.health}
          onChange={(e) => setDraft((d) => ({ ...d, health: e.target.value as AtlasEdge['health'] }))}>
          {HEALTH.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>

      {!valid && <p className="text-[11px] text-destructive">Origen y destino deben ser nodos distintos.</p>}
      <p className="rounded border border-border bg-background p-2 text-[10.5px] text-muted-foreground">También podés cambiar origen/destino arrastrando los extremos de la flecha directamente sobre el mapa.</p>
    </div>

    <footer className="flex items-center gap-2 border-t border-border p-3">
      <Button variant="destructive" onClick={() => onDelete(edge.id)}><Trash2 size={14}/>Eliminar</Button>
      <div className="ml-auto flex gap-2">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button disabled={!valid} onClick={() => onSave({ ...draft, label: draft.label?.trim() || undefined })}>Guardar cambios</Button>
      </div>
    </footer>
  </aside>
}
