'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { KIND_META, type AtlasNode, type CountryCode, type Environment, type NodeKind, type NodeStatus } from '@/lib/atlas-types'
import { saveAtlasNodeOverride } from '@/lib/atlas-local'

export function NodeEditor({ node, onClose }: { node: AtlasNode; onClose: () => void }) {
  const [label, setLabel] = useState(node.label)
  const [kind, setKind] = useState<NodeKind>(node.kind)
  const [owner, setOwner] = useState(node.owner)
  const [domain, setDomain] = useState(node.domain)
  const [description, setDescription] = useState(node.description)
  const [status, setStatus] = useState<NodeStatus>(node.status)
  const [country, setCountry] = useState<CountryCode | ''>(node.country ?? '')
  const [tech, setTech] = useState((node.tech ?? []).join(', '))
  const [environments, setEnvironments] = useState<Environment[]>(node.environments ?? [])

  useEffect(() => {
    setLabel(node.label); setKind(node.kind); setOwner(node.owner); setDomain(node.domain); setDescription(node.description)
    setStatus(node.status); setCountry(node.country ?? ''); setTech((node.tech ?? []).join(', '))
    setEnvironments(node.environments ?? [])
  }, [node])

  function save() {
    const normalizedEnvironments = environments.map((env) => {
      const url = env.url?.trim() || undefined
      let server = env.server.trim()

      // Si el usuario carga sólo la URL, obtenemos el host automáticamente.
      if (!server && url) {
        try {
          const parsed = new URL(url)
          server = parsed.host
        } catch {
          // Se conserva vacío para que el ambiente no se pierda por una URL incompleta.
        }
      }

      return {
        ...env,
        server,
        url,
      }
    })

    saveAtlasNodeOverride(node.id, {
      label: label.trim() || node.label,
      kind,
      owner: owner.trim(),
      domain: domain.trim(),
      description: description.trim(),
      status,
      country: country || undefined,
      tech: tech.split(',').map((x) => x.trim()).filter(Boolean),
      environments: normalizedEnvironments,
      environmentsReplace: true,
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
      <label className="block"><span className="mb-1 block text-muted-foreground">Tipo de nodo</span>
        <select className="h-9 w-full rounded-md border border-border bg-background px-2" value={kind} onChange={(e) => setKind(e.target.value as NodeKind)}>
          {Object.entries(KIND_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
        </select>
      </label>
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

      <section className="space-y-2 rounded-lg border border-border bg-background/50 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[12px] font-semibold">Ambientes</p>
            <p className="text-[10.5px] text-muted-foreground">DEV, QAS y PRD con host/servidor, URL y estado.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => setEnvironments((prev) => [
              ...prev,
              { name: 'Desarrollo', server: '', url: '', status: 'ok' },
            ])}
          >
            <Plus size={12}/>Agregar
          </Button>
        </div>

        {environments.length === 0 && (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
            Este nodo todavía no tiene ambientes cargados.
          </p>
        )}

        {environments.map((env, index) => (
          <div key={index} className="space-y-2 rounded-md border border-border bg-card p-2.5">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <select
                className="h-8 rounded-md border border-border bg-background px-2 text-[11px]"
                value={env.name}
                onChange={(e) => setEnvironments((prev) => prev.map((item, i) => i === index ? { ...item, name: e.target.value as Environment['name'] } : item))}
              >
                <option value="Desarrollo">DEV · Desarrollo</option>
                <option value="QA">QAS · Testing</option>
                <option value="Producción">PRD · Producción</option>
                <option value="Staging">STG · Staging</option>
              </select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => setEnvironments((prev) => prev.filter((_, i) => i !== index))}
                aria-label="Eliminar ambiente"
              >
                <Trash2 size={13}/>
              </Button>
            </div>
            <Input
              className="h-8 text-[11px]"
              value={env.server}
              placeholder="Servidor / host · ej. apis.grupocepas.com"
              onChange={(e) => setEnvironments((prev) => prev.map((item, i) => i === index ? { ...item, server: e.target.value } : item))}
            />
            <Input
              className="h-8 text-[11px]"
              value={env.url ?? ''}
              placeholder="URL · ej. https://apis.grupocepas.com/Gw.Sap4Hana"
              onChange={(e) => setEnvironments((prev) => prev.map((item, i) => i === index ? { ...item, url: e.target.value } : item))}
            />
            <select
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-[11px]"
              value={env.status}
              onChange={(e) => setEnvironments((prev) => prev.map((item, i) => i === index ? { ...item, status: e.target.value as Environment['status'] } : item))}
            >
              <option value="ok">OK</option>
              <option value="degradado">Degradado</option>
              <option value="caido">Caído</option>
            </select>
          </div>
        ))}
      </section>
      <p className="rounded border border-border bg-background p-2 text-[10.5px] text-muted-foreground">ID estable: <code>{node.id}</code>. Estos cambios se guardan localmente en este navegador y actualizan Mapa y Documentación.</p>
    </div>
    <footer className="flex justify-end gap-2 border-t border-border p-3">
      <Button variant="outline" onClick={onClose}>Cancelar</Button>
      <Button onClick={save}>Guardar cambios</Button>
    </footer>
  </aside>
}
