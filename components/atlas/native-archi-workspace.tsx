'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Download, FileUp, Folder, Maximize2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Search, ZoomIn, ZoomOut } from 'lucide-react'
import { connectionPoints, parseNativeArchi, type DiagramObject, type NativeModel } from '@/lib/native-archi'
import { exportArchiChanges, loadArchiDraft, saveArchiDraft, type ArchiEdit } from '@/lib/archi-universe'
import { ArchiUniversePanel } from './archi-universe-panel'
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


function fontFromArchi(value?: string) {
  if (!value) return { family: 'Arial, sans-serif', size: 10.5, weight: 400, style: 'normal' as const }
  const parts = value.split('|')
  const family = parts[1] || 'Arial'
  const points = Number(parts[2]) || 8
  const swtStyle = Number(parts[3]) || 0
  return {
    family: `${family}, Arial, sans-serif`,
    size: Math.max(8, points * 1.333),
    weight: (swtStyle & 1) ? 700 : 400,
    style: (swtStyle & 2) ? 'italic' as const : 'normal' as const,
  }
}

function roundedConnectionPath(points: Array<{ x: number; y: number }>, radius = 14) {
  if (points.length < 2) return ''
  if (points.length === 2) return `M${points[0].x} ${points[0].y} L${points[1].x} ${points[1].y}`
  const out: string[] = [`M${points[0].x} ${points[0].y}`]
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], cur = points[i], next = points[i + 1]
    const ax = prev.x - cur.x, ay = prev.y - cur.y
    const bx = next.x - cur.x, by = next.y - cur.y
    const al = Math.hypot(ax, ay), bl = Math.hypot(bx, by)
    if (al < 1 || bl < 1) { out.push(`L${cur.x} ${cur.y}`); continue }
    const r = Math.min(radius, al / 2, bl / 2)
    const p1 = { x: cur.x + ax / al * r, y: cur.y + ay / al * r }
    const p2 = { x: cur.x + bx / bl * r, y: cur.y + by / bl * r }
    out.push(`L${p1.x} ${p1.y} Q${cur.x} ${cur.y} ${p2.x} ${p2.y}`)
  }
  const last = points.at(-1)!
  out.push(`L${last.x} ${last.y}`)
  return out.join(' ')
}


function connectionLabelOffset(relative?: string) {
  // Same bitmask values Archi inherits from Draw2D PositionConstants.
  const value = Number(relative ?? '2')
  const north = (value & 1) !== 0, south = (value & 4) !== 0
  const west = (value & 8) !== 0, east = (value & 16) !== 0
  return {
    x: west ? -5 : east ? 5 : 0,
    y: north ? -5 : south ? 5 : 0,
  }
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
  const [edits, setEdits] = useState<ArchiEdit[]>(() => initialModel && initialXml ? loadArchiDraft(initialModel.id, initialXml) : [])
  const [viewId, setViewId] = useState<string | null>(() => initialModel ? (initialModel.views.some((v) => v.id === KETAN) ? KETAN : initialModel.views[0]?.id ?? null) : null)
  const [selected, setSelected] = useState<DiagramObject | null>(null)
  const [query, setQuery] = useState('')
  const [viewQuery, setViewQuery] = useState('')
  const [scale, setScale] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [fileHover, setFileHover] = useState(false)
  const [leftCompact, setLeftCompact] = useState(false)
  const [rightCompact, setRightCompact] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [drag, setDrag] = useState<{ id: string; startX: number; startY: number; originX: number; originY: number; x: number; y: number } | null>(null)
  const dragRef = useRef<typeof drag>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!initialModel || model?.id === initialModel.id) return
    setModel(initialModel)
    setOriginalXml(initialXml)
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
  const viewList = useMemo(() => {
    const q = viewQuery.trim().toLocaleLowerCase()
    return model?.views.filter((v) => !q || `${v.folderPath.join(' ')} ${v.name}`.toLocaleLowerCase().includes(q)) ?? []
  }, [model, viewQuery])

  type ViewTreeNode = { name: string; path: string; folders: ViewTreeNode[]; views: typeof viewList }
  const viewTree = useMemo(() => {
    const root: ViewTreeNode = { name: model?.name ?? 'Modelo', path: '', folders: [], views: [] }
    const folderMap = new Map<string, ViewTreeNode>([['', root]])
    for (const item of viewList) {
      let parent = root
      item.folderPath.forEach((name, index) => {
        const path = item.folderPath.slice(0, index + 1).join('/')
        let folder = folderMap.get(path)
        if (!folder) {
          folder = { name, path, folders: [], views: [] }
          folderMap.set(path, folder)
          parent.folders.push(folder)
        }
        parent = folder
      })
      parent.views.push(item)
    }
    const sort = (node: ViewTreeNode) => {
      node.folders.sort((a, b) => a.name.localeCompare(b.name))
      node.views.sort((a, b) => a.name.localeCompare(b.name))
      node.folders.forEach(sort)
    }
    sort(root)
    return root
  }, [model?.name, viewList])

  useEffect(() => {
    if (!model) return
    const paths = new Set<string>()
    for (const v of model.views) v.folderPath.forEach((_, index) => paths.add(v.folderPath.slice(0, index + 1).join('/')))
    setExpandedFolders(paths)
  }, [model?.id])

  const fitCurrentView = useCallback(() => {
    const host = canvasRef.current
    if (!host || !view) return
    const padding = 24
    const availableWidth = Math.max(100, host.clientWidth - padding * 2)
    const availableHeight = Math.max(100, host.clientHeight - padding * 2)
    const next = Math.min(availableWidth / view.width, availableHeight / view.height)
    setScale(Math.max(.08, Math.min(2.5, next)))
  }, [view])

  useEffect(() => {
    const id = requestAnimationFrame(fitCurrentView)
    return () => cancelAnimationFrame(id)
  }, [fitCurrentView, leftCompact, rightCompact])

  useEffect(() => {
    const host = canvasRef.current
    if (!host) return
    const observer = new ResizeObserver(() => fitCurrentView())
    observer.observe(host)
    return () => observer.disconnect()
  }, [fitCurrentView])

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
      setEdits([])
      setViewId(parsed.views.some((v) => v.id === KETAN) ? KETAN : parsed.views[0].id)
      setSelected(null)
      setSelectedConnectionId(null)
      requestAnimationFrame(fitCurrentView)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo abrir el modelo.')
    } finally { setLoading(false) }
  }

  async function saveArchiFile() {
    if (!model || !originalXml) return
    try {
      const result = edits.length ? exportArchiChanges(originalXml, model, edits) : originalXml
      const parsed = parseNativeArchi(result)
      if (parsed.id !== model.id || parsed.views.length < model.views.length)
        throw new Error('La validación del archivo modificado falló.')
      const base = (model.name || 'modelo-archi').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'modelo-archi'
      const picker = (window as Window & {
        showSaveFilePicker?: (options: {
          suggestedName?: string
          types?: Array<{ description: string; accept: Record<string, string[]> }>
        }) => Promise<{ createWritable: () => Promise<{ write: (value: string | Blob) => Promise<void>; close: () => Promise<void> }> }>
      }).showSaveFilePicker
      if (picker) {
        const handle = await picker({
          suggestedName: `${base}.archimate`,
          types: [{ description: 'ArchiMate model', accept: { 'application/xml': ['.archimate', '.xml'] } }],
        })
        const writable = await handle.createWritable()
        await writable.write(result)
        await writable.close()
      } else {
        const url = URL.createObjectURL(new Blob([result], { type: 'application/xml' }))
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `${base}.archimate`
        anchor.click()
        setTimeout(() => URL.revokeObjectURL(url), 30_000)
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el archivo .archimate.')
    }
  }

  function fileDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); setFileHover(false)
    const file = event.dataTransfer.files[0]
    if (!file) return
    if (!/\.(archimate|xml)$/i.test(file.name)) { setError('Soltá un archivo .archimate o .xml.'); return }
    void load(file)
  }

  function startMove(event: PointerEvent<SVGGElement>, o: DiagramObject) {
    if (event.button !== 0 || !viewId || containerIds.has(o.id)) return
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    const next = { id: o.id, startX: event.clientX, startY: event.clientY, originX: o.x, originY: o.y, x: o.x, y: o.y }
    // No disparamos un render pesado en pointerdown. El drag se materializa recién
    // cuando el puntero realmente se mueve; esto reduce el INP al seleccionar.
    dragRef.current = next
  }
  function move(event: PointerEvent<SVGGElement>) {
    const current = dragRef.current
    if (!current) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    if (!drag && Math.hypot(dx, dy) < 3) return
    const next = { ...current, x: Math.max(0, Math.round(current.originX + dx / scale)),
      y: Math.max(0, Math.round(current.originY + dy / scale)) }
    dragRef.current = next
    setDrag(next)
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
    const alt = o.figureType === '1'
    const isNote = /^Note$/i.test(o.type)
    const isGrouping = /Grouping|DiagramModelGroup/i.test(o.type)
    const isJunction = /Junction/i.test(o.type)
    const isArtifact = /Artifact/i.test(o.type)
    const isData = /DataObject/i.test(o.type)
    const isNode = /^Node$/i.test(o.type)
    const isDevice = /Device/i.test(o.type)
    const isService = /Service/i.test(o.type)
    const isEvent = /Event/i.test(o.type)
    const isComponent = /ApplicationComponent/i.test(o.type)
    const font = fontFromArchi(o.font)
    const defaultTopLeft = group || isNote
    const alignCode = o.textAlignment ?? (defaultTopLeft ? '1' : '2')
    const align = alignCode === '1' ? 'start' : alignCode === '4' ? 'end' : 'middle'
    const textInset = alt && /ApplicationComponent/i.test(o.type) ? 18 : 7
    const textX = align === 'middle' ? o.x + o.width / 2 : align === 'end' ? o.x + o.width - textInset : o.x + textInset
    const lines = truncated(o.label, o.width - textInset * 2)
    const positionCode = o.textPosition ?? (defaultTopLeft ? '0' : '1')
    const lineHeight = Math.max(10, font.size * 1.2)
    const baseY = positionCode === '2' ? o.y + o.height - 7 - (lines.length - 1) * lineHeight :
      positionCode === '1' ? o.y + o.height / 2 - ((lines.length - 1) * lineHeight) / 2 + font.size * .35 : o.y + font.size + 5
    const common = { fill: background, stroke, strokeWidth: selectedObject ? 3 : 1 }

    return <g key={o.id} tabIndex={0} role="button" aria-label={`${o.label}, ${o.type}`} onClick={() => { setSelected(o); setSelectedConnectionId(null) }} onPointerDown={(e) => startMove(e, o)} onPointerMove={move} onPointerUp={endMove} onLostPointerCapture={endMove} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(o); setSelectedConnectionId(null) } }} style={{cursor:group ? 'pointer' : 'grab',touchAction:'none',opacity: faded ? .35 : 1}}>
      <title>{`${o.label} · ${o.type}${o.elementId ? ` · ${o.elementId}` : ''} · figura ${o.id}`}</title>

      {isNote ? <rect x={o.x} y={o.y} width={o.width} height={o.height} fill={o.fillColor || 'var(--background)'} stroke={stroke} strokeWidth={selectedObject ? 3 : 1}/>
      : isJunction ? <ellipse cx={o.x + o.width / 2} cy={o.y + o.height / 2} rx={o.width / 2} ry={o.height / 2}
          fill={background} stroke={stroke} strokeWidth={selectedObject ? 3 : 1}/>
      : isGrouping && alt ? <>
          <rect x={o.x} y={o.y + 18} width={o.width} height={Math.max(1, o.height - 18)} {...common} fillOpacity={!o.fillColor ? .35 : 1}/>
          <path d={`M ${o.x} ${o.y + 18} V ${o.y} H ${o.x + Math.max(42, Math.min(o.width / 1.4, o.width))} V ${o.y + 18}`}
            fill={background} stroke={stroke} strokeWidth={selectedObject ? 3 : 1}/>
        </>
      : isComponent && alt ? <>
          <path d={`M ${o.x + 10} ${o.y} H ${o.x + o.width} V ${o.y + o.height} H ${o.x + 10} V ${o.y + 43} M ${o.x + 10} ${o.y + 30} V ${o.y + 23} M ${o.x + 10} ${o.y + 10} V ${o.y}`} {...common}/>
          <rect x={o.x} y={o.y + 10} width="20" height="13" {...common}/>
          <rect x={o.x} y={o.y + 30} width="20" height="13" {...common}/>
        </>
      : isEvent && alt ? (() => {
          const indent = Math.min(o.height / 3, o.width / 3)
          const cy = o.y + o.height / 2
          const right = o.x + o.width - indent
          return <path d={`M ${o.x} ${o.y} L ${o.x + indent} ${cy} L ${o.x} ${o.y + o.height} H ${right} A ${indent} ${o.height / 2} 0 0 0 ${right} ${o.y} Z`} {...common}/>
        })()
      : isService ? <rect x={o.x} y={o.y} width={o.width} height={o.height} rx={alt ? Math.min(o.height / 2, o.width * .4) : Math.min(12, o.height / 3)} ry={alt ? o.height / 2 : Math.min(12, o.height / 3)} {...common}/>
      : isArtifact && alt ? <>
          <path d={`M ${o.x} ${o.y} H ${o.x + o.width - 18} L ${o.x + o.width} ${o.y + 18} V ${o.y + o.height} H ${o.x} Z`} {...common}/>
          <path d={`M ${o.x + o.width - 18} ${o.y} V ${o.y + 18} H ${o.x + o.width}`} fill="none" stroke={stroke} strokeWidth="1"/>
        </>
      : isData ? <>
          <rect x={o.x} y={o.y} width={o.width} height={o.height} {...common}/>
          {alt && <path d={`M ${o.x} ${o.y + 12} H ${o.x + o.width}`} fill="none" stroke={stroke} strokeWidth="1"/>}
        </>
      : isDevice && alt ? <>
          <rect x={o.x} y={o.y} width={o.width} height={Math.max(1, o.height * .8)} rx="14" {...common}/>
          <path d={`M ${o.x + 1} ${o.y + o.height} L ${o.x + 15} ${o.y + o.height * .8} H ${o.x + o.width - 15} L ${o.x + o.width - 1} ${o.y + o.height} Z`} {...common}/>
        </>
      : isNode && alt ? <>
          <rect x={o.x} y={o.y + 5} width={Math.max(1, o.width - 7)} height={Math.max(1, o.height - 5)} {...common}/>
          <path d={`M ${o.x} ${o.y + 5} L ${o.x + 7} ${o.y} H ${o.x + o.width} V ${o.y + o.height - 5} L ${o.x + o.width - 7} ${o.y + o.height} M ${o.x + o.width - 7} ${o.y + 5} L ${o.x + o.width} ${o.y}`} fill="none" stroke={stroke} strokeWidth="1"/>
        </>
      : <rect x={o.x} y={o.y} width={o.width} height={o.height} rx={group ? 0 : 1} {...common} fillOpacity={group && !o.fillColor ? .35 : 1}/>}

      {isComponent && !alt && !group && <>
        <rect x={o.x + o.width - 14} y={o.y + 7} width="10" height="13" fill="none" stroke={stroke} strokeWidth="1"/>
        <rect x={o.x + o.width - 17} y={o.y + 9} width="6" height="2.5" fill={background} stroke={stroke} strokeWidth="1"/>
        <rect x={o.x + o.width - 17} y={o.y + 14} width="6" height="2.5" fill={background} stroke={stroke} strokeWidth="1"/>
      </>}
      {/Interface/i.test(o.type) && !group && <circle cx={o.x + o.width - 12} cy={o.y + 12} r="5" fill="none" stroke={stroke} strokeWidth="1"/>}
      {isData && !alt && !group && <>
        <rect x={o.x + o.width - 17} y={o.y + 6} width="13" height="10" fill="none" stroke={stroke} strokeWidth="1"/>
        <path d={`M ${o.x + o.width - 17} ${o.y + 9} H ${o.x + o.width - 4}`} stroke={stroke} strokeWidth="1"/>
      </>}
      {isArtifact && !alt && !group && <>
        <path d={`M ${o.x + o.width - 16} ${o.y + 6} H ${o.x + o.width - 9} L ${o.x + o.width - 4} ${o.y + 11} V ${o.y + 21} H ${o.x + o.width - 16} Z M ${o.x + o.width - 9} ${o.y + 6} V ${o.y + 11} H ${o.x + o.width - 4}`} fill="none" stroke={stroke} strokeWidth="1"/>
      </>}
      {o.label && lines.map((line, index) => <text key={index} x={textX} y={baseY + index * lineHeight} fontFamily={font.family} fontSize={font.size} fontWeight={font.weight} fontStyle={font.style} textAnchor={align} fill={textColor}>{line}</text>)}
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
        <p className="text-[12px] text-muted-foreground">Editor compatible con Archi: mové figuras, editá relaciones y propiedades, y guardá nuevamente el .archimate. El original permanece intacto hasta que descargues.</p>
      </div>
      {model && <Button variant="outline" size="sm" onClick={saveArchiFile} title={edits.length ? `Guardar ${edits.length} cambios en un nuevo .archimate` : 'Descargar el modelo abierto'}>
        <Download size={15}/>{edits.length ? `Guardar .archimate (${edits.length})` : 'Guardar .archimate'}
      </Button>}
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
      <aside className={`flex shrink-0 flex-col border-r border-border bg-sidebar transition-[width] ${leftCompact ? 'w-10' : 'w-[270px]'}`}>
        <div className={`border-b border-border ${leftCompact ? 'p-1' : 'p-2.5'}`}>
          <div className="flex items-center gap-2">
            {!leftCompact && <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold" title={model.name}>{model.name}</p>
              <p className="text-[10px] text-muted-foreground">{model.views.length} vistas · {model.elements.size} elementos · {model.relationships.size} relaciones</p>
            </div>}
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setLeftCompact((v) => !v)} aria-label={leftCompact ? 'Expandir vistas' : 'Compactar vistas'} title={leftCompact ? 'Expandir vistas' : 'Compactar vistas'}>
              {leftCompact ? <PanelLeftOpen size={15}/> : <PanelLeftClose size={15}/>}
            </Button>
          </div>
          {!leftCompact && <div className="relative mt-2">
            <Search size={12} className="absolute left-2 top-2.5 text-muted-foreground"/>
            <Input value={viewQuery} onChange={(e) => setViewQuery(e.target.value)} placeholder="Buscar vista" aria-label="Buscar vista" className="h-8 pl-7 text-xs" />
          </div>}
        </div>
        {!leftCompact && <div className="min-h-0 flex-1 overflow-auto px-1 py-1.5">
          {(() => {
            const renderNode = (node: ViewTreeNode, depth = 0): React.ReactNode => <>
              {node.folders.map((folder) => {
                const open = viewQuery.trim() ? true : expandedFolders.has(folder.path)
                return <div key={folder.path}>
                  <button type="button" onClick={() => setExpandedFolders((prev) => {
                    const next = new Set(prev)
                    if (next.has(folder.path)) next.delete(folder.path); else next.add(folder.path)
                    return next
                  })} className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[11px] font-medium hover:bg-accent" style={{paddingLeft: 6 + depth * 12}}>
                    {open ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}<Folder size={13}/><span className="truncate">{folder.name}</span>
                  </button>
                  {open && renderNode(folder, depth + 1)}
                </div>
              })}
              {node.views.map((v) => <button key={v.id} onClick={() => { setViewId(v.id); setSelected(null); setSelectedConnectionId(null); setQuery('') }}
                className={`flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[11px] hover:bg-accent ${v.id === viewId ? 'bg-accent font-semibold' : ''}`} style={{paddingLeft: 22 + depth * 12}}>
                <span className="truncate">{v.name}</span><span className="ml-auto text-[9px] text-muted-foreground">{v.objects.length}</span>
              </button>)}
            </>
            return renderNode(viewTree)
          })()}
        </div>}
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <div className="mr-auto flex items-center gap-3">
            <span className="rounded bg-accent px-2 py-1 text-[12px] font-semibold">Vista Archi</span>
            <span className="text-[11px] text-muted-foreground">{`${view?.name} · ${objects.length} figuras · ${connections.length} conexiones`}</span>
          </div>
          {selectedConnectionId && <Button variant="outline" size="sm" onClick={addBend}>Añadir pliegue</Button>}
          {edits.length > 0 && <span className="rounded border border-primary/40 px-2 py-1 text-[11px] text-foreground">{edits.length} cambios · revisalos en «Cambios»</span>}
          <div className="relative"><Search size={13} className="absolute left-2 top-2.5 text-muted-foreground"/><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar componente" aria-label="Buscar componente" className="h-8 w-48 pl-7 text-xs"/></div>
          <Button variant="outline" size="icon" onClick={() => setScale((s) => Math.max(.08, s / 1.25))} aria-label="Alejar"><ZoomOut size={14}/></Button>
          <span className="w-10 text-center text-[11px]">{Math.round(scale * 100)}%</span>
          <Button variant="outline" size="icon" onClick={() => setScale((s) => Math.min(3, s * 1.25))} aria-label="Acercar"><ZoomIn size={14}/></Button>
          <Button variant="outline" size="icon" onClick={fitCurrentView} aria-label="Ajustar vista a pantalla" title="Ajustar vista a pantalla"><Maximize2 size={14}/></Button>
        </div>
        {matches.length > 0 && <div className="flex max-h-24 flex-wrap gap-1 overflow-auto border-b border-border px-3 py-2">{matches.slice(0, 30).map((o) => <button key={o.id} onClick={() => setSelected(o)} className="rounded border border-border px-2 py-1 text-[11px] hover:bg-accent">{o.label}</button>)}{matches.length > 30 && <span className="text-[11px]">+{matches.length - 30}</span>}</div>}
        <div ref={canvasRef} className="min-h-0 flex-1 overflow-auto bg-[var(--archi-canvas)]">
          {view && <svg width={Math.round(view.width * scale)} height={Math.round(view.height * scale)} viewBox={`0 0 ${view.width} ${view.height}`} role="img" aria-label={`Vista Archi ${view.name}`} className="block">
            <defs>
              <marker id="native-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M0 0 7 4 0 8 Z" fill="context-stroke"/></marker>
              <marker id="native-open-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M0 0 L7 4 L0 8" fill="none" stroke="context-stroke" strokeWidth="1"/></marker>
              <marker id="native-triangle" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto-start-reverse"><path d="M0 0 L9 4 L0 8 Z" fill="var(--archi-canvas)" stroke="context-stroke" strokeWidth="1"/></marker>
              <marker id="native-diamond" markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto-start-reverse"><path d="M1 3.5 L5 0.5 L9 3.5 L5 6.5 Z" fill="context-stroke" stroke="context-stroke"/></marker>
              <marker id="native-open-diamond" markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto-start-reverse"><path d="M1 3.5 L5 0.5 L9 3.5 L5 6.5 Z" fill="var(--archi-canvas)" stroke="context-stroke" strokeWidth="1"/></marker>
              <marker id="native-ball" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto"><circle cx="3.5" cy="3.5" r="2.5" fill="context-stroke"/></marker>
              <marker id="native-half-arrow" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto"><path d="M0 3.5 L8 0" fill="none" stroke="context-stroke" strokeWidth="1"/></marker>
            </defs>
            {objects.filter((o) => containerIds.has(o.id)).map(renderFigure)}
            {connections.map((c) => { const points = routeFor(c.id); if (!points.length) return null
              const path = roundedConnectionPath(points)
              const rel = c.relationId ? model.relationships.get(c.relationId) : undefined
              const type = rel?.type ?? c.type
              const connected = selectedConnectionId === c.id || !!selected && (selected.id === c.source || selected.id === c.target)
              const baseStroke = c.lineColor || 'var(--archi-line)'
              const stroke = connected ? '#f59e0b' : baseStroke
              const access = rel?.accessType ?? '0'
              const dash = /FlowRelationship/i.test(type) ? '6 3' :
                /RealizationRelationship|AccessRelationship/i.test(type) ? '2 2' :
                /InfluenceRelationship/i.test(type) ? '2 2' : undefined
              let markerStart: string | undefined
              let markerEnd: string | undefined
              if (/CompositionRelationship/i.test(type)) markerStart = 'url(#native-diamond)'
              else if (/AggregationRelationship/i.test(type)) markerStart = 'url(#native-open-diamond)'
              else if (/AssignmentRelationship/i.test(type)) { markerStart = 'url(#native-ball)'; markerEnd = 'url(#native-arrow)' }
              else if (/RealizationRelationship|SpecializationRelationship/i.test(type)) markerEnd = 'url(#native-triangle)'
              else if (/ServingRelationship/i.test(type)) markerEnd = 'url(#native-open-arrow)'
              else if (/FlowRelationship|TriggeringRelationship/i.test(type)) markerEnd = 'url(#native-arrow)'
              else if (/AccessRelationship/i.test(type)) {
                if (access === '1' || access === '3') markerStart = 'url(#native-open-arrow)'
                if (access === '0' || access === '3' || access === undefined) markerEnd = 'url(#native-open-arrow)'
              } else if (/AssociationRelationship/i.test(type) && rel?.directed) markerEnd = 'url(#native-half-arrow)'
              const labelPoint = c.textPosition === '0' ? points[Math.min(1, points.length - 1)] :
                c.textPosition === '2' ? points[Math.max(0, points.length - 2)] :
                points[Math.floor(points.length / 2)]
              const labelOffset = connectionLabelOffset(c.textRelativePosition)
              return <g key={c.id}>
                <title>{`${rel?.name || type} · ${c.id}`}</title>
                <path d={path} fill="none" stroke={stroke} strokeWidth={connected ? Math.max(3, (c.lineWidth ?? 1) + 2) : (c.lineWidth ?? 1)}
                  strokeDasharray={dash} strokeLinejoin="miter" strokeLinecap="butt" markerStart={markerStart} markerEnd={markerEnd}/>
                {c.nameVisible !== false && rel?.name && labelPoint && (() => { const rf = fontFromArchi(c.font); return <text
                  x={labelPoint.x + labelOffset.x} y={labelPoint.y + labelOffset.y}
                  fontFamily={rf.family} fontSize={rf.size} fontWeight={rf.weight} fontStyle={rf.style}
                  textAnchor={labelOffset.x < 0 ? 'end' : labelOffset.x > 0 ? 'start' : 'middle'}
                  dominantBaseline={labelOffset.y > 0 ? 'hanging' : 'auto'}
                  fill={c.fontColor || 'var(--foreground)'} paintOrder="stroke" stroke="var(--archi-canvas)" strokeWidth="3">{rel.name}</text> })()}
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
        </div>
      </section>
      {rightCompact ? <aside className="flex w-10 shrink-0 flex-col items-center border-l border-border bg-card py-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRightCompact(false)} aria-label="Expandir propiedades" title="Expandir propiedades"><PanelRightOpen size={15}/></Button>
      </aside> : <div className="relative flex shrink-0">
        <Button variant="ghost" size="icon" className="absolute right-1 top-1 z-20 h-7 w-7" onClick={() => setRightCompact(true)} aria-label="Compactar propiedades" title="Compactar propiedades"><PanelRightClose size={14}/></Button>
        <ArchiUniversePanel model={model} selected={selected} viewId={viewId} xml={originalXml} edits={edits} setEdits={setEdits}/>
      </div>}
    </div>}
  </div>
}
