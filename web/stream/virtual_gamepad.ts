// PrimSec: экранный геймпад для телефона.
//
// Рисуется поверх картинки: два стика, крестовина, A/B/X/Y, бамперы и
// курки, «Назад»/«Меню». Каждый элемент ведёт свой палец (pointer id),
// поэтому можно жать кнопку и вести стик одновременно. На компьютер уходит
// как обычный геймпад (отдельный номер, не мешает Bluetooth-геймпаду).

import { ControllerCapabilities } from "../uniffi/moonlight_common_bindings"
import { emptyGamepadState, GamepadState, SUPPORTED_BUTTONS } from "./gamepad"
import { StreamInput } from "./input"

const PAD_ID = 7
type ButtonName = "a" | "b" | "x" | "y" | "lb" | "rb" | "back" | "play" | "up" | "down" | "left" | "right" | "lsClk" | "rsClk"

export class VirtualGamepad {
    private getInput: () => StreamInput
    private root = document.createElement("div")
    private state: GamepadState = emptyGamepadState()
    private visible = false
    private added = false
    private sendQueued = false

    constructor(getInput: () => StreamInput) {
        this.getInput = getInput
        this.root.classList.add("vpad")
        this.root.hidden = true

        // Касания по геймпаду не должны превращаться в мышь на картинке.
        for (const ev of ["touchstart", "touchmove", "touchend", "touchcancel", "mousedown", "mouseup", "mousemove", "click", "contextmenu", "wheel"]) {
            this.root.addEventListener(ev, e => { e.stopPropagation() }, { passive: false })
        }
        this.root.addEventListener("touchstart", e => e.preventDefault(), { passive: false })
        this.root.addEventListener("contextmenu", e => e.preventDefault())

        // Левая половина
        const left = this.el("vpad-left")
        left.appendChild(this.trigger("ЛК", "lt"))
        left.appendChild(this.button("ЛБ", "lb", "vpad-bumper"))
        left.appendChild(this.stick("left"))
        left.appendChild(this.dpad())

        // Правая половина
        const right = this.el("vpad-right")
        right.appendChild(this.trigger("ПК", "rt"))
        right.appendChild(this.button("ПБ", "rb", "vpad-bumper"))
        right.appendChild(this.face())
        right.appendChild(this.stick("right"))

        // Центр
        const mid = this.el("vpad-mid")
        mid.appendChild(this.button("⧉", "back", "vpad-small"))
        mid.appendChild(this.button("≡", "play", "vpad-small"))

        this.root.append(left, mid, right)
    }

    getElement(): HTMLElement {
        return this.root
    }

    isVisible(): boolean {
        return this.visible
    }

    setVisible(visible: boolean) {
        this.visible = visible
        this.root.hidden = !visible
        if (visible) {
            this.ensureAdded()
        } else {
            this.state = emptyGamepadState()
            this.send()
        }
    }

    // Поток переподключился — геймпад надо заявить заново.
    onStreamStart() {
        this.added = false
        if (this.visible) {
            this.ensureAdded()
        }
    }

    private ensureAdded() {
        if (this.added) {
            return
        }
        const caps: ControllerCapabilities = {
            analogTriggers: true,
            rumble: false,
            triggerRumble: false,
            touchpad: false,
            accel: false,
            gyro: false,
            batteryState: false,
            rgbLed: false,
            dualTouchpad: false,
        }
        try {
            this.getInput().sendControllerAdd(PAD_ID, SUPPORTED_BUTTONS, caps)
            this.added = true
        } catch {
            this.added = false
        }
    }

    private send() {
        if (this.sendQueued) {
            return
        }
        this.sendQueued = true
        // Одно сообщение на кадр, сколько бы пальцев ни двигалось.
        requestAnimationFrame(() => {
            this.sendQueued = false
            if (!this.added) {
                return
            }
            this.getInput().sendController(PAD_ID, {
                ...this.state,
                buttonFlags: { ...this.state.buttonFlags },
            })
        })
    }

    private haptic() {
        try {
            if ("vibrate" in navigator) {
                navigator.vibrate(8)
            }
        } catch { /* iPhone не умеет — не важно */ }
    }

    // ---------- элементы ----------

    private el(cls: string): HTMLDivElement {
        const d = document.createElement("div")
        d.classList.add(cls)
        return d
    }

    private bindPress(el: HTMLElement, onDown: () => void, onUp: () => void) {
        let pointer: number | null = null
        el.addEventListener("pointerdown", e => {
            e.preventDefault()
            e.stopPropagation()
            if (pointer != null) {
                return
            }
            pointer = e.pointerId
            try { el.setPointerCapture(e.pointerId) } catch { /* */ }
            el.classList.add("on")
            this.haptic()
            onDown()
        })
        const up = (e: PointerEvent) => {
            if (e.pointerId !== pointer) {
                return
            }
            pointer = null
            el.classList.remove("on")
            onUp()
        }
        el.addEventListener("pointerup", up)
        el.addEventListener("pointercancel", up)
        el.addEventListener("lostpointercapture", up)
    }

    private button(label: string, name: ButtonName, cls?: string): HTMLDivElement {
        const b = this.el("vpad-btn")
        if (cls) {
            b.classList.add(cls)
        }
        b.classList.add("vpad-" + name)
        b.textContent = label
        this.bindPress(b,
            () => { this.state.buttonFlags[name] = true; this.send() },
            () => { this.state.buttonFlags[name] = false; this.send() })
        return b
    }

    private trigger(label: string, which: "lt" | "rt"): HTMLDivElement {
        const b = this.el("vpad-btn")
        b.classList.add("vpad-trigger")
        b.textContent = label
        this.bindPress(b,
            () => { if (which == "lt") this.state.leftTrigger = 1; else this.state.rightTrigger = 1; this.send() },
            () => { if (which == "lt") this.state.leftTrigger = 0; else this.state.rightTrigger = 0; this.send() })
        return b
    }

    private face(): HTMLDivElement {
        const f = this.el("vpad-face")
        f.append(
            this.button("Y", "y", "vpad-y"),
            this.button("X", "x", "vpad-x"),
            this.button("B", "b", "vpad-b"),
            this.button("A", "a", "vpad-a"),
        )
        return f
    }

    private dpad(): HTMLDivElement {
        const d = this.el("vpad-dpad")
        d.append(
            this.button("▲", "up", "vpad-up"),
            this.button("◀", "left", "vpad-left-btn"),
            this.button("▶", "right", "vpad-right-btn"),
            this.button("▼", "down", "vpad-down"),
        )
        return d
    }

    private stick(side: "left" | "right"): HTMLDivElement {
        const base = this.el("vpad-stick")
        const knob = this.el("vpad-knob")
        base.appendChild(knob)
        let pointer: number | null = null
        let cx = 0, cy = 0, radius = 1
        let lastTap = 0

        const apply = (x: number, y: number) => {
            if (side == "left") {
                this.state.leftStickX = x
                this.state.leftStickY = y
            } else {
                this.state.rightStickX = x
                this.state.rightStickY = y
            }
            knob.style.transform = `translate(${x * radius * 0.6}px, ${y * radius * 0.6}px)`
            this.send()
        }
        const move = (e: PointerEvent) => {
            let dx = (e.clientX - cx) / (radius * 0.6)
            let dy = (e.clientY - cy) / (radius * 0.6)
            const len = Math.hypot(dx, dy)
            if (len > 1) {
                dx /= len
                dy /= len
            }
            apply(dx, dy)
        }
        base.addEventListener("pointerdown", e => {
            e.preventDefault()
            e.stopPropagation()
            if (pointer != null) {
                return
            }
            pointer = e.pointerId
            try { base.setPointerCapture(e.pointerId) } catch { /* */ }
            const r = base.getBoundingClientRect()
            cx = r.left + r.width / 2
            cy = r.top + r.height / 2
            radius = r.width / 2
            base.classList.add("on")
            // Двойной тап по стику — нажатие стика (L3/R3).
            const now = performance.now()
            if (now - lastTap < 300) {
                const flag = side == "left" ? "lsClk" : "rsClk"
                this.state.buttonFlags[flag] = true
                this.send()
                setTimeout(() => { this.state.buttonFlags[flag] = false; this.send() }, 120)
            }
            lastTap = now
            move(e)
        })
        base.addEventListener("pointermove", e => {
            if (e.pointerId === pointer) {
                move(e)
            }
        })
        const up = (e: PointerEvent) => {
            if (e.pointerId !== pointer) {
                return
            }
            pointer = null
            base.classList.remove("on")
            apply(0, 0)
        }
        base.addEventListener("pointerup", up)
        base.addEventListener("pointercancel", up)
        base.addEventListener("lostpointercapture", up)
        return base
    }
}
