'use client'

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { diffNativeModels, parseNativeArchi, type DiagramObject, type ModelChange, type NativeModel } from '@/lib/native-archi'
import { exportArchiChanges, newArchiId, saveUniverse, type ArchiEdit, type UniverseState } from '@/lib/archi-universe'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  model: NativeModel
  selected: DiagramObject | null
  viewId: string | null
  xml: string
  universe: UniverseState
  setUniverse: Dispatch<SetStateAction<UniverseState>>
  edits: ArchiEdit[]
  setEdits: Dispatch<SetStateAction<ArchiEdit[]>>
}

const TYPES = ['ApplicationComponent', 'ApplicationService', 'DataObject', 'Node', 'SystemSoftware'] as const
const REL_TYPES = ['FlowRelationship', 'ServingRelationship', 'AssociationRelationship'] as const

export function ArchiUniversePanel({ model, selected, viewId, xml, universe, setUniverse, edits, setEdits }: Props) {
  const [tab, setTab] = useState<'detail' | 'universe' | 'changes'>('detail')
  const [assetName, setAssetName] = useState('')
  const [existingAsset, setExistingAsset] = useState('')
  const [interfaceId, setInterfaceId] = useState('')
  const [rename, setRename] = useState('')
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<(typeof TYPES)[number]>('ApplicationComponent')
  const [targetId, setTargetId] = useState('')
  const [relationType, setRelationType] = useState<(typeof REL_TYPES)[number]>('FlowRelationship')
  const [changes, setChanges] = useState<ModelChange[] | null>(null)
  const [message, setMessage] = useState('')
  const element = selected?.elementId ? model.elements.get(selected.elementId) : undefined
  const related = useMemo(() => element ? [...model.relationships.values()].filter((r) => r.source === element.id || r.target === element.id) : [], [model, element])
  const linked = element ? universe.assets.filter((a) => a.archiIds.includes(element.id)) : []
  const peers = useMemo(() => [...model.elements.values()].filter((e) => e.id !== element?.id).sort((a, b) => a.name.localeCompare(b.name)), [model, element])

  function update(next: UniverseState) {
    setUniverse(next)
    try { saveUniverse(next); setMessage('Vínculo guardado en este navegador.') }
    catch { setMessage('El navegador no permitió guardar el vínculo localmente.') }
  }

  function bind() {
    if (!element) return
    const id = existingAsset || crypto.randomUUID()
    const found = universe.assets.find((a) => a.id === id)
    const name = assetName.trim() || element.name
    const assets = found ? universe.assets.map((a) => a.id === id ? {
      ...a, archiIds: [...new Set([...a.archiIds, element.id])],
      interfaceIds: interfaceId.trim() ? [...new Set([...a.interfaceIds, interfaceId.trim()])] : a.interfaceIds,
    } : a) : [...universe.assets, { id, name, kind: element.type,
      archiIds: [element.id], interfaceIds: interfaceId.trim() ? [interfaceId.trim()] : [] }]
    update({ ...universe, assets })
    setAssetName(''); setExistingAsset(''); setInterfaceId('')
  }

  function createAsset() {
    if (!newName.trim()) { setMessage('Ingresá el nombre del nuevo componente.'); return }
    const id = newArchiId()
    const asset = { id: crypto.randomUUID(), name: newName.trim(), kind: newType, archiIds: [id], interfaceIds: interfaceId.trim() ? [interfaceId.trim()] : [] }
    update({ ...universe, assets: [...universe.assets, asset] })
    setEdits((list) => [...list, { kind: 'createElement', id, name: asset.name, elementType: newType, viewId: viewId ?? undefined }])
    setNewName(''); setInterfaceId('')
    setMessage('Componente nuevo agregado al universo y al borrador Archi. Exportá el modelo para revisarlo en Archi.')
  }

  async function compare(file?: File) {
    if (!file) return
    try {
      if (file.size > 35_000_000) throw new Error('El archivo supera 35 MB.')
      const updated = parseNativeArchi(await file.text())
      setChanges(diffNativeModels(model, updated))
      setMessage('Comparación por IDs terminada. El modelo abierto no se modificó.')
      setTab('changes')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo comparar.') }
  }

  function download() {
    try {
      if (!edits.length) throw new Error('No hay cambios preparados para exportar.')
      const result = exportArchiChanges(xml, model, edits)
      const parsed = parseNativeArchi(result)
      if (parsed.elements.size < model.elements.size || parsed.relationships.size < model.relationships.size || parsed.views.length < model.views.length)
        throw new Error('La validación detectó una pérdida de elementos, relaciones o vistas.')
      const url = URL.createObjectURL(new Blob([result], { type: 'application/xml' }))
      const a = document.createElement('a')
      a.href = url; a.download = `cepasgeneral-propuesta-${new Date().toISOString().slice(0, 10)}.archimate`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setMessage('Modelo propuesto descargado. Abrilo y revisalo en Archi antes de versionarlo en GitLab corporativo.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo exportar.') }
  }

  return <aside className="flex w-[310px] shrink-0 flex-col border-l border-border bg-card">
    <div className="flex border-b border-border">{(['detail', 'universe', 'changes'] as const).map((key) => <button key={key} onClick={() => setTab(key)}
      className={`flex-1 px-2 py-3 text-[11px] font-semibold ${tab === key ? 'border-b-2 border-primary' : 'text-muted-foreground'}`}>{key === 'detail' ? 'Elemento' : key === 'universe' ? 'Universo' : 'Cambios'}</button>)}</div>
    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 text-[12px]">
      {tab === 'detail' && (element ? <>
        <div><h3 className="break-words text-[15px] font-semibold">{element.name}</h3><p className="text-muted-foreground">{element.type}</p></div>
        <dl className="space-y-2"><div><dt className="text-muted-foreground">ID estable del modelo</dt><dd className="break-all font-mono text-[10px]">{element.id}</dd></div>
          <div><dt className="text-muted-foreground">Apariciones en vistas</dt><dd>{model.views.filter((v) => v.objects.some((o) => o.elementId === element.id)).length}</dd></div>
          <div><dt className="text-muted-foreground">Relaciones en el modelo</dt><dd>{related.length}</dd></div>
          <div><dt className="text-muted-foreground">Activos vinculados</dt><dd>{linked.map((a) => a.name).join(', ') || 'Sin vincular'}</dd></div></dl>
        {element.documentation && <p className="whitespace-pre-wrap border-t border-border pt-3 text-muted-foreground">{element.documentation}</p>}
        {!!Object.keys(element.properties).length && <div className="border-t border-border pt-3"><strong>Propiedades</strong>{Object.entries(element.properties).map(([k, v]) => <p className="break-words" key={k}>{k}: {v}</p>)}</div>}
        <div className="border-t border-border pt-3"><strong>Relaciones y vecinos</strong><div className="mt-2 max-h-60 space-y-2 overflow-auto">{related.map((r) => <div className="rounded border border-border p-2" key={r.id}><span className="text-muted-foreground">{r.type.replace('Relationship', '')} · {r.source === element.id ? 'salida' : 'entrada'}</span><p>{model.elements.get(r.source === element.id ? r.target : r.source)?.name ?? '(referencia sin resolver)'}</p><code className="break-all text-[10px]">{r.id}</code></div>)}</div></div>
      </> : <p className="text-muted-foreground">Elegí un elemento de una vista para consultar sus relaciones reales, propiedades y vínculos con el universo.</p>)}
      {tab === 'universe' && <>
        <div><h3 className="font-semibold">Activos del universo</h3><p className="mt-1 text-muted-foreground">Cada activo tiene un ID propio y puede vincular varios IDs de Archi e interfaces. Los vínculos se guardan en este navegador.</p></div>
        {universe.assets.map((a) => {
          const neighbours = [...new Set([...model.relationships.values()].flatMap((r) =>
            a.archiIds.includes(r.source) ? [r.target] : a.archiIds.includes(r.target) ? [r.source] : []))]
          const linkedAssets = universe.assets.filter((other) => other.id !== a.id && other.archiIds.some((id) => neighbours.includes(id)))
          const missing = a.archiIds.filter((id) => !model.elements.has(id) && !edits.some((edit) => edit.kind === 'createElement' && edit.id === id))
          return <div key={a.id} className="rounded border border-border p-2"><b>{a.name}</b><p className="text-muted-foreground">{a.kind} · {a.archiIds.length} elementos · {a.interfaceIds.join(', ') || 'Sin interfaz'}</p>
            <p className="text-muted-foreground">Relaciones del modelo: {neighbours.length} · activos relacionados: {linkedAssets.map((other) => other.name).join(', ') || 'Aún sin vincular'}</p>
            {!!missing.length && <p className="text-amber-600">{missing.length} IDs ausentes en esta versión del modelo.</p>}
            <p className="break-all font-mono text-[10px]">{a.id}</p></div>
        })}
        {element && <div className="space-y-2 border-t border-border pt-3"><h4 className="font-semibold">Vincular «{element.name}»</h4>
          <select value={existingAsset} onChange={(e) => setExistingAsset(e.target.value)} className="w-full rounded border border-border bg-background p-2"><option value="">Nuevo activo</option>{universe.assets.map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select>
          {!existingAsset && <Input value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder={element.name}/>}
          <Input value={interfaceId} onChange={(e) => setInterfaceId(e.target.value)} placeholder="Interfaz, ej. INT-PP01"/>
          <Button size="sm" onClick={bind}>Guardar vínculo por ID</Button></div>}
        <div className="space-y-2 border-t border-border pt-3"><h4 className="font-semibold">Nuevo componente desde el front</h4>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre del componente"/>
          <select value={newType} onChange={(e) => setNewType(e.target.value as typeof newType)} className="w-full rounded border border-border bg-background p-2">{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          <Button size="sm" onClick={createAsset}>Agregar al universo y al borrador Archi</Button></div>
      </>}
      {tab === 'changes' && <>
        <div><h3 className="font-semibold">Comparar versiones</h3><p className="mt-1 text-muted-foreground">Detecta altas, bajas y modificaciones de elementos, relaciones y vistas por ID estable.</p></div>
        <label className="block cursor-pointer rounded border border-border p-2 text-center">Elegir otro .archimate<input type="file" accept=".archimate,.xml" className="sr-only" onChange={(e) => { void compare(e.target.files?.[0]); e.target.value = '' }}/></label>
        {changes && <div><b>{changes.length} diferencias</b><div className="mt-2 max-h-48 space-y-1 overflow-auto">{changes.slice(0, 100).map((c) => <div className="rounded border border-border p-2" key={c.id}><b>{c.change} · {c.kind}</b><p>{c.before || '∅'} → {c.after || '∅'}</p><code className="break-all text-[10px]">{c.id}</code></div>)}</div></div>}
        <div className="space-y-2 border-t border-border pt-3"><h4 className="font-semibold">Cambios preparados: {edits.length}</h4>
          {edits.map((e, i) => <p key={i} className="rounded border border-border p-2">{e.kind} · {e.kind === 'rename' ? e.elementId : e.kind === 'createElement' ? e.name : e.kind === 'moveFigure' ? `${e.objectId} (${e.x}, ${e.y})` : e.sourceId}</p>)}
          <Button size="sm" disabled={!edits.length} onClick={download}>Descargar propuesta .archimate</Button>
          <p className="text-muted-foreground">No escribe directamente en GitLab. El archivo original queda intacto.</p></div>
        {element && <div className="space-y-2 border-t border-border pt-3"><h4 className="font-semibold">Renombrar componente seleccionado</h4>
          <Input value={rename} onChange={(e) => setRename(e.target.value)} placeholder={element.name}/>
          <Button size="sm" onClick={() => { if (!rename.trim()) return; setEdits((list) => [...list, { kind: 'rename', elementId: element.id, expectedName: element.name, name: rename.trim() }]); setRename('') }}>Preparar cambio</Button>
          <h4 className="pt-2 font-semibold">Relacionar con otro elemento</h4>
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="w-full rounded border border-border bg-background p-2"><option value="">Elegir destino</option>{peers.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.id.slice(-6)}</option>)}</select>
          <select value={relationType} onChange={(e) => setRelationType(e.target.value as typeof relationType)} className="w-full rounded border border-border bg-background p-2">{REL_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          <Button size="sm" disabled={!targetId} onClick={() => { if (!targetId) return; setEdits((list) => [...list, { kind: 'createRelationship', id: newArchiId(), sourceId: element.id, targetId, relationshipType: relationType,
            viewId: model.views.find((v) => v.id === viewId)?.objects.some((o) => o.elementId === targetId) ? viewId ?? undefined : undefined }]); setTargetId('') }}>Preparar relación</Button>
        </div>}
      </>}
      {message && <p role="status" className="rounded border border-border bg-accent p-2">{message}</p>}
    </div>
  </aside>
}
