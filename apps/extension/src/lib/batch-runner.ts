import { importRead, readTab } from "./actions"
import { emptyBatch, type Batch, type FoundLink } from "./batch"

const STORAGE_KEY = "batch"
const TAB_TIMEOUT_MS = 45_000
const DEFAULT_IMPORT_TIMEOUT_SEC = 60

export type BatchOptions = {
  importTimeoutSec?: number
}

type ImportResult = Awaited<ReturnType<typeof importRead>>

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

let stopId: string | null = null

async function save(batch: Batch) {
  await browser.storage.session.set({ [STORAGE_KEY]: batch })
}

export async function getBatch(): Promise<Batch | null> {
  const value = (await browser.storage.session.get(STORAGE_KEY))[STORAGE_KEY]
  return (value as Batch | undefined) ?? null
}

export async function clearBatch() {
  await browser.storage.session.remove(STORAGE_KEY)
}

export function stopBatch(id?: string) {
  stopId = id ?? "stop"
}

class BatchStopped extends Error {
  constructor() {
    super("Stopped")
    this.name = "BatchStopped"
  }
}

function waitForComplete(tabId: number, batchId: string) {
  return new Promise<void>((resolve, reject) => {
    let settle: ReturnType<typeof setTimeout> | null = null

    const finish = (error?: Error) => {
      if (settle) clearTimeout(settle)
      clearTimeout(timer)
      clearInterval(tick)
      browser.tabs.onUpdated.removeListener(onUpdated)
      browser.tabs.onRemoved.removeListener(onRemoved)
      if (error) reject(error)
      else resolve()
    }

    const done = () => {
      // Give client-rendered pages a moment to settle.
      settle = setTimeout(() => finish(), 1200)
    }

    const timer = setTimeout(() => {
      finish(new Error("The page took too long to load."))
    }, TAB_TIMEOUT_MS)

    // Stop can be requested while waiting for a slow page.
    const tick = setInterval(() => {
      if (stopId === batchId || stopId === "stop") finish(new BatchStopped())
    }, 250)

    const onUpdated = (id: number, change: { status?: string }) => {
      if (id !== tabId || change.status !== "complete") return
      if (!settle) done()
    }
    const onRemoved = (id: number) => {
      if (id !== tabId) return
      finish(new Error("The tab was closed."))
    }

    browser.tabs.onUpdated.addListener(onUpdated)
    browser.tabs.onRemoved.addListener(onRemoved)

    void browser.tabs.get(tabId).then(
      (tab) => {
        if (tab.status === "complete" && !settle) done()
      },
      () => {}
    )
  })
}

function isStopped(batchId: string) {
  return stopId === batchId || stopId === "stop"
}

export async function runBatch(links: FoundLink[], options: BatchOptions = {}) {
  const importTimeoutSec = Math.min(
    600,
    Math.max(15, options.importTimeoutSec ?? DEFAULT_IMPORT_TIMEOUT_SEC)
  )
  const importTimeoutMs = importTimeoutSec * 1000
  const id = crypto.randomUUID()
  stopId = null
  const batch = emptyBatch(links, id)
  await save(batch)

  for (const item of batch.items) {
    if (isStopped(id)) {
      batch.status = "stopped"
      break
    }
    item.state = "adding"
    item.stage = "opening"
    await save(batch)

    let tabId: number | undefined
    try {
      const tab = await browser.tabs.create({ url: item.url, active: false })
      tabId = tab.id
      if (tabId === undefined) throw new Error("Couldn't open the page.")
      item.stage = "loading"
      await save(batch)
      await waitForComplete(tabId, id)
      if (isStopped(id)) throw new BatchStopped()
      item.stage = "reading"
      await save(batch)
      const page = await readTab(tabId)
      item.stage = `importing (${importTimeoutSec}s)`
      await save(batch)
      let left = importTimeoutSec
      const countdown = setInterval(() => {
        left = Math.max(0, left - 1)
        if (item.state === "adding" && item.stage?.startsWith("importing (")) {
          item.stage = `importing (${left}s)`
        }
        void save(batch)
      }, 1000)
      try {
        let imported: ImportResult
        try {
          imported = await withTimeout(importRead(page), importTimeoutMs)
        } catch (error) {
          if ((error as Error).message !== "timeout") throw error
          item.stage = "checking…"
          await save(batch)
          await new Promise((resolve) => setTimeout(resolve, 5000))
          const retry = await importRead(page)
          if (retry.result.duplicate) {
            imported = {
              ...retry,
              result: { ...retry.result, duplicate: false },
            }
          } else {
            throw new Error("Import timed out and the recipe was not added.")
          }
        }
        const { result, link } = imported
        item.state = result.duplicate ? "already" : "added"
        item.stage = null
        item.name = result.recipe.name
        item.link = link
        if (result.duplicate) batch.already++
        else batch.added++
      } finally {
        clearInterval(countdown)
      }
    } catch (error) {
      if (error instanceof BatchStopped || isStopped(id)) {
        batch.status = "stopped"
        item.state = "waiting"
        item.stage = null
      } else {
        item.state = "failed"
        item.stage = null
        item.error = (error as Error).message
        batch.failed++
      }
    } finally {
      if (tabId !== undefined) {
        void browser.tabs.remove(tabId).catch(() => {
          // already closed
        })
      }
    }

    if (batch.status !== "stopped") batch.done++
    await save(batch)
    if (batch.status === "stopped") break
  }

  if (batch.status === "running") batch.status = "done"
  await save(batch)
  return batch
}
