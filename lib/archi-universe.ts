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
  | { kind: 'createElement'; id: string; name: string; elementType: 'ApplicationComponent' | 'ApplicationService' | 'DataObject' | 'Node' | 'SystemSoftware'; viewId?: string }
  | { kind: 'createRelationship'; id: string; sourceId: string; targetId: string; relationshipType: 'FlowRelationship' | 'ServingRelationship' | 'AssociationRelationship'; viewId?: string }

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
  const byId = new Map(Array.from(root.getElementsByTagName('*')).filter((el) => el.hasAttribute('id')).map((el) => [el.getAttribute('id')!, el]))
  const xsi = 'http://www.w3.org/2001/XMLSchema-instance'
  const make = (tag: string, id: string, type: string) => {
    const element = doc.createElement(tag)
    element.setAttribute('id', id)
    element.setAttributeNS(xsi, 'xsi:type', `archimate:${type}`)
    return element
  }
  for (const edit of edits) {
    if (edit.kind === 'rename') {
      const el = byId.get(edit.elementId)
      if (!el || !model.elements.has(edit.elementId) || el.getAttribute('name') !== edit.expectedName)
        throw new Error(`Conflicto de versión en el elemento ${edit.elementId}.`)
      if (!edit.name.trim()) throw new Error('El nombre no puede estar vacío.')
      el.setAttribute('name', edit.name.trim())
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
