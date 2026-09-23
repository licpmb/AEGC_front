/** Read-only parser for Archi's native .archimate XML. All processing stays in the browser. */
export interface NativeElement {
  id: string
  name: string
  type: string
  documentation?: string
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
}

export interface DiagramConnection {
  id: string
  source: string
  target: string
  relationId?: string
  type: string
}

export interface NativeView {
  id: string
  name: string
  objects: DiagramObject[]
  connections: DiagramConnection[]
  width: number
  height: number
}

export interface NativeModel {
  name: string
  elements: Map<string, NativeElement>
  views: NativeView[]
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
  const views: NativeView[] = []
  const all = Array.from(root.getElementsByTagName('*'))
  for (const el of all) {
    if (el.localName !== 'element') continue
    const id = el.getAttribute('id')
    if (!id) continue
    const type = xmlType(el)
    if (type === 'ArchimateDiagramModel' || type === 'CanvasModel' || type === 'SketchModel') continue
    elements.set(id, {
      id,
      name: el.getAttribute('name') ?? '(sin nombre)',
      type,
      documentation: children(el, 'documentation')[0]?.textContent?.trim(),
    })
  }

  for (const el of all) {
    if (el.localName !== 'element' || xmlType(el) !== 'ArchimateDiagramModel') continue
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
        const fallback = child.getAttribute('name') || (objectType === 'DiagramModelGroup' ? 'Grupo' : '')
        objects.push({ id: objectId, elementId, label: ref?.name ?? fallback, type: ref?.type ?? objectType,
          x, y, width: Math.max(30, numeric(b.getAttribute('width'), 160)),
          height: Math.max(22, numeric(b.getAttribute('height'), 55)), depth })
        for (const line of children(child, 'sourceConnection')) {
          const connectionId = line.getAttribute('id')
          if (!connectionId || seenConnections.has(connectionId)) continue
          seenConnections.add(connectionId)
          connections.push({ id: connectionId, source: line.getAttribute('source') ?? '',
            target: line.getAttribute('target') ?? '',
            relationId: line.getAttribute('archimateRelationship') ?? undefined, type: xmlType(line) })
        }
        walk(child, x, y, depth + 1)
      }
    }
    walk(el, 0, 0, 0)
    views.push({ id, name: el.getAttribute('name') ?? '(sin nombre)', objects, connections,
      width: Math.max(900, ...objects.map((o) => o.x + o.width)) + 50,
      height: Math.max(550, ...objects.map((o) => o.y + o.height)) + 50 })
  }
  if (!views.length) throw new Error('No se encontraron vistas ArchiMate en el archivo.')
  return { name: root.getAttribute('name') ?? 'Modelo Archi', elements, views }
}
