'use client'

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { diffNativeModels, parseNativeArchi, type DiagramObject, type ModelChange, type NativeModel } from '@/lib/native-archi'
import { exportArchiChanges, newArchiId, type ArchiEdit } from '@/lib/archi-universe'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  model: NativeModel
  selected: DiagramObject | null
  viewId: string | null
  xml: string
  edits: ArchiEdit[]
  setEdits: Dispatch<SetStateAction<ArchiEdit[]>>
}

const REL_TYPES = [
  'AccessRelationship', 'AggregationRelationship', 'AssignmentRelationship', 'AssociationRelationship',
  'CompositionRelationship', 'FlowRelationship', 'InfluenceRelationship', 'RealizationRelationship',
  'ServingRelationship', 'SpecializationRelationship', 'TriggeringRelationship',
] as const

export function ArchiUniversePanel({ model, selected, viewId, xml, edits, setEdits }: Props) {
  const [tab, setTab] = useState<'detail' | 'changes'>('detail')
  const [rename, setRename] = useState('')
  const [documentation, setDocumentation] = useState('')
  const [propertyKey, setPropertyKey] = useState('')
  const [propertyValue, setPropertyValue] = useState('')
  const [targetId, setTargetId] = useState('')
  const [relationType, setRelationType] = useState<(typeof REL_TYPES)[number]>('FlowRelationship')
  const [changes, setChanges] = useState<ModelChange[] | null>(null)
  const [message, setMessage] = useState('')

  const element = selected?.elementId ? model.elements.get(selected.elementId) : undefined
  const related = useMemo(
    () => element ? [...model.relationships.values()].filter((r) => r.source === element.id || r.target === element.id) : [],
    [model, element],
  )
  const peers = useMemo(
    () => [...model.elements.values()].filter((e) => e.id !== element?.id).sort((a, b) => a.name.localeCompare(b.name)),
    [model, element],
  )

  const effectiveDocumentation = useMemo(() => {
    if (!element) return ''
    const staged = [...edits].reverse().find((e) => e.kind === 'setDocumentation' && e.elementId === element.id)
    return staged?.kind === 'setDocumentation' ? staged.documentation : element.documentation ?? ''
  }, [edits, element])

  const effectiveProperties = useMemo(() => {
    if (!element) return {} as Record<string, string>
    const next = { ...element.properties }
    for (const edit of edits) {
      if (edit.kind === 'setProperty' && edit.elementId === element.id) next[edit.key] = edit.value
      if (edit.kind === 'deleteProperty' && edit.elementId === element.id) delete next[edit.key]
    }
    return next
  }, [edits, element])

  useEffect(() => {
    setRename('')
    setDocumentation(effectiveDocumentation)
    setPropertyKey('')
    setPropertyValue('')
    setTargetId('')
    setMessage('')
  }, [element?.id])

  useEffect(() => {
    if (element) setDocumentation(effectiveDocumentation)
  }, [effectiveDocumentation, element])

  async function compare(file?: File) {
    if (!file) return
    try {
      if (file.size > 35_000_000) throw new Error('El archivo supera 35 MB.')
      const updated = parseNativeArchi(await file.text())
      setChanges(diffNativeModels(model, updated))
      setMessage('Comparación por IDs terminada. El modelo abierto no se modificó.')
      setTab('changes')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo comparar.')
    }
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
      a.href = url
      a.download = `cepasgeneral-editado-${new Date().toISOString().slice(0, 10)}.archimate`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setMessage('Modelo .archimate generado con los cambios editados. Ya puede abrirse nuevamente en Archi.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo exportar.')
    }
  }

  function stageRename() {
    if (!element || !rename.trim()) return
    setEdits((list) => [
      ...list.filter((e) => !(e.kind === 'rename' && e.elementId === element.id)),
      { kind: 'rename', elementId: element.id, expectedName: element.name, name: rename.trim() },
    ])
    setRename('')
    setMessage('Nombre guardado en el borrador del modelo.')
  }

  function stageDocumentation() {
    if (!element) return
    setEdits((list) => [
      ...list.filter((e) => !(e.kind === 'setDocumentation' && e.elementId === element.id)),
      { kind: 'setDocumentation', elementId: element.id, documentation },
    ])
    setMessage('Documentación guardada en el borrador del modelo.')
  }

  function stageProperty() {
    if (!element || !propertyKey.trim()) return
    const key = propertyKey.trim()
    setEdits((list) => [
      ...list.filter((e) => !(
        (e.kind === 'setProperty' || e.kind === 'deleteProperty') &&
        e.elementId === element.id &&
        e.key === key
      )),
      { kind: 'setProperty', elementId: element.id, key, value: propertyValue },
    ])
    setPropertyKey('')
    setPropertyValue('')
    setMessage(`Propiedad «${key}» guardada en el borrador.`)
  }

  function deleteProperty(key: string) {
    if (!element) return
    setEdits((list) => [
      ...list.filter((e) => !(
        (e.kind === 'setProperty' || e.kind === 'deleteProperty') &&
        e.elementId === element.id &&
        e.key === key
      )),
      { kind: 'deleteProperty', elementId: element.id, key },
    ])
    setMessage(`Propiedad «${key}» marcada para eliminar.`)
  }

  function stageRelationship() {
    if (!element || !targetId) return
    setEdits((list) => [
      ...list,
      {
        kind: 'createRelationship',
        id: newArchiId(),
        sourceId: element.id,
        targetId,
        relationshipType: relationType,
        viewId: model.views.find((v) => v.id === viewId)?.objects.some((o) => o.elementId === targetId)
          ? viewId ?? undefined
          : undefined,
      },
    ])
    setTargetId('')
    setMessage('Relación agregada al borrador. Si ambos elementos están en esta vista, aparece en el diagrama.')
  }

  function editLabel(edit: ArchiEdit) {
    switch (edit.kind) {
      case 'rename': return `nombre · ${edit.elementId}`
      case 'setDocumentation': return `documentación · ${edit.elementId}`
      case 'setProperty': return `propiedad ${edit.key} · ${edit.elementId}`
      case 'deleteProperty': return `eliminar propiedad ${edit.key} · ${edit.elementId}`
      case 'createElement': return `nuevo elemento · ${edit.name}`
      case 'moveFigure': return `posición · ${edit.objectId} (${edit.x}, ${edit.y})`
      case 'routeConnection': return `recorrido · ${edit.connectionId} (${edit.points.length} pliegues)`
      case 'createRelationship': return `relación · ${edit.sourceId} → ${edit.targetId}`
    }
  }

  return <aside className="flex w-[330px] shrink-0 flex-col border-l border-border bg-card">
    <div className="flex border-b border-border">
      {(['detail', 'changes'] as const).map((key) => (
        <button
          key={key}
          onClick={() => setTab(key)}
          className={`flex-1 px-2 py-3 text-[11px] font-semibold ${tab === key ? 'border-b-2 border-primary' : 'text-muted-foreground'}`}
        >
          {key === 'detail' ? 'Elemento' : `Cambios${edits.length ? ` (${edits.length})` : ''}`}
        </button>
      ))}
    </div>

    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 text-[12px]">
      {tab === 'detail' && (element ? <>
        <div>
          <h3 className="break-words text-[15px] font-semibold">{element.name}</h3>
          <p className="text-muted-foreground">{element.type}</p>
        </div>

        <dl className="space-y-2">
          <div><dt className="text-muted-foreground">ID estable del modelo</dt><dd className="break-all font-mono text-[10px]">{element.id}</dd></div>
          <div><dt className="text-muted-foreground">Apariciones en vistas</dt><dd>{model.views.filter((v) => v.objects.some((o) => o.elementId === element.id)).length}</dd></div>
          <div><dt className="text-muted-foreground">Relaciones en el modelo</dt><dd>{related.length}</dd></div>
        </dl>

        <div className="space-y-2 border-t border-border pt-3">
          <h4 className="font-semibold">Editar artefacto Archi</h4>
          <p className="text-[10px] text-muted-foreground">Estos cambios se escriben en el .archimate exportado y pueden volver a abrirse en Archi.</p>

          <label className="block text-[10px] font-semibold text-muted-foreground">Nombre</label>
          <div className="flex gap-2">
            <Input value={rename} onChange={(e) => setRename(e.target.value)} placeholder={element.name} aria-label="Nuevo nombre del elemento"/>
            <Button size="sm" disabled={!rename.trim()} onClick={stageRename}>Guardar</Button>
          </div>

          <label className="block pt-1 text-[10px] font-semibold text-muted-foreground">Documentación</label>
          <Textarea
            value={documentation}
            onChange={(e) => setDocumentation(e.target.value)}
            placeholder="Documentación del elemento"
            className="min-h-24 text-xs"
          />
          <Button size="sm" variant="outline" onClick={stageDocumentation}>Guardar documentación</Button>

          <div className="pt-2">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="font-semibold">Propiedades</h4>
              <span className="text-[10px] text-muted-foreground">{Object.keys(effectiveProperties).length}</span>
            </div>
            <div className="space-y-1.5">
              {Object.entries(effectiveProperties).map(([key, value]) => (
                <div key={key} className="rounded border border-border bg-background p-2">
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => { setPropertyKey(key); setPropertyValue(value) }}
                      title="Editar propiedad"
                    >
                      <b className="break-all">{key}</b>
                      <p className="break-words text-muted-foreground">{value || '—'}</p>
                    </button>
                    <button type="button" className="text-[10px] text-destructive hover:underline" onClick={() => deleteProperty(key)}>Quitar</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 grid gap-2">
              <Input value={propertyKey} onChange={(e) => setPropertyKey(e.target.value)} placeholder="Propiedad / clave"/>
              <Input value={propertyValue} onChange={(e) => setPropertyValue(e.target.value)} placeholder="Valor"/>
              <Button size="sm" variant="outline" disabled={!propertyKey.trim()} onClick={stageProperty}>Agregar / actualizar propiedad</Button>
            </div>
          </div>
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <h4 className="font-semibold">Crear relación Archi</h4>
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="w-full rounded border border-border bg-background p-2" aria-label="Elemento destino">
            <option value="">Elegir destino</option>
            {peers.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.id.slice(-6)}</option>)}
          </select>
          <select value={relationType} onChange={(e) => setRelationType(e.target.value as typeof relationType)} className="w-full rounded border border-border bg-background p-2" aria-label="Tipo de relación">
            {REL_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <Button size="sm" disabled={!targetId} onClick={stageRelationship}>Crear relación</Button>
        </div>

        <div className="border-t border-border pt-3">
          <strong>Relaciones y vecinos</strong>
          <div className="mt-2 max-h-60 space-y-2 overflow-auto">
            {related.map((r) => (
              <div className="rounded border border-border p-2" key={r.id}>
                <span className="text-muted-foreground">{r.type.replace('Relationship', '')} · {r.source === element.id ? 'salida' : 'entrada'}</span>
                <p>{model.elements.get(r.source === element.id ? r.target : r.source)?.name ?? '(referencia sin resolver)'}</p>
                <code className="break-all text-[10px]">{r.id}</code>
              </div>
            ))}
          </div>
        </div>
      </> : <p className="text-muted-foreground">Elegí un elemento de la vista para consultar y editar sus datos Archi.</p>)}

      {tab === 'changes' && <>
        <div>
          <h3 className="font-semibold">Cambios del modelo</h3>
          <p className="mt-1 text-muted-foreground">Todos los cambios preparados se aplican sobre una copia del XML al guardar el .archimate.</p>
        </div>
        <label className="block cursor-pointer rounded border border-border p-2 text-center">
          Comparar con otro .archimate
          <input type="file" accept=".archimate,.xml" className="sr-only" onChange={(e) => { void compare(e.target.files?.[0]); e.target.value = '' }}/>
        </label>
        {changes && <div>
          <b>{changes.length} diferencias</b>
          <div className="mt-2 max-h-48 space-y-1 overflow-auto">
            {changes.slice(0, 100).map((c) => <div className="rounded border border-border p-2" key={c.id}><b>{c.change} · {c.kind}</b><p>{c.before || '∅'} → {c.after || '∅'}</p><code className="break-all text-[10px]">{c.id}</code></div>)}
          </div>
        </div>}
        <div className="space-y-2 border-t border-border pt-3">
          <h4 className="font-semibold">Cambios preparados: {edits.length}</h4>
          {edits.map((edit, i) => (
            <div key={i} className="flex items-center gap-2 rounded border border-border p-2">
              <span className="min-w-0 flex-1 break-all">{editLabel(edit)}</span>
              <button type="button" className="text-primary hover:underline" onClick={() => setEdits((list) => list.filter((_, index) => index !== i))} aria-label={`Deshacer cambio ${i + 1}`}>Deshacer</button>
            </div>
          ))}
          <Button size="sm" disabled={!edits.length} onClick={download}>Guardar .archimate editado</Button>
          <p className="text-muted-foreground">El archivo original no se modifica; se genera una copia compatible para abrir en Archi.</p>
        </div>
      </>}

      {message && <p role="status" className="rounded border border-border bg-accent p-2">{message}</p>}
    </div>
  </aside>
}
