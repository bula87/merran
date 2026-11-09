/**
 * Finding recipe links on a page, and running a batch import of them one by
 * one. The scan runs inside the page; the batch runs in the background.
 */

/** A recipe link found on a listing page. */
export type FoundLink = {
  url: string
  text: string
}

export type BatchItemState =
  "waiting" | "adding" | "added" | "already" | "failed"

export type BatchItem = FoundLink & {
  state: BatchItemState
  stage: string | null
  name: string | null
  link: string | null
  error: string | null
}

export type BatchStatus = "running" | "done" | "stopped"

export type Batch = {
  id: string
  status: BatchStatus
  total: number
  done: number
  added: number
  already: number
  failed: number
  items: BatchItem[]
}

/** Scans the open page for recipe links. Runs inside the page. */
export function scanRecipeLinks(max = 5000): FoundLink[] {
  const origin = location.origin
  const root =
    document.querySelector("main") ??
    document.querySelector("article") ??
    document.querySelector('[role="main"]') ??
    document.body

  const seen = new Set<string>()
  const found: FoundLink[] = []
  const recipePath =
    /\/(recipe|recipes|przepis|przepisy|rezept|recette|ricetta|receta)\b/i

  for (const node of Array.from(
    root.querySelectorAll<HTMLAnchorElement>("a[href]")
  )) {
    const raw = node.getAttribute("href")?.trim()
    if (!raw || raw.startsWith("#") || raw.startsWith("javascript:")) continue
    let url: URL
    try {
      url = new URL(raw, location.href)
    } catch {
      continue
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue
    url.hash = ""
    const href = url.toString()
    if (seen.has(href)) continue
    seen.add(href)

    const text = (node.innerText || node.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
    if (text.length < 2 || text.length > 200) continue

    const same = url.origin === origin
    const recipeLike = recipePath.test(url.pathname)
    // On a listing page, recipe links often point to another site (e.g. lidlomix ->
    // monsieur-cuisine.com/recipe/...), or to recipe paths on the same site.
    if (!recipeLike && same) continue
    // Skip obvious non-content links.
    if (
      /\/(login|signin|sign-in|register|account|cart|basket|search|category|tag|author|page\/\d)\b/i.test(
        url.pathname
      ) &&
      !recipeLike
    ) {
      continue
    }

    found.push({ url: href, text: text.slice(0, 160) })
  }

  // If recipe-path heuristics found nothing, fall back to external links with
  // meaningful labels (a broad listing page).
  if (found.length === 0) {
    seen.clear()
    for (const node of Array.from(
      root.querySelectorAll<HTMLAnchorElement>("a[href]")
    )) {
      const raw = node.getAttribute("href")?.trim()
      if (!raw) continue
      let url: URL
      try {
        url = new URL(raw, location.href)
      } catch {
        continue
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") continue
      if (url.origin === origin) continue
      url.hash = ""
      const href = url.toString()
      if (seen.has(href)) continue
      seen.add(href)
      const text = (node.innerText || node.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
      if (text.length < 4 || text.length > 200) continue
      found.push({ url: href, text: text.slice(0, 160) })
    }
  }

  // Recipe-path links anywhere on the page (some listings render outside main).
  if (found.length < max) {
    for (const node of Array.from(
      document.querySelectorAll<HTMLAnchorElement>("a[href]")
    )) {
      if (found.length >= max) break
      const raw = node.getAttribute("href")?.trim()
      if (!raw) continue
      let url: URL
      try {
        url = new URL(raw, location.href)
      } catch {
        continue
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") continue
      if (!recipePath.test(url.pathname)) continue
      url.hash = ""
      const href = url.toString()
      if (seen.has(href)) continue
      seen.add(href)
      const text = (node.innerText || node.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
      if (text.length < 2 || text.length > 200) continue
      found.push({ url: href, text: text.slice(0, 160) })
    }
  }

  return found.slice(0, Math.max(1, max))
}

/** Origins that need host permission to read imported pages. */
export function originsForLinks(urls: string[]) {
  const origins = new Set<string>()
  for (const url of urls) {
    try {
      origins.add(`${new URL(url).origin}/*`)
    } catch {
      // skip
    }
  }
  return [...origins]
}

export function emptyBatch(items: FoundLink[], id: string): Batch {
  return {
    id,
    status: "running",
    total: items.length,
    done: 0,
    added: 0,
    already: 0,
    failed: 0,
    items: items.map((item) => ({
      ...item,
      state: "waiting",
      stage: null,
      name: null,
      link: null,
      error: null,
    })),
  }
}
