'use client'

import { useMemo, useState } from 'react'
import { X, Search, Lock, ChevronDown, ChevronRight, Copy, ArrowRight } from 'lucide-react'
import { ATLAS_NODES } from '@/lib/atlas-data'
import type { AtlasNode, Endpoint, EndpointScope } from '@/lib/atlas-types'
import { cn } from '@/lib/utils'

const METHOD_COLOR: Record<string, string> = {
  GET: 'var(--chart-4)',
  POST: 'var(--chart-3)',
  PUT: 'var(--chart-1)',
  PATCH: 'var(--chart-1)',
  DELETE: 'var(--destructive)',
}

const SCOPE_META: Record<EndpointScope, { label: string; color: string }> = {
  interno: { label: 'Internos', color: 'var(--chart-3)' },
  sap: { label: 'Contra SAP', color: 'var(--chart-1)' },
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => {
          navigator.clipboard?.writeText(code)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }}
        className="absolute right-2 top-2 flex items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground hover:text-foreground"
      >
        <Copy size={10} />
        {copied ? 'copiado' : 'copiar'}
      </button>
      <pre className="overflow-auto rounded-md border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground">
        {code}
      </pre>
    </div>
  )
}

function EndpointRow({ ep, env }: { ep: Endpoint; env: string }) {
  const [open, setOpen] = useState(false)
  const [variantIdx, setVariantIdx] = useState(0)
  const color = METHOD_COLOR[ep.method]
  const base = ep.envUrls?.find((u) => u.env === env)?.baseUrl
  const fullUrl = base ? `${base}${ep.path}` : ep.path
  const variant = ep.variants?.[variantIdx]

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-accent/40"
      >
        <span className="shrink-0 text-muted-foreground">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span
          className="w-14 shrink-0 rounded-sm px-1 py-0.5 text-center font-mono text-[10px] font-bold"
          style={{ background: `color-mix(in oklab, ${color} 20%, transparent)`, color }}
        >
          {ep.method}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[12px]">{ep.path}</p>
          {ep.note && <p className="truncate text-[11px] text-muted-foreground">{ep.note}</p>}
        </div>
        {ep.variants && ep.variants.length > 0 && (
          <span className="hidden shrink-0 rounded-full border border-border px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground sm:inline">
            {ep.variants.length} tipo{ep.variants.length > 1 ? 's' : ''}
          </span>
        )}
        {ep.avgMs && (
          <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{ep.avgMs}ms</span>
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-sm px-1 py-0.5 font-mono text-[9px] font-bold"
              style={{ background: `color-mix(in oklab, ${color} 20%, transparent)`, color }}
            >
              {ep.method}
            </span>
            <code className="min-w-0 flex-1 truncate rounded border border-border bg-background px-2 py-1 font-mono text-[11px]">
              {fullUrl}
            </code>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-[11.5px]">
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground">destino</span>
              <span className="flex items-center gap-1 font-medium">
                <ArrowRight size={11} />
                {ep.target}
              </span>
            </span>
            {ep.auth && (
              <span className="flex items-center gap-1.5">
                <Lock size={11} className="text-muted-foreground" />
                {ep.auth}
              </span>
            )}
          </div>

          {ep.headers && (
            <div>
              <p className="mb-1 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
                Headers
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(ep.headers).map(([k, v]) => (
                  <span
                    key={k}
                    className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px]"
                  >
                    {k}: <span className="text-muted-foreground">{v}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {ep.variants && ep.variants.length > 0 && variant && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {ep.variants.map((v, i) => (
                  <button
                    key={v.orderType}
                    onClick={() => setVariantIdx(i)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                      i === variantIdx
                        ? 'border-[var(--chart-3)] bg-[color-mix(in_oklab,var(--chart-3)_16%,transparent)]'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {v.orderType}
                  </button>
                ))}
              </div>
              {variant.note && (
                <p className="text-[11px] text-muted-foreground">{variant.note}</p>
              )}
              {variant.requestBody && (
                <div>
                  <p className="mb-1 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
                    Request body
                  </p>
                  <CodeBlock code={variant.requestBody} />
                </div>
              )}
              {variant.responseBody && (
                <div>
                  <p className="mb-1 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
                    Response
                  </p>
                  <CodeBlock code={variant.responseBody} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function EndpointExplorer({
  nodeId,
  connectionToId,
  onClose,
}: {
  nodeId: string
  connectionToId?: string | null
  onClose: () => void
}) {
  const node = ATLAS_NODES.find((n) => n.id === nodeId) as AtlasNode | undefined
  const other = connectionToId ? ATLAS_NODES.find((n) => n.id === connectionToId) : null

  const envOptions = useMemo(() => {
    const set = new Set<string>()
    node?.endpoints?.forEach((e) => e.envUrls?.forEach((u) => set.add(u.env)))
    return Array.from(set)
  }, [node])

  const [env, setEnv] = useState<string>(envOptions[0] ?? 'Producción')
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const eps = node?.endpoints ?? []
    const q = query.trim().toLowerCase()
    const filtered = q
      ? eps.filter(
          (e) =>
            e.path.toLowerCase().includes(q) ||
            e.target.toLowerCase().includes(q) ||
            e.variants?.some((v) => v.orderType.toLowerCase().includes(q)),
        )
      : eps
    return {
      interno: filtered.filter((e) => (e.scope ?? 'interno') === 'interno'),
      sap: filtered.filter((e) => e.scope === 'sap'),
    }
  }, [node, query])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div
        className="flex h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-border px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Catálogo de endpoints
            </p>
            <h2 className="truncate text-[15px] font-semibold">{node?.label ?? 'Nodo'}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </header>

        {other && (
          <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-5 py-2 text-[12px]">
            <span className="text-muted-foreground">Conexión seleccionada:</span>
            <span className="flex items-center gap-1.5 font-medium">
              {node?.label}
              <ArrowRight size={12} />
              {other.label}
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2.5">
          <div className="relative flex-1">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar ruta, destino o tipo de pedido…"
              className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-2 text-[12.5px] outline-none focus:border-ring"
            />
          </div>
          {envOptions.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
                Ambiente
              </span>
              {envOptions.map((e) => (
                <button
                  key={e}
                  onClick={() => setEnv(e)}
                  className={cn(
                    'rounded-md border px-2 py-1 text-[11.5px] transition-colors',
                    env === e
                      ? 'border-[var(--chart-3)] bg-[color-mix(in_oklab,var(--chart-3)_16%,transparent)]'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 space-y-5 overflow-auto bg-background px-5 py-4">
          {(['interno', 'sap'] as EndpointScope[]).map((scope) =>
            groups[scope].length > 0 ? (
              <div key={scope}>
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: SCOPE_META[scope].color }}
                  />
                  <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {SCOPE_META[scope].label} ({groups[scope].length})
                  </h3>
                </div>
                <div className="space-y-2">
                  {groups[scope].map((ep, i) => (
                    <EndpointRow key={ep.id ?? ep.path + i} ep={ep} env={env} />
                  ))}
                </div>
              </div>
            ) : null,
          )}

          {groups.interno.length === 0 && groups.sap.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
              <p className="text-[13.5px] font-medium">Sin endpoints cargados para este desarrollo.</p>
              <p className="max-w-sm text-[12px] text-muted-foreground">
                Se pueden cargar manualmente o importar desde la colección (OpenAPI / Postman) del
                repositorio.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
