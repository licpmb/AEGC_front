'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { AtlasNode, CountryCode, NodeStatus } from '@/lib/atlas-types'
import { saveAtlasNodeOverride } from '@/lib/atlas-local'

export function NodeEditor({ node, onClose }: { node: AtlasNode; onClose: () => void }) {
  const [label, setLabel] = useState(node.label)
  const [owner, setOwner] = useState(node.owner)
  const [domain, setDomain] = useState(node.domain)
  const [description, setDescription] = useState(node.description)
  const [status, setStatus] = useState<NodeStatus>(node.status)
  const [country, setCountry] = useState<CountryCode | ''>(node.country ?? '')
  const [tech, setTech] = useState((node.tech ?? []).join(', '))

  useEffect(() => {
    setLabel(node.label); setOwner(node.owner); setDomain(node.domain); setDescription(node.description)
    setStatus(node.status); setCountry(node.country ?? ''); setTech((node.tech ?? []).join(', '))
  }, [node])

  function save() {
    saveAtlasNodeOverride(node.id, {
      label: label.trim() || node.label,
      owner: owner.trim(),
      domain: domain.trim(),
      description: description.trim(),
      status,
      country: country || undefined,
      tech: tech.split(',').map((x) => x.trim()).filter(Boolean),
    })
    onClose()
  }

  return <aside className="flex h-full w-[390px] shrink-0 flex-col border-l border-border bg-card">
    <header className="flex items-center gap-2 border-b border-border px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Editar nodo</p>
        <h2 className="truncate text-[15px] font-semibold">{node.label}</h2>
      </div>
      <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar editor"><X size={15}/></Button>
    </header>
    <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4 text-[12px]">
      <label className="block"><span className="mb-1 block text-muted-foreground">Nombre</span><Input value={label} onChange={(e) => setLabel(e.target.value)}/></label>
      <label className="block"><span className="mb-1 block text-muted-foreground">Owner</span><Input value={owner} onChange={(e) => setOwner(e.target.value)}/></label>
      <label className="block"><span className="mb-1 block text-muted-foreground">Dominio</span><Input value={domain} onChange={(e) => setDomain(e.target.value)}/></label>
      <label className="block"><span className="mb-1 block text-muted-foreground">Descripción</span><Textarea className="min-h-28" value={description} onChange={(e) => setDescription(e.target.value)}/></label>
      <div className="grid grid-cols-2 gap-2">
        <label><span className="mb-1 block text-muted-foreground">Estado</span>
          <select className="h-9 w-full rounded-md border border-border bg-background px-2" value={status} onChange={(e) => setStatus(e.target.value as NodeStatus)}>
            <option value="prod">Producción</option><option value="staging">Staging</option><option value="dev">Desarrollo</option><option value="deprecated">Deprecado</option>
          </select>
        </label>
        <label><span className="mb-1 block text-muted-foreground">País</span>
          <select className="h-9 w-full rounded-md border border-border bg-background px-2" value={country} onChange={(e) => setCountry(e.target.value as CountryCode | '')}>
            <option value="">Regional</option><option value="AR">Argentina</option><option value="CL">Chile</option><option value="UY">Uruguay</option>
          </select>
        </label>
      </div>
      <label className="block"><span className="mb-1 block text-muted-foreground">Stack / tecnologías</span><Input value={tech} onChange={(e) => setTech(e.target.value)} placeholder="REST, .NET, SQL Server"/></label>
      <p className="rounded border border-border bg-background p-2 text-[10.5px] text-muted-foreground">ID estable: <code>{node.id}</code>. Estos cambios se guardan localmente en este navegador y actualizan Mapa y Documentación.</p>
    </div>
    <footer className="flex justify-end gap-2 border-t border-border p-3">
      <Button variant="outline" onClick={onClose}>Cancelar</Button>
      <Button onClick={save}>Guardar cambios</Button>
    </footer>
  </aside>
}
