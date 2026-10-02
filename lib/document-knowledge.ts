'use client'

import type { AtlasNode } from './atlas-types'

export type DocumentKind = 'pdf' | 'word' | 'image' | 'text' | 'spreadsheet' | 'other'
export type DocumentSourceType = 'upload' | 'folder' | 'sharepoint'
export type ProcessingStatus = 'pendiente' | 'procesando' | 'procesado' | 'error' | 'parcial'

export interface KnowledgeSource {
  id: string
  type: DocumentSourceType
  name: string
  location?: string
  createdAt: string
  lastSyncAt?: string
  connectionStatus: 'local' | 'pendiente_auth' | 'conectado'
}

export interface DocumentLink {
  nodeId: string
  confidence: number
  evidence: string[]
  state: 'sugerido' | 'vinculado' | 'descartado'
}

export interface KnowledgeDocument {
  id: string
  sourceId: string
  name: string
  relativePath?: string
  mimeType: string
  size: number
  kind: DocumentKind
  status: ProcessingStatus
  processedAt?: string
  modifiedAt?: number
  text: string
  error?: string
  links: DocumentLink[]
}

const SOURCES_KEY = 'aegc:knowledge-sources:v1'
const DOCUMENTS_KEY = 'aegc:knowledge-documents:v1'
export const KNOWLEDGE_EVENT = 'aegc:knowledge-changed'

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
  window.dispatchEvent(new CustomEvent(KNOWLEDGE_EVENT))
}

export function loadKnowledgeSources() {
  return readJson<KnowledgeSource[]>(SOURCES_KEY, [])
}

export function saveKnowledgeSource(source: KnowledgeSource) {
  const current = loadKnowledgeSources()
  writeJson(SOURCES_KEY, [...current.filter((s) => s.id !== source.id), source])
}

export function loadKnowledgeDocuments() {
  return readJson<KnowledgeDocument[]>(DOCUMENTS_KEY, [])
}

export function saveKnowledgeDocument(document: KnowledgeDocument) {
  const current = loadKnowledgeDocuments()
  writeJson(DOCUMENTS_KEY, [...current.filter((d) => d.id !== document.id), document])
}

export function updateDocumentLink(documentId: string, nodeId: string, state: DocumentLink['state']) {
  const current = loadKnowledgeDocuments()
  writeJson(DOCUMENTS_KEY, current.map((doc) => doc.id !== documentId ? doc : {
    ...doc,
    links: doc.links.map((link) => link.nodeId === nodeId ? { ...link, state } : link),
  }))
}

export function deleteKnowledgeSource(sourceId: string) {
  writeJson(SOURCES_KEY, loadKnowledgeSources().filter((s) => s.id !== sourceId))
  writeJson(DOCUMENTS_KEY, loadKnowledgeDocuments().filter((d) => d.sourceId !== sourceId))
}

export function classifyDocument(file: File): DocumentKind {
  const name = file.name.toLowerCase()
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(name)) return 'image'
  if (/\.(docx?|rtf)$/i.test(name)) return 'word'
  if (/\.(xlsx?|ods)$/i.test(name)) return 'spreadsheet'
  if (file.type.startsWith('text/') || /\.(txt|md|csv|json|xml|ya?ml|log)$/i.test(name)) return 'text'
  return 'other'
}

function loadScript(src: string, marker: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Sólo disponible en navegador.'))
  const w = window as unknown as Record<string, unknown>
  if (w[marker]) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const selector = 'script[data-aegc-lib="' + marker + '"]'
    const existing = document.querySelector<HTMLScriptElement>(selector)
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar ' + marker + '.')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.dataset.aegcLib = marker
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('No se pudo cargar ' + marker + '.'))
    document.head.appendChild(script)
  })
}

async function extractPdf(file: File): Promise<string> {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib')
  const w = window as unknown as { pdfjsLib?: {
    GlobalWorkerOptions?: { workerSrc: string }
    getDocument: (input: { data: ArrayBuffer }) => { promise: Promise<{
      numPages: number
      getPage: (page: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }>
    }> }
  } }
  if (!w.pdfjsLib) throw new Error('PDF.js no quedó disponible.')
  if (w.pdfjsLib.GlobalWorkerOptions) {
    w.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
  }
  const pdf = await w.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  const chunks: string[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const text = await page.getTextContent()
    chunks.push(text.items.map((item) => item.str ?? '').join(' '))
  }
  return chunks.join('\n\n')
}

async function extractDocx(file: File): Promise<string> {
  if (file.name.toLowerCase().endsWith('.doc')) {
    throw new Error('El formato .doc antiguo no se procesa en navegador. Guardalo como .docx o PDF.')
  }
  await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.9.1/mammoth.browser.min.js', 'mammoth')
  const w = window as unknown as { mammoth?: { extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> } }
  if (!w.mammoth) throw new Error('Mammoth no quedó disponible.')
  const result = await w.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return result.value
}

async function extractSpreadsheet(file: File): Promise<string> {
  await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', 'XLSX')
  const w = window as unknown as {
    XLSX?: {
      read: (data: ArrayBuffer, options: { type: string }) => { SheetNames: string[]; Sheets: Record<string, unknown> }
      utils: { sheet_to_csv: (sheet: unknown) => string }
    }
  }
  if (!w.XLSX) throw new Error('SheetJS no quedó disponible.')
  const workbook = w.XLSX.read(await file.arrayBuffer(), { type: 'array' })
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name]
    return '### ' + name + '\n' + w.XLSX!.utils.sheet_to_csv(sheet)
  }).join('\n\n')
}

async function extractImage(file: File): Promise<string> {
  await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js', 'Tesseract')
  const w = window as unknown as {
    Tesseract?: { recognize: (image: File, lang: string) => Promise<{ data: { text: string } }> }
  }
  if (!w.Tesseract) throw new Error('Tesseract no quedó disponible.')
  const result = await w.Tesseract.recognize(file, 'spa+eng')
  return result.data.text
}

export async function extractDocumentText(file: File): Promise<{ text: string; partial?: boolean }> {
  const kind = classifyDocument(file)
  if (kind === 'pdf') return { text: await extractPdf(file) }
  if (kind === 'word') return { text: await extractDocx(file) }
  if (kind === 'image') return { text: await extractImage(file) }
  if (kind === 'spreadsheet') return { text: await extractSpreadsheet(file) }
  if (kind === 'text') return { text: await file.text() }

  return { text: file.name + '\n' + file.type, partial: true }
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9./:_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function nodeTerms(node: AtlasNode): string[] {
  const terms = new Set<string>()
  const add = (value?: string) => {
    const normalized = normalize(value ?? '')
    if (normalized.length >= 3) terms.add(normalized)
  }

  add(node.label)
  add(node.id)
  node.tech?.forEach(add)
  node.artifacts?.forEach((artifact) => add(artifact.name))
  node.endpoints?.forEach((endpoint) => {
    add(endpoint.path)
    add(endpoint.target)
    endpoint.envUrls?.forEach((url) => add(url.baseUrl))
  })
  node.environments?.forEach((environment) => {
    add(environment.server)
    add(environment.url)
  })

  const aliases: Record<string, string[]> = {
    'sap-s4': ['sap s/4hana', 'sap s4hana', 's/4hana', 's4 hana', 's4hana'],
    cpi: ['sap cpi', 'cloud integration', 'integration suite', 'sap integration suite'],
    'gw-sap4hana': ['gw.sap4hana', 'gw.saps4hana', 'gateway sap4hana', 'gateway s4'],
    ketan: ['ketan'],
    'api-ketan': ['api.ketan', 'cepas.ketan', '/ketan/'],
    gcc: ['gcc', 'gestion comercial cepas'],
    dmp: ['datos maestros personal', 'dmp'],
  }
  aliases[node.id]?.forEach(add)
  return [...terms]
}

function occurrences(haystack: string, needle: string): number {
  if (!needle || needle.length < 3) return 0
  let count = 0
  let index = haystack.indexOf(needle)
  while (index >= 0) {
    count += 1
    index = haystack.indexOf(needle, index + needle.length)
  }
  return count
}

export function matchDocumentToNodes(text: string, fileName: string, nodes: AtlasNode[]): DocumentLink[] {
  const haystack = normalize(fileName + '\n' + text)
  const links: DocumentLink[] = []

  for (const node of nodes) {
    const evidence: string[] = []
    let strongest = 0
    let totalHits = 0

    for (const term of nodeTerms(node)) {
      const hits = occurrences(haystack, term)
      if (!hits) continue
      totalHits += hits
      strongest = Math.max(strongest, term.length)
      if (evidence.length < 4) evidence.push(term)
    }

    if (!totalHits) continue

    const exactLabel = occurrences(haystack, normalize(node.label)) > 0
    const exactId = normalize(node.id).length >= 4 && occurrences(haystack, normalize(node.id)) > 0
    let confidence = 0.5
    if (exactLabel) confidence += 0.28
    if (exactId) confidence += 0.12
    if (strongest >= 12) confidence += 0.08
    if (totalHits >= 3) confidence += 0.06
    confidence = Math.min(0.99, confidence)

    links.push({
      nodeId: node.id,
      confidence,
      evidence,
      state: confidence >= 0.9 ? 'vinculado' : 'sugerido',
    })
  }

  return links.sort((a, b) => b.confidence - a.confidence).slice(0, 12)
}

export function newId(prefix: string) {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
}
