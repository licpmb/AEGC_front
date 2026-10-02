'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ExternalLink,
  FileArchive,
  FileImage,
  FileText,
  FolderOpen,
  Link2,
  LoaderCircle,
  RefreshCw,
  Search,
  Share2,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAtlasNodes } from '@/lib/atlas-local'
import {
  KNOWLEDGE_EVENT,
  classifyDocument,
  deleteKnowledgeSource,
  extractDocumentText,
  loadKnowledgeDocuments,
  loadKnowledgeSources,
  matchDocumentToNodes,
  newId,
  saveKnowledgeDocument,
  saveKnowledgeSource,
  updateDocumentLink,
  type KnowledgeDocument,
  type KnowledgeSource,
} from '@/lib/document-knowledge'
import { cn } from '@/lib/utils'
import { connectAndSyncSharePointFolder, syncSharePointSource } from '@/lib/sharepoint-graph'
import { getMicrosoftSession } from '@/lib/entra-auth'

const MAX_STORED_TEXT = 120000

function sourceIcon(type: KnowledgeSource['type']) {
  if (type === 'folder') return FolderOpen
  if (type === 'sharepoint') return Share2
  return Upload
}

function fileIcon(doc: KnowledgeDocument) {
  if (doc.kind === 'image') return FileImage
  if (doc.kind === 'pdf' || doc.kind === 'word') return FileText
  return FileArchive
}

function formatBytes(size: number) {
  if (size < 1024) return size + ' B'
  if (size < 1024 * 1024) return Math.round(size / 1024) + ' KB'
  return (size / 1024 / 1024).toFixed(1) + ' MB'
}

export function DocumentSources() {
  const atlasNodes = useAtlasNodes()
  const filesRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [selectedSourceId, setSelectedSourceId] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [processing, setProcessing] = useState<string | null>(null)
  const [sharePointUrl, setSharePointUrl] = useState('')
  const [sharePointName, setSharePointName] = useState('')
  const [sharePointNodeId, setSharePointNodeId] = useState('')
  const [sharePointRecursive, setSharePointRecursive] = useState(true)
  const [microsoftUser, setMicrosoftUser] = useState<string | null>(null)
  const [sharePointStatus, setSharePointStatus] = useState<string | null>(null)
  const [showSharePoint, setShowSharePoint] = useState(false)

  useEffect(() => {
    const sync = () => {
      setSources(loadKnowledgeSources())
      setDocuments(loadKnowledgeDocuments())
    }
    sync()
    window.addEventListener(KNOWLEDGE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(KNOWLEDGE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  useEffect(() => {
    folderRef.current?.setAttribute('webkitdirectory', '')
    folderRef.current?.setAttribute('directory', '')
    void getMicrosoftSession().then((session) => setMicrosoftUser(session?.name ?? session?.username ?? null))
  }, [])

  const visibleDocuments = useMemo(() => {
    const q = search.trim().toLowerCase()
    return documents
      .filter((doc) => selectedSourceId === 'all' || doc.sourceId === selectedSourceId)
      .filter((doc) => !q || doc.name.toLowerCase().includes(q) || doc.text.toLowerCase().includes(q))
      .sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0))
  }, [documents, search, selectedSourceId])

  const stats = useMemo(() => {
    const linked = documents.reduce((sum, doc) => sum + doc.links.filter((link) => link.state === 'vinculado').length, 0)
    const suggestions = documents.reduce((sum, doc) => sum + doc.links.filter((link) => link.state === 'sugerido').length, 0)
    return { documents: documents.length, linked, suggestions }
  }, [documents])

  async function processFiles(files: File[], sourceType: KnowledgeSource['type']) {
    if (!files.length) return

    const firstPath = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath
    const folderName = firstPath ? firstPath.split('/')[0] : null
    const source: KnowledgeSource = {
      id: newId('source'),
      type: sourceType,
      name: folderName || (files.length === 1 ? files[0].name : 'Carga manual · ' + files.length + ' archivos'),
      location: folderName || undefined,
      createdAt: new Date().toISOString(),
      lastSyncAt: new Date().toISOString(),
      connectionStatus: 'local',
    }
    saveKnowledgeSource(source)
    setSelectedSourceId(source.id)

    for (const file of files) {
      const documentId = newId('doc')
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || undefined
      const initial: KnowledgeDocument = {
        id: documentId,
        sourceId: source.id,
        name: file.name,
        relativePath,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        kind: classifyDocument(file),
        status: 'procesando',
        modifiedAt: file.lastModified,
        text: '',
        links: [],
      }
      saveKnowledgeDocument(initial)
      setProcessing(documentId)

      try {
        const result = await extractDocumentText(file)
        const extracted = result.text.slice(0, MAX_STORED_TEXT)
        const links = matchDocumentToNodes(extracted, file.name, atlasNodes)
        saveKnowledgeDocument({
          ...initial,
          status: result.partial ? 'parcial' : 'procesado',
          text: extracted,
          processedAt: new Date().toISOString(),
          links,
        })
      } catch (error) {
        saveKnowledgeDocument({
          ...initial,
          status: 'error',
          processedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Error procesando el archivo.',
        })
      }
    }

    setProcessing(null)
  }

  async function connectSharePoint() {
    const url = sharePointUrl.trim()
    if (!url || !sharePointNodeId) return

    setProcessing('sharepoint')
    setSharePointStatus('Autenticando con Microsoft y leyendo la carpeta…')
    try {
      const result = await connectAndSyncSharePointFolder({
        folderUrl: url,
        sourceName: sharePointName,
        nodeId: sharePointNodeId,
        recursive: sharePointRecursive,
        nodes: atlasNodes,
      })
      setSelectedSourceId(result.source.id)
      setSharePointStatus(
        'Conectado. ' + result.processed + ' procesados · ' + result.skipped + ' sin cambios/omitidos · ' + result.failed + ' errores.',
      )
      setSharePointUrl('')
      setSharePointName('')
      setSharePointNodeId('')
    } catch (error) {
      setSharePointStatus(error instanceof Error ? error.message : 'No se pudo conectar SharePoint.')
    } finally {
      setProcessing(null)
    }
  }

  async function syncSource(source: KnowledgeSource) {
    const session = await getMicrosoftSession()
    if (!session) {
      setSharePointStatus('No hay una sesión Microsoft activa. Cerrá la sesión local e ingresá con “Continuar con Microsoft Entra ID”.')
      setShowSharePoint(true)
      return
    }
    setProcessing(source.id)
    setSharePointStatus('Sincronizando ' + source.name + '…')
    try {
      const result = await syncSharePointSource(source, atlasNodes)
      setSharePointStatus(
        source.name + ': ' + result.processed + ' procesados · ' + result.skipped + ' sin cambios/omitidos · ' + result.failed + ' errores.',
      )
    } catch (error) {
      setSharePointStatus(error instanceof Error ? error.message : 'Error sincronizando SharePoint.')
    } finally {
      setProcessing(null)
    }
  }

  function nodeLabel(nodeId: string) {
    return atlasNodes.find((node) => node.id === nodeId)?.label ?? nodeId
  }

  function removeSource(sourceId: string) {
    deleteKnowledgeSource(sourceId)
    if (selectedSourceId === sourceId) setSelectedSourceId('all')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="border-b border-border px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileText size={17} style={{ color: 'var(--chart-3)' }} />
              <h1 className="text-lg font-semibold">Fuentes y documentos</h1>
            </div>
            <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
              Procesa documentación técnica y propone vínculos con las integraciones del Atlas. Las coincidencias de alta confianza se vinculan; las dudosas quedan para revisión.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={filesRef}
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.doc,.docx,.rtf,.txt,.md,.csv,.json,.xml,.yaml,.yml,.log,.png,.jpg,.jpeg,.webp,.gif,.bmp,.xls,.xlsx,.ods"
              onChange={(event) => {
                void processFiles(Array.from(event.target.files ?? []), 'upload')
                event.target.value = ''
              }}
            />
            <input
              ref={folderRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                void processFiles(Array.from(event.target.files ?? []), 'folder')
                event.target.value = ''
              }}
            />
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => filesRef.current?.click()}>
              <Upload size={14} />
              Subir documentos
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => folderRef.current?.click()}>
              <FolderOpen size={14} />
              Subir carpeta
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setShowSharePoint((value) => !value)}>
              <Share2 size={14} />
              SharePoint
            </Button>
          </div>
        </div>

        {showSharePoint && (
          <div className="mt-4 rounded-lg border border-border bg-card p-4">
            <div className="mb-3">
              <p className="text-[12px] font-semibold">Conectar carpeta SharePoint a una integración</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                AEGC no copia los archivos como repositorio. SharePoint sigue siendo el origen; AEGC guarda la referencia, el texto interpretado y los vínculos arquitectónicos.
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="lg:col-span-2 rounded-md border border-border bg-background px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Cuenta Microsoft activa</p>
                <p className="mt-1 text-[12px] font-medium">
                  {microsoftUser ?? 'Sin sesión Microsoft. Ingresá a AEGC con Microsoft Entra ID para usar SharePoint.'}
                </p>
              </div>
              <div>
                <Label className="text-[11px]">Nombre visible</Label>
                <Input
                  value={sharePointName}
                  onChange={(event) => setSharePointName(event.target.value)}
                  placeholder="Documentación KETAN"
                  className="mt-1 h-9 text-[12px]"
                />
              </div>
              <div>
                <Label className="text-[11px]">Relacionar carpeta con</Label>
                <select
                  value={sharePointNodeId}
                  onChange={(event) => setSharePointNodeId(event.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-[12px]"
                >
                  <option value="">Seleccioná un nodo / integración…</option>
                  {atlasNodes.slice().sort((a, b) => a.label.localeCompare(b.label)).map((node) => (
                    <option key={node.id} value={node.id}>{node.label} · {node.kind}</option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-2">
                <Label className="text-[11px]">URL de la carpeta SharePoint</Label>
                <Input
                  value={sharePointUrl}
                  onChange={(event) => setSharePointUrl(event.target.value)}
                  placeholder="https://tenant.sharepoint.com/sites/.../Shared%20Documents/Integraciones/KETAN"
                  className="mt-1 h-9 text-[12px]"
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={sharePointRecursive}
                  onChange={(event) => setSharePointRecursive(event.target.checked)}
                />
                Incluir subcarpetas y mantener la relación heredada con el nodo
              </label>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => void connectSharePoint()}
                disabled={!sharePointUrl.trim() || !sharePointNodeId || !microsoftUser || processing === 'sharepoint'}
              >
                {processing === 'sharepoint' ? <LoaderCircle size={13} className="animate-spin" /> : <Share2 size={13} />}
                Conectar y sincronizar
              </Button>
            </div>

            {sharePointStatus && (
              <p className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-[11px] text-muted-foreground">
                {sharePointStatus}
              </p>
            )}

            <p className="mt-3 text-[10.5px] text-muted-foreground">
              SharePoint usa la misma identidad con la que ingresaste a AEGC. La configuración de Entra pertenece a la aplicación y no se solicita al usuario. No se guarda el access token.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-5 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
          <span><b className="text-foreground">{stats.documents}</b> documentos</span>
          <span><b className="text-foreground">{stats.linked}</b> vínculos confirmados</span>
          <span><b className="text-foreground">{stats.suggestions}</b> sugerencias</span>
          {processing && (
            <span className="flex items-center gap-1.5 text-foreground">
              <LoaderCircle size={12} className="animate-spin" />
              Procesando
            </span>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[270px] shrink-0 border-r border-border bg-sidebar/40 p-3">
          <button
            type="button"
            onClick={() => setSelectedSourceId('all')}
            className={cn(
              'mb-2 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[12px]',
              selectedSourceId === 'all' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-accent',
            )}
          >
            <span>Todas las fuentes</span>
            <span className="font-mono text-[10px]">{documents.length}</span>
          </button>

          <div className="mb-2 px-3 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">Fuentes</div>
          <div className="flex flex-col gap-1">
            {sources.map((source) => {
              const Icon = sourceIcon(source.type)
              const count = documents.filter((doc) => doc.sourceId === source.id).length
              return (
                <div
                  key={source.id}
                  className={cn(
                    'group flex items-center rounded-md',
                    selectedSourceId === source.id ? 'bg-secondary' : 'hover:bg-accent',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedSourceId(source.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
                  >
                    <Icon size={13} className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px]">{source.name}</span>
                      <span className="block truncate font-mono text-[9px] text-muted-foreground">
                        {source.type === 'sharepoint'
                          ? ((source.nodeId ? nodeLabel(source.nodeId) : 'sin nodo') + ' · ' + count + ' docs')
                          : count + ' docs'}
                      </span>
                    </span>
                  </button>
                  {source.type === 'sharepoint' && (
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                      onClick={() => void syncSource(source)}
                      title="Sincronizar carpeta SharePoint"
                      disabled={processing === source.id}
                    >
                      <RefreshCw size={12} className={processing === source.id ? 'animate-spin' : ''} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="mr-1 hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:block"
                    onClick={() => removeSource(source.id)}
                    title="Eliminar fuente y sus documentos"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            })}
            {sources.length === 0 && (
              <p className="px-3 py-4 text-[11px] leading-relaxed text-muted-foreground">
                Todavía no hay fuentes. Subí documentos, una carpeta o registrá una ubicación de SharePoint.
              </p>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-border px-5 py-3">
            <div className="relative max-w-md flex-1">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por archivo o contenido extraído..."
                className="h-8 pl-8 text-[12px]"
              />
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">{visibleDocuments.length} visibles</span>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="p-5">
              <div className="flex flex-col gap-3">
                {visibleDocuments.map((doc) => {
                  const Icon = fileIcon(doc)
                  const linked = doc.links.filter((link) => link.state === 'vinculado')
                  const suggested = doc.links.filter((link) => link.state === 'sugerido')
                  return (
                    <div key={doc.id} className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-md bg-secondary p-2">
                          <Icon size={16} className="text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-[13px] font-medium">{doc.name}</h3>
                            <span className={cn(
                              'rounded-full px-2 py-0.5 font-mono text-[9px] uppercase',
                              doc.status === 'error' ? 'bg-destructive/10 text-destructive' :
                              doc.status === 'procesando' ? 'bg-secondary text-muted-foreground' :
                              doc.status === 'parcial' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' :
                              'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                            )}>
                              {doc.status}
                            </span>
                            <span className="font-mono text-[9px] text-muted-foreground">{formatBytes(doc.size)}</span>
                          </div>
                          {doc.relativePath && (
                            <p className="mt-0.5 truncate font-mono text-[9.5px] text-muted-foreground">{doc.relativePath}</p>
                          )}
                          {doc.error && <p className="mt-2 text-[11px] text-destructive">{doc.error}</p>}
                          {!doc.error && doc.text && (
                            <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                              {doc.text.slice(0, 400)}
                            </p>
                          )}
                        </div>
                      </div>

                      {(linked.length > 0 || suggested.length > 0) && (
                        <div className="mt-4 border-t border-border pt-3">
                          {linked.length > 0 && (
                            <div className="mb-3">
                              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                <Link2 size={11} />
                                Vinculado
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {linked.map((link) => (
                                  <span key={link.nodeId} className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 text-[10.5px]">
                                    <Check size={10} />
                                    {nodeLabel(link.nodeId)}
                                    <span className="font-mono text-[9px] text-muted-foreground">{Math.round(link.confidence * 100)}%</span>
                                    <button
                                      type="button"
                                      onClick={() => updateDocumentLink(doc.id, link.nodeId, 'sugerido')}
                                      title="Quitar vínculo automático"
                                    >
                                      <X size={10} className="text-muted-foreground hover:text-foreground" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {suggested.length > 0 && (
                            <div>
                              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Sugerencias para revisar
                              </div>
                              <div className="flex flex-col gap-1.5">
                                {suggested.slice(0, 6).map((link) => (
                                  <div key={link.nodeId} className="flex items-center gap-2 rounded-md border border-border/70 px-2.5 py-1.5">
                                    <span className="min-w-0 flex-1 truncate text-[11px]">{nodeLabel(link.nodeId)}</span>
                                    <span className="font-mono text-[9px] text-muted-foreground">{Math.round(link.confidence * 100)}%</span>
                                    <span className="hidden max-w-[260px] truncate font-mono text-[9px] text-muted-foreground xl:inline">
                                      {link.evidence.join(' · ')}
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 px-2 text-[10px]"
                                      onClick={() => updateDocumentLink(doc.id, link.nodeId, 'vinculado')}
                                    >
                                      Vincular
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-[10px]"
                                      onClick={() => updateDocumentLink(doc.id, link.nodeId, 'descartado')}
                                    >
                                      Descartar
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {visibleDocuments.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                    <FileText size={28} className="text-muted-foreground" />
                    <div>
                      <p className="text-[13px] font-medium">No hay documentos para mostrar</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Subí archivos o una carpeta. PDF, DOCX e imágenes se procesan y se comparan contra las integraciones conocidas.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
