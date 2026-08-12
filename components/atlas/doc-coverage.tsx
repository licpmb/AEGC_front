'use client'

import { useMemo, useState } from 'react'
import { FileText, ExternalLink, AlertTriangle, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ATLAS_NODES } from '@/lib/atlas-data'
import { getDocCoverage, getDocCompleteness } from '@/lib/atlas-docs'
import {
  COUNTRY_META,
  DOC_SOURCE_META,
  DOC_STATUS_META,
  type DocSourceKind,
  type DocStatus,
} from '@/lib/atlas-types'
import { cn } from '@/lib/utils'

// Nodos que representan "desarrollos" documentables.
const DEV_KINDS = new Set(['erp', 'middleware', 'interface', 'loader', 'builder', 'datastore'])

const SOURCES = Object.keys(DOC_SOURCE_META) as DocSourceKind[]

function StatusDot({ status }: { status: DocStatus }) {
  const meta = DOC_STATUS_META[status]
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{
          background: status === 'faltante' ? 'transparent' : meta.color,
          border: status === 'faltante' ? '1px dashed var(--destructive)' : 'none',
        }}
      />
      <span
        className="text-[11.5px]"
        style={{ color: status === 'faltante' ? 'var(--destructive)' : 'var(--foreground)' }}
      >
        {meta.label}
      </span>
    </div>
  )
}

export function DocCoverage() {
  const [q, setQ] = useState('')

  const devs = useMemo(
    () =>
      ATLAS_NODES.filter((n) => DEV_KINDS.has(n.kind) && !n.parentId)
        .concat(ATLAS_NODES.filter((n) => n.kind === 'interface' && n.parentId))
        .filter((n, i, arr) => arr.findIndex((x) => x.id === n.id) === i)
        .filter((n) => n.label.toLowerCase().includes(q.toLowerCase()))
        .map((n) => ({
          node: n,
          coverage: getDocCoverage(n.id),
          completeness: getDocCompleteness(n.id),
        }))
        .sort((a, b) => a.completeness - b.completeness),
    [q],
  )

  const summary = useMemo(() => {
    const all = ATLAS_NODES.filter((n) => DEV_KINDS.has(n.kind) || n.kind === 'interface')
    const avg =
      all.length > 0
        ? Math.round(all.reduce((acc, n) => acc + getDocCompleteness(n.id), 0) / all.length)
        : 0
    const gaps: Record<DocSourceKind, number> = {
      sharepoint: 0,
      gitlab: 0,
      archimate: 0,
    }
    for (const n of all) {
      for (const d of getDocCoverage(n.id)) {
        if (d.status === 'faltante') gaps[d.kind] += 1
      }
    }
    return { avg, gaps, total: all.length }
  }, [])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border px-6 py-5">
        <div className="flex items-center gap-2">
          <FileText size={16} style={{ color: 'var(--chart-4)' }} />
          <h1 className="text-lg font-semibold">Cobertura documental</h1>
        </div>
        <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
          Consolida la documentación repartida en SharePoint, GitLab y ArchiMate, y muestra qué
          falta de cada desarrollo. GCC agrega el estado de sus hijos y comparte el SharePoint
          contra SAP. Cada celda es sincronizable por API.
        </p>

        <div className="mt-4 flex flex-wrap items-stretch gap-3">
          <div className="flex min-w-40 flex-col justify-center rounded-lg border border-border bg-card px-4 py-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Completitud media
            </span>
            <div className="mt-1 flex items-end gap-2">
              <span className="text-2xl font-semibold tabular-nums">{summary.avg}%</span>
              <span className="mb-1 text-[11.5px] text-muted-foreground">
                de {summary.total} desarrollos
              </span>
            </div>
          </div>

          {SOURCES.map((s) => (
            <div
              key={s}
              className="flex min-w-36 flex-col justify-center rounded-lg border border-border bg-card px-4 py-3"
            >
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: DOC_SOURCE_META[s].color }} />
                {DOC_SOURCE_META[s].label}
              </span>
              <div className="mt-1 flex items-end gap-1.5">
                <span
                  className="text-2xl font-semibold tabular-nums"
                  style={{ color: summary.gaps[s] > 0 ? 'var(--destructive)' : 'var(--foreground)' }}
                >
                  {summary.gaps[s]}
                </span>
                <span className="mb-1 text-[11.5px] text-muted-foreground">sin doc</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-3">
        <div className="relative w-72 max-w-full">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar desarrollo…"
            className="h-9 pl-8 text-[13px]"
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {(Object.keys(DOC_STATUS_META) as DocStatus[]).map((st) => (
            <span key={st} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  background: st === 'faltante' ? 'transparent' : DOC_STATUS_META[st].color,
                  border: st === 'faltante' ? '1px dashed var(--destructive)' : 'none',
                }}
              />
              {DOC_STATUS_META[st].label}
            </span>
          ))}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="min-w-[760px] px-6 py-4">
          {/* header row */}
          <div className="grid grid-cols-[minmax(200px,1.4fr)_repeat(3,1fr)_120px] items-center gap-3 border-b border-border pb-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Desarrollo
            </span>
            {SOURCES.map((s) => (
              <span
                key={s}
                className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                {DOC_SOURCE_META[s].label}
              </span>
            ))}
            <span className="text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Completitud
            </span>
          </div>

          {devs.map(({ node, coverage, completeness }) => (
            <div
              key={node.id}
              className="grid grid-cols-[minmax(200px,1.4fr)_repeat(3,1fr)_120px] items-center gap-3 border-b border-border/60 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[13px] font-medium">{node.label}</p>
                  {node.country && <span aria-hidden>{COUNTRY_META[node.country].flag}</span>}
                </div>
                <p className="truncate text-[11px] text-muted-foreground">{node.domain}</p>
              </div>

              {coverage.map((d) => (
                <div key={d.kind} className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <StatusDot status={d.status} />
                    {d.shared && d.via && (
                      <span className="rounded-sm border border-border px-1 py-px font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                        vía {d.via}
                      </span>
                    )}
                    {d.rollup && (
                      <span
                        className="rounded-sm px-1 py-px font-mono text-[9px] uppercase tracking-wide"
                        style={{
                          background: 'color-mix(in oklab, var(--chart-3) 18%, transparent)',
                          color: 'var(--chart-3)',
                        }}
                        title="Estado agregado del árbol de hijos"
                      >
                        rollup
                      </span>
                    )}
                  </div>
                  {d.note && (
                    <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground" title={d.note}>
                      {d.note}
                    </p>
                  )}
                  {d.url && d.status !== 'faltante' && (
                    <a
                      href={d.url}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink size={9} />
                      {d.updatedAt ?? 'abrir'}
                    </a>
                  )}
                </div>
              ))}

              <div className="flex items-center justify-end gap-2">
                <div className="h-1.5 w-14 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${completeness}%`,
                      background:
                        completeness >= 75
                          ? 'var(--chart-4)'
                          : completeness >= 40
                            ? 'var(--chart-1)'
                            : 'var(--destructive)',
                    }}
                  />
                </div>
                <span className="w-9 text-right text-[12px] font-semibold tabular-nums">
                  {completeness}%
                </span>
              </div>
            </div>
          ))}

          {devs.length === 0 && (
            <div className="flex items-center gap-2 py-10 text-[13px] text-muted-foreground">
              <AlertTriangle size={14} />
              No hay desarrollos que coincidan con la búsqueda.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
