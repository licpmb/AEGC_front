/** Read-only parser for Archi's native .archimate XML. All processing stays in the browser. */
export interface NativeElement {
  id: string
  name: string
  type: string
  documentation?: string
  properties: Record<string, string>
}

export interface NativeRelationship {
  id: string
  name: string
  type: string
  source: string
  target: string
  documentation?: string
  properties: Record<string, string>
  accessType?: string
  directed?: boolean
}

export interface DiagramObject {
  id: string
  elementId?: string
  label: string
  type: string
  x: number
  y: number
  width: number
  height: number
  depth: number
  fillColor?: string
  lineColor?: string
  fontColor?: string
  font?: string
  textAlignment?: string
  textPosition?: string
  figureType?: string
  hasChildren?: boolean
}

export interface DiagramConnection {
  id: string
  source: string
  target: string
  relationId?: string
  type: string
  lineColor?: string
  lineWidth?: number
  fontColor?: string
  font?: string
  textPosition?: string
  textRelativePosition?: string
  nameVisible?: boolean
  bendpoints: Array<{ startX: number; startY: number; endX: number; endY: number }>
}

export interface NativeView {
  id: string
  name: string
  type: string
  objects: DiagramObject[]
  connections: DiagramConnection[]
  width: number
  height: number
}

export interface NativeModel {
  id: string
  name: string
  elements: Map<string, NativeElement>
  relationships: Map<string, NativeRelationship>
  views: NativeView[]
}

/** Reproduce Draw2D RelativeBendpoint exactly.
 * Archi stores two offsets for every bendpoint and a weight based on its
 * position in the route. The absolute point is the weighted interpolation
 * of the source-relative and target-relative coordinates. */
function rectangularAnchor(o: DiagramObject, point: { x: number; y: number }) {
  const cx = o.x + o.width / 2, cy = o.y + o.height / 2
  const dx = point.x - cx, dy = point.y - cy
  const factor = Math.max(Math.abs(dx) / Math.max(o.width / 2, 1), Math.abs(dy) / Math.max(o.height / 2, 1), 1e-6)
  return { x: cx + dx / factor, y: cy + dy / factor }
}

function ellipseAnchor(o: DiagramObject, point: { x: number; y: number }) {
  const cx = o.x + o.width / 2, cy = o.y + o.height / 2
  const rx = Math.max(o.width / 2, 1), ry = Math.max(o.height / 2, 1)
  const dx = point.x - cx, dy = point.y - cy
  const scale = 1 / Math.max(Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)), 1e-6)
  return { x: cx + dx * scale, y: cy + dy * scale }
}

function roundedRectangleAnchor(o: DiagramObject, point: { x: number; y: number }) {
  // Draw2D's RoundedRectangleAnchor follows the rounded outline. The straight
  // rectangle result is exact outside the corner radius; near a corner, project
  // onto the quarter ellipse used by Archi's rounded delegates.
  const hit = rectangularAnchor(o, point)
  const radiusX = Math.min(o.height / 2, o.width * .4)
  const radiusY = Math.min(o.height / 2, radiusX)
  const left = o.x + radiusX, right = o.x + o.width - radiusX
  const top = o.y + radiusY, bottom = o.y + o.height - radiusY
  if (hit.x >= left && hit.x <= right || hit.y >= top && hit.y <= bottom) return hit
  const ccx = hit.x < left ? left : right
  const ccy = hit.y < top ? top : bottom
  const dx = point.x - ccx, dy = point.y - ccy
  const k = 1 / Math.max(Math.sqrt((dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY)), 1e-6)
  return { x: ccx + dx * k, y: ccy + dy * k }
}

function archiAnchor(o: DiagramObject, point: { x: number; y: number }) {
  if (/Junction/i.test(o.type)) return ellipseAnchor(o, point)
  if (/Service|Process|Function|Interaction/i.test(o.type) && o.figureType !== '1') return roundedRectangleAnchor(o, point)
  return rectangularAnchor(o, point)
}

export function connectionPoints(connection: DiagramConnection, source: DiagramObject, target: DiagramObject) {
  const sx = source.x + source.width / 2, sy = source.y + source.height / 2
  const tx = target.x + target.width / 2, ty = target.y + target.height / 2
  const count = connection.bendpoints.length
  const bends = connection.bendpoints.map((p, index) => {
    const weight = (index + 1) / (count + 1)
    const startX = sx + p.startX, startY = sy + p.startY
    const endX = tx + p.endX, endY = ty + p.endY
    return {
      x: startX * (1 - weight) + endX * weight,
      y: startY * (1 - weight) + endY * weight,
    }
  })
  const firstGuide = bends[0] ?? { x: tx, y: ty }
  const lastGuide = bends.at(-1) ?? { x: sx, y: sy }
  return [archiAnchor(source, firstGuide), ...bends, archiAnchor(target, lastGuide)]
}

function children(parent: Element, name: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === name)
}

function xmlType(el: Element): string {
  return el.getAttribute('xsi:type')?.split(':').at(-1) ??
    el.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type')?.split(':').at(-1) ??
    el.localName
}

function numeric(value: string | null, fallback: number): number {
  const result = Number(value)
  return value !== null && Number.isFinite(result) ? result : fallback
}

export function parseNativeArchi(source: string): NativeModel {
  if (source.length > 35_000_000) throw new Error('El modelo supera el límite de 35 MB.')
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('El XML contiene una declaración no admitida.')
  const doc = new DOMParser().parseFromString(source, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('El archivo no es XML válido.')
  const root = doc.documentElement
  if (root.localName !== 'model') throw new Error('El archivo no parece ser un modelo nativo de Archi.')

  const elements = new Map<string, NativeElement>()
  const relationships = new Map<string, NativeRelationship>()
  const views: NativeView[] = []
  const all = Array.from(root.getElementsByTagName('*'))
  const propertyDefinitions = new Map<string, string>()
  for (const el of all) {
    if (el.localName === 'property') {
      const id = el.getAttribute('id')
      if (id && el.getAttribute('key')) propertyDefinitions.set(id, el.getAttribute('key')!)
    }
  }
  function propertiesOf(el: Element): Record<string, string> {
    const result: Record<string, string> = {}
    for (const p of children(el, 'property')) {
      const key = p.getAttribute('key') ?? propertyDefinitions.get(p.getAttribute('keyRef') ?? '')
      if (key) result[key] = p.getAttribute('value') ?? p.textContent?.trim() ?? ''
    }
    return result
  }
  for (const el of all) {
    if (el.localName !== 'element') continue
    const id = el.getAttribute('id')
    if (!id) continue
    const type = xmlType(el)
    if (type.endsWith('Relationship')) {
      relationships.set(id, { id, name: el.getAttribute('name') ?? '', type,
        source: el.getAttribute('source') ?? '', target: el.getAttribute('target') ?? '',
        documentation: children(el, 'documentation')[0]?.textContent?.trim(), properties: propertiesOf(el),
        accessType: el.getAttribute('accessType') ?? undefined,
        directed: el.getAttribute('directed') === 'true' || el.getAttribute('directed') === '1' })
      continue
    }
    if (type === 'ArchimateDiagramModel' || type === 'CanvasModel' || type === 'SketchModel') continue
    elements.set(id, {
      id,
      name: el.getAttribute('name') ?? '(sin nombre)',
      type,
      documentation: children(el, 'documentation')[0]?.textContent?.trim(),
      properties: propertiesOf(el),
    })
  }

  for (const el of all) {
    if (el.localName !== 'element' || !['ArchimateDiagramModel', 'SketchModel', 'CanvasModel'].includes(xmlType(el))) continue
    const id = el.getAttribute('id')
    if (!id) continue
    const objects: DiagramObject[] = []
    const connections: DiagramConnection[] = []
    const seenConnections = new Set<string>()
    function walk(parent: Element, parentX: number, parentY: number, depth: number) {
      for (const child of children(parent, 'child')) {
        const b = children(child, 'bounds')[0]
        if (!b) continue
        const x = parentX + numeric(b.getAttribute('x'), 0)
        const y = parentY + numeric(b.getAttribute('y'), 0)
        const elementId = child.getAttribute('archimateElement') ?? undefined
        const ref = elementId ? elements.get(elementId) : undefined
        const objectId = child.getAttribute('id')
        if (!objectId) continue
        const objectType = xmlType(child)
        const fallback = child.getAttribute('name') || children(child, 'content')[0]?.textContent?.trim() ||
          children(child, 'notes')[0]?.textContent?.trim() || (objectType === 'DiagramModelGroup' ? 'Grupo' : '')
        objects.push({ id: objectId, elementId, label: ref?.name ?? fallback, type: ref?.type ?? objectType,
          x, y, width: Math.max(30, numeric(b.getAttribute('width'), 160)),
          height: Math.max(22, numeric(b.getAttribute('height'), 55)), depth,
          fillColor: child.getAttribute('fillColor') ?? undefined,
          lineColor: child.getAttribute('lineColor') ?? undefined,
          fontColor: child.getAttribute('fontColor') ?? undefined,
          font: child.getAttribute('font') ?? undefined,
          textAlignment: child.getAttribute('textAlignment') ?? undefined,
          textPosition: child.getAttribute('textPosition') ?? undefined,
          figureType: child.getAttribute('type') ?? undefined,
          hasChildren: children(child, 'child').length > 0 })
        for (const line of children(child, 'sourceConnection')) {
          const connectionId = line.getAttribute('id')
          if (!connectionId || seenConnections.has(connectionId)) continue
          seenConnections.add(connectionId)
          connections.push({ id: connectionId, source: line.getAttribute('source') ?? '',
            target: line.getAttribute('target') ?? '',
            relationId: line.getAttribute('archimateRelationship') ?? undefined, type: xmlType(line),
            lineColor: line.getAttribute('lineColor') ?? undefined,
            lineWidth: Math.max(1, numeric(line.getAttribute('lineWidth'), 1)),
            fontColor: line.getAttribute('fontColor') ?? undefined,
            font: line.getAttribute('font') ?? undefined,
            textPosition: line.getAttribute('textPosition') ?? undefined,
            textRelativePosition: children(line, 'feature').find((f) => f.getAttribute('name') === 'textRelativePosition')?.getAttribute('value') ?? undefined,
            nameVisible: children(line, 'feature').find((f) => f.getAttribute('name') === 'nameVisible')?.getAttribute('value') !== 'false',
            bendpoints: children(line, 'bendpoint').map((point) => ({
              startX: numeric(point.getAttribute('startX'), 0), startY: numeric(point.getAttribute('startY'), 0),
              endX: numeric(point.getAttribute('endX'), 0), endY: numeric(point.getAttribute('endY'), 0),
            })) })
        }
        walk(child, x, y, depth + 1)
      }
    }
    walk(el, 0, 0, 0)
    views.push({ id, name: el.getAttribute('name') ?? '(sin nombre)', type: xmlType(el), objects, connections,
      width: Math.max(900, ...objects.map((o) => o.x + o.width)) + 50,
      height: Math.max(550, ...objects.map((o) => o.y + o.height)) + 50 })
  }
  if (!views.length) throw new Error('No se encontraron vistas ArchiMate en el archivo.')
  return { id: root.getAttribute('id') ?? '', name: root.getAttribute('name') ?? 'Modelo Archi', elements, relationships, views }
}

export interface ModelChange {
  id: string
  kind: 'element' | 'relationship' | 'view'
  change: 'added' | 'removed' | 'modified'
  before?: string
  after?: string
}

/** Compare semantic entities by their Archi IDs, independent of diagram coordinates. */
export function diffNativeModels(before: NativeModel, after: NativeModel): ModelChange[] {
  if (before.id !== after.id) throw new Error('Los archivos pertenecen a modelos Archi distintos.')
  const changes: ModelChange[] = []
  function compare<T>(kind: ModelChange['kind'], a: Map<string, T>, b: Map<string, T>, value: (item: T) => string, label: (item: T) => string) {
    for (const [id, old] of a) {
      const next = b.get(id)
      if (!next) changes.push({ id, kind, change: 'removed', before: label(old) })
      else if (value(old) !== value(next)) changes.push({ id, kind, change: 'modified', before: label(old), after: label(next) })
    }
    for (const [id, next] of b) if (!a.has(id)) changes.push({ id, kind, change: 'added', after: label(next) })
  }
  compare('element', before.elements, after.elements,
    (e) => JSON.stringify([e.name, e.type, e.documentation, e.properties]), (e) => e.name)
  compare('relationship', before.relationships, after.relationships,
    (e) => JSON.stringify([e.name, e.type, e.source, e.target, e.documentation, e.properties]), (e) => e.name || `${e.type}: ${e.source} → ${e.target}`)
  compare('view', new Map(before.views.map((v) => [v.id, v])), new Map(after.views.map((v) => [v.id, v])),
    (v) => JSON.stringify([v.name, v.type, v.objects, v.connections]), (v) => v.name)
  return changes
}
