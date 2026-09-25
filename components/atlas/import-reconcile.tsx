'use client'

import { useMemo, useRef, useState } from 'react'
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
  Settings2,
  Braces,
  ShieldAlert,
  FileJson,
  Files,
  GitMerge,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataEntry } from './data-entry'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ATLAS_NODES } from '@/lib/atlas-data'
import { saveAtlasNodeOverride, upsertImportedEdge, upsertImportedNode, useAtlasNodes } from '@/lib/atlas-local'
import { parseAppSettings, parsePostman, type TechnicalReconcileResult } from '@/lib/technical-import'
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
  appsettings: Settings2,
  postman: Braces,
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

type DetectedFile = {
  name: string
  source: ImportSource | 'desconocido'
  label: string
}

async function detectImportSource(file: File): Promise<DetectedFile> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.archimate')) return { name: file.name, source: 'archimate', label: 'ArchiMate' }
  if (/\.ya?ml$/.test(name)) return { name: file.name, source: 'openapi', label: 'OpenAPI / YAML' }
  if (/\.(docx|pdf|xlsx|vsdx)$/i.test(name)) return { name: file.name, source: 'sharepoint', label: 'Documento' }

  if (name.endsWith('.json')) {
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      if (String(json?.info?.schema ?? '').includes('getpostman.com') || (Array.isArray(json?.item) && json?.info)) {
        return { name: file.name, source: 'postman', label: 'Postman Collection' }
      }
      if (json?.openapi || json?.swagger) {
        return { name: file.name, source: 'openapi', label: 'OpenAPI / Swagger' }
      }
      if (
        json?.ConnectionStrings !== undefined ||
        json?.Logging !== undefined ||
        json?.Serilog !== undefined ||
        json?.AllowedHosts !== undefined ||
        json?.ApiUrls !== undefined ||
        /appsettings/i.test(file.name)
      ) {
        return { name: file.name, source: 'appsettings', label: 'AppSettings' }
      }
    } catch {
      // JSON inválido o no reconocible.
    }
  }

  if (/\.xml$/i.test(name)) {
    const head = (await file.text()).slice(0, 8000).toLowerCase()
    if (head.includes('archimate') || head.includes('<model')) {
      return { name: file.name, source: 'archimate', label: 'ArchiMate / XML' }
    }
  }

  return { name: file.name, source: 'desconocido', label: 'No identificado' }
}

export function ImportReconcile() {
  const atlasNodes = useAtlasNodes()
  const [workspace, setWorkspace] = useState<'descubrir' | 'cargar'>('descubrir')
  const [source, setSource] = useState<ImportSource | null>(null)
  const [scanned, setScanned] = useState(false)
  const [liveResult, setLiveResult] = useState<TechnicalReconcileResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [detectedFiles, setDetectedFiles] = useState<DetectedFile[]>([])
  const genericInputRef = useRef<HTMLInputElement>(null)
  // acciones elegidas por item: aplicar | omitir
  const [actions, setActions] = useState<Record<string, 'aplicar' | 'omitir'>>({})
  const [mappings, setMappings] = useState<Record<string, string>>({})

  const result = liveResult ?? (source ? RECONCILE_RESULTS[source] ?? null : null)

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

  function seedActions(items: ReconcileItem[]) {
    const seed: Record<string, 'aplicar' | 'omitir'> = {}
    items.forEach((i) => {
      seed[i.id] = i.defaultAction === 'aplicar' ? 'aplicar' : 'omitir'
    })
    setActions(seed)
  }

  function startScan(src: ImportSource) {
    const staticResult = RECONCILE_RESULTS[src]
    if (!staticResult) return
    setSource(src)
    setLiveResult(null)
    setError(null)
    setScanned(false)
    seedActions(staticResult.items)
    setTimeout(() => setScanned(true), 250)
  }

  async function loadDroppedFiles(files: File[]) {
    if (!files.length) return
    setError(null)
    setScanned(false)

    const detected = await Promise.all(files.map(detectImportSource))
    setDetectedFiles(detected)

    const supported = detected.filter((d) => d.source === 'appsettings' || d.source === 'postman')
    if (!supported.length) {
      const labels = detected.map((d) => `${d.name}: ${d.label}`).join(' · ')
      setSource(detected[0]?.source === 'desconocido' ? null : detected[0]?.source ?? null)
      setError(`Identifiqué los archivos, pero este flujo todavía procesa automáticamente AppSettings y Postman. ${labels}`)
      setScanned(true)
      return
    }

    const allItems: TechnicalReconcileResult['items'] = []
    let totalSecrets = 0
    const processedNames: string[] = []
    let firstSource: 'appsettings' | 'postman' = supported[0].source as 'appsettings' | 'postman'

    for (let i = 0; i < detected.length; i += 1) {
      const detectedFile = detected[i]
      if (detectedFile.source !== 'appsettings' && detectedFile.source !== 'postman') continue
      const file = files[i]
      const text = await file.text()
      const parsed = detectedFile.source === 'appsettings'
        ? parseAppSettings(text, file.name, atlasNodes)
        : parsePostman(text, file.name, atlasNodes)
      allItems.push(...parsed.items.map((item) => ({ ...item, id: `${slugFile(file.name)}-${item.id}` })))
      totalSecrets += parsed.secretsDetected
      processedNames.push(file.name)
    }

    const combined: TechnicalReconcileResult = {
      source: firstSource,
      fileName: processedNames.join(' + '),
      scannedAt: 'recién',
      items: allItems,
      secretsDetected: totalSecrets,
    }

    setSource(firstSource)
    setLiveResult(combined)
    seedActions(combined.items)
    setScanned(true)
  }

  function slugFile(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36)
  }

  async function loadTechnicalFile(src: 'appsettings' | 'postman', file: File) {
    setDetectedFiles([{ name: file.name, source: src, label: src === 'appsettings' ? 'AppSettings' : 'Postman Collection' }])
    setSource(src)
    setLiveResult(null)
    setError(null)
    setScanned(false)
    try {
      const text = await file.text()
      const parsed = src === 'appsettings'
        ? parseAppSettings(text, file.name, atlasNodes)
        : parsePostman(text, file.name, atlasNodes)
      setLiveResult(parsed)
      seedActions(parsed.items)
      setScanned(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo interpretar el archivo.')
      setScanned(true)
    }
  }

  function reset() {
    setSource(null)
    setLiveResult(null)
    setError(null)
    setDetectedFiles([])
    setScanned(false)
    setActions({})
    setMappings({})
  }

  const toApply = Object.values(actions).filter((a) => a === 'aplicar').length

  function applySelected() {
    if (!liveResult) return

    const storedMappings = (() => {
      try { return JSON.parse(localStorage.getItem('aegc:import-mappings:v1') ?? '{}') as Record<string, string> }
      catch { return {} as Record<string, string> }
    })()

    for (const item of liveResult.items) {
      if (actions[item.id] !== 'aplicar') continue
      const mappedNodeId = mappings[item.id]

      if (mappedNodeId) {
        storedMappings[`${liveResult.source}|${item.label}`] = mappedNodeId
      }

      for (const mutation of item.mutations ?? []) {
        if (mutation.kind === 'patch-node') {
          saveAtlasNodeOverride(mappedNodeId ?? mutation.nodeId, mutation.patch)
        } else if (mutation.kind === 'upsert-node') {
          if (mappedNodeId) {
            saveAtlasNodeOverride(mappedNodeId, {
              description: mutation.node.description,
              tech: mutation.node.tech,
              environments: mutation.node.environments,
            })
          } else {
            upsertImportedNode(mutation.node)
          }
        } else if (mutation.kind === 'upsert-edge') {
          upsertImportedEdge({
            ...mutation.edge,
            source: mappings[item.id] && mutation.edge.source === item.matchedAtlasId ? mappings[item.id] : mutation.edge.source,
            target: mappings[item.id] && mutation.edge.target === item.matchedAtlasId ? mappings[item.id] : mutation.edge.target,
          })
        }
      }
    }

    try { localStorage.setItem('aegc:import-mappings:v1', JSON.stringify(storedMappings)) } catch {}
    setActions((prev) => Object.fromEntries(Object.keys(prev).map((id) => [id, 'omitir'])))
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* encabezado unificado */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h2 className="text-pretty text-lg font-semibold">Datos e importación</h2>
          <p className="mt-0.5 max-w-2xl text-pretty text-[13px] leading-relaxed text-muted-foreground">
            Una sola entrada para descubrir arquitectura desde archivos o cargar/editar datos manualmente.
          </p>
        </div>
        {workspace === 'descubrir' && source && (
          <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5">
            <RotateCcw size={13} />
            Otra fuente
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-border px-5">
        <button
          onClick={() => setWorkspace('descubrir')}
          className={cn(
            'border-b-2 px-3 py-3 text-[13px] font-medium transition-colors',
            workspace === 'descubrir'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          Descubrir / Importar
        </button>
        <button
          onClick={() => setWorkspace('cargar')}
          className={cn(
            'border-b-2 px-3 py-3 text-[13px] font-medium transition-colors',
            workspace === 'cargar'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          Cargar / Editar manualmente
        </button>
      </div>

      {workspace === 'cargar' && <DataEntry />}

      {/* selección de fuente */}
      {workspace === 'descubrir' && !source && (
        <div
          className={cn(
            'relative m-4 flex flex-1 items-center justify-center rounded-2xl border-2 border-dashed p-6 transition-colors',
            dragging
              ? 'border-[var(--chart-3)] bg-[color-mix(in_oklab,var(--chart-3)_9%,transparent)]'
              : 'border-border bg-card/20',
          )}
          onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={(e) => {
            e.preventDefault()
            const next = e.relatedTarget as Node | null
            if (!next || !e.currentTarget.contains(next)) setDragging(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void loadDroppedFiles(Array.from(e.dataTransfer.files))
          }}
        >
          <input
            ref={genericInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".json,.yaml,.yml,.archimate,.xml,.docx,.pdf,.xlsx,.vsdx"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length) void loadDroppedFiles(files)
              e.currentTarget.value = ''
            }}
          />

          {dragging && (
            <div className="pointer-events-none absolute inset-4 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-[var(--chart-3)] bg-[color-mix(in_oklab,var(--chart-3)_12%,var(--background))]">
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-secondary">
                  <Files size={27} />
                </span>
                <p className="text-[16px] font-semibold">Soltá los archivos en cualquier lugar</p>
                <p className="text-[12px] text-muted-foreground">AEGC identifica automáticamente el tipo de artefacto.</p>
              </div>
            </div>
          )}

          <div className="w-full max-w-4xl">
            <button
              type="button"
              onClick={() => genericInputRef.current?.click()}
              className="mb-6 flex w-full cursor-pointer flex-col items-center justify-center rounded-xl px-6 py-6 text-center transition-colors hover:bg-accent/30"
            >
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
                <Files size={23} />
              </span>
              <p className="text-[15px] font-semibold">Toda esta área acepta archivos</p>
              <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-muted-foreground">
                Arrastrá y soltá en cualquier punto dentro del borde punteado. AEGC identifica automáticamente
                AppSettings, Postman, OpenAPI, ArchiMate o documentación. También podés hacer clic acá para elegir archivos.
              </p>
            </button>

            <h3 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              O elegí el tipo manualmente
            </h3>
            <div className="grid gap-4 md:grid-cols-3">
              {(Object.keys(IMPORT_SOURCE_META) as ImportSource[]).map((src) => {
                const meta = IMPORT_SOURCE_META[src]
                const Icon = SOURCE_ICON[src]
                return (
                  <label
                    key={src}
                    className="group flex cursor-pointer flex-col items-start gap-3 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-[color:var(--chart-3)]"
                    onClick={(e) => {
                      if (src !== 'appsettings' && src !== 'postman') {
                        e.preventDefault()
                        startScan(src)
                      }
                    }}
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
                    {(src === 'appsettings' || src === 'postman') && (
                      <input
                        type="file"
                        className="hidden"
                        accept=".json,application/json"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) void loadTechnicalFile(src, file)
                          e.currentTarget.value = ''
                        }}
                      />
                    )}
                  </label>
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
      {workspace === 'descubrir' && source && result && (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* barra de resumen */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border bg-card/40 px-6 py-3">
            <span className="flex items-center gap-2 text-[13px]">
              <Upload size={14} className="text-muted-foreground" />
              <span className="font-mono text-[12px]">{result.fileName}</span>
            </span>
            {detectedFiles.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {detectedFiles.map((file) => (
                  <span key={file.name} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-[10px]">
                    <FileJson size={10} />
                    <span className="max-w-40 truncate">{file.name}</span>
                    <span className="font-semibold text-foreground">· {file.label}</span>
                  </span>
                ))}
              </div>
            )}
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
              <Button size="sm" className="gap-1.5" disabled={toApply === 0 || !liveResult} onClick={applySelected}>
                <Check size={14} />
                Aplicar al Atlas
              </Button>
            </div>
          </div>

          {liveResult?.secretsDetected ? (
            <div className="mx-6 mt-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px]">
              <ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber-600" />
              <span>Se detectaron {liveResult.secretsDetected} credenciales/secretos potenciales. <strong>No se muestran ni se incorporan al Atlas.</strong></span>
            </div>
          ) : null}

          {error && (
            <div className="mx-6 mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          )}

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
                    atlasNodes={atlasNodes}
                    mappedNodeId={mappings[item.id]}
                    onMap={(nodeId) => {
                      setMappings((prev) => ({ ...prev, [item.id]: nodeId }))
                      setActions((prev) => ({ ...prev, [item.id]: 'aplicar' }))
                    }}
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
  atlasNodes,
  mappedNodeId,
  onMap,
  onAction,
}: {
  item: ReconcileItem
  action: 'aplicar' | 'omitir'
  atlasNodes: ReturnType<typeof useAtlasNodes>
  mappedNodeId?: string
  onMap: (nodeId: string) => void
  onAction: (a: 'aplicar' | 'omitir') => void
}) {
  const [open, setOpen] = useState(false)
  const [mappingOpen, setMappingOpen] = useState(false)
  const mapped = mappedNodeId ? atlasNodes.find((n) => n.id === mappedNodeId)?.label ?? mappedNodeId : null
  const matched = mapped ?? nodeLabel(item.matchedAtlasId)
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
          <div className="flex shrink-0 items-center gap-2">
            {(item.status === 'ambiguo' || item.status === 'falta_en_modelo') && (
              <Button
                variant={mappedNodeId ? 'secondary' : 'outline'}
                size="sm"
                className="h-7 gap-1.5 px-2 text-[11px]"
                onClick={() => setMappingOpen((v) => !v)}
              >
                <GitMerge size={12} />
                {mappedNodeId ? 'Mapeado' : 'Mapear'}
              </Button>
            )}
            <div className="flex overflow-hidden rounded-md border border-border">
              <button
                onClick={() => onAction('aplicar')}
                className={cn(
                  'px-2.5 py-1 text-[11px] font-medium transition-colors',
                  action === 'aplicar'
                    ? 'bg-[color:var(--chart-4)] text-[color:var(--background)]'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {mappedNodeId ? 'Vincular' : item.status === 'falta_en_modelo' ? 'Agregar' : 'Aplicar'}
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
          </div>
        ) : (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {item.status === 'sin_cambios' ? 'nada que hacer' : 'informativo'}
          </span>
        )}
      </div>

      {mappingOpen && (
        <div className="border-t border-border bg-background/60 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="mb-1 font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground">
                Mapear contra nodo existente
              </p>
              <select
                value={mappedNodeId ?? ''}
                onChange={(e) => e.target.value && onMap(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-[12px] outline-none focus:border-ring"
              >
                <option value="">Seleccioná un nodo del Atlas…</option>
                {atlasNodes
                  .slice()
                  .sort((a, b) => a.label.localeCompare(b.label))
                  .map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label} · {node.kind}
                    </option>
                  ))}
              </select>
            </div>
            {mappedNodeId && (
              <div className="max-w-sm rounded-md border border-[color:var(--chart-4)]/30 bg-[color-mix(in_oklab,var(--chart-4)_10%,transparent)] px-3 py-2 text-[11px]">
                Este hallazgo se vinculará con <strong>{mapped}</strong> en vez de crear un nodo nuevo.
              </div>
            )}
          </div>
        </div>
      )}

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
