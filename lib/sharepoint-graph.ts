'use client'

import type { AtlasNode } from './atlas-types'
import { acquireGraphAccessToken } from './entra-auth'
import {
  classifyDocument,
  extractDocumentText,
  loadKnowledgeDocuments,
  matchDocumentToNodes,
  newId,
  saveKnowledgeDocument,
  saveKnowledgeSource,
  type DocumentLink,
  type KnowledgeDocument,
  type KnowledgeSource,
} from './document-knowledge'

export interface SharePointResolvedFolder {
  siteId: string
  driveId: string
  folderItemId: string
  name: string
  webUrl: string
}

type GraphDriveItem = {
  id: string
  name: string
  webUrl?: string
  eTag?: string
  size?: number
  lastModifiedDateTime?: string
  file?: { mimeType?: string }
  folder?: { childCount?: number }
  parentReference?: { path?: string }
}

async function graphJson<T>(token: string, url: string): Promise<T> {
  const response = await fetch(url.startsWith('https://') ? url : 'https://graph.microsoft.com/v1.0' + url, {
    headers: { Authorization: 'Bearer ' + token },
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error('Microsoft Graph ' + response.status + ': ' + (detail || response.statusText))
  }
  return response.json() as Promise<T>
}

function decodePath(value: string) {
  try { return decodeURIComponent(value) } catch { return value }
}

function normalizePath(value: string) {
  return decodePath(value).replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase()
}

export async function resolveSharePointFolder(
  folderUrl: string,
): Promise<{ token: string; folder: SharePointResolvedFolder }> {
  const token = await acquireGraphAccessToken()
  const parsed = new URL(folderUrl)
  const segments = parsed.pathname.split('/').filter(Boolean)
  const siteIndex = segments.findIndex((segment) => segment.toLowerCase() === 'sites' || segment.toLowerCase() === 'teams')
  if (siteIndex < 0 || !segments[siteIndex + 1]) {
    throw new Error('No pude identificar el sitio en la URL. Usá una URL de carpeta de SharePoint que contenga /sites/... o /teams/....')
  }

  const sitePath = '/' + segments.slice(0, siteIndex + 2).join('/')
  const site = await graphJson<{ id: string }>(
    token,
    '/sites/' + encodeURIComponent(parsed.hostname) + ':' + sitePath,
  )
  const drives = await graphJson<{ value: Array<{ id: string; name: string; webUrl?: string }> }>(
    token,
    '/sites/' + encodeURIComponent(site.id) + '/drives',
  )

  const folderPath = normalizePath(parsed.pathname)
  const candidates = drives.value
    .filter((drive) => drive.webUrl && folderPath.startsWith(normalizePath(new URL(drive.webUrl).pathname)))
    .sort((a, b) => normalizePath(new URL(b.webUrl!).pathname).length - normalizePath(new URL(a.webUrl!).pathname).length)

  const drive = candidates[0]
  if (!drive?.webUrl) {
    throw new Error('No pude determinar la biblioteca de documentos de esa URL.')
  }

  const drivePath = decodePath(new URL(drive.webUrl).pathname).replace(/\/$/, '')
  const absoluteFolderPath = decodePath(parsed.pathname).replace(/\/$/, '')
  const relative = absoluteFolderPath.slice(drivePath.length).replace(/^\/+/, '')
  const item = relative
    ? await graphJson<GraphDriveItem>(
        token,
        '/drives/' + encodeURIComponent(drive.id) + '/root:/' + relative.split('/').map(encodeURIComponent).join('/'),
      )
    : await graphJson<GraphDriveItem>(token, '/drives/' + encodeURIComponent(drive.id) + '/root')

  if (!item.folder) throw new Error('La URL no corresponde a una carpeta de SharePoint.')

  return {
    token,
    folder: {
      siteId: site.id,
      driveId: drive.id,
      folderItemId: item.id,
      name: item.name,
      webUrl: item.webUrl ?? folderUrl,
    },
  }
}

async function listChildren(token: string, driveId: string, itemId: string): Promise<GraphDriveItem[]> {
  const result: GraphDriveItem[] = []
  let url = 'https://graph.microsoft.com/v1.0/drives/' + encodeURIComponent(driveId) + '/items/' + encodeURIComponent(itemId) + '/children?$top=200'
  while (url) {
    const page = await graphJson<{ value: GraphDriveItem[]; '@odata.nextLink'?: string }>(token, url)
    result.push(...page.value)
    url = page['@odata.nextLink'] ?? ''
  }
  return result
}

async function walkFolder(
  token: string,
  driveId: string,
  itemId: string,
  recursive: boolean,
  prefix = '',
): Promise<Array<{ item: GraphDriveItem; relativePath: string }>> {
  const children = await listChildren(token, driveId, itemId)
  const output: Array<{ item: GraphDriveItem; relativePath: string }> = []

  for (const child of children) {
    const relativePath = prefix ? prefix + '/' + child.name : child.name
    if (child.file) {
      output.push({ item: child, relativePath })
    } else if (recursive && child.folder) {
      output.push(...await walkFolder(token, driveId, child.id, recursive, relativePath))
    }
  }

  return output
}

function isSupported(name: string) {
  return /\.(pdf|docx?|rtf|xlsx?|ods|txt|md|csv|json|xml|ya?ml|log|png|jpe?g|webp|gif|bmp)$/i.test(name)
}

async function downloadDriveItem(token: string, driveId: string, item: GraphDriveItem): Promise<File> {
  const response = await fetch(
    'https://graph.microsoft.com/v1.0/drives/' + encodeURIComponent(driveId) + '/items/' + encodeURIComponent(item.id) + '/content',
    { headers: { Authorization: 'Bearer ' + token } },
  )
  if (!response.ok) throw new Error('No se pudo descargar ' + item.name + ' desde SharePoint.')
  const blob = await response.blob()
  return new File([blob], item.name, {
    type: item.file?.mimeType || blob.type || 'application/octet-stream',
    lastModified: item.lastModifiedDateTime ? Date.parse(item.lastModifiedDateTime) : Date.now(),
  })
}

function inheritedLink(source: KnowledgeSource): DocumentLink[] {
  if (!source.nodeId) return []
  return [{
    nodeId: source.nodeId,
    confidence: 1,
    evidence: ['Heredado de carpeta SharePoint: ' + source.name],
    state: 'vinculado',
  }]
}

function mergeLinks(inherited: DocumentLink[], discovered: DocumentLink[]) {
  const byNode = new Map<string, DocumentLink>()
  for (const link of [...inherited, ...discovered]) {
    const previous = byNode.get(link.nodeId)
    if (!previous || link.confidence > previous.confidence || link.state === 'vinculado') byNode.set(link.nodeId, link)
  }
  return [...byNode.values()].sort((a, b) => b.confidence - a.confidence)
}

export async function connectAndSyncSharePointFolder(args: {
  folderUrl: string
  sourceName?: string
  nodeId: string
  recursive: boolean
  nodes: AtlasNode[]
  existingSource?: KnowledgeSource
}): Promise<{ source: KnowledgeSource; processed: number; skipped: number; failed: number }> {
  const { token, folder } = await resolveSharePointFolder(args.folderUrl)
  const source: KnowledgeSource = {
    id: args.existingSource?.id ?? newId('source'),
    type: 'sharepoint',
    name: args.sourceName?.trim() || folder.name,
    location: folder.webUrl,
    webUrl: folder.webUrl,
    createdAt: args.existingSource?.createdAt ?? new Date().toISOString(),
    lastSyncAt: args.existingSource?.lastSyncAt,
    connectionStatus: 'conectado',
    nodeId: args.nodeId,
    recursive: args.recursive,
    siteId: folder.siteId,
    driveId: folder.driveId,
    folderItemId: folder.folderItemId,
  }
  saveKnowledgeSource(source)

  const current = loadKnowledgeDocuments().filter((doc) => doc.sourceId === source.id)
  const byExternalId = new Map(current.filter((doc) => doc.externalId).map((doc) => [doc.externalId!, doc]))
  const items = await walkFolder(token, folder.driveId, folder.folderItemId, args.recursive)

  let processed = 0
  let skipped = 0
  let failed = 0

  for (const { item, relativePath } of items) {
    if (!isSupported(item.name)) {
      skipped += 1
      continue
    }

    const previous = byExternalId.get(item.id)
    if (previous?.etag && item.eTag && previous.etag === item.eTag) {
      skipped += 1
      continue
    }

    const base: KnowledgeDocument = {
      id: previous?.id ?? newId('doc'),
      sourceId: source.id,
      name: item.name,
      relativePath,
      mimeType: item.file?.mimeType ?? 'application/octet-stream',
      size: item.size ?? 0,
      kind: previous?.kind ?? 'other',
      status: 'procesando',
      modifiedAt: item.lastModifiedDateTime ? Date.parse(item.lastModifiedDateTime) : undefined,
      text: previous?.text ?? '',
      externalId: item.id,
      etag: item.eTag,
      webUrl: item.webUrl,
      links: inheritedLink(source),
    }
    saveKnowledgeDocument(base)

    try {
      const file = await downloadDriveItem(token, folder.driveId, item)
      const extracted = await extractDocumentText(file)
      const text = extracted.text.slice(0, 120000)
      const discovered = matchDocumentToNodes(text, item.name, args.nodes)
      saveKnowledgeDocument({
        ...base,
        mimeType: file.type || base.mimeType,
        kind: classifyDocument(file),
        status: extracted.partial ? 'parcial' : 'procesado',
        processedAt: new Date().toISOString(),
        text,
        links: mergeLinks(inheritedLink(source), discovered),
      })
      processed += 1
    } catch (error) {
      saveKnowledgeDocument({
        ...base,
        status: 'error',
        processedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Error procesando documento de SharePoint.',
      })
      failed += 1
    }
  }

  saveKnowledgeSource({
    ...source,
    lastSyncAt: new Date().toISOString(),
    connectionStatus: failed && !processed ? 'error' : 'conectado',
    lastError: failed ? failed + ' documento(s) con error.' : undefined,
  })

  return { source, processed, skipped, failed }
}

export async function syncSharePointSource(
  source: KnowledgeSource,
  nodes: AtlasNode[],
) {
  if (!source.webUrl && !source.location) throw new Error('La fuente SharePoint no tiene URL.')
  if (!source.nodeId) throw new Error('La carpeta SharePoint no está relacionada con un nodo.')
  return connectAndSyncSharePointFolder({
    folderUrl: source.webUrl ?? source.location!,
    sourceName: source.name,
    nodeId: source.nodeId,
    recursive: source.recursive !== false,
    nodes,
    existingSource: source,
  })
}
