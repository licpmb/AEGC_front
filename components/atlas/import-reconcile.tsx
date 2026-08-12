'use client'

import { useMemo, useState } from 'react'
import {
  Upload,
  Boxes,
  Code2,
  FileText,
  Check,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Link2,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ATLAS_NODES } from '@/lib/atlas-data'
import {
  IMPORT_SOURCE_META,
  RECONCILE_META,
  RECONCILE_RESULTS,
  type ImportSource,
  type ReconcileItem,
  type ReconcileStatus,
} from '@/lib/atlas-reconcile'
import { cn } from '@/lib/utils'

const SOURCE_ICON: Record<ImportSource, typeof Boxes> = {
  archimate: Boxes,
  openapi: Code2,
  sharepoint: FileText,
}

const ORDER: ReconcileStatus[] = [
  'ambiguo',
  'modificado',
  'falta_en_modelo',
  'falta_en_fuente',
  'sin_cambios',
]

function nodeLabel(id?: string) {
  if (!id) return null
  return ATLAS_NODES.find((n) => n.id === id)?.label ?? id
}

function StatusPill({ status }: { status: ReconcileStatus }) {
  const m = RECONCILE_META[status]
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide"
      style={{ background: `color-mix(in oklab, ${m.color} 16%, transparent)`, color: m.color }}
    >
      {m.label}
    </span>
  )
}

export function ImportReconcile() {
  const [source, setSource] = useState<ImportSource | null>(null)
  const [scanned, setScanned] = useState(false)
  // acciones elegidas por item: aplicar | omitir
  const [actions, setActions] = useState<Record<string, 'aplicar' | 'omitir'>>({})

  const result = source ? RECONCILE_RESULTS[source] : null

  const counts = useMemo(() => {
    const c: Record<ReconcileStatus, number> = {
      sin_cambios: 0,
      modificado: 0,
      falta_en_modelo: 0,
      falta_en_fuente: 0,
      ambiguo: 0,
    }
    result?.items.forEach((i) => (c[i.status] += 1))
    return c
  }, [result])

  const ordered = useMemo(
    () =>
      result
        ? [...result.items].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
        : [],
    [result],
  )

  function startScan(src: ImportSource) {
    setSource(src)
    setScanned(false)
    const seed: Record<string, 'aplicar' | 'omitir'> = {}
    RECONCILE_RESULTS[src].items.forEach((i) => {
      seed[i.id] = i.defaultAction === 'aplicar' ? 'aplicar' : 'omitir'
    })
    setActions(seed)
    // simula el escaneo
    setTimeout(() => setScanned(true), 550)
  }

  function reset() {
    setSource(null)
    setScanned(false)
    setActions({})
  }

  const toApply = Object.values(actions).filter((a) => a === 'aplicar').length

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* encabezado */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h2 className="text-pretty text-lg font-semibold">Importar y reconciliar</h2>
          <p className="mt-0.5 max-w-2xl text-pretty text-[13px] leading-relaxed text-muted-foreground">
            Cada fuente se compara contra el Atlas actual y propone cambios{' '}
            <span className="text-foreground">sobre lo que ya existe</span>. No se crean duplicados:
            lo que coincide se corrige, lo nuevo se marca para revisar.
          </p>
        </div>
        {source && (
          <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5">
            <RotateCcw size={13} />
            Otra fuente
          </Button>
        )}
      </div>

      {/* selección de fuente */}
      {!source && (
        <div className="grid flex-1 place-items-center p-6">
          <div className="w-full max-w-4xl">
            <h3 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Elegí una fuente
            </h3>
            <div className="grid gap-4 md:grid-cols-3">
              {(Object.keys(IMPORT_SOURCE_META) as ImportSource[]).map((src) => {
                const meta = IMPORT_SOURCE_META[src]
                const Icon = SOURCE_ICON[src]
                return (
                  <button
                    key={src}
                    onClick={() => startScan(src)}
                    className="group flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-[color:var(--chart-3)]"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                      <Icon size={20} />
                    </span>
                    <div>
                      <p className="font-semibold">{meta.label}</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                        {meta.hint}
                      </p>
                    </div>
                    <span className="mt-auto flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      <Upload size={11} />
                      {meta.accept}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="mt-6 text-center text-[12px] text-muted-foreground">
              Arrastrá el archivo o conectá la fuente por API. Todo puede cargarse también{' '}
              <span className="text-foreground">una a una o masivo</span> desde “Cargar datos”.
            </p>
          </div>
        </div>
      )}

      {/* resultado de reconciliación */}
      {source && result && (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* barra de resumen */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border bg-card/40 px-6 py-3">
            <span className="flex items-center gap-2 text-[13px]">
              <Upload size={14} className="text-muted-foreground" />
              <span className="font-mono text-[12px]">{result.fileName}</span>
            </span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {ORDER.map((s) =>
                counts[s] > 0 ? (
                  <span key={s} className="flex items-center gap-1.5 text-[12px]">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: RECONCILE_META[s].color }}
                    />
                    <span className="text-foreground">{counts[s]}</span>
                    <span className="text-muted-foreground">{RECONCILE_META[s].label}</span>
                  </span>
                ) : null,
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[12px] text-muted-foreground">
                {toApply} de {result.items.length} para aplicar
              </span>
              <Button size="sm" className="gap-1.5" disabled={toApply === 0}>
                <Check size={14} />
                Aplicar al Atlas
              </Button>
            </div>
          </div>

          {!scanned ? (
            <div className="grid flex-1 place-items-center">
              <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Sparkles size={15} className="animate-pulse" />
                Reconciliando contra el Atlas…
              </span>
            </div>
          ) : (
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-2 p-6">
                {ordered.map((item) => (
                  <ReconcileRow
                    key={item.id}
                    item={item}
                    action={actions[item.id]}
                    onAction={(a) => setActions((p) => ({ ...p, [item.id]: a }))}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  )
}

function ReconcileRow({
  item,
  action,
  onAction,
}: {
  item: ReconcileItem
  action: 'aplicar' | 'omitir'
  onAction: (a: 'aplicar' | 'omitir') => void
}) {
  const [open, setOpen] = useState(false)
  const matched = nodeLabel(item.matchedAtlasId)
  const canApply = item.status !== 'sin_cambios' && item.status !== 'falta_en_fuente'
  const hasDetail = (item.changes?.length ?? 0) > 0 || item.aiSummary

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => hasDetail && setOpen((o) => !o)}
          className={cn('flex min-w-0 flex-1 items-center gap-3 text-left', hasDetail && 'cursor-pointer')}
        >
          <span className="font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground">
            {item.entity}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{item.label}</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {item.status === 'ambiguo' ? (
                <AlertTriangle size={11} style={{ color: 'var(--destructive)' }} />
              ) : matched ? (
                <Link2 size={11} />
              ) : null}
              <span className="truncate">
                {matched ? (
                  <>
                    {item.status === 'falta_en_fuente' ? 'Solo en Atlas: ' : '↔ '}
                    <span className="text-foreground">{matched}</span>
                    {typeof item.confidence === 'number' && item.status !== 'falta_en_fuente' && (
                      <span className="ml-1 opacity-70">
                        · {Math.round(item.confidence * 100)}%
                      </span>
                    )}
                  </>
                ) : (
                  item.matchReason
                )}
              </span>
            </span>
          </span>
        </button>

        <StatusPill status={item.status} />

        {/* acción */}
        {canApply ? (
          <div className="flex shrink-0 overflow-hidden rounded-md border border-border">
            <button
              onClick={() => onAction('aplicar')}
              className={cn(
                'px-2.5 py-1 text-[11px] font-medium transition-colors',
                action === 'aplicar'
                  ? 'bg-[color:var(--chart-4)] text-[color:var(--background)]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.status === 'falta_en_modelo' ? 'Agregar' : 'Aplicar'}
            </button>
            <button
              onClick={() => onAction('omitir')}
              className={cn(
                'border-l border-border px-2.5 py-1 text-[11px] font-medium transition-colors',
                action === 'omitir'
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Omitir
            </button>
          </div>
        ) : (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {item.status === 'sin_cambios' ? 'nada que hacer' : 'informativo'}
          </span>
        )}
      </div>

      {/* detalle: diff + resumen IA */}
      {open && hasDetail && (
        <div className="border-t border-border bg-background/50 px-4 py-3">
          {item.aiSummary && (
            <div className="mb-3 rounded-md border border-border bg-card p-3">
              <p className="mb-1 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground">
                <Sparkles size={11} style={{ color: 'var(--chart-3)' }} />
                Resumen interpretado
              </p>
              <p className="text-[12px] leading-relaxed">{item.aiSummary}</p>
            </div>
          )}
          {item.changes && item.changes.length > 0 && (
            <div className="space-y-1.5">
              {item.changes.map((c) => (
                <div key={c.field} className="flex items-start gap-3 text-[12px]">
                  <span className="w-24 shrink-0 pt-0.5 font-mono text-[10.5px] text-muted-foreground">
                    {c.field}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    {c.before !== null ? (
                      <span className="rounded bg-[color:color-mix(in_oklab,var(--destructive)_12%,transparent)] px-1.5 py-0.5 text-[color:var(--destructive)] line-through decoration-1">
                        {c.before}
                      </span>
                    ) : (
                      <span className="font-mono text-[10.5px] text-muted-foreground">(vacío)</span>
                    )}
                    <ArrowRight size={12} className="shrink-0 text-muted-foreground" />
                    <span className="rounded bg-[color:color-mix(in_oklab,var(--chart-4)_16%,transparent)] px-1.5 py-0.5 text-[color:var(--chart-4)]">
                      {c.after}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
