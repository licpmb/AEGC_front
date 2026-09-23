'use client'

import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react'
import { FileUp, Search, ZoomIn, ZoomOut, RotateCcw, AlertTriangle } from 'lucide-react'
import { connectionPoints, parseNativeArchi, type DiagramObject, type NativeModel } from '@/lib/native-archi'
import { loadArchiDraft, loadUniverse, saveArchiDraft, type ArchiEdit, type UniverseState } from '@/lib/archi-universe'
import { ArchiUniversePanel } from './archi-universe-panel'
import { UniverseGraph } from './universe-graph'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const KETAN = 'id-a653960d5e4b4d999b7b5187cc313b61'

function fill(type: string): string {
  if (/Strategy|Capability|Resource|ValueStream/i.test(type)) return '#f5deaa'
  if (/Business|Product|Contract/i.test(type)) return '#ffffb5'
  if (/Application|DataObject/i.test(type)) return '#b5ffff'
  if (/Node|SystemSoftware|Device|Technology|Artifact|Path/i.test(type)) return '#c9e7b7'
  if (/Motivation|Goal|Requirement|Stakeholder|Driver/i.test(type)) return '#ccccff'
  if (/Implementation|WorkPackage|Deliverable|Plateau|Gap/i.test(type)) return '#ffe0e0'
  if (/Grouping|Group/i.test(type)) return '#ffffff'
  return '#f2f2f2'
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
  const [edits, setEdits] = useState<ArchiEdit[]>(() => initialModel && initialXml ? loadArchiDraft(initialModel.id, initialXml) : [])
  const [viewId, setViewId] = useState<string | null>(() => initialModel ? (initialModel.views.some((v) => v.id === KETAN) ? KETAN : initialModel.views[0]?.id ?? null) : null)
  const [selected, setSelected] = useState<DiagramObject | null>(null)
  const [query, setQuery] = useState('')
  const [viewQuery, setViewQuery] = useState('')
  const [scale, setScale] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'archi' | 'universe'>('archi')
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [fileHover, setFileHover] = useState(false)
  const [drag, setDrag] = useState<{ id: string; startX: number; startY: number; originX: number; originY: number; x: number; y: number } | null>(null)
  const dragRef = useRef<typeof drag>(null)
  useEffect(() => {
    if (!initialModel || model?.id === initialModel.id) return
    setModel(initialModel)
    setOriginalXml(initialXml)
    setUniverse(loadUniverse(initialModel.id))
    setEdits(loadArchiDraft(initialModel.id, initialXml))
    setViewId(initialModel.views.some((v) => v.id === KETAN) ? KETAN : initialModel.views[0]?.id ?? null)
  }, [initialModel, initialXml, model?.id])
  useEffect(() => { if (model && originalXml) saveArchiDraft(model.id, originalXml, edits) }, [model, originalXml, edits])

  const view = model?.views.find((v) => v.id === viewId) ?? null
  const connections = useMemo(() => {
    if (!view) return []
    const extra = edits.flatMap((edit) => {
      if (edit.kind !== 'createRelationship' || edit.viewId !== view.id) return []
      const source = view.objects.find((o) => o.elementId === edit.sourceId)
      const target = view.objects.find((o) => o.elementId === edit.targetId)
      return source && target ? [{ id: edit.id, source: source.id, target: target.id, relationId: edit.id,
        type: edit.relationshipType, bendpoints: [] }] : []
    })
    return [...view.connections, ...extra]
  }, [view, edits])
  const objects = useMemo(() => view?.objects.slice().sort((a, b) => a.depth - b.depth).map((o) => {
    const edit = edits.find((e) => e.kind === 'moveFigure' && e.viewId === viewId && e.objectId === o.id)
    const rename = edits.find((e) => e.kind === 'rename' && e.elementId === o.elementId)
    return { ...o, label: rename?.kind === 'rename' ? rename.name : o.label,
      x: drag?.id === o.id ? drag.x : edit?.kind === 'moveFigure' ? edit.x : o.x,
      y: drag?.id === o.id ? drag.y : edit?.kind === 'moveFigure' ? edit.y : o.y }
  }) ?? [], [view, edits, viewId, drag])
  const byId = useMemo(() => new Map(objects.map((obj) => [obj.id, obj])), [objects])
  const containerIds = useMemo(() => new Set(objects.filter((o) => o.hasChildren || /DiagramModelGroup|Grouping|Group/i.test(o.type)).map((o) => o.id)), [objects])
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
      setSelectedConnectionId(null)
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
    if (event.button !== 0 || !viewId || mode !== 'archi' || containerIds.has(o.id)) return
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
  function renderFigure(o: DiagramObject) {
    const group = containerIds.has(o.id)
    const selectedObject = selected?.id === o.id
    const faded = !!query && !`${o.label} ${o.type}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
    const stroke = selectedObject ? '#f59e0b' : (o.lineColor || (group ? 'var(--archi-line)' : '#536c84'))
    const background = o.fillColor || (group ? 'var(--archi-group)' : fill(o.type))
    const textColor = o.fontColor || (group ? 'var(--foreground)' : '#1b3145')
    const rounded = /Service|Process|Function|Interaction/i.test(o.type) ? Math.min(22, o.height / 2) : group ? 1 : 3
    const alignCode = o.textAlignment ?? '2'
    const align = alignCode === '1' ? 'start' : alignCode === '4' ? 'end' : 'middle'
    const textX = align === 'middle' ? o.x + o.width / 2 : align === 'end' ? o.x + o.width - 7 : o.x + 7
    const lines = truncated(o.label, o.width - 14)
    const positionCode = o.textPosition ?? '1'
    const baseY = positionCode === '2' ? o.y + o.height - 8 - (lines.length - 1) * 14 :
      positionCode === '1' ? o.y + o.height / 2 - ((lines.length - 1) * 14) / 2 + 4 : o.y + 18
    const common = { fill: background, stroke, strokeWidth: selectedObject ? 3 : 1.2 }
    const isNote = /^Note$/i.test(o.type)
    const isData = /DataObject|Artifact/i.test(o.type)
    const isNode = /^Node$|Device/i.test(o.type)
    return <g key={o.id} tabIndex={0} role="button" aria-label={`${o.label}, ${o.type}`} onClick={() => { setSelected(o); setSelectedConnectionId(null) }} onPointerDown={(e) => startMove(e, o)} onPointerMove={move} onPointerUp={endMove} onLostPointerCapture={endMove} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(o); setSelectedConnectionId(null) } }} style={{cursor:group ? 'pointer' : 'grab',touchAction:'none',opacity: faded ? .35 : 1}}>
      <title>{`${o.label} · ${o.type}${o.elementId ? ` · ${o.elementId}` : ''} · figura ${o.id}`}</title>
      {isNote ? <rect x={o.x} y={o.y} width={o.width} height={o.height} rx="1" fill={o.fillColor || 'var(--background)'} stroke={stroke} strokeWidth={selectedObject ? 3 : 1}/> : isData && !group ? <>
        <path d={`M ${o.x} ${o.y} H ${o.x + o.width - 13} L ${o.x + o.width} ${o.y + 13} V ${o.y + o.height} H ${o.x} Z`} {...common}/>
        <path d={`M ${o.x + o.width - 13} ${o.y} V ${o.y + 13} H ${o.x + o.width}`} fill="none" stroke={stroke} strokeWidth={1.2}/>
      </> : isNode && !group ? <>
        <rect x={o.x} y={o.y + 6} width={Math.max(1, o.width - 8)} height={Math.max(1, o.height - 6)} rx={rounded} {...common}/>
        <path d={`M ${o.x} ${o.y + 6} L ${o.x + 8} ${o.y} H ${o.x + o.width} V ${o.y + o.height - 6} L ${o.x + o.width - 8} ${o.y + o.height}`} fill="none" stroke={stroke} strokeWidth={1.2}/>
      </> : <rect x={o.x} y={o.y} width={o.width} height={o.height} rx={rounded} {...common} fillOpacity={group && !o.fillColor ? .55 : 1}/>}
      {/ApplicationComponent/i.test(o.type) && !group && <>
        <rect x={o.x + o.width - 20} y={o.y + 7} width="11" height="8" fill="none" stroke={stroke} strokeWidth="1"/>
        <path d={`M ${o.x + o.width - 23} ${o.y + 9} h5 M ${o.x + o.width - 23} ${o.y + 13} h5`} stroke={stroke} strokeWidth="1"/>
      </>}
      {/Interface/i.test(o.type) && !group && <circle cx={o.x + o.width - 12} cy={o.y + 12} r="5" fill="none" stroke={stroke} strokeWidth="1.2"/>}
      {o.label && lines.map((line, index) => <text key={index} x={textX} y={baseY + index * 14} fontSize="11" fontWeight={index ? 400 : 600} textAnchor={align} fill={textColor}>{line}</text>)}
    </g>
  }

  function routeFor(connectionId: string) {
    const c = connections.find((item) => item.id === connectionId)
    const source = c && byId.get(c.source), target = c && byId.get(c.target)
    if (!c || !source || !target) return []
    const draft = edits.find((e) => e.kind === 'routeConnection' && e.viewId === viewId && e.connectionId === connectionId)
    const original = connectionPoints(c, source, target)
    return draft?.kind === 'routeConnection' ? [original[0], ...draft.points, original.at(-1)!] : original
  }
  function updateRoute(connectionId: string, points: Array<{ x: number; y: number }>) {
    if (!viewId) return
    setEdits((list) => [...list.filter((e) => !(e.kind === 'routeConnection' && e.viewId === viewId && e.connectionId === connectionId)),
      { kind: 'routeConnection', viewId, connectionId, points }])
  }
  function addBend() {
    if (!selectedConnectionId) return
    const route = routeFor(selectedConnectionId)
    if (route.length < 2) return
    const a = route.at(-2)!, b = route.at(-1)!
    updateRoute(selectedConnectionId, [...route.slice(1, -1), { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) }])
  }

  return <div className={`relative flex h-full min-h-0 w-full flex-col bg-background ${fileHover ? 'ring-2 ring-inset ring-sky-500' : ''}`}
    onDragEnter={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setFileHover(true) } }}
    onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }}
    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileHover(false) }} onDrop={fileDrop}>
    {fileHover && <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-background/85 text-lg font-semibold">Soltá el archivo .archimate para abrirlo</div>}
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-[16px] font-semibold">Modelo Archi · universo de interfaces</h2>
        <p className="text-[12px] text-muted-foreground">Abrí el archivo, mové figuras, seleccioná líneas para editar sus pliegues y editá elementos desde el panel. Los cambios se guardan como borrador local.</p>
      </div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-[12px] font-medium hover:bg-accent">
        <FileUp size={15}/>{model ? 'Cambiar modelo' : 'Abrir .archimate'}
        <input type="file" accept=".archimate,.xml" className="sr-only" onChange={(e) => { void load(e.target.files?.[0]); e.target.value = '' }} />
      </label>
    </div>
    {error && <div role="alert" className="flex items-center gap-2 border-b border-destructive/40 px-5 py-2 text-[12px] text-destructive"><AlertTriangle size={14}/>{error}</div>}
    {!model ? <label className={`m-5 grid flex-1 cursor-pointer place-items-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${fileHover ? 'border-sky-400 bg-sky-500/10' : 'border-border bg-card/20 hover:border-sky-500 hover:bg-card/40'}`}>
      <div className="max-w-lg">
        <FileUp className="mx-auto mb-4 text-sky-400" size={42}/><h3 className="text-lg font-semibold">Arrastrá y soltá tu .archimate acá</h3>
        <p className="mt-2 text-[13px] text-muted-foreground">O hacé clic en cualquier parte de esta zona para elegir el archivo.</p>
        <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">Se abrirá la vista KETAN con sus bases locales, líneas, jobs, Gateway, CPI y SAP. El archivo se procesa en este navegador.</p>
        {loading && <p role="status" className="mt-3">Leyendo modelo…</p>}
      </div>
      <input type="file" accept=".archimate,.xml" className="sr-only" onChange={(e) => { void load(e.target.files?.[0]); e.target.value = '' }} />
    </label> : <div className="flex min-h-0 flex-1">
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
            <span className="text-[11px] text-muted-foreground">{mode === 'archi' ? `${view?.name} · ${objects.length} figuras · ${connections.length} conexiones` : `${universe.assets.length} activos · relaciones por IDs`}</span></div>
          {mode === 'archi' && <>
          {selectedConnectionId && <Button variant="outline" size="sm" onClick={addBend}>Añadir pliegue</Button>}
          {edits.length > 0 && <span className="rounded border border-primary/40 px-2 py-1 text-[11px] text-foreground">{edits.length} cambios · descargá desde «Cambios»</span>}
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
        }}/></div> : <div className="min-h-0 flex-1 overflow-auto bg-[var(--archi-canvas)]">
          {view && <svg width={Math.round(view.width * scale)} height={Math.round(view.height * scale)} viewBox={`0 0 ${view.width} ${view.height}`} role="img" aria-label={`Vista Archi ${view.name}`} className="block">
            <defs>
              <marker id="native-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0 8 4.5 0 9 Z" fill="context-stroke"/></marker>
              <marker id="native-open-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M1 1 L9 5 L1 9" fill="none" stroke="context-stroke" strokeWidth="1.2"/></marker>
              <marker id="native-triangle" markerWidth="11" markerHeight="11" refX="10" refY="5.5" orient="auto"><path d="M1 1 L10 5.5 L1 10 Z" fill="var(--archi-canvas)" stroke="context-stroke" strokeWidth="1.2"/></marker>
              <marker id="native-diamond" markerWidth="12" markerHeight="12" refX="1" refY="6" orient="auto"><path d="M1 6 L6 1 L11 6 L6 11 Z" fill="context-stroke" stroke="context-stroke"/></marker>
              <marker id="native-open-diamond" markerWidth="12" markerHeight="12" refX="1" refY="6" orient="auto"><path d="M1 6 L6 1 L11 6 L6 11 Z" fill="var(--archi-canvas)" stroke="context-stroke" strokeWidth="1.2"/></marker>
            </defs>
            {objects.filter((o) => containerIds.has(o.id)).map(renderFigure)}
            {connections.map((c) => { const points = routeFor(c.id); if (!points.length) return null
              const path = points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')
              const rel = c.relationId ? model.relationships.get(c.relationId) : undefined
              const type = rel?.type ?? c.type
              const connected = selectedConnectionId === c.id || !!selected && (selected.id === c.source || selected.id === c.target)
              const baseStroke = c.lineColor || (type === 'FlowRelationship' ? 'var(--archi-flow)' : 'var(--archi-line)')
              const stroke = connected ? '#f59e0b' : baseStroke
              const dash = /RealizationRelationship|AccessRelationship|InfluenceRelationship/i.test(type) ? '6 4' : undefined
              const markerEnd = /AssociationRelationship/i.test(type) ? undefined :
                /RealizationRelationship|SpecializationRelationship/i.test(type) ? 'url(#native-triangle)' :
                /ServingRelationship/i.test(type) ? 'url(#native-open-arrow)' : 'url(#native-arrow)'
              const markerStart = /CompositionRelationship/i.test(type) ? 'url(#native-diamond)' :
                /AggregationRelationship/i.test(type) ? 'url(#native-open-diamond)' : undefined
              const middle = points[Math.floor(points.length / 2)]
              return <g key={c.id}>
                <title>{`${rel?.name || type} · ${c.id}`}</title>
                <path d={path} fill="none" stroke={stroke} strokeWidth={connected ? Math.max(3.4, (c.lineWidth ?? 1) + 2) : Math.max(1.2, (c.lineWidth ?? 1) * 1.4)}
                  strokeDasharray={dash} strokeLinejoin="round" strokeLinecap="round" markerStart={markerStart} markerEnd={markerEnd}/>
                {rel?.name && middle && <text x={middle.x + 5} y={middle.y - 5} fontSize="10" fill={c.fontColor || 'var(--foreground)'} paintOrder="stroke" stroke="var(--archi-canvas)" strokeWidth="3">{rel.name}</text>}
                <path d={path} fill="none" stroke="transparent" strokeWidth="14" style={{ cursor: 'pointer' }} onClick={() => { setSelectedConnectionId(c.id); setSelected(null) }}/>
              </g> })}
            {objects.filter((o) => !containerIds.has(o.id)).map(renderFigure)}
            {selectedConnectionId && routeFor(selectedConnectionId).slice(1, -1).map((point, index) => <circle key={`${selectedConnectionId}-${index}`} cx={point.x} cy={point.y} r="8" fill="#f59e0b" stroke="var(--archi-canvas)" strokeWidth="2" style={{cursor:'move', touchAction:'none'}} aria-label="Arrastrá para mover el pliegue; doble clic para quitar"
              onDoubleClick={() => updateRoute(selectedConnectionId, routeFor(selectedConnectionId).slice(1, -1).filter((_, i) => i !== index))}
              onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.dataset.startX = String(e.clientX); e.currentTarget.dataset.startY = String(e.clientY); e.currentTarget.dataset.pointX = String(point.x); e.currentTarget.dataset.pointY = String(point.y) }}
              onPointerMove={(e) => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
                const x = Math.round(Number(e.currentTarget.dataset.pointX) + (e.clientX - Number(e.currentTarget.dataset.startX)) / scale)
                const y = Math.round(Number(e.currentTarget.dataset.pointY) + (e.clientY - Number(e.currentTarget.dataset.startY)) / scale)
                const route = routeFor(selectedConnectionId).slice(1, -1); route[index] = { x, y }; updateRoute(selectedConnectionId, route)
              }}/>) }
          </svg>}
        </div>}
      </section>
      <ArchiUniversePanel model={model} selected={selected} viewId={viewId} xml={originalXml} universe={universe} setUniverse={setUniverse} edits={edits} setEdits={setEdits}/>
    </div>}
  </div>
}
