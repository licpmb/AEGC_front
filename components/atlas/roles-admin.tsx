'use client'

import { useState } from 'react'
import { Plus, ShieldCheck, Check, Users, Globe2, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { COUNTRY_META, type CountryCode } from '@/lib/atlas-types'
import { cn } from '@/lib/utils'

type Scope = CountryCode | 'ALL'

type PermKey =
  | 'ver'
  | 'editarNodos'
  | 'relaciones'
  | 'cargaMasiva'
  | 'syncGitlab'
  | 'usuarios'
  | 'roles'

const PERMISSIONS: { key: PermKey; label: string; desc: string }[] = [
  { key: 'ver', label: 'Ver el mapa', desc: 'Acceso de lectura al universo y los detalles' },
  { key: 'editarNodos', label: 'Crear / editar nodos', desc: 'Alta individual y edición de interfaces y componentes' },
  { key: 'relaciones', label: 'Editar relaciones', desc: 'Crear y quitar conexiones entre nodos' },
  { key: 'cargaMasiva', label: 'Carga masiva', desc: 'Importar nodos y relaciones desde CSV/JSON' },
  { key: 'syncGitlab', label: 'Sincronizar GitLab', desc: 'Disparar y configurar el sync de issues y pipelines' },
  { key: 'usuarios', label: 'Gestionar usuarios', desc: 'Invitar, asignar roles y países' },
  { key: 'roles', label: 'Administrar roles', desc: 'Crear roles y definir permisos' },
]

type Role = {
  id: string
  name: string
  desc: string
  scope: Scope
  system?: boolean
  perms: Record<PermKey, boolean>
  members: number
}

const allPerms = (v: boolean): Record<PermKey, boolean> =>
  Object.fromEntries(PERMISSIONS.map((p) => [p.key, v])) as Record<PermKey, boolean>

const INITIAL_ROLES: Role[] = [
  {
    id: 'admin',
    name: 'Administrador general',
    desc: 'Control total sobre el mapa, la data, los usuarios y los roles.',
    scope: 'ALL',
    system: true,
    perms: allPerms(true),
    members: 2,
  },
  {
    id: 'arquitecto',
    name: 'Arquitecto',
    desc: 'Edita arquitectura y relaciones en todos los países. No administra usuarios.',
    scope: 'ALL',
    perms: { ...allPerms(true), usuarios: false, roles: false },
    members: 4,
  },
  {
    id: 'editor-ar',
    name: 'Editor · Argentina',
    desc: 'Mantiene los desarrollos de Argentina. Alcance acotado al país.',
    scope: 'AR',
    perms: { ver: true, editarNodos: true, relaciones: true, cargaMasiva: true, syncGitlab: true, usuarios: false, roles: false },
    members: 6,
  },
  {
    id: 'lector',
    name: 'Lector',
    desc: 'Solo lectura del mapa y los tableros. Ideal para management.',
    scope: 'ALL',
    perms: { ...allPerms(false), ver: true },
    members: 21,
  },
]

const USERS = [
  { name: 'M. Duarte', email: 'm.duarte@grupocepas.com', role: 'Administrador general', scope: 'ALL' as Scope, entra: 'entra-id' },
  { name: 'J. Pérez', email: 'j.perez@grupocepas.com', role: 'Arquitecto', scope: 'ALL' as Scope, entra: 'entra-id' },
  { name: 'L. Arce', email: 'l.arce@grupocepas.com', role: 'Editor · Argentina', scope: 'AR' as Scope, entra: 'entra-id' },
  { name: 'S. Rivas', email: 's.rivas@grupocepas.cl', role: 'Editor · Chile', scope: 'CL' as Scope, entra: 'entra-id' },
  { name: 'C. Molina', email: 'c.molina@grupocepas.com', role: 'Lector', scope: 'ALL' as Scope, entra: 'local' },
]

function scopeLabel(s: Scope) {
  return s === 'ALL' ? 'Todos los países' : `${COUNTRY_META[s].flag} ${COUNTRY_META[s].label}`
}

export function RolesAdmin() {
  const [roles, setRoles] = useState<Role[]>(INITIAL_ROLES)
  const [selectedId, setSelectedId] = useState('admin')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const selected = roles.find((r) => r.id === selectedId) ?? roles[0]

  const togglePerm = (key: PermKey) => {
    if (selected.system) return
    setRoles((prev) =>
      prev.map((r) => (r.id === selected.id ? { ...r, perms: { ...r.perms, [key]: !r.perms[key] } } : r)),
    )
  }

  const setScope = (scope: Scope) => {
    if (selected.system) return
    setRoles((prev) => prev.map((r) => (r.id === selected.id ? { ...r, scope } : r)))
  }

  const createRole = () => {
    const name = newName.trim()
    if (!name) return
    const id = `role-${Date.now()}`
    setRoles((prev) => [
      ...prev,
      { id, name, desc: 'Rol personalizado.', scope: 'ALL', perms: { ...allPerms(false), ver: true }, members: 0 },
    ])
    setSelectedId(id)
    setNewName('')
    setCreating(false)
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-auto bg-background">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={17} style={{ color: 'var(--chart-3)' }} />
              <h1 className="text-lg font-semibold">Roles y accesos</h1>
            </div>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground text-pretty">
              Autenticación con Microsoft Entra ID. Creá roles, definí permisos granulares y acotá el
              alcance por país. Todo configurable desde el front.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <span className="grid h-4 w-4 grid-cols-2 gap-px" aria-hidden>
              <span className="bg-[#f25022]" />
              <span className="bg-[#7fba00]" />
              <span className="bg-[#00a4ef]" />
              <span className="bg-[#ffb900]" />
            </span>
            <span className="text-[12px]">
              Tenant <span className="font-mono text-muted-foreground">grupocepas.onmicrosoft.com</span>
            </span>
          </div>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Lista de roles */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Roles ({roles.length})
              </span>
              <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[12px]" onClick={() => setCreating((v) => !v)}>
                <Plus size={13} /> Nuevo
              </Button>
            </div>

            {creating && (
              <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-card/60 p-2.5">
                <Input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) createRole()
                  }}
                  placeholder="Nombre del rol"
                  className="h-8 text-[13px]"
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 flex-1 text-[12px]" onClick={createRole}>
                    Crear rol
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[12px]" onClick={() => setCreating(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {roles.map((r) => {
              const active = r.id === selected.id
              const count = Object.values(r.perms).filter(Boolean).length
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors',
                    active ? 'border-[var(--chart-3)] bg-card' : 'border-border bg-card/50 hover:bg-card',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium">{r.name}</span>
                    {r.system && (
                      <span className="shrink-0 rounded-sm bg-secondary px-1 py-px font-mono text-[9px] uppercase text-muted-foreground">
                        sistema
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users size={10} /> {r.members}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <KeyRound size={10} /> {count}/{PERMISSIONS.length}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Globe2 size={10} /> {r.scope === 'ALL' ? 'Global' : r.scope}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Detalle del rol */}
          <div className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold">{selected.name}</h2>
                <p className="mt-1 max-w-lg text-[12.5px] leading-relaxed text-muted-foreground">{selected.desc}</p>
              </div>
              {selected.system && (
                <span className="rounded-md border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Rol de sistema · no editable
                </span>
              )}
            </div>

            {/* Alcance por país */}
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Alcance por país
              </Label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(['ALL', 'AR', 'CL', 'UY'] as Scope[]).map((s) => (
                  <button
                    key={s}
                    disabled={selected.system}
                    onClick={() => setScope(s)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-[12px] transition-colors disabled:opacity-60',
                      selected.scope === s
                        ? 'border-[var(--chart-3)] bg-[color-mix(in_oklab,var(--chart-3)_16%,transparent)] text-foreground'
                        : 'border-border text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {scopeLabel(s)}
                  </button>
                ))}
              </div>
            </div>

            {/* Permisos */}
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Permisos
              </Label>
              <div className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border">
                {PERMISSIONS.map((p) => (
                  <div key={p.key} className="flex items-center justify-between gap-4 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium">{p.label}</p>
                      <p className="truncate text-[11.5px] text-muted-foreground">{p.desc}</p>
                    </div>
                    <Switch
                      checked={selected.perms[p.key]}
                      disabled={selected.system}
                      onCheckedChange={() => togglePerm(p.key)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Usuarios */}
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Usuarios ({USERS.length})
            </span>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]">
              <Plus size={13} /> Invitar usuario
            </Button>
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Usuario</th>
                  <th className="px-4 py-2.5 font-medium">Rol</th>
                  <th className="px-4 py-2.5 font-medium">Alcance</th>
                  <th className="px-4 py-2.5 font-medium">Origen</th>
                </tr>
              </thead>
              <tbody>
                {USERS.map((u) => (
                  <tr key={u.email} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold"
                          style={{
                            background: 'color-mix(in oklab, var(--chart-3) 20%, transparent)',
                            color: 'var(--chart-3)',
                          }}
                        >
                          {u.name.split(' ').map((p) => p[0]).join('')}
                        </span>
                        <div className="leading-tight">
                          <p className="font-medium">{u.name}</p>
                          <p className="font-mono text-[11px] text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">{u.role}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{scopeLabel(u.scope)}</td>
                    <td className="px-4 py-2.5">
                      {u.entra === 'entra-id' ? (
                        <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                          <span className="grid h-3 w-3 grid-cols-2 gap-px" aria-hidden>
                            <span className="bg-[#f25022]" />
                            <span className="bg-[#7fba00]" />
                            <span className="bg-[#00a4ef]" />
                            <span className="bg-[#ffb900]" />
                          </span>
                          Entra ID
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                          <Check size={12} /> Local
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 font-mono text-[10.5px] text-muted-foreground">
            Prototipo de diseño · los cambios de roles y permisos no se persisten todavía
          </p>
        </div>
      </div>
    </div>
  )
}
