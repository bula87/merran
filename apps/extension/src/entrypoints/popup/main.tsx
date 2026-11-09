import { StrictMode, useEffect, useMemo, useState, type FormEvent } from "react"
import { createRoot } from "react-dom/client"

import { isVideoPage, openListPanel, readTab, type Added } from "@/lib/actions"
import {
  originsForLinks,
  scanRecipeLinks,
  type Batch,
  type FoundLink,
} from "@/lib/batch"
import { HouseholdSwitch } from "@/lib/households"
import {
  originOf,
  removeConnection,
  useConnections,
  type Connection,
} from "@/lib/merran"
import type { PageRead } from "@/lib/page"
import "@/lib/ui.css"

// The toolbar button's popup: connecting to a Merran, then adding the page
// open in this tab, and opening the shopping list beside it.

function Popup() {
  const connections = useConnections()
  if (!connections) return null
  return connections.current ? (
    <Connected connection={connections.current} all={connections.all} />
  ) : (
    <Connect />
  )
}

function Brand() {
  return (
    <div className="brand">
      <img src="/icons/48.png" alt="" />
      <h1>Merran</h1>
    </div>
  )
}

/** Connecting: the address of the person's Merran, then Merran asks them. */
function Connect() {
  const [address, setAddress] = useState("")
  const [error, setError] = useState<string>()

  async function connect(event: FormEvent) {
    event.preventDefault()
    setError(undefined)
    let origin: string
    try {
      origin = originOf(address)
    } catch {
      setError("That doesn't look like an address.")
      return
    }
    // The browser asks the person to let the extension reach their Merran.
    const granted = await browser.permissions.request({
      origins: [`${origin}/*`],
    })
    if (!granted) {
      setError("The extension needs to reach your Merran to connect to it.")
      return
    }
    await browser.runtime.sendMessage({ type: "connect", origin })
    window.close()
  }

  return (
    <form className="popup stack" onSubmit={connect}>
      <Brand />
      <p className="muted">
        Connect to your Merran to add recipes from any page, and keep the
        shopping list beside you while you shop.
      </p>
      <input
        type="text"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        placeholder="merran.example.com"
        aria-label="Your Merran's address"
        autoFocus
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={!address.trim()}>
        Connect
      </button>
      <p className="muted small">
        Your browser asks to let the extension reach that address, then Merran
        opens to ask you.
      </p>
    </form>
  )
}

type PageState =
  | { step: "reading" }
  | { step: "unreadable" }
  | { step: "ready"; page: PageRead }
  | { step: "adding"; page: PageRead }
  | { step: "added"; page: PageRead; message: string; link: string }
  | { step: "failed"; page: PageRead; message: string }

/** Connected: the page in this tab, and the list. */
function Connected({
  connection,
  all,
}: {
  connection: Connection
  all: Connection[]
}) {
  const [state, setState] = useState<PageState>({ step: "reading" })
  const [windowId, setWindowId] = useState<number>()
  const [tabId, setTabId] = useState<number>()

  useEffect(() => {
    void (async () => {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      })
      setWindowId(tab?.windowId)
      setTabId(tab?.id)
      if (tab?.id === undefined || !/^https?:/.test(tab.url ?? "")) {
        setState({ step: "unreadable" })
        return
      }
      try {
        setState({ step: "ready", page: await readTab(tab.id) })
      } catch {
        setState({ step: "unreadable" })
      }
    })()
  }, [])

  /** Added by the background, which carries on if this closes. */
  async function add(page: PageRead) {
    if (tabId === undefined) return
    setState({ step: "adding", page })
    const added = (await browser.runtime.sendMessage({
      type: "add-tab",
      tabId,
    })) as Added | undefined
    if (added?.ok) {
      setState({
        step: "added",
        page,
        message: added.message,
        link: added.link,
      })
    } else {
      setState({
        step: "failed",
        page,
        message: added?.message ?? "That didn't work. Try again.",
      })
    }
  }

  async function showList() {
    await openListPanel(windowId)
    window.close()
  }

  /** Connects another household: Merran asks which. */
  async function addHousehold() {
    await browser.runtime.sendMessage({
      type: "connect",
      origin: connection.origin,
    })
    window.close()
  }

  return (
    <div className="popup stack">
      <div className="row between">
        <Brand />
        <HouseholdSwitch current={connection} all={all} />
      </div>

      <section className="card">
        {state.step === "reading" ? (
          <p className="muted">Reading this page…</p>
        ) : state.step === "unreadable" ? (
          <p className="muted">
            Open a recipe's page to add it to your recipes.
          </p>
        ) : (
          <>
            <p className="title">{state.page.title || state.page.url}</p>
            {state.step === "ready" && (
              <>
                <p className="muted small">
                  {isVideoPage(state.page.url)
                    ? "A video: Merran watches it and writes its recipe up, if your household has AI."
                    : state.page.hasRecipe
                      ? "There's a recipe on this page."
                      : "No recipe data here: Merran's AI reads the page, if your household has AI."}
                </p>
                <button type="button" onClick={() => void add(state.page)}>
                  Add this recipe
                </button>
              </>
            )}
            {state.step === "adding" && (
              <>
                <button type="button" disabled>
                  {isVideoPage(state.page.url)
                    ? "Watching the video…"
                    : "Adding…"}
                </button>
                <p className="muted small">
                  You can close this: Merran says on the page when it's done.
                </p>
              </>
            )}
            {state.step === "added" && (
              <>
                <p>{state.message}</p>
                <a href={state.link} target="_blank" rel="noreferrer">
                  Open it in Merran
                </a>
              </>
            )}
            {state.step === "failed" && (
              <>
                <p className="error">{state.message}</p>
                <button
                  type="button"
                  className="outline"
                  onClick={() => void add(state.page)}
                >
                  Try again
                </button>
              </>
            )}
          </>
        )}
      </section>

      {tabId !== undefined && <BatchImport tabId={tabId} />}

      <button type="button" className="outline" onClick={() => void showList()}>
        Shopping list
      </button>

      <div className="row between">
        <a
          href={connection.origin}
          target="_blank"
          rel="noreferrer"
          className="small"
        >
          {new URL(connection.origin).host}
        </a>
        <span className="row">
          <button
            type="button"
            className="ghost small"
            onClick={() => void addHousehold()}
          >
            Add a household
          </button>
          <button
            type="button"
            className="ghost small"
            onClick={() => void removeConnection(connection.keyId)}
            title="Its key stays in Merran until you take it away in Settings, You, API keys."
          >
            Disconnect
          </button>
        </span>
      </div>
    </div>
  )
}

function BatchImport({ tabId }: { tabId: number }) {
  const [open, setOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [found, setFound] = useState<FoundLink[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState("")
  const [batch, setBatch] = useState<Batch | null>(null)
  const [error, setError] = useState<string>()

  useEffect(() => {
    void (async () => {
      const current = (await browser.runtime.sendMessage({
        type: "batch-status",
      })) as Batch | null
      if (current) {
        setBatch(current)
        setOpen(true)
      }
    })()
    const changed = (
      changes: Record<string, { newValue?: unknown }>,
      area: string
    ) => {
      if (area !== "session" || !("batch" in changes)) return
      setBatch((changes.batch.newValue as Batch | undefined) ?? null)
    }
    browser.storage.onChanged.addListener(changed)
    return () => browser.storage.onChanged.removeListener(changed)
  }, [])

  async function scan() {
    setScanning(true)
    setError(undefined)
    setFound(null)
    try {
      const [read] = await browser.scripting.executeScript({
        target: { tabId },
        func: scanRecipeLinks,
      })
      const links = (read?.result ?? []) as FoundLink[]
      setFound(links)
      setPicked(new Set(links.map((link) => link.url)))
      setOpen(true)
    } catch (e) {
      setError((e as Error).message || "Couldn't scan this page.")
    } finally {
      setScanning(false)
    }
  }

  const shown = useMemo(() => {
    const links = found ?? []
    const q = filter.trim().toLowerCase()
    if (!q) return links
    return links.filter(
      (link) =>
        link.text.toLowerCase().includes(q) ||
        link.url.toLowerCase().includes(q)
    )
  }, [found, filter])

  async function start() {
    const links = (found ?? []).filter((link) => picked.has(link.url))
    if (links.length === 0) return
    setError(undefined)
    const origins = originsForLinks(links.map((link) => link.url))
    const granted = await browser.permissions.request({ origins })
    if (!granted) {
      setError(
        "The extension needs permission to open and read those recipe pages."
      )
      return
    }
    await browser.runtime.sendMessage({ type: "batch-start", links })
  }

  async function stop() {
    if (batch)
      await browser.runtime.sendMessage({ type: "batch-stop", id: batch.id })
  }

  async function clear() {
    await browser.runtime.sendMessage({ type: "batch-clear" })
    setBatch(null)
  }

  const running = batch?.status === "running"
  const selected = (found ?? []).filter((link) => picked.has(link.url)).length

  return (
    <section className="card">
      <div className="row between">
        <h2>Batch import</h2>
        <button
          type="button"
          className="ghost small"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && (
        <div className="stack">
          <p className="muted small">
            Scan this page for recipe links, then import them one by one. Each
            page is opened in the background and added to the current household.
          </p>

          {batch ? (
            <>
              <p className="title">
                {batch.status === "running"
                  ? `Importing ${Math.min(batch.done + 1, batch.total)} of ${batch.total}…`
                  : batch.status === "stopped"
                    ? `Stopped: ${batch.done} of ${batch.total} processed`
                    : `Done: ${batch.done} of ${batch.total} processed`}
              </p>
              <p className="muted small">
                Added {batch.added}, already had {batch.already}, failed{" "}
                {batch.failed}.
              </p>
              <div className="row">
                {running ? (
                  <button
                    type="button"
                    className="outline"
                    onClick={() => void stop()}
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    className="outline"
                    onClick={() => void clear()}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div
                style={{
                  maxHeight: 180,
                  overflow: "auto",
                  display: "grid",
                  gap: 4,
                }}
              >
                {batch.items.map((item) => (
                  <div
                    key={item.url}
                    className="small"
                    style={{ overflowWrap: "anywhere" }}
                  >
                    <span
                      style={{
                        color:
                          item.state === "added"
                            ? "var(--primary)"
                            : item.state === "failed"
                              ? "var(--destructive)"
                              : "var(--muted-foreground)",
                      }}
                    >
                      {item.state === "adding"
                        ? "…"
                        : item.state === "added"
                          ? "✓"
                          : item.state === "already"
                            ? "="
                            : item.state === "failed"
                              ? "✗"
                              : "·"}
                    </span>{" "}
                    {item.name || item.text}
                    {item.state === "adding" && item.stage ? (
                      <span className="muted"> ({item.stage})</span>
                    ) : null}
                    {item.error ? (
                      <span className="error"> — {item.error}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className="outline"
                onClick={() => void scan()}
                disabled={scanning}
              >
                {scanning ? "Scanning…" : "Scan this page for recipe links"}
              </button>
              {found && (
                <>
                  <p className="small muted">
                    Found {found.length} link{found.length === 1 ? "" : "s"}.
                    Select the recipes to import.
                  </p>
                  {found.length > 0 && (
                    <>
                      <input
                        type="text"
                        value={filter}
                        onChange={(event) => setFilter(event.target.value)}
                        placeholder="Filter links…"
                        aria-label="Filter links"
                      />
                      <div className="row">
                        <button
                          type="button"
                          className="ghost small"
                          onClick={() =>
                            setPicked(new Set(found.map((l) => l.url)))
                          }
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          className="ghost small"
                          onClick={() => setPicked(new Set())}
                        >
                          None
                        </button>
                        <span
                          className="small muted grow"
                          style={{ textAlign: "right" }}
                        >
                          {selected} selected
                        </span>
                      </div>
                      <div
                        style={{
                          maxHeight: 180,
                          overflow: "auto",
                          display: "grid",
                          gap: 2,
                        }}
                      >
                        {shown.map((link) => (
                          <label
                            key={link.url}
                            className="small"
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "flex-start",
                              cursor: "pointer",
                              padding: "2px 0",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={picked.has(link.url)}
                              onChange={(event) => {
                                setPicked((current) => {
                                  const next = new Set(current)
                                  if (event.target.checked) next.add(link.url)
                                  else next.delete(link.url)
                                  return next
                                })
                              }}
                            />
                            <span style={{ overflowWrap: "anywhere" }}>
                              {link.text}
                              <span
                                className="muted"
                                style={{ display: "block" }}
                              >
                                {new URL(link.url).host}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => void start()}
                        disabled={selected === 0}
                      >
                        Import {selected} selected
                      </button>
                      <p className="muted small">
                        You can close this popup; the batch continues in the
                        background. Large batches may take a while (one page at
                        a time).
                      </p>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {error && <p className="error small">{error}</p>}
        </div>
      )}
    </section>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Popup />
  </StrictMode>
)
