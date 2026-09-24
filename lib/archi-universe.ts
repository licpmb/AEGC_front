import type { NativeModel } from './native-archi'

export interface UniverseAsset {
  id: string
  name: string
  kind: string
  archiIds: string[]
  interfaceIds: string[]
}

export interface UniverseState {
  modelId: string
  assets: UniverseAsset[]
}

export type ArchiEdit =
  | { kind: 'rename'; elementId: string; expectedName: string; name: string }
  | { kind: 'setDocumentation'; elementId: string; documentation: string }
  | { kind: 'setProperty'; elementId: string; key: string; value: string }
  | { kind: 'deleteProperty'; elementId: string; key: string }
  | { kind: 'createElement'; id: string; name: string; elementType: 'ApplicationComponent' | 'ApplicationService' | 'DataObject' | 'Node' | 'SystemSoftware'; viewId?: string }
  | { kind: 'createRelationship'; id: string; sourceId: string; targetId: string; relationshipType:
      'AccessRelationship' | 'AggregationRelationship' | 'AssignmentRelationship' | 'AssociationRelationship' |
      'CompositionRelationship' | 'FlowRelationship' | 'InfluenceRelationship' | 'RealizationRelationship' |
      'ServingRelationship' | 'SpecializationRelationship' | 'TriggeringRelationship'; viewId?: string }
  | { kind: 'moveFigure'; viewId: string; objectId: string; x: number; y: number }
  | { kind: 'routeConnection'; viewId: string; connectionId: string; points: Array<{ x: number; y: number }> }

function sourceFingerprint(xml: string) {
  let hash = 2166136261
  for (let i = 0; i < xml.length; i++) hash = Math.imul(hash ^ xml.charCodeAt(i), 16777619)
  return `${xml.length}:${hash >>> 0}`
}

export function loadArchiDraft(modelId: string, xml: string): ArchiEdit[] {
  try {
    const saved = JSON.parse(localStorage.getItem(`aegc:draft:${modelId}`) ?? 'null')
    if (saved?.fingerprint === sourceFingerprint(xml) && Array.isArray(saved.edits)) return saved.edits
  } catch { /* Ignore an invalid or unavailable local draft. */ }
  return []
}

export function saveArchiDraft(modelId: string, xml: string, edits: ArchiEdit[]) {
  try { localStorage.setItem(`aegc:draft:${modelId}`, JSON.stringify({ fingerprint: sourceFingerprint(xml), edits })) }
  catch { /* Export remains available even when local storage is unavailable. */ }
}

export function loadUniverse(modelId: string): UniverseState {
  try {
    const value = localStorage.getItem(`aegc:universe:${modelId}`)
    if (value) {
      const parsed = JSON.parse(value) as UniverseState
      if (parsed.modelId === modelId && Array.isArray(parsed.assets)) return parsed
    }
  } catch { /* unavailable or invalid local data */ }
  return { modelId, assets: [] }
}

export function saveUniverse(state: UniverseState): void {
  localStorage.setItem(`aegc:universe:${state.modelId}`, JSON.stringify(state))
}

export function reconcileUniverse(state: UniverseState, model: NativeModel) {
  return state.assets.map((asset) => ({ asset,
    resolved: asset.archiIds.filter((id) => model.elements.has(id)),
    missing: asset.archiIds.filter((id) => !model.elements.has(id)),
    relationships: [...model.relationships.values()].filter((r) =>
      asset.archiIds.includes(r.source) || asset.archiIds.includes(r.target)),
  }))
}

function child(parent: Element, name: string): Element | undefined {
  return Array.from(parent.children).find((item) => item.localName === name)
}

function namedFolder(root: Element, type: string): Element {
  const folder = Array.from(root.children).find((item) => item.localName === 'folder' && item.getAttribute('type') === type)
  if (!folder) throw new Error(`El modelo no contiene la carpeta ${type}.`)
  return folder
}

function nativeId() { return `id-${crypto.randomUUID().replace(/-/g, '')}` }

/** Apply only explicit, reviewable commands to a COPY of the original XML. */
export function exportArchiChanges(originalXml: string, model: NativeModel, edits: ArchiEdit[]): string {
  if (/<!DOCTYPE|<!ENTITY/i.test(originalXml)) throw new Error('El XML contiene declaraciones no admitidas.')
  const doc = new DOMParser().parseFromString(originalXml, 'application/xml')
  if (doc.querySelector('parsererror') || doc.documentElement.getAttribute('id') !== model.id)
    throw new Error('La fuente original no coincide con el modelo abierto.')
  const root = doc.documentElement
  const allNodes = Array.from(root.getElementsByTagName('*'))
  const byId = new Map(allNodes.filter((el) => el.hasAttribute('id')).map((el) => [el.getAttribute('id')!, el]))
  const propertyDefinitions = new Map<string, string>()
  for (const node of allNodes) {
    if (node.localName !== 'property') continue
    const id = node.getAttribute('id')
    const key = node.getAttribute('key')
    if (id && key) propertyDefinitions.set(id, key)
  }
  const propertyKey = (node: Element) => node.getAttribute('key') ?? propertyDefinitions.get(node.getAttribute('keyRef') ?? '') ?? ''
  const xsi = 'http://www.w3.org/2001/XMLSchema-instance'
  const make = (tag: string, id: string, type: string) => {
    const element = doc.createElement(tag)
    element.setAttribute('id', id)
    element.setAttributeNS(xsi, 'xsi:type', `archimate:${type}`)
    return element
  }
  const moved = new Map(edits.filter((edit): edit is Extract<ArchiEdit, { kind: 'moveFigure' }> => edit.kind === 'moveFigure')
    .map((edit) => [`${edit.viewId}:${edit.objectId}`, edit] as const))
  for (const edit of edits) {
    if (edit.kind === 'routeConnection') {
      const view = model.views.find((v) => v.id === edit.viewId)
      const connection = view?.connections.find((c) => c.id === edit.connectionId)
      const source = view?.objects.find((o) => o.id === connection?.source)
      const target = view?.objects.find((o) => o.id === connection?.target)
      const line = byId.get(edit.connectionId)
      if (!source || !target || !line || edit.points.length > 40 || edit.points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
        throw new Error('Recorrido de conexión inválido.')
      for (const old of Array.from(line.children).filter((item) => item.localName === 'bendpoint')) old.remove()
      const from = moved.get(`${edit.viewId}:${source.id}`)
      const to = moved.get(`${edit.viewId}:${target.id}`)
      const sx = (from?.x ?? source.x) + source.width / 2, sy = (from?.y ?? source.y) + source.height / 2
      const tx = (to?.x ?? target.x) + target.width / 2, ty = (to?.y ?? target.y) + target.height / 2
      for (const point of edit.points) {
        const bend = doc.createElement('bendpoint')
        bend.setAttribute('startX', String(Math.round(point.x - sx)))
        bend.setAttribute('startY', String(Math.round(point.y - sy)))
        bend.setAttribute('endX', String(Math.round(point.x - tx)))
        bend.setAttribute('endY', String(Math.round(point.y - ty)))
        line.appendChild(bend)
      }
    } else if (edit.kind === 'moveFigure') {
      const view = model.views.find((v) => v.id === edit.viewId)
      const figure = view?.objects.find((o) => o.id === edit.objectId)
      const node = byId.get(edit.objectId)
      const bounds = node && child(node, 'bounds')
      if (!figure || !bounds || !Number.isFinite(edit.x) || !Number.isFinite(edit.y)) throw new Error('Figura o posición inválida.')
      bounds.setAttribute('x', String(Number(bounds.getAttribute('x') ?? 0) + edit.x - figure.x))
      bounds.setAttribute('y', String(Number(bounds.getAttribute('y') ?? 0) + edit.y - figure.y))
    } else if (edit.kind === 'rename') {
      const el = byId.get(edit.elementId)
      if (!el || !model.elements.has(edit.elementId) || el.getAttribute('name') !== edit.expectedName)
        throw new Error(`Conflicto de versión en el elemento ${edit.elementId}.`)
      if (!edit.name.trim()) throw new Error('El nombre no puede estar vacío.')
      el.setAttribute('name', edit.name.trim())
    } else if (edit.kind === 'setDocumentation') {
      const el = byId.get(edit.elementId)
      if (!el || !model.elements.has(edit.elementId)) throw new Error(`Elemento no encontrado: ${edit.elementId}.`)
      let docNode = Array.from(el.children).find((item) => item.localName === 'documentation')
      if (!edit.documentation.trim()) {
        docNode?.remove()
      } else {
        if (!docNode) {
          docNode = doc.createElement('documentation')
          el.appendChild(docNode)
        }
        docNode.textContent = edit.documentation
      }
    } else if (edit.kind === 'setProperty') {
      const el = byId.get(edit.elementId)
      const key = edit.key.trim()
      if (!el || !model.elements.has(edit.elementId) || !key) throw new Error('Elemento o propiedad inválidos.')
      const existing = Array.from(el.children).find((item) => item.localName === 'property' && propertyKey(item) === key)
      if (existing) {
        existing.setAttribute('value', edit.value)
        if (!existing.hasAttribute('key') && !existing.hasAttribute('keyRef')) existing.setAttribute('key', key)
      } else {
        const property = doc.createElement('property')
        property.setAttribute('key', key)
        property.setAttribute('value', edit.value)
        el.appendChild(property)
      }
    } else if (edit.kind === 'deleteProperty') {
      const el = byId.get(edit.elementId)
      if (!el || !model.elements.has(edit.elementId)) throw new Error(`Elemento no encontrado: ${edit.elementId}.`)
      const existing = Array.from(el.children).find((item) => item.localName === 'property' && propertyKey(item) === edit.key)
      existing?.remove()
    } else if (edit.kind === 'createElement') {
      if (byId.has(edit.id) || !edit.name.trim()) throw new Error('ID duplicado o nombre vacío.')
      const folderType = ['Node', 'SystemSoftware'].includes(edit.elementType) ? 'technology' : 'application'
      const el = make('element', edit.id, edit.elementType)
      el.setAttribute('name', edit.name.trim())
      namedFolder(root, folderType).appendChild(el)
      byId.set(edit.id, el)
      if (edit.viewId) {
        const view = byId.get(edit.viewId)
        if (!view || !model.views.some((v) => v.id === edit.viewId)) throw new Error('Vista no encontrada.')
        const object = make('child', nativeId(), 'DiagramObject')
        object.setAttribute('archimateElement', edit.id)
        const bounds = doc.createElement('bounds')
        const existing = model.views.find((v) => v.id === edit.viewId)!
        bounds.setAttribute('x', String(existing.width + 80))
        bounds.setAttribute('y', '120')
        bounds.setAttribute('width', '180')
        bounds.setAttribute('height', '60')
        object.appendChild(bounds)
        view.appendChild(object)
        byId.set(object.getAttribute('id')!, object)
      }
    } else {
      if (byId.has(edit.id) || edit.sourceId === edit.targetId || !byId.has(edit.sourceId) || !byId.has(edit.targetId))
        throw new Error('Relación duplicada o extremos inválidos.')
      const rel = make('element', edit.id, edit.relationshipType)
      rel.setAttribute('source', edit.sourceId)
      rel.setAttribute('target', edit.targetId)
      namedFolder(root, 'relations').appendChild(rel)
      byId.set(edit.id, rel)
      if (edit.viewId) {
        const view = model.views.find((v) => v.id === edit.viewId)
        if (!view) throw new Error('Vista no encontrada.')
        const source = view.objects.find((o) => o.elementId === edit.sourceId)
        const target = view.objects.find((o) => o.elementId === edit.targetId)
        if (!source || !target) throw new Error('Los dos elementos deben existir en la vista elegida.')
        const sourceObject = byId.get(source.id)!
        const targetObject = byId.get(target.id)!
        const line = make('sourceConnection', nativeId(), 'Connection')
        line.setAttribute('source', source.id)
        line.setAttribute('target', target.id)
        line.setAttribute('archimateRelationship', edit.id)
        sourceObject.appendChild(line)
        targetObject.setAttribute('targetConnections', [targetObject.getAttribute('targetConnections'), line.getAttribute('id')].filter(Boolean).join(' '))
      }
    }
  }
  return new XMLSerializer().serializeToString(doc)
}

export function newArchiId() { return nativeId() }
