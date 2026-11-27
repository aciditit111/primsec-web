// PrimSec: экран трансляции на телефоне — как у приложений удалённого
// доступа, а не как у сайта.
//
//  * ConnectOverlay — заставка «Подключаюсь…» с этапами по-человечески;
//    журнал (английские строки движка) — только по «Подробнее».
//  * FloatingButton — круглая кнопка PrimSec поверх картинки: тянется
//    пальцем, прилипает к краю, по тапу — меню (клавиатура, режим пальца,
//    геймпад, экран, клавиши, качество, отключиться). Вверху меню — путь
//    связи и задержка.
//  * ViewZoom — «Целиком» / «Во весь экран» / «Крупно»: картинка
//    масштабируется, при увеличении следует за курсором.

import { InfoEvent } from "./index"

const LOGO = "resources/primsec-192.png"

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
}

function stopAll(e: HTMLElement) {
    for (const ev of ["touchstart", "touchmove", "touchend", "touchcancel", "mousedown", "mouseup", "mousemove",
        "click", "contextmenu", "wheel", "keydown", "keyup", "pointerdown", "pointermove", "pointerup"]) {
        e.addEventListener(ev, x => x.stopPropagation(), { passive: false })
    }
}

export function lsGet(key: string): string | null {
    try { return localStorage.getItem(key) } catch { return null }
}
export function lsSet(key: string, value: string) {
    try { localStorage.setItem(key, value) } catch { /* приватный режим */ }
}

// ---------------------------------------------------------------- заставка

export class ConnectOverlay {
    private root = el("div", "ps-connect")
    private title = el("div", "ps-connect-title", "Подключаюсь")
    private step = el("div", "ps-connect-step", "Связываюсь с компьютером…")
    private spinner = el("div", "ps-spinner")
    private actions = el("div", "ps-connect-actions")
    private details = el("pre", "ps-connect-log")
    private log: string[] = []
    private failed = false
    private done = false

    constructor(pcName: string) {
        const logo = el("img", "ps-connect-logo") as HTMLImageElement
        logo.src = LOGO
        logo.alt = ""
        this.title.textContent = pcName ? "Подключаюсь к " + pcName : "Подключаюсь"
        this.root.append(logo, this.title, this.step, this.spinner, this.actions, this.details)
        this.details.hidden = true
        stopAll(this.root)
    }

    getElement(): HTMLElement { return this.root }

    onInfo(event: InfoEvent) {
        const d = event.detail
        if (d.type == "connectionComplete") {
            this.done = true
            this.root.classList.add("ps-hide")
            window.setTimeout(() => { this.root.hidden = true }, 350)
            return
        }
        if (d.type != "addDebugLine") return
        const line = (d.line || "").trim()
        if (line) this.log.push(line)
        if (this.done || this.failed) return

        const l = line.toLowerCase()
        if (l.includes("web socket")) this.step.textContent = "Прямая связь не вышла — подключаюсь через сервер…"
        else if (l.includes("candidate") || l.includes("ice")) this.step.textContent = "Ищу самый быстрый путь…"
        else if (l.includes("transport") || l.includes("offer") || l.includes("answer")) this.step.textContent = "Договариваюсь с компьютером…"
        else if (l.includes("video") || l.includes("stream")) this.step.textContent = "Почти готово…"

        const t = d.additional?.type
        if (t == "fatal" || t == "fatalDescription") {
            this.fail(line)
        }
    }

    reconnecting() {
        this.root.hidden = false
        this.root.classList.remove("ps-hide")
        this.done = false
        this.spinner.hidden = false
        this.actions.innerHTML = ""
        this.title.textContent = "Связь прервалась"
        this.step.textContent = "Переподключаюсь…"
    }

    ended(message: string) {
        this.fail(message)
        this.title.textContent = "Трансляция завершена"
    }

    setPcName(name: string) {
        if (!this.failed && name) this.title.textContent = "Подключаюсь к " + name
    }

    fail(message: string) {
        this.failed = true
        this.root.hidden = false
        this.root.classList.remove("ps-hide")
        this.spinner.hidden = true
        this.title.textContent = "Не получилось подключиться"
        // Свои русские сообщения показываем как есть, английские — заменяем.
        this.step.textContent = /[а-яё]/i.test(message)
            ? message
            : "Связь с компьютером не установилась. Проверь интернет и попробуй ещё раз."
        this.actions.innerHTML = ""
        const retry = el("button", "ps-btn ps-btn-primary", "Повторить")
        retry.addEventListener("click", () => location.reload())
        const back = el("button", "ps-btn", "К компьютерам")
        back.addEventListener("click", () => { location.href = "/" })
        const more = el("button", "ps-btn ps-btn-ghost", "Подробнее")
        more.addEventListener("click", () => {
            this.details.hidden = !this.details.hidden
            this.details.textContent = this.log.join("\n")
        })
        this.actions.append(retry, back, more)
    }
}

// ---------------------------------------------------------------- масштаб

export type ViewMode = "fit" | "fill" | "zoom"

export class ViewZoom {
    private mode: ViewMode = "fit"
    private panX = 0
    private panY = 0
    private getRect: () => DOMRect
    private scale = 1
    private getCursor: () => { visible: boolean, x: number, y: number }

    constructor(getRect: () => DOMRect, getCursor: () => { visible: boolean, x: number, y: number }) {
        this.getRect = getRect
        this.getCursor = getCursor
        const saved = lsGet("psView") as ViewMode | null
        if (saved == "fit" || saved == "fill" || saved == "zoom") this.mode = saved
    }

    getMode(): ViewMode { return this.mode }

    setMode(mode: ViewMode) {
        this.mode = mode
        this.panX = 0
        this.panY = 0
        lsSet("psView", mode)
        this.apply()
    }

    // Каждый кадр: масштаб и сдвиг, чтобы курсор оставался на экране.
    apply() {
        const rect = this.getRect()
        const vw = window.innerWidth
        const vh = window.innerHeight
        // Размер картинки без масштаба: видимый прямоугольник / текущий масштаб.
        const w = rect.width / this.scale
        const h = rect.height / this.scale
        if (w <= 0 || h <= 0) return
        let scale = 1
        if (this.mode == "fill") scale = Math.max(vw / w, vh / h)
        else if (this.mode == "zoom") scale = Math.max(vw / w, vh / h) * 1.6
        if (scale < 1.001) {
            this.panX = 0
            this.panY = 0
            this.setVars(1, 0, 0)
            return
        }
        const sw = w * scale
        const sh = h * scale
        const maxX = Math.max(0, (sw - vw) / 2)
        const maxY = Math.max(0, (sh - vh) / 2)

        const c = this.getCursor()
        if (c.visible) {
            // Где курсор окажется при текущем сдвиге.
            const cx = vw / 2 + this.panX + (c.x - 0.5) * sw
            const cy = vh / 2 + this.panY + (c.y - 0.5) * sh
            const mx = Math.min(120, vw * 0.18)
            const my = Math.min(90, vh * 0.18)
            if (cx < mx) this.panX += mx - cx
            if (cx > vw - mx) this.panX -= cx - (vw - mx)
            if (cy < my) this.panY += my - cy
            if (cy > vh - my) this.panY -= cy - (vh - my)
        }
        this.panX = Math.max(-maxX, Math.min(maxX, this.panX))
        this.panY = Math.max(-maxY, Math.min(maxY, this.panY))
        this.setVars(scale, this.panX, this.panY)
    }

    private last = ""
    private setVars(s: number, x: number, y: number) {
        const key = `${s.toFixed(4)}|${x.toFixed(1)}|${y.toFixed(1)}`
        if (key == this.last) return
        this.last = key
        this.scale = s
        const r = document.documentElement.style
        r.setProperty("--ps-zoom", s.toFixed(4))
        r.setProperty("--ps-pan-x", `${x.toFixed(1)}px`)
        r.setProperty("--ps-pan-y", `${y.toFixed(1)}px`)
    }
}

// ---------------------------------------------------------------- меню

export type MenuItem = {
    id: string
    label: string
    icon: string
    active?: () => boolean
    onClick: () => void
}

const I = {
    keyboard: '<path d="M3 7h18v10H3z"/><path d="M7 11h.01M11 11h.01M15 11h.01M7 14h10"/>',
    touch: '<path d="M9 11V5a2 2 0 0 1 4 0v6"/><path d="M13 10a2 2 0 0 1 4 0v3a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-1.5-2.5a1.6 1.6 0 0 1 2.7-1.7L9 13"/>',
    pad: '<path d="M6 9h4M8 7v4M15 9h.01M18 11h.01"/><path d="M17.3 5H6.7A4 4 0 0 0 2.8 8.4l-.8 6.2A3 3 0 0 0 7.3 17l1.9-2h5.6l1.9 2a3 3 0 0 0 5.3-2.4l-.8-6.2A4 4 0 0 0 17.3 5z"/>',
    screen: '<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/>',
    keys: '<path d="M4 6h16v12H4z"/><path d="M8 10h3M8 14h8"/>',
    quality: '<path d="M4 18l5-6 4 4 7-9"/>',
    apps: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
    off: '<path d="M12 3v8"/><path d="M6.3 7.3a8 8 0 1 0 11.4 0"/>',
}

function svg(path: string): string {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`
}
export const ICONS = I
export { svg }

export class FloatingButton {
    private fab = el("button", "ps-fab")
    private menu = el("div", "ps-menu")
    private status = el("div", "ps-menu-status")
    private grid = el("div", "ps-menu-grid")
    private sheet = el("div", "ps-sheet")
    private items: MenuItem[] = []
    private open = false
    private getStatus: () => Promise<string>

    constructor(items: MenuItem[], getStatus: () => Promise<string>) {
        this.items = items
        this.getStatus = getStatus
        const img = el("img") as HTMLImageElement
        img.src = LOGO
        img.alt = ""
        this.fab.appendChild(img)
        this.fab.setAttribute("aria-label", "Меню")
        this.menu.append(this.status, this.grid)
        this.menu.hidden = true
        this.sheet.hidden = true
        stopAll(this.fab)
        stopAll(this.menu)
        stopAll(this.sheet)
        this.render()
        this.initDrag()
        this.menu.addEventListener("click", e => {
            if (e.target === this.menu) this.setOpen(false)
        })
    }

    getElements(): HTMLElement[] { return [this.menu, this.sheet, this.fab] }

    private render() {
        this.grid.innerHTML = ""
        for (const it of this.items) {
            const b = el("button", "ps-menu-item")
            if (it.id == "off") b.classList.add("ps-danger")
            if (it.active && it.active()) b.classList.add("on")
            b.innerHTML = `<span class="ps-menu-icon">${svg(it.icon)}</span><span class="ps-menu-label"></span>`
            ;(b.querySelector(".ps-menu-label") as HTMLElement).textContent = it.label
            b.addEventListener("click", () => {
                it.onClick()
                this.render()
            })
            this.grid.appendChild(b)
        }
    }

    setItems(items: MenuItem[]) {
        this.items = items
        this.render()
    }

    setOpen(open: boolean) {
        this.open = open
        this.menu.hidden = !open
        this.fab.classList.toggle("open", open)
        if (open) {
            this.status.textContent = "…"
            this.getStatus().then(t => { this.status.textContent = t }).catch(() => { this.status.textContent = "" })
            this.render()
        } else {
            this.closeSheet()
        }
    }
    isOpen(): boolean { return this.open }

    // Вторичное меню (клавиши, качество, экран).
    showSheet(title: string, options: Array<{ label: string, sub?: string, on?: boolean, onClick: () => void }>) {
        this.sheet.innerHTML = ""
        const head = el("div", "ps-sheet-head")
        head.appendChild(el("div", "ps-sheet-title", title))
        const close = el("button", "ps-sheet-close", "Готово")
        close.addEventListener("click", () => this.closeSheet())
        head.appendChild(close)
        this.sheet.appendChild(head)
        const list = el("div", "ps-sheet-list")
        for (const o of options) {
            const b = el("button", "ps-sheet-item" + (o.on ? " on" : ""))
            b.appendChild(el("span", "ps-sheet-label", o.label))
            if (o.sub) b.appendChild(el("span", "ps-sheet-sub", o.sub))
            b.addEventListener("click", () => o.onClick())
            list.appendChild(b)
        }
        this.sheet.appendChild(list)
        this.sheet.hidden = false
        this.menu.hidden = true
    }
    closeSheet() {
        this.sheet.hidden = true
        if (this.open) this.menu.hidden = false
    }

    // Кнопку можно тянуть; отпустил — прилипает к ближнему краю.
    private initDrag() {
        let startX = 0, startY = 0, baseX = 0, baseY = 0, moved = false, id: number | null = null
        const pos = (lsGet("psFab") || "").split(",").map(Number)
        let x = pos.length == 2 && isFinite(pos[0]) ? pos[0] : -1
        let y = pos.length == 2 && isFinite(pos[1]) ? pos[1] : 0.3
        const place = () => {
            const s = this.fab.offsetWidth || 56
            const vw = window.innerWidth, vh = window.innerHeight
            const left = x < 0 ? 10 : Math.min(vw - s - 10, Math.max(10, x * vw))
            const top = Math.min(vh - s - 10, Math.max(10, y * vh))
            this.fab.style.left = `${left}px`
            this.fab.style.top = `${top}px`
        }
        place()
        window.addEventListener("resize", place)
        this.fab.addEventListener("pointerdown", e => {
            id = e.pointerId
            moved = false
            startX = e.clientX
            startY = e.clientY
            const r = this.fab.getBoundingClientRect()
            baseX = r.left
            baseY = r.top
            try { this.fab.setPointerCapture(e.pointerId) } catch { /* */ }
            this.fab.classList.add("drag")
        })
        this.fab.addEventListener("pointermove", e => {
            if (e.pointerId !== id) return
            const dx = e.clientX - startX, dy = e.clientY - startY
            if (!moved && Math.hypot(dx, dy) < 8) return
            moved = true
            this.fab.style.left = `${baseX + dx}px`
            this.fab.style.top = `${baseY + dy}px`
        })
        const end = (e: PointerEvent) => {
            if (e.pointerId !== id) return
            id = null
            this.fab.classList.remove("drag")
            if (!moved) {
                this.setOpen(!this.open)
                return
            }
            const r = this.fab.getBoundingClientRect()
            const vw = window.innerWidth, vh = window.innerHeight
            x = r.left + r.width / 2 < vw / 2 ? -1 : 1
            y = Math.max(0, Math.min(1, r.top / vh))
            lsSet("psFab", `${x},${y}`)
            place()
        }
        this.fab.addEventListener("pointerup", end)
        this.fab.addEventListener("pointercancel", end)
    }
}

// ---------------------------------------------------------------- подсказка

export function showGestureHintOnce(parent: HTMLElement) {
    if (lsGet("psHintShown") == "1") return
    lsSet("psHintShown", "1")
    const box = el("div", "ps-hint")
    box.innerHTML =
        '<div class="ps-hint-title">Управление пальцем</div>' +
        '<div class="ps-hint-row"><b>Водить</b> — двигать курсор</div>' +
        '<div class="ps-hint-row"><b>Тап</b> — клик</div>' +
        '<div class="ps-hint-row"><b>Тап двумя пальцами</b> — правый клик</div>' +
        '<div class="ps-hint-row"><b>Два пальца вверх-вниз</b> — прокрутка</div>' +
        '<div class="ps-hint-row"><b>Двойной тап и держать</b> — перетаскивание</div>' +
        '<div class="ps-hint-row"><b>Кнопка P</b> — меню: клавиатура, геймпад, экран</div>'
    const ok = el("button", "ps-btn ps-btn-primary", "Понятно")
    ok.addEventListener("click", () => box.remove())
    box.appendChild(ok)
    stopAll(box)
    parent.appendChild(box)
}
