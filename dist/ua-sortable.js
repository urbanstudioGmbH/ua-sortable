/**
 * UA_Sortable v1.0.4 — IIFE build (browser global)
 * Pointer-Events-based drag-and-drop sorting. No dependencies.
 *
 * @author  Marian Feiler <mf@urbanstudio.de>
 * @company urbanstudio GmbH — https://urbanstudio.de
 * @license MIT
 * @see     https://github.com/urbanstudioGmbH/ua-sortable
 *
 * Usage:
 *   <script src="ua-sortable.js"></script>
 *   <script>
 *     new UA_Sortable(document.querySelector("ul"), { handle: ".drag-handle" });
 *     // or shorthand:
 *     uaMakeSortable(document.querySelector("ul"), { handle: ".drag-handle" });
 *   </script>
 */
(function (global, factory) {
    "use strict";
    if (typeof module !== "undefined" && module.exports) {
        // CommonJS / Node (no DOM, only class export)
        module.exports = factory();
    } else {
        // Browser global
        const exports = factory();
        global.UA_Sortable   = exports.UA_Sortable;
        global.uaMakeSortable = exports.uaMakeSortable;
    }
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this, function () {
    "use strict";

    class UA_Sortable {

        static #instanceRegistry = new WeakMap();
        static #groupRegistry    = new Map();
        static #globalObserver   = null;

        #containerElement        = null;
        #options                 = {};
        #draggableElements       = [];
        #draggedElement          = null;
        #placeholderElement      = null;
        #sourceContainerElement  = null;
        #currentContainerElement = null;
        #pointerStartX           = 0;
        #pointerStartY           = 0;
        #dragOffsetX             = 0;
        #dragOffsetY             = 0;
        #savedDragStyle          = "";
        #delayTimer              = null;
        #isDragging              = false;
        #childObserver           = null;
        #rafId                   = null;
        #rafX                    = 0;
        #rafY                    = 0;
        #layoutAnimations        = new Map();
        #boundHandlePointerDown   = null;
        #boundHandlePointerMove   = null;
        #boundHandlePointerUp     = null;
        #boundHandlePointerCancel = null;

        constructor(containerElement, options = {}) {
            if (!containerElement || containerElement.nodeType !== 1) {
                throw new Error("UA_Sortable: first argument must be an HTMLElement");
            }
            if (UA_Sortable.#instanceRegistry.has(containerElement)) {
                UA_Sortable.#instanceRegistry.get(containerElement).destroy();
            }
            this.#containerElement = containerElement;
            this.#options = {
                handle: null, filter: null, group: null, direction: "auto",
                animation: 150, dataIdAttr: "data-id", delay: 0,
                delayOnTouchOnly: false, disabled: false,
                ghostClass: "ua-sortable-ghost", dragClass: "ua-sortable-drag",
                confirm: null, onDragStart: null, onDragEnd: null,
                onSort: null, onMove: null,
                ...options,
            };
            this.#boundHandlePointerDown   = this.#handlePointerDown.bind(this);
            this.#boundHandlePointerMove   = this.#handlePointerMove.bind(this);
            this.#boundHandlePointerUp     = this.#handlePointerUp.bind(this);
            this.#boundHandlePointerCancel = this.#handlePointerCancel.bind(this);
            this.#registerInGlobals();
            this.#attachContainerListeners();
            this.#observeChildChanges();
            this.#refreshDraggableList();
        }

        toArray() {
            return this.#getDraggableChildren().map(el => el.getAttribute(this.#options.dataIdAttr) ?? "");
        }
        enable()  { this.option("disabled", false); }
        disable() { this.option("disabled", true);  }
        refresh() { this.#refreshDraggableList(); }
        destroy() {
            this.#detachContainerListeners();
            this.#childObserver?.disconnect();
            this.#childObserver = null;
            this.#cleanupDragState();
            this.#unregisterFromGlobals();
        }
        option(name, value = undefined) {
            if (value === undefined) return this.#options[name];
            this.#options[name] = value;
            if (name === "filter" || name === "handle") this.#refreshDraggableList();
        }

        static get(containerElement) {
            return UA_Sortable.#instanceRegistry.get(containerElement) ?? null;
        }
        static getGroup(groupName) {
            return [...(UA_Sortable.#groupRegistry.get(groupName) ?? [])];
        }
        static snapshot(groupName = null) {
            let instances;
            if (groupName !== null) {
                instances = UA_Sortable.getGroup(groupName);
            } else {
                instances = [];
                UA_Sortable.#groupRegistry.forEach(g => instances.push(...g));
            }
            return instances.map(i => ({ container: i.#containerElement, ids: i.toArray(), group: i.#options.group }));
        }
        static initAll(root = document) {
            root.querySelectorAll("[data-ua-sortable]").forEach(el => {
                if (!UA_Sortable.#instanceRegistry.has(el)) UA_Sortable.#initFromDataAttributes(el);
            });
        }
        static observe(root) {
            if (UA_Sortable.#globalObserver) UA_Sortable.#globalObserver.disconnect();
            UA_Sortable.#globalObserver = new MutationObserver(mutations => {
                for (const m of mutations) {
                    for (const node of m.addedNodes) {
                        if (!(node instanceof HTMLElement)) continue;
                        if (node.hasAttribute("data-ua-sortable") && !UA_Sortable.#instanceRegistry.has(node)) {
                            UA_Sortable.#initFromDataAttributes(node);
                        }
                        node.querySelectorAll("[data-ua-sortable]").forEach(el => {
                            if (!UA_Sortable.#instanceRegistry.has(el)) UA_Sortable.#initFromDataAttributes(el);
                        });
                    }
                }
            });
            UA_Sortable.#globalObserver.observe(root, { childList: true, subtree: true });
        }

        static #initFromDataAttributes(el) {
            const d = el.dataset, o = {};
            if (d.sortableHandle    !== undefined) o.handle     = d.sortableHandle;
            if (d.sortableFilter    !== undefined) o.filter     = d.sortableFilter;
            if (d.sortableGroup     !== undefined) o.group      = d.sortableGroup;
            if (d.sortableDirection !== undefined) o.direction  = d.sortableDirection;
            if (d.sortableAnimation !== undefined) o.animation  = parseInt(d.sortableAnimation, 10);
            if (d.sortableDataIdAttr!== undefined) o.dataIdAttr = d.sortableDataIdAttr;
            if (d.sortableDelay     !== undefined) o.delay      = parseInt(d.sortableDelay, 10);
            new UA_Sortable(el, o);
        }
        #registerInGlobals() {
            UA_Sortable.#instanceRegistry.set(this.#containerElement, this);
            const g = this.#options.group;
            if (g) {
                if (!UA_Sortable.#groupRegistry.has(g)) UA_Sortable.#groupRegistry.set(g, new Set());
                UA_Sortable.#groupRegistry.get(g).add(this);
            }
        }
        #unregisterFromGlobals() {
            UA_Sortable.#instanceRegistry.delete(this.#containerElement);
            const g = this.#options.group;
            if (g && UA_Sortable.#groupRegistry.has(g)) UA_Sortable.#groupRegistry.get(g).delete(this);
        }
        #attachContainerListeners() {
            this.#containerElement.addEventListener("pointerdown", this.#boundHandlePointerDown);
        }
        #detachContainerListeners() {
            this.#containerElement.removeEventListener("pointerdown", this.#boundHandlePointerDown);
            document.removeEventListener("pointermove",   this.#boundHandlePointerMove);
            document.removeEventListener("pointerup",     this.#boundHandlePointerUp);
            document.removeEventListener("pointercancel", this.#boundHandlePointerCancel);
        }
        #observeChildChanges() {
            this.#childObserver = new MutationObserver(() => this.#refreshDraggableList());
            this.#childObserver.observe(this.#containerElement, { childList: true });
        }
        #refreshDraggableList() { this.#draggableElements = this.#getDraggableChildren(); }
        #getDraggableChildren() {
            const c = [...this.#containerElement.children];
            return this.#options.filter ? c.filter(el => !el.matches(this.#options.filter)) : c;
        }
        #handlePointerDown(e) {
            if (this.#options.disabled) return;
            if (e.button !== 0 && e.pointerType === "mouse") return;
            const dragged = this.#findDraggableParent(e.target);
            if (!dragged) return;
            if (this.#options.filter) {
                if (dragged.matches(this.#options.filter)) return;
                if (e.target.closest(this.#options.filter)) return;
            }
            if (this.#options.handle) {
                const h = e.target.closest(this.#options.handle);
                if (!h || !dragged.contains(h)) return;
            }
            this.#pointerStartX = e.clientX;
            this.#pointerStartY = e.clientY;
            const delay = this.#options.delay > 0 && (!this.#options.delayOnTouchOnly || e.pointerType === "touch");
            if (delay) {
                this.#delayTimer = setTimeout(() => this.#startDrag(e, dragged), this.#options.delay);
                const cancel = mv => {
                    if (Math.hypot(mv.clientX - this.#pointerStartX, mv.clientY - this.#pointerStartY) > 5) {
                        clearTimeout(this.#delayTimer);
                        document.removeEventListener("pointermove", cancel);
                    }
                };
                document.addEventListener("pointermove", cancel);
            } else {
                this.#startDrag(e, dragged);
            }
        }
        #startDrag(e, dragged) {
            this.#isDragging = true;
            this.#draggedElement = dragged;
            this.#sourceContainerElement = this.#containerElement;
            this.#currentContainerElement = this.#containerElement;
            const r = dragged.getBoundingClientRect();
            this.#dragOffsetX = e.clientX - r.left;
            this.#dragOffsetY = e.clientY - r.top;
            this.#placeholderElement = document.createElement(dragged.tagName);
            this.#placeholderElement.classList.add("ua-sortable-placeholder");
            this.#placeholderElement.style.cssText = `width:${r.width}px;height:${r.height}px;align-self:start;pointer-events:none;`;
            dragged.parentNode.insertBefore(this.#placeholderElement, dragged);
            try { dragged.setPointerCapture(e.pointerId); } catch (_) {}
            this.#savedDragStyle = dragged.style.cssText;
            dragged.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;margin:0;z-index:9999;pointer-events:none;`;
            dragged.classList.add(this.#options.dragClass);
            this.#containerElement.classList.add("ua-sortable-active");
            document.body.style.userSelect = "none";
            document.addEventListener("pointermove",   this.#boundHandlePointerMove);
            document.addEventListener("pointerup",     this.#boundHandlePointerUp);
            document.addEventListener("pointercancel", this.#boundHandlePointerCancel);
            this.#options.onDragStart?.(dragged);
        }
        #handlePointerMove(e) {
            if (!this.#isDragging) return;
            this.#draggedElement.style.left = `${e.clientX - this.#dragOffsetX}px`;
            this.#draggedElement.style.top  = `${e.clientY - this.#dragOffsetY}px`;
            const tc = this.#findTargetContainer(e.clientX, e.clientY);
            if (tc && tc !== this.#currentContainerElement) {
                this.#currentContainerElement.classList.remove("ua-sortable-active");
                tc.classList.add("ua-sortable-active");
                this.#currentContainerElement = tc;
            }
            this.#rafX = e.clientX;
            this.#rafY = e.clientY;
            if (!this.#rafId) {
                this.#rafId = requestAnimationFrame(() => {
                    this.#rafId = null;
                    if (this.#isDragging) this.#updatePlaceholderPosition(this.#rafX, this.#rafY);
                });
            }
        }
        #handlePointerUp()     { if (this.#isDragging) this.#finalizeDrop(); }
        #handlePointerCancel() { if (this.#isDragging) this.#revertDrag(); }
        async #finalizeDrop() {
            const dragged = this.#draggedElement;
            const src = this.#sourceContainerElement;
            const tgt = this.#currentContainerElement;
            const moved = src !== tgt;
            if (moved && this.#options.confirm) {
                document.removeEventListener("pointermove",   this.#boundHandlePointerMove);
                document.removeEventListener("pointerup",     this.#boundHandlePointerUp);
                document.removeEventListener("pointercancel", this.#boundHandlePointerCancel);
                const ok = await Promise.resolve(this.#options.confirm(dragged.getAttribute(this.#options.dataIdAttr), src, tgt));
                if (!ok) { this.#revertDrag(); return; }
            }
            tgt.insertBefore(dragged, this.#placeholderElement);
            this.#cleanupDragState();
            const id  = dragged.getAttribute(this.#options.dataIdAttr);
            const ids = UA_Sortable.get(tgt)?.toArray() ?? [...tgt.children]
                .filter(el => el !== this.#placeholderElement && (!this.#options.filter || !el.matches(this.#options.filter)))
                .map(el => el.getAttribute(this.#options.dataIdAttr) ?? "");
            if (moved) {
                const srcIds = UA_Sortable.get(src)?.toArray() ?? [];
                const ok = await this.#invokeOnMove(id, src, tgt, srcIds, ids);
                if (ok === false) { src.appendChild(dragged); this.#options.onDragEnd?.(dragged, false); return; }
            } else {
                this.#options.onSort?.(ids, tgt);
            }
            this.#options.onDragEnd?.(dragged, true);
        }
        #revertDrag() {
            const d = this.#draggedElement;
            const isCross = this.#sourceContainerElement !== this.#currentContainerElement;
            if (!isCross && this.#placeholderElement?.parentNode) {
                this.#placeholderElement.parentNode.insertBefore(d, this.#placeholderElement);
            }
            this.#cleanupDragState();
            this.#options.onDragEnd?.(d, false);
        }
        async #invokeOnMove(id, from, to, fromIds, toIds) {
            if (!this.#options.onMove) return true;
            return await Promise.resolve(this.#options.onMove(id, from, to, fromIds, toIds)) !== false;
        }
        #cleanupDragState() {
            this.#placeholderElement?.remove();
            if (this.#draggedElement) {
                this.#draggedElement.style.cssText = this.#savedDragStyle;
                this.#draggedElement.classList.remove(this.#options.dragClass);
            }
            this.#containerElement.classList.remove("ua-sortable-active");
            if (this.#currentContainerElement && this.#currentContainerElement !== this.#containerElement) {
                this.#currentContainerElement.classList.remove("ua-sortable-active");
            }
            clearTimeout(this.#delayTimer);
            if (this.#rafId) { cancelAnimationFrame(this.#rafId); this.#rafId = null; }
            this.#layoutAnimations.forEach(a => a.cancel());
            this.#layoutAnimations.clear();
            document.body.style.userSelect = "";
            document.removeEventListener("pointermove",   this.#boundHandlePointerMove);
            document.removeEventListener("pointerup",     this.#boundHandlePointerUp);
            document.removeEventListener("pointercancel", this.#boundHandlePointerCancel);
            this.#placeholderElement = this.#draggedElement =
            this.#sourceContainerElement = this.#currentContainerElement = this.#delayTimer = null;
            this.#isDragging = false;
        }
        #updatePlaceholderPosition(px, py) {
            const tc = this.#currentContainerElement;
            const children = [...tc.children].filter(c =>
                c !== this.#draggedElement &&
                c !== this.#placeholderElement &&
                (!this.#options.filter || !c.matches(this.#options.filter))
            );
            const dir = this.#resolveDirection(tc);
            let before = null;
            if (dir === "grid") {
                before = this.#getGridInsertBeforeElement(children, px, py);
            } else {
                for (const s of children) {
                    const sr  = s.getBoundingClientRect();
                    const mid = dir === "horizontal" ? sr.left + sr.width / 2 : sr.top + sr.height / 2;
                    if ((dir === "horizontal" ? px : py) < mid) { before = s; break; }
                }
            }
            if (before) {
                if (this.#placeholderElement.nextSibling !== before) {
                    this.#animateLayoutChange(tc, () => tc.insertBefore(this.#placeholderElement, before));
                }
            } else {
                if (tc.lastElementChild !== this.#placeholderElement) {
                    this.#animateLayoutChange(tc, () => tc.appendChild(this.#placeholderElement));
                }
            }
        }
        #animateLayoutChange(container, changeDOM) {
            const duration = Number(this.#options.animation) || 0;
            if (duration <= 0 || typeof Element === "undefined" || !Element.prototype.animate) {
                changeDOM();
                return;
            }
            const getChildren = () => [...container.children].filter(c =>
                c !== this.#draggedElement &&
                c !== this.#placeholderElement &&
                (!this.#options.filter || !c.matches(this.#options.filter))
            );
            const first = new Map(getChildren().map(c => [c, c.getBoundingClientRect()]));
            changeDOM();
            for (const c of getChildren()) {
                const f = first.get(c);
                if (!f) continue;
                const l = c.getBoundingClientRect();
                const dx = f.left - l.left;
                const dy = f.top - l.top;
                if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
                this.#layoutAnimations.get(c)?.cancel();
                const a = c.animate(
                    [
                        { transform: `translate(${dx}px, ${dy}px)` },
                        { transform: "translate(0, 0)" },
                    ],
                    { duration, easing: "ease", fill: "both" }
                );
                this.#layoutAnimations.set(c, a);
                a.finished
                    .catch(() => {})
                    .finally(() => {
                        if (this.#layoutAnimations.get(c) === a) this.#layoutAnimations.delete(c);
                    });
            }
        }
        #getGridInsertBeforeElement(children, px, py) {
            if (!children.length) return null;
            const tol = 4;
            const rows = [];
            for (const el of children) {
                const r = el.getBoundingClientRect();
                let row = rows.find(candidate => Math.abs(candidate.top - r.top) <= tol);
                if (!row) {
                    row = { top: r.top, bottom: r.bottom, items: [] };
                    rows.push(row);
                }
                row.top = Math.min(row.top, r.top);
                row.bottom = Math.max(row.bottom, r.bottom);
                row.items.push({ element: el, rect: r });
            }
            rows.sort((a, b) => a.top - b.top);
            rows.forEach(row => row.items.sort((a, b) => a.rect.left - b.rect.left));
            let targetRow = rows[rows.length - 1];
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const nextRow = rows[i + 1] ?? null;
                if (py < row.top) {
                    targetRow = row;
                    break;
                }
                if (py <= row.bottom) {
                    targetRow = row;
                    break;
                }
                if (nextRow && py < nextRow.top) {
                    targetRow = py < row.bottom + (nextRow.top - row.bottom) / 2 ? row : nextRow;
                    break;
                }
            }
            for (const item of targetRow.items) {
                if (px < item.rect.left + item.rect.width / 2) return item.element;
            }
            const nextRow = rows[rows.indexOf(targetRow) + 1];
            return nextRow?.items[0]?.element ?? null;
        }
        #resolveDirection(el) {
            if (this.#options.direction !== "auto") return this.#options.direction;
            const style = getComputedStyle(el);
            if (style.display === "grid" || style.display === "inline-grid") return "grid";
            if (style.display === "flex" || style.display === "inline-flex") {
                return (style.flexDirection === "row" || style.flexDirection === "row-reverse") ? "horizontal" : "vertical";
            }
            return "vertical";
        }
        #findDraggableParent(el) {
            let c = el;
            while (c && c !== this.#containerElement) {
                if (c.parentElement === this.#containerElement) return c;
                c = c.parentElement;
            }
            return null;
        }
        #findTargetContainer(px, py) {
            const g = this.#options.group;
            if (!g) return this.#containerElement;
            for (const inst of UA_Sortable.getGroup(g)) {
                if (inst === this || inst.#options.disabled) continue;
                const r = inst.#containerElement.getBoundingClientRect();
                if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) return inst.#containerElement;
            }
            return this.#containerElement;
        }
    }

    // Inject minimal CSS
    if (typeof document !== "undefined" && !document.getElementById("ua-sortable-styles")) {
        const s = document.createElement("style");
        s.id = "ua-sortable-styles";
        s.textContent = ".ua-sortable-drag{opacity:.95;box-shadow:0 8px 24px rgba(0,0,0,.18);transition:box-shadow .15s;}.ua-sortable-placeholder{border:2px dashed rgba(0,0,0,.18);border-radius:3px;box-sizing:border-box;background:rgba(0,0,0,.03);}.ua-sortable-active>.ua-sortable-over{border-top:2px solid var(--accent,#2563eb);}.ua-drag-handle{cursor:grab;touch-action:none;}.ua-drag-handle:active{cursor:grabbing;}";
        document.head.appendChild(s);
    }

    function uaMakeSortable(el, options = {}) {
        return new UA_Sortable(el, options);
    }

    return { UA_Sortable, uaMakeSortable };
});
