'use client'

import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react'
import { FileUp, Search, ZoomIn, ZoomOut, RotateCcw, AlertTriangle } from 'lucide-react'
import { parseNativeArchi, type DiagramObject, type NativeModel } from '@/lib/native-archi'
import { loadUniverse, type ArchiEdit, type UniverseState } from '@/lib/archi-universe'
import { ArchiUniversePanel } from './archi-universe-panel'
import { UniverseGraph } from './universe-graph'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const KETAN = 'id-a653960d5e4b4d999b7b5187cc313b61'

function fill(type: string): string {
  if (/Business|Product|Contract/i.test(type)) return '#e5cb77'
  if (/Application|DataObject/i.test(type)) return '#9ad8ed'
  if (/Node|SystemSoftware|Device|Technology|Artifact|Path/i.test(type)) return '#b2df9b'
  if (/Grouping|Group/i.test(type)) return '#22364b'
  return '#c2d5e7'
}

function truncated(label: string, width: number): string[] {
  const max = Math.max(9, Math.floor(width / 7.2))
  if (label.length <= max) return [label]
  const words = label.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if ((current + ' ' + word).trim().length > max && current) { lines.push(current); current = word }
    else current = (current + ' ' + word).trim()
    if (lines.length === 2) break
  }
  if (lines.length < 2 && current) lines.push(current)
  return lines.map((line) => line.length > max ? line.slice(0, max - 1) + '…' : line)
}

export function NativeArchiWorkspace({ initialModel = null, initialXml = '', onModelLoaded }: {
  initialModel?: NativeModel | null
  initialXml?: string
  onModelLoaded?: (model: NativeModel, xml: string) => void
}) {
  const [model, setModel] = useState<NativeModel | null>(initialModel)
  const [originalXml, setOriginalXml] = useState(initialXml)
  const [universe, setUniverse] = useState<UniverseState>(() => initialModel ? loadUniverse(initialModel.id) : { modelId: '', assets: [] })
  const [edits, setEdits] = useState<ArchiEdit[]>([])
  const [viewId, setViewId] = useState<string | null>(() => initialModel ? (initialModel.views.some((v) => v.id === KETAN) ? KETAN : initialModel.views[0]?.id ?? null) : null)
  const [selected, setSelected] = useState<DiagramObject | null>(null)
  const [query, setQuery] = useState('')
  const [viewQuery, setViewQuery] = useState('')
  const [scale, setScale] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'archi' | 'universe'>('archi')
  const [fileHover, setFileHover] = useState(false)
  const [drag, setDrag] = useState<{ id: string; startX: number; startY: number; originX: number; originY: number; x: number; y: number } | null>(null)
  const dragRef = useRef<typeof drag>(null)
  useEffect(() => {
    if (!initialModel || model?.id === initialModel.id) return
    setModel(initialModel)
    setOriginalXml(initialXml)
    setUniverse(loadUniverse(initialModel.id))
    setViewId(initialModel.views.some((v) => v.id === KETAN) ? KETAN : initialModel.views[0]?.id ?? null)
  }, [initialModel, initialXml, model?.id])

  const view = model?.views.find((v) => v.id === viewId) ?? null
  const objects = useMemo(() => view?.objects.slice().sort((a, b) => a.depth - b.depth).map((o) => {
    const edit = edits.find((e) => e.kind === 'moveFigure' && e.viewId === viewId && e.objectId === o.id)
    return { ...o, x: drag?.id === o.id ? drag.x : edit?.kind === 'moveFigure' ? edit.x : o.x,
      y: drag?.id === o.id ? drag.y : edit?.kind === 'moveFigure' ? edit.y : o.y }
  }) ?? [], [view, edits, viewId, drag])
  const byId = useMemo(() => new Map(objects.map((obj) => [obj.id, obj])), [objects])
  const matches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    return q ? objects.filter((o) => `${o.label} ${o.type}`.toLocaleLowerCase().includes(q)) : []
  }, [objects, query])
  const viewList = useMemo(() => model?.views.filter((v) =>
    v.name.toLocaleLowerCase().includes(viewQuery.trim().toLocaleLowerCase())) ?? [], [model, viewQuery])

  async function load(file?: File) {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      if (file.size > 35_000_000) throw new Error('El modelo supera el límite de 35 MB.')
      const source = await file.text()
      const parsed = parseNativeArchi(source)
      setModel(parsed)
      setOriginalXml(source)
      onModelLoaded?.(parsed, source)
      setUniverse(loadUniverse(parsed.id))
      setEdits([])
      setViewId(parsed.views.some((v) => v.id === KETAN) ? KETAN : parsed.views[0].id)
      setSelected(null)
      setMode('archi')
      setScale(1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo abrir el modelo.')
    } finally { setLoading(false) }
  }

  function fileDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); setFileHover(false)
    const file = event.dataTransfer.files[0]
    if (!file) return
    if (!/\.(archimate|xml)$/i.test(file.name)) { setError('Soltá un archivo .archimate o .xml.'); return }
    void load(file)
  }

  function startMove(event: PointerEvent<SVGGElement>, o: DiagramObject) {
    if (event.button !== 0 || !viewId || mode !== 'archi' || /Group/i.test(o.type)) return
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    const next = { id: o.id, startX: event.clientX, startY: event.clientY, originX: o.x, originY: o.y, x: o.x, y: o.y }
    dragRef.current = next; setDrag(next); setSelected(o)
  }
  function move(event: PointerEvent<SVGGElement>) {
    const current = dragRef.current
    if (!current) return
    const next = { ...current, x: Math.max(0, Math.round(current.originX + (event.clientX - current.startX) / scale)),
      y: Math.max(0, Math.round(current.originY + (event.clientY - current.startY) / scale)) }
    dragRef.current = next; setDrag(next)
  }
  function endMove() {
    const current = dragRef.current
    if (!current || !viewId) return
    const original = view?.objects.find((o) => o.id === current.id)
    if (original && (current.x !== original.x || current.y !== original.y))
      setEdits((list) => [...list.filter((e) => !(e.kind === 'moveFigure' && e.viewId === viewId && e.objectId === current.id)),
        { kind: 'moveFigure', viewId, objectId: current.id, x: current.x, y: current.y }])
    dragRef.current = null; setDrag(null)
  }

  return <div className={`relative flex h-full min-h-0 w-full flex-col bg-background ${fileHover ? 'ring-2 ring-inset ring-sky-500' : ''}`}
    onDragEnter={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setFileHover(true) } }}
    onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }}
    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileHover(false) }} onDrop={fileDrop}>
    {fileHover && <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-background/85 text-lg font-semibold">Soltá el archivo .archimate para abrirlo</div>}
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-[16px] font-semibold">Modelo Archi · universo de interfaces</h2>
        <p className="text-[12px] text-muted-foreground">Abrí el archivo nativo y recorré todas sus vistas, componentes y conexiones. Se procesa en este navegador.</p>
      </div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-[12px] font-medium hover:bg-accent">
        <FileUp size={15}/>{model ? 'Cambiar modelo' : 'Abrir .archimate'}
        <input type="file" accept=".archimate,.xml" className="sr-only" onChange={(e) => { void load(e.target.files?.[0]); e.target.value = '' }} />
      </label>
    </div>
    {error && <div role="alert" className="flex items-center gap-2 border-b border-destructive/40 px-5 py-2 text-[12px] text-destructive"><AlertTriangle size={14}/>{error}</div>}
    {!model ? <div className="grid flex-1 place-items-center p-8 text-center"><div className="max-w-lg">
      <FileUp className="mx-auto mb-4 text-muted-foreground" size={32}/><h3 className="text-lg font-semibold">Abrí tu modelo empresarial</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">Elegí o arrastrá <code>cepasgeneral.archimate</code>. Se abrirá la vista KETAN con sus bases locales, líneas, jobs, procedimientos, Gateway, CPI y SAP. También podrás explorar las demás vistas y ver dónde se reutiliza un mismo elemento.</p>
      <p className="mt-3 text-[12px] text-muted-foreground">El archivo se procesa en el navegador. Podés mover figuras y descargar los cambios como propuesta .archimate.</p>
      {loading && <p className="mt-3">Leyendo modelo…</p>}
    </div></div> : <div className="flex min-h-0 flex-1">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="space-y-2 border-b border-border p-3"><p className="truncate text-[12px] font-semibold" title={model.name}>{model.name}</p><p className="text-[11px] text-muted-foreground">{model.views.length} vistas · {model.elements.size} elementos · {model.relationships.size} relaciones</p>
          <Input value={viewQuery} onChange={(e) => setViewQuery(e.target.value)} placeholder="Buscar vista" aria-label="Buscar vista" className="h-8 text-xs" /></div>
        <div className="min-h-0 flex-1 overflow-auto p-2">{viewList.map((v) => <button key={v.id} onClick={() => { setViewId(v.id); setSelected(null); setQuery(''); setScale(1) }}
          className={`mb-1 w-full rounded-md px-2 py-2 text-left text-[12px] hover:bg-accent ${v.id === viewId ? 'bg-accent font-semibold' : ''}`}>{v.name}<span className="ml-1 text-[10px] text-muted-foreground">{v.objects.length}</span></button>)}</div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <div className="mr-auto flex items-center gap-3"><button onClick={() => setMode('archi')} className={`rounded px-2 py-1 text-[12px] ${mode === 'archi' ? 'bg-accent font-semibold' : 'text-muted-foreground'}`}>Vista Archi</button>
            <button onClick={() => setMode('universe')} className={`rounded px-2 py-1 text-[12px] ${mode === 'universe' ? 'bg-accent font-semibold' : 'text-muted-foreground'}`}>Universo vinculado</button>
            <span className="text-[11px] text-muted-foreground">{mode === 'archi' ? `${view?.name} · ${objects.length} figuras · ${view?.connections.length} conexiones` : `${universe.assets.length} activos · relaciones por IDs`}</span></div>
          {mode === 'archi' && <>
          <div className="relative"><Search size={13} className="absolute left-2 top-2.5 text-muted-foreground"/><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar componente" aria-label="Buscar componente" className="h-8 w-48 pl-7 text-xs"/></div>
          <Button variant="outline" size="icon" onClick={() => setScale((s) => Math.max(.4, s / 1.25))} aria-label="Alejar"><ZoomOut size={14}/></Button>
          <span className="w-10 text-center text-[11px]">{Math.round(scale * 100)}%</span>
          <Button variant="outline" size="icon" onClick={() => setScale((s) => Math.min(3, s * 1.25))} aria-label="Acercar"><ZoomIn size={14}/></Button>
          <Button variant="outline" size="icon" onClick={() => setScale(1)} aria-label="Restablecer zoom"><RotateCcw size={14}/></Button>
          </>}
        </div>
        {mode === 'archi' && matches.length > 0 && <div className="flex max-h-24 flex-wrap gap-1 overflow-auto border-b border-border px-3 py-2">{matches.slice(0, 30).map((o) => <button key={o.id} onClick={() => setSelected(o)} className="rounded border border-border px-2 py-1 text-[11px] hover:bg-accent">{o.label}</button>)}{matches.length > 30 && <span className="text-[11px]">+{matches.length - 30}</span>}</div>}
        {mode === 'universe' ? <div className="min-h-0 flex-1"><UniverseGraph model={model} universe={universe} onAsset={(id) => {
          const asset = universe.assets.find((a) => a.id === id)
          const match = model.views.flatMap((v) => v.objects.map((o) => ({ v, o }))).find(({ o }) => asset?.archiIds.includes(o.elementId ?? ''))
          if (match) { setViewId(match.v.id); setSelected(match.o); setMode('archi') }
        }}/></div> : <div className="min-h-0 flex-1 overflow-auto bg-[radial-gradient(var(--border)_0.6px,transparent_0.6px)] bg-[length:20px_20px]">
          {view && <svg width={Math.round(view.width * scale)} height={Math.round(view.height * scale)} viewBox={`0 0 ${view.width} ${view.height}`} role="img" aria-label={`Vista Archi ${view.name}`} className="block">
            <defs><marker id="native-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 8 4 0 8" fill="#7d97ad"/></marker></defs>
            {view.connections.map((c) => { const from = byId.get(c.source); const to = byId.get(c.target); if (!from || !to) return null
              const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
              const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 }
              const bends = c.bendpoints.map((p) => ({ x: start.x + p.startX, y: start.y + p.startY }))
              const path = [start, ...bends, end].map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')
              const rel = c.relationId ? model.relationships.get(c.relationId) : undefined
              const type = rel?.type ?? c.type
              return <path key={c.id} d={path} fill="none" stroke={type === 'FlowRelationship' ? '#4baad8' : '#7d97ad'} strokeWidth="1.6"
                strokeDasharray={type === 'AssociationRelationship' ? '5 4' : undefined} markerEnd={type === 'AssociationRelationship' ? undefined : 'url(#native-arrow)'} opacity=".8"/> })}
            {objects.map((o) => { const group = /Group/i.test(o.type); const selectedObject = selected?.id === o.id; const faded = !!query && !`${o.label} ${o.type}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
              return <g key={o.id} tabIndex={0} role="button" aria-label={`${o.label}, ${o.type}`} onClick={() => setSelected(o)} onPointerDown={(e) => startMove(e, o)} onPointerMove={move} onPointerUp={endMove} onLostPointerCapture={endMove} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(o) } }} style={{cursor:group ? 'pointer' : 'grab',touchAction:'none',opacity: faded ? .35 : 1}}>
                <rect x={o.x} y={o.y} width={o.width} height={o.height} rx={group ? 3 : 5} fill={group ? '#253c50' : fill(o.type)} fillOpacity={group ? .45 : 1} stroke={selectedObject ? '#f59e0b' : '#536c84'} strokeWidth={selectedObject ? 3 : 1.2}/>
                {o.label && truncated(o.label, o.width).map((line, index) => <text key={index} x={o.x + 7} y={o.y + 18 + index * 14} fontSize="11" fontWeight={index ? 400 : 600} fill={group ? '#e2e9f3' : '#1b3145'}>{line}</text>)}
              </g> })}
          </svg>}
        </div>}
      </section>
      <ArchiUniversePanel model={model} selected={selected} viewId={viewId} xml={originalXml} universe={universe} setUniverse={setUniverse} edits={edits} setEdits={setEdits}/>
    </div>}
  </div>
}
