'use client'

import {
  X,
  GitBranch,
  ArrowRight,
  ArrowLeft,
  CircleDot,
  Activity,
  Gauge,
  Users,
  Boxes,
  ExternalLink,
  Server,
  FileText,
  Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  KIND_META,
  COUNTRY_META,
  DOC_SOURCE_META,
  DOC_STATUS_META,
  type AtlasEdge,
  type AtlasNode,
  type GitlabIssue,
} from '@/lib/atlas-types'
import { getDocCoverage, getDocCompleteness } from '@/lib/atlas-docs'
import { cn } from '@/lib/utils'

const SEVERITY_COLOR: Record<string, string> = {
  bloqueante: 'var(--destructive)',
  alta: 'var(--chart-1)',
  media: 'var(--chart-4)',
  baja: 'var(--muted-foreground)',
}

const HEALTH_COLOR: Record<string, string> = {
  ok: 'var(--chart-4)',
  degradado: 'var(--chart-1)',
  caido: 'var(--destructive)',
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-right text-[13px] font-medium">{value}</span>
    </div>
  )
}

function SectionTitle({ icon: Icon, children }: { icon: typeof Boxes; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pb-2 pt-1">
      <Icon size={13} className="text-muted-foreground" />
      <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {children}
      </h3>
    </div>
  )
}

export function DetailPanel({
  node,
  nodes,
  edges,
  issues,
  onClose,
  onSelect,
  onOpenArchimate,
  onOpenEndpoints,
}: {
  node: AtlasNode
  nodes: AtlasNode[]
  edges: AtlasEdge[]
  issues: GitlabIssue[]
  onClose: () => void
  onSelect: (id: string) => void
  onOpenArchimate?: (nodeId: string) => void
  onOpenEndpoints?: (nodeId: string) => void
}) {
  const meta = KIND_META[node.kind]
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const incoming = edges.filter((e) => e.target === node.id)
  const outgoing = edges.filter((e) => e.source === node.id)
  const children = nodes.filter((n) => n.parentId === node.id)
  // Issues propios + los de sus componentes (front / gw / api), para que una
  // interfaz refleje el estado real de todo su árbol.
  const descendantIds = new Set<string>()
  const collect = (id: string) => {
    for (const n of nodes) {
      if (n.parentId === id && !descendantIds.has(n.id)) {
        descendantIds.add(n.id)
        collect(n.id)
      }
    }
  }
  collect(node.id)

  const nodeIssues = issues
    .filter((i) => i.nodeId === node.id || descendantIds.has(i.nodeId))
    .map((i) => ({
      ...i,
      viaLabel: i.nodeId === node.id ? null : (byId.get(i.nodeId)?.label ?? null),
    }))
  const open = nodeIssues.filter((i) => i.state !== 'cerrado')

  return (
    <aside className="flex h-full w-[400px] shrink-0 flex-col border-l border-border bg-sidebar">
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span
          className="mt-0.5 h-8 w-1 shrink-0 rounded-full"
          style={{ background: meta.color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p
            className="font-mono text-[10px] uppercase tracking-[0.14em]"
            style={{ color: meta.color }}
          >
            {meta.label} · {node.domain}
          </p>
          <h2 className="truncate text-lg font-semibold leading-tight">{node.label}</h2>
          {node.country ? (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-border bg-card px-1.5 py-0.5 text-[10.5px]">
              <span aria-hidden>{COUNTRY_META[node.country].flag}</span>
              {COUNTRY_META[node.country].label}
            </span>
          ) : (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-dashed border-border px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
              Regional · AR · CL · UY
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar panel">
          <X size={16} />
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 px-5 py-4 pb-10">
          <p className="text-[13px] leading-relaxed text-muted-foreground">{node.description}</p>

          <div className="rounded-lg border border-border bg-card px-3 py-1.5">
            <Row
              label="Estado"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <CircleDot
                    size={11}
                    style={{ color: node.status === 'prod' ? 'var(--chart-4)' : 'var(--chart-1)' }}
                  />
                  {node.status === 'prod' ? 'Producción' : node.status}
                </span>
              }
            />
            <Row label="Owner" value={node.owner} />
            {node.sla && <Row label="SLA" value={node.sla} />}
            {node.volume && <Row label="Volumen" value={node.volume} />}
          </div>

          {node.tech && node.tech.length > 0 && (
            <div>
              <SectionTitle icon={Gauge}>Stack</SectionTitle>
              <div className="flex flex-wrap gap-1.5">
                {node.tech.map((t) => (
                  <span
                    key={t}
                    className="rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {children.length > 0 && (
            <div>
              <SectionTitle icon={Boxes}>Componentes ({children.length})</SectionTitle>
              <div className="flex flex-col gap-1">
                {children.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onSelect(c.id)}
                    className="flex items-center justify-between rounded-md border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-ring hover:bg-accent"
                  >
                    <span className="text-[13px] font-medium">{c.label}</span>
                    <span
                      className="font-mono text-[10px] uppercase tracking-wider"
                      style={{ color: KIND_META[c.kind].color }}
                    >
                      {KIND_META[c.kind].label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {node.endpoints && node.endpoints.length > 0 && (
            <div>
              <div className="flex items-center justify-between">
                <SectionTitle icon={Activity}>Endpoints ({node.endpoints.length})</SectionTitle>
                {onOpenEndpoints && (
                  <button
                    onClick={() => onOpenEndpoints(node.id)}
                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Ver detalle
                    <ArrowRight size={11} />
                  </button>
                )}
              </div>
              <div className="overflow-hidden rounded-lg border border-border">
                {node.endpoints.map((ep, i) => {
                  const color =
                    ep.method === 'GET'
                      ? 'var(--chart-4)'
                      : ep.method === 'DELETE'
                        ? 'var(--destructive)'
                        : 'var(--chart-3)'
                  return (
                    <button
                      key={ep.id ?? ep.path + i}
                      onClick={() => onOpenEndpoints?.(node.id)}
                      className={cn(
                        'flex w-full items-center gap-2 bg-card px-2.5 py-2 text-left hover:bg-accent/40',
                        i > 0 && 'border-t border-border',
                      )}
                    >
                      <span
                        className="w-12 shrink-0 rounded-sm px-1 py-0.5 text-center font-mono text-[9px] font-bold"
                        style={{
                          background: `color-mix(in oklab, ${color} 20%, transparent)`,
                          color,
                        }}
                      >
                        {ep.method}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[11.5px]">{ep.path}</p>
                        <p className="truncate text-[10.5px] text-muted-foreground">
                          → {ep.target}
                          {ep.note ? ` · ${ep.note}` : ''}
                        </p>
                      </div>
                      {ep.scope === 'sap' && (
                        <span className="shrink-0 rounded-sm border border-border px-1 py-px font-mono text-[8.5px] uppercase tracking-wide text-muted-foreground">
                          SAP
                        </span>
                      )}
                      {ep.avgMs && (
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {ep.avgMs}ms
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {node.environments && node.environments.length > 0 && (
            <div>
              <SectionTitle icon={Server}>Ambientes ({node.environments.length})</SectionTitle>
              <div className="overflow-hidden rounded-lg border border-border">
                {node.environments.map((env, i) => (
                  <div
                    key={env.name + i}
                    className={cn(
                      'flex items-center gap-2 bg-card px-2.5 py-2',
                      i > 0 && 'border-t border-border',
                    )}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: HEALTH_COLOR[env.status] }}
                      title={env.status}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-medium leading-tight">{env.name}</p>
                      <p className="truncate font-mono text-[10.5px] text-muted-foreground">
                        {env.server}
                      </p>
                    </div>
                    {env.url && (
                      <a
                        href={env.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        title={env.url}
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <SectionTitle icon={FileText}>Documentación</SectionTitle>
              <span className="font-mono text-[10px] text-muted-foreground">
                {getDocCompleteness(node.id)}% completo
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {getDocCoverage(node.id).map((d) => {
                const meta = DOC_SOURCE_META[d.kind]
                const st = DOC_STATUS_META[d.status]
                const missing = d.status === 'faltante'
                return (
                  <div
                    key={d.kind}
                    className={cn(
                      'rounded-md border px-2.5 py-2',
                      missing ? 'border-dashed border-destructive/50 bg-transparent' : 'border-border bg-card',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[12px] font-medium">
                        <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                        {meta.label}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {d.kind === 'archimate' && !missing && onOpenArchimate && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onOpenArchimate(node.id)
                            }}
                            className="text-muted-foreground hover:text-foreground"
                            title="Abrir visualizador de ArchiMate"
                          >
                            <Eye size={12} />
                          </button>
                        )}
                        {d.url && !missing && (
                          <a
                            href={d.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    </div>
                    <span
                      className="mt-1 block text-[10.5px]"
                      style={{ color: missing ? 'var(--destructive)' : st.color }}
                    >
                      {st.label}
                      {d.updatedAt && !missing ? ` · ${d.updatedAt}` : ''}
                    </span>
                    {(d.shared || d.rollup) && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {d.shared && d.via && (
                          <span className="rounded-sm border border-border px-1 py-px font-mono text-[8.5px] uppercase tracking-wide text-muted-foreground">
                            vía {d.via}
                          </span>
                        )}
                        {d.rollup && (
                          <span
                            className="rounded-sm px-1 py-px font-mono text-[8.5px] uppercase tracking-wide"
                            style={{
                              background: 'color-mix(in oklab, var(--chart-3) 18%, transparent)',
                              color: 'var(--chart-3)',
                            }}
                          >
                            rollup hijos
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <SectionTitle icon={ArrowRight}>Conexiones</SectionTitle>
            <div className="flex flex-col gap-1">
              {incoming.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onSelect(e.source)}
                  className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-ring hover:bg-accent"
                >
                  <ArrowLeft size={12} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    {byId.get(e.source)?.label}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {e.protocol}
                  </span>
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: HEALTH_COLOR[e.health] }}
                    title={e.health}
                  />
                </button>
              ))}
              {outgoing.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onSelect(e.target)}
                  className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-ring hover:bg-accent"
                >
                  <ArrowRight size={12} className="shrink-0" style={{ color: 'var(--chart-3)' }} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    {byId.get(e.target)?.label}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {e.protocol}
                  </span>
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: HEALTH_COLOR[e.health] }}
                    title={e.health}
                  />
                </button>
              ))}
              {incoming.length === 0 && outgoing.length === 0 && (
                <p className="text-[13px] text-muted-foreground">Sin conexiones registradas.</p>
              )}
            </div>
          </div>

          {node.gitlab && (
            <div>
              <SectionTitle icon={GitBranch}>GitLab</SectionTitle>
              <div className="rounded-lg border border-border bg-card px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-mono text-[11.5px]">
                    {node.gitlab.path}
                  </p>
                  <ExternalLink size={12} className="shrink-0 text-muted-foreground" />
                </div>
                <Separator className="my-2" />
                <div className="flex items-center gap-3 font-mono text-[10.5px]">
                  <span className="text-muted-foreground">{node.gitlab.branch}</span>
                  <span
                    className="rounded-sm px-1.5 py-0.5 uppercase"
                    style={{
                      background:
                        node.gitlab.lastPipeline === 'passed'
                          ? 'color-mix(in oklab, var(--chart-4) 20%, transparent)'
                          : node.gitlab.lastPipeline === 'failed'
                            ? 'color-mix(in oklab, var(--destructive) 22%, transparent)'
                            : 'color-mix(in oklab, var(--chart-1) 22%, transparent)',
                      color:
                        node.gitlab.lastPipeline === 'passed'
                          ? 'var(--chart-4)'
                          : node.gitlab.lastPipeline === 'failed'
                            ? 'var(--destructive)'
                            : 'var(--chart-1)',
                    }}
                  >
                    pipeline {node.gitlab.lastPipeline}
                  </span>
                  {node.gitlab.syncedAt && (
                    <span className="ml-auto text-muted-foreground">sync {node.gitlab.syncedAt}</span>
                  )}
                </div>

                {node.gitlab.closedIssues != null && (
                  <>
                    <Separator className="my-2" />
                    {(() => {
                      const done = node.gitlab.closedIssues ?? 0
                      const open = node.gitlab.openIssues ?? 0
                      const total = done + open
                      const pct = total > 0 ? Math.round((done / total) * 100) : 0
                      return (
                        <div>
                          <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                            <span>{node.gitlab.sprint ?? 'Sprint activo'}</span>
                            <span>
                              {done}/{total} · {pct}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, background: 'var(--chart-4)' }}
                            />
                          </div>
                        </div>
                      )
                    })()}
                  </>
                )}
              </div>
            </div>
          )}

          <div>
            <SectionTitle icon={GitBranch}>
              Issues del sprint ({open.length} abiertos)
            </SectionTitle>
            <div className="flex flex-col gap-1">
              {nodeIssues.length === 0 && (
                <p className="text-[13px] text-muted-foreground">Sin issues asociados.</p>
              )}
              {nodeIssues.map((i) => (
                <div
                  key={i.id}
                  className={cn(
                    'rounded-md border border-border bg-card px-2.5 py-2',
                    i.state === 'cerrado' && 'opacity-50',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: SEVERITY_COLOR[i.severity] }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] leading-snug">{i.title}</p>
                      {i.viaLabel && (
                        <span className="mt-1 inline-block rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
                          vía {i.viaLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 pl-3.5 font-mono text-[10px] text-muted-foreground">
                    <span>#{i.iid}</span>
                    <span className="uppercase" style={{ color: SEVERITY_COLOR[i.severity] }}>
                      {i.kind}
                    </span>
                    <span>{i.state.replace('_', ' ')}</span>
                    <span className="ml-auto inline-flex items-center gap-1">
                      <Users size={9} />
                      {i.assignee}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </aside>
  )
}
