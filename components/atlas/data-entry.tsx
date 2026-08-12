'use client'

import { useState } from 'react'
import {
  Upload,
  FileSpreadsheet,
  Link2,
  CheckCircle2,
  AlertCircle,
  Plus,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ATLAS_NODES } from '@/lib/atlas-data'
import { KIND_META, COUNTRY_META, type CountryCode } from '@/lib/atlas-types'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'individual', label: 'Alta individual', icon: Plus },
  { key: 'masiva', label: 'Carga masiva', icon: FileSpreadsheet },
  { key: 'relaciones', label: 'Relaciones', icon: Link2 },
] as const

const COMPONENTS = [
  { key: 'front', label: 'Front' },
  { key: 'gw', label: 'Gateway' },
  { key: 'api', label: 'API' },
  { key: 'endpoints', label: 'Endpoints' },
  { key: 'ambientes', label: 'Ambientes / Servers' },
  { key: 'loader', label: 'Loader' },
  { key: 'builder', label: 'Builder' },
  { key: 'gitlab', label: 'Proyecto GitLab' },
]

const COUNTRY_OPTIONS: { value: string; label: string }[] = [
  { value: 'regional', label: 'Regional (AR · CL · UY)' },
  ...(Object.keys(COUNTRY_META) as CountryCode[]).map((c) => ({
    value: c,
    label: `${COUNTRY_META[c].flag} ${COUNTRY_META[c].label}`,
  })),
]

const SAMPLE_CSV = `id,label,kind,domain,owner,status,tech,gitlab_path
wp-front,WP · Front,front,Aplicaciones,Equipo GCC,prod,"Next.js;React",gcc/web-pedidos-front
wp-gw,WP · Gateway,gateway,Aplicaciones,Equipo GCC,prod,"Kong;Entra ID",gcc/web-pedidos-gateway
wp-api,WP · API,api,Aplicaciones,Equipo GCC,prod,".NET 8",gcc/web-pedidos-api
loader-sql,Loader BQ→SQL,loader,Datos,Data Platform,prod,"Python;Airflow",data/loaders-sql`

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </h3>
  )
}

export function DataEntry() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('individual')
  const [comps, setComps] = useState<string[]>(['front', 'gw', 'api', 'gitlab'])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-border px-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 border-b-2 px-3 py-3 text-[13px] font-medium transition-colors',
              tab === t.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-5xl px-5 py-6">
          {tab === 'individual' && (
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <div className="flex flex-col gap-5">
                <div>
                  <SectionLabel>Identidad del nodo</SectionLabel>
                  <div className="mt-3 grid gap-3.5 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-[12.5px]">Nombre</Label>
                      <Input placeholder="Web de Pedidos" className="h-10 text-[13px]" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-[12.5px]">Tipo</Label>
                      <Select defaultValue="interface">
                        <SelectTrigger className="h-10 text-[13px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(KIND_META).map(([k, m]) => (
                            <SelectItem key={k} value={k}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-[12.5px]">Pertenece a</Label>
                      <Select defaultValue="gcc">
                        <SelectTrigger className="h-10 text-[13px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ATLAS_NODES.map((n) => (
                            <SelectItem key={n.id} value={n.id}>
                              {n.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-[12.5px]">Owner</Label>
                      <Input placeholder="Equipo GCC" className="h-10 text-[13px]" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-[12.5px]">País</Label>
                      <Select defaultValue="regional">
                        <SelectTrigger className="h-10 text-[13px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COUNTRY_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="mt-3.5 flex flex-col gap-1.5">
                    <Label className="text-[12.5px]">Descripción</Label>
                    <Textarea
                      placeholder="Qué hace, qué inyecta o extrae, y contra qué sistemas."
                      className="min-h-20 text-[13px]"
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <SectionLabel>¿Qué componentes tiene?</SectionLabel>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {COMPONENTS.map((c) => {
                      const on = comps.includes(c.key)
                      return (
                        <label
                          key={c.key}
                          className={cn(
                            'flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 transition-colors',
                            on ? 'border-ring bg-accent' : 'border-border bg-card',
                          )}
                        >
                          <span className="text-[13px] font-medium">{c.label}</span>
                          <Switch
                            checked={on}
                            onCheckedChange={(v) =>
                              setComps((prev) =>
                                v ? [...prev, c.key] : prev.filter((x) => x !== c.key),
                              )
                            }
                          />
                        </label>
                      )
                    })}
                  </div>
                </div>

                {comps.includes('gitlab') && (
                  <>
                    <Separator />
                    <div>
                      <SectionLabel>GitLab</SectionLabel>
                      <div className="mt-3 grid gap-3.5 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-[12.5px]">Path del proyecto</Label>
                          <Input
                            placeholder="gcc/web-pedidos"
                            className="h-10 font-mono text-[12.5px]"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-[12.5px]">Branch principal</Label>
                          <Input placeholder="main" className="h-10 font-mono text-[12.5px]" />
                        </div>
                      </div>
                      <p className="mt-2 text-[12px] text-muted-foreground">
                        Los issues y pipelines se sincronizan automáticamente desde la API de
                        GitLab una vez vinculado el proyecto.
                      </p>
                    </div>
                  </>
                )}

                {comps.includes('api') && (
                  <>
                    <Separator />
                    <div>
                      <SectionLabel>Endpoints</SectionLabel>
                      <div className="mt-3 flex flex-col gap-2">
                        <div className="flex gap-2">
                          <Select defaultValue="POST">
                            <SelectTrigger className="h-10 w-28 font-mono text-[12.5px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                                <SelectItem key={m} value={m}>
                                  {m}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="/v1/pedidos"
                            className="h-10 flex-1 font-mono text-[12.5px]"
                          />
                          <Input placeholder="Destino: CPI → SAP" className="h-10 flex-1 text-[13px]" />
                        </div>
                        <Button variant="outline" size="sm" className="w-fit">
                          <Plus size={13} />
                          Agregar endpoint
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                {comps.includes('ambientes') && (
                  <>
                    <Separator />
                    <div>
                      <SectionLabel>Ambientes / Servers</SectionLabel>
                      <div className="mt-3 flex flex-col gap-2">
                        <div className="flex gap-2">
                          <Select defaultValue="Producción">
                            <SelectTrigger className="h-10 w-40 text-[12.5px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {['Producción', 'Staging', 'QA', 'Desarrollo'].map((m) => (
                                <SelectItem key={m} value={m}>
                                  {m}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="server: gcc-prod-01.cepas.local"
                            className="h-10 flex-1 font-mono text-[12.5px]"
                          />
                          <Input
                            placeholder="https://…"
                            className="h-10 flex-1 font-mono text-[12.5px]"
                          />
                        </div>
                        <Button variant="outline" size="sm" className="w-fit">
                          <Plus size={13} />
                          Agregar ambiente
                        </Button>
                      </div>
                      <p className="mt-2 text-[12px] text-muted-foreground">
                        Cada ambiente puede tener su server, URL y sus propios endpoints. Su estado
                        de salud se toma de los logs.
                      </p>
                    </div>
                  </>
                )}

                <div className="flex gap-2 pt-1">
                  <Button className="h-10">Guardar y ubicar en el mapa</Button>
                  <Button variant="ghost" className="h-10">
                    Cancelar
                  </Button>
                </div>
              </div>

              {/* Preview del nodo */}
              <div className="flex flex-col gap-3">
                <SectionLabel>Previsualización</SectionLabel>
                <div className="rounded-lg border border-border bg-sidebar p-5">
                  <div
                    className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
                    style={{
                      borderColor: 'var(--chart-3)',
                      boxShadow: '0 0 30px -12px var(--chart-3)',
                    }}
                  >
                    <span
                      className="h-7 w-7 shrink-0 rounded-md"
                      style={{
                        background: 'color-mix(in oklab, var(--chart-3) 20%, transparent)',
                      }}
                    />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold">Nuevo nodo</p>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Interfaz{comps.includes('gitlab') ? ' · git' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    {comps.map((c) => (
                      <div
                        key={c}
                        className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
                      >
                        <ArrowRight size={11} className="text-muted-foreground" />
                        <span className="text-[12px]">
                          {COMPONENTS.find((x) => x.key === c)?.label}
                        </span>
                      </div>
                    ))}
                    {comps.length === 0 && (
                      <p className="text-[12px] text-muted-foreground">
                        Sin componentes seleccionados.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'masiva' && (
            <div className="flex flex-col gap-6">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { t: 'Nodos', d: 'Sistemas, interfaces, componentes' },
                  { t: 'Relaciones', d: 'Origen, destino, protocolo, dirección' },
                  { t: 'Endpoints', d: 'Método, path, destino' },
                ].map((c) => (
                  <div
                    key={c.t}
                    className="rounded-lg border border-border bg-card px-4 py-3.5"
                  >
                    <p className="text-[13.5px] font-semibold">{c.t}</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{c.d}</p>
                    <Button variant="ghost" size="sm" className="mt-2 h-7 px-0 text-[12px]">
                      Descargar plantilla CSV
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/50 px-6 py-12">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ background: 'color-mix(in oklab, var(--chart-3) 15%, transparent)' }}
                >
                  <Upload size={20} style={{ color: 'var(--chart-3)' }} />
                </span>
                <div className="text-center">
                  <p className="text-[14px] font-medium">Arrastrá tu CSV, XLSX o JSON</p>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">
                    También podés pegar un export de tu inventario actual o conectar la API de
                    GitLab para importar proyectos.
                  </p>
                </div>
                <div className="mt-1 flex gap-2">
                  <Button size="sm">Seleccionar archivo</Button>
                  <Button variant="outline" size="sm">
                    Importar desde GitLab
                  </Button>
                </div>
              </div>

              <div>
                <SectionLabel>Vista previa del mapeo</SectionLabel>
                <div className="mt-3 overflow-hidden rounded-lg border border-border">
                  <pre className="overflow-x-auto bg-card px-4 py-3 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
                    {SAMPLE_CSV}
                  </pre>
                  <div className="flex flex-wrap items-center gap-4 border-t border-border bg-sidebar px-4 py-2.5">
                    <span className="flex items-center gap-1.5 text-[12px]">
                      <CheckCircle2 size={13} style={{ color: 'var(--chart-4)' }} />
                      4 filas válidas
                    </span>
                    <span className="flex items-center gap-1.5 text-[12px]">
                      <AlertCircle size={13} style={{ color: 'var(--chart-1)' }} />
                      1 advertencia: <code className="font-mono">loader-sql</code> sin relación de
                      destino
                    </span>
                    <Button size="sm" className="ml-auto h-8">
                      Confirmar importación
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'relaciones' && (
            <div className="flex flex-col gap-6">
              <div>
                <SectionLabel>Crear relación</SectionLabel>
                <div className="mt-3 rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-end">
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Label className="text-[12.5px]">Origen</Label>
                      <Select defaultValue="wp-api">
                        <SelectTrigger className="h-10 text-[13px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ATLAS_NODES.map((n) => (
                            <SelectItem key={n.id} value={n.id}>
                              {n.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <ArrowRight size={16} className="mb-3 hidden shrink-0 text-muted-foreground lg:block" />
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Label className="text-[12.5px]">Destino</Label>
                      <Select defaultValue="cpi">
                        <SelectTrigger className="h-10 text-[13px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ATLAS_NODES.map((n) => (
                            <SelectItem key={n.id} value={n.id}>
                              {n.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-[12.5px]">Dirección</Label>
                      <Select defaultValue="inyeccion">
                        <SelectTrigger className="h-10 text-[13px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inyeccion">Inyección</SelectItem>
                          <SelectItem value="extraccion">Extracción</SelectItem>
                          <SelectItem value="bidireccional">Bidireccional</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-[12.5px]">Protocolo</Label>
                      <Select defaultValue="REST">
                        <SelectTrigger className="h-10 text-[13px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['REST', 'OData', 'SOAP', 'IDoc', 'JDBC', 'Batch', 'CDC', 'SFTP'].map(
                            (p) => (
                              <SelectItem key={p} value={p}>
                                {p}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-[12.5px]">Etiqueta</Label>
                      <Input placeholder="POST /v1/pedidos" className="h-10 font-mono text-[12.5px]" />
                    </div>
                  </div>
                  <Button className="mt-4 h-10">Crear relación</Button>
                </div>
              </div>

              <div>
                <SectionLabel>Relaciones del flujo de pedidos</SectionLabel>
                <div className="mt-3 overflow-hidden rounded-lg border border-border">
                  {[
                    ['Web de Pedidos · Front', 'WP · Gateway', 'REST', 'Inyección'],
                    ['WP · Gateway', 'WP · API', 'REST', 'Inyección'],
                    ['WP · API', 'SAP CPI', 'REST', 'Inyección'],
                    ['SAP CPI', 'API_SALES_ORDER_SRV', 'OData', 'Inyección'],
                    ['SQL Server · GCC', 'GCC', 'JDBC', 'Extracción'],
                  ].map(([s, t, p, d], i) => (
                    <div
                      key={s + t}
                      className={cn(
                        'flex flex-wrap items-center gap-3 bg-card px-4 py-2.5',
                        i > 0 && 'border-t border-border',
                      )}
                    >
                      <span className="text-[12.5px] font-medium">{s}</span>
                      <ArrowRight size={12} className="text-muted-foreground" />
                      <span className="text-[12.5px] font-medium">{t}</span>
                      <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">
                        {p}
                      </span>
                      <span
                        className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase"
                        style={{
                          background:
                            d === 'Inyección'
                              ? 'color-mix(in oklab, var(--chart-3) 20%, transparent)'
                              : 'color-mix(in oklab, var(--chart-4) 20%, transparent)',
                          color: d === 'Inyección' ? 'var(--chart-3)' : 'var(--chart-4)',
                        }}
                      >
                        {d}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
