"use strict";

/**
 * UA_Sortable v1.0.4 — Pointer-Events-based drag-and-drop sorting for lists and grids.
 * No dependencies — no jQuery, no CDN, no external frameworks.
 * Supports: simple sorting, cross-list groups, auto-direction, filter, delay.
 *
 * @author  Marian Feiler <mf@urbanstudio.de>
 * @company urbanstudio GmbH — https://urbanstudio.de
 * @license MIT
 * @see     https://github.com/urbanstudioGmbH/ua-sortable
 */
export class UA_Sortable {

    // --- Global registries ---
    static #instanceRegistry = new WeakMap();   // containerElement → UA_Sortable
    static #groupRegistry    = new Map();        // groupName → Set<UA_Sortable>
    static #globalObserver   = null;

    // --- Internal drag state ---
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

    // Bound handler references for clean removeEventListener
    #boundHandlePointerDown   = null;
    #boundHandlePointerMove   = null;
    #boundHandlePointerUp     = null;
    #boundHandlePointerCancel = null;

    /**
     * @param {HTMLElement} containerElement
     * @param {object} options
     */
    constructor(containerElement, options = {}) {
        if (!containerElement || containerElement.nodeType !== 1) {
            throw new Error("UA_Sortable: first argument must be an HTMLElement");
        }
        if (UA_Sortable.#instanceRegistry.has(containerElement)) {
            UA_Sortable.#instanceRegistry.get(containerElement).destroy();
        }

        this.#containerElement = containerElement;
        this.#options = {
            handle:           null,
            filter:           null,
            group:            null,
            direction:        "auto",
            animation:        150,
            dataIdAttr:       "data-id",
            delay:            0,
            delayOnTouchOnly: false,
            disabled:         false,
            ghostClass:       "ua-sortable-ghost",
            dragClass:        "ua-sortable-drag",
            confirm:          null,
            onDragStart:      null,
            onDragEnd:        null,
            onSort:           null,
            onMove:           null,
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

    // =========================================================================
    // PUBLIC API — Instance methods
    // =========================================================================

    /** Returns IDs of all draggable children in current DOM order. */
    toArray() {
        return this.#getDraggableChildren().map(el => el.getAttribute(this.#options.dataIdAttr) ?? "");
    }

    /** Enable dragging. */
    enable() {
        this.option("disabled", false);
    }

    /** Disable dragging. */
    disable() {
        this.option("disabled", true);
    }

    /** Re-scan draggable children and filtered elements. */
    refresh() {
        this.#refreshDraggableList();
    }

    /** Remove all listeners and observers, delete from global registry. */
    destroy() {
        this.#detachContainerListeners();
        this.#childObserver?.disconnect();
        this.#childObserver = null;
        this.#cleanupDragState();
        this.#unregisterFromGlobals();
    }

    /**
     * Get or set an option at runtime.
     * @param {string} name
     * @param {*} [value]
     */
    option(name, value = undefined) {
        if (value === undefined) return this.#options[name];
        this.#options[name] = value;
        if (name === "filter" || name === "handle") this.#refreshDraggableList();
    }

    // =========================================================================
    // PUBLIC API — Static methods
    // =========================================================================

    /** Returns the UA_Sortable instance for a container element. */
    static get(containerElement) {
        return UA_Sortable.#instanceRegistry.get(containerElement) ?? null;
    }

    /** Returns all instances registered under a group name. */
    static getGroup(groupName) {
        return [...(UA_Sortable.#groupRegistry.get(groupName) ?? [])];
    }

    /**
     * Returns a snapshot of current order for all grouped instances.
     * @param {string} [groupName] — if omitted, all grouped instances
     * @returns {{ container: HTMLElement, ids: string[], group: string|null }[]}
     */
    static snapshot(groupName = null) {
        let instances;
        if (groupName !== null) {
            instances = UA_Sortable.getGroup(groupName);
        } else {
            instances = [];
            UA_Sortable.#groupRegistry.forEach(groupSet => instances.push(...groupSet));
        }
        return instances.map(instance => ({
            container: instance.#containerElement,
            ids:       instance.toArray(),
            group:     instance.#options.group,
        }));
    }

    /**
     * Initialize all [data-ua-sortable] containers within root.
     * @param {HTMLElement|Document} [root=document]
     */
    static initAll(root = document) {
        root.querySelectorAll("[data-ua-sortable]").forEach(containerElement => {
            if (!UA_Sortable.#instanceRegistry.has(containerElement)) {
                UA_Sortable.#initFromDataAttributes(containerElement);
            }
        });
    }

    /**
     * Start a MutationObserver that auto-initializes new [data-ua-sortable] containers.
     * @param {HTMLElement|Document} root
     */
    static observe(root) {
        if (UA_Sortable.#globalObserver) UA_Sortable.#globalObserver.disconnect();
        UA_Sortable.#globalObserver = new MutationObserver(mutationList => {
            for (const mutation of mutationList) {
                for (const addedNode of mutation.addedNodes) {
                    if (!(addedNode instanceof HTMLElement)) continue;
                    if (addedNode.hasAttribute("data-ua-sortable")) {
                        UA_Sortable.#initFromDataAttributes(addedNode);
                    }
                    addedNode.querySelectorAll("[data-ua-sortable]").forEach(el => {
                        if (!UA_Sortable.#instanceRegistry.has(el)) {
                            UA_Sortable.#initFromDataAttributes(el);
                        }
                    });
                }
            }
        });
        UA_Sortable.#globalObserver.observe(root, { childList: true, subtree: true });
    }

    // =========================================================================
    // PRIVATE — Initialization
    // =========================================================================

    static #initFromDataAttributes(containerElement) {
        const dataset = containerElement.dataset;
        const options = {};
        if (dataset.sortableHandle    !== undefined) options.handle     = dataset.sortableHandle;
        if (dataset.sortableFilter    !== undefined) options.filter     = dataset.sortableFilter;
        if (dataset.sortableGroup     !== undefined) options.group      = dataset.sortableGroup;
        if (dataset.sortableDirection !== undefined) options.direction  = dataset.sortableDirection;
        if (dataset.sortableAnimation !== undefined) options.animation  = parseInt(dataset.sortableAnimation, 10);
        if (dataset.sortableDataIdAttr!== undefined) options.dataIdAttr = dataset.sortableDataIdAttr;
        if (dataset.sortableDelay     !== undefined) options.delay      = parseInt(dataset.sortableDelay, 10);
        new UA_Sortable(containerElement, options);
    }

    #registerInGlobals() {
        UA_Sortable.#instanceRegistry.set(this.#containerElement, this);
        const groupName = this.#options.group;
        if (groupName) {
            if (!UA_Sortable.#groupRegistry.has(groupName)) {
                UA_Sortable.#groupRegistry.set(groupName, new Set());
            }
            UA_Sortable.#groupRegistry.get(groupName).add(this);
        }
    }

    #unregisterFromGlobals() {
        UA_Sortable.#instanceRegistry.delete(this.#containerElement);
        const groupName = this.#options.group;
        if (groupName && UA_Sortable.#groupRegistry.has(groupName)) {
            UA_Sortable.#groupRegistry.get(groupName).delete(this);
        }
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

    #refreshDraggableList() {
        this.#draggableElements = this.#getDraggableChildren();
    }

    #getDraggableChildren() {
        const children = [...this.#containerElement.children];
        if (!this.#options.filter) return children;
        return children.filter(child => !child.matches(this.#options.filter));
    }

    // =========================================================================
    // PRIVATE — Pointer event handlers
    // =========================================================================

    #handlePointerDown(pointerEvent) {
        if (this.#options.disabled) return;
        if (pointerEvent.button !== 0 && pointerEvent.pointerType === "mouse") return;

        const draggedElement = this.#findDraggableParent(pointerEvent.target);
        if (!draggedElement) return;

        if (this.#options.filter) {
            if (draggedElement.matches(this.#options.filter)) return;
            if (pointerEvent.target.closest(this.#options.filter)) return;
        }

        if (this.#options.handle) {
            const handleElement = pointerEvent.target.closest(this.#options.handle);
            if (!handleElement || !draggedElement.contains(handleElement)) return;
        }

        this.#pointerStartX = pointerEvent.clientX;
        this.#pointerStartY = pointerEvent.clientY;

        const shouldDelay = this.#options.delay > 0 &&
            (!this.#options.delayOnTouchOnly || pointerEvent.pointerType === "touch");

        if (shouldDelay) {
            this.#delayTimer = setTimeout(() => {
                this.#startDrag(pointerEvent, draggedElement);
            }, this.#options.delay);
            const cancelDelay = (moveEvent) => {
                const distance = Math.hypot(
                    moveEvent.clientX - this.#pointerStartX,
                    moveEvent.clientY - this.#pointerStartY
                );
                if (distance > 5) {
                    clearTimeout(this.#delayTimer);
                    document.removeEventListener("pointermove", cancelDelay);
                }
            };
            document.addEventListener("pointermove", cancelDelay, { once: false });
        } else {
            this.#startDrag(pointerEvent, draggedElement);
        }
    }

    #startDrag(pointerEvent, draggedElement) {
        this.#isDragging              = true;
        this.#draggedElement          = draggedElement;
        this.#sourceContainerElement  = this.#containerElement;
        this.#currentContainerElement = this.#containerElement;

        const boundingRect = draggedElement.getBoundingClientRect();

        this.#dragOffsetX = pointerEvent.clientX - boundingRect.left;
        this.#dragOffsetY = pointerEvent.clientY - boundingRect.top;

        // Placeholder keeps layout space — visible drop indicator
        this.#placeholderElement = document.createElement(draggedElement.tagName);
        this.#placeholderElement.classList.add("ua-sortable-placeholder");
        this.#placeholderElement.style.cssText = [
            `width:${boundingRect.width}px`,
            `height:${boundingRect.height}px`,
            "align-self:start",
            "pointer-events:none",
        ].join(";");
        draggedElement.parentNode.insertBefore(this.#placeholderElement, draggedElement);

        try { draggedElement.setPointerCapture(pointerEvent.pointerId); } catch (_) {}

        this.#savedDragStyle = draggedElement.style.cssText;
        draggedElement.style.cssText = [
            "position:fixed",
            `left:${boundingRect.left}px`,
            `top:${boundingRect.top}px`,
            `width:${boundingRect.width}px`,
            "margin:0",
            "z-index:9999",
            "pointer-events:none",
        ].join(";");
        draggedElement.classList.add(this.#options.dragClass);

        this.#containerElement.classList.add("ua-sortable-active");
        document.body.style.userSelect = "none";

        document.addEventListener("pointermove",   this.#boundHandlePointerMove);
        document.addEventListener("pointerup",     this.#boundHandlePointerUp);
        document.addEventListener("pointercancel", this.#boundHandlePointerCancel);

        this.#options.onDragStart?.(draggedElement);
    }

    #handlePointerMove(pointerEvent) {
        if (!this.#isDragging) return;

        this.#draggedElement.style.left = `${pointerEvent.clientX - this.#dragOffsetX}px`;
        this.#draggedElement.style.top  = `${pointerEvent.clientY - this.#dragOffsetY}px`;

        const targetContainer = this.#findTargetContainer(pointerEvent.clientX, pointerEvent.clientY);
        if (targetContainer && targetContainer !== this.#currentContainerElement) {
            this.#currentContainerElement.classList.remove("ua-sortable-active");
            targetContainer.classList.add("ua-sortable-active");
            this.#currentContainerElement = targetContainer;
        }

        this.#rafX = pointerEvent.clientX;
        this.#rafY = pointerEvent.clientY;
        if (!this.#rafId) {
            this.#rafId = requestAnimationFrame(() => {
                this.#rafId = null;
                if (this.#isDragging) this.#updatePlaceholderPosition(this.#rafX, this.#rafY);
            });
        }
    }

    #handlePointerUp() {
        if (!this.#isDragging) return;
        this.#finalizeDrop();
    }

    #handlePointerCancel() {
        if (!this.#isDragging) return;
        this.#revertDrag();
    }

    // =========================================================================
    // PRIVATE — Drop logic
    // =========================================================================

    async #finalizeDrop() {
        const draggedElement         = this.#draggedElement;
        const sourceContainerElement = this.#sourceContainerElement;
        const targetContainerElement = this.#currentContainerElement;
        const didChangeContainer     = sourceContainerElement !== targetContainerElement;

        if (didChangeContainer && this.#options.confirm !== null) {
            // Freeze drag movement during async confirm dialog
            document.removeEventListener("pointermove",   this.#boundHandlePointerMove);
            document.removeEventListener("pointerup",     this.#boundHandlePointerUp);
            document.removeEventListener("pointercancel", this.#boundHandlePointerCancel);

            const confirmFunction = this.#options.confirm;
            const confirmed = await Promise.resolve(
                confirmFunction(
                    draggedElement.getAttribute(this.#options.dataIdAttr),
                    sourceContainerElement,
                    targetContainerElement
                )
            );
            if (!confirmed) {
                this.#revertDrag();
                return;
            }
        }

        targetContainerElement.insertBefore(draggedElement, this.#placeholderElement);
        this.#cleanupDragState();

        const movedId          = draggedElement.getAttribute(this.#options.dataIdAttr);
        const orderedTargetIds = UA_Sortable.get(targetContainerElement)?.toArray()
            ?? [...targetContainerElement.children]
                .filter(el => el !== this.#placeholderElement && (!this.#options.filter || !el.matches(this.#options.filter)))
                .map(el => el.getAttribute(this.#options.dataIdAttr) ?? "");

        if (didChangeContainer) {
            const sourceInstance   = UA_Sortable.get(sourceContainerElement);
            const orderedSourceIds = sourceInstance?.toArray() ?? [];

            const shouldProceed = await this.#invokeOnMove(
                movedId,
                sourceContainerElement,
                targetContainerElement,
                orderedSourceIds,
                orderedTargetIds
            );
            if (shouldProceed === false) {
                sourceContainerElement.appendChild(draggedElement);
                this.#options.onDragEnd?.(draggedElement, false);
                return;
            }
        } else {
            this.#options.onSort?.(orderedTargetIds, targetContainerElement);
        }

        this.#options.onDragEnd?.(draggedElement, true);
    }

    #revertDrag() {
        const draggedElement = this.#draggedElement;
        const isCrossContainer = this.#sourceContainerElement !== this.#currentContainerElement;
        if (!isCrossContainer && this.#placeholderElement?.parentNode) {
            this.#placeholderElement.parentNode.insertBefore(draggedElement, this.#placeholderElement);
        }
        this.#cleanupDragState();
        this.#options.onDragEnd?.(draggedElement, false);
    }

    async #invokeOnMove(movedId, fromContainer, toContainer, orderedFromIds, orderedToIds) {
        if (!this.#options.onMove) return true;
        const result = await Promise.resolve(
            this.#options.onMove(movedId, fromContainer, toContainer, orderedFromIds, orderedToIds)
        );
        return result !== false;
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
        this.#layoutAnimations.forEach(animation => animation.cancel());
        this.#layoutAnimations.clear();
        document.body.style.userSelect = "";
        document.removeEventListener("pointermove",   this.#boundHandlePointerMove);
        document.removeEventListener("pointerup",     this.#boundHandlePointerUp);
        document.removeEventListener("pointercancel", this.#boundHandlePointerCancel);

        this.#placeholderElement      = null;
        this.#draggedElement          = null;
        this.#sourceContainerElement  = null;
        this.#currentContainerElement = null;
        this.#isDragging              = false;
        this.#delayTimer              = null;
    }

    // =========================================================================
    // PRIVATE — Position & direction calculation
    // =========================================================================

    #updatePlaceholderPosition(pointerX, pointerY) {
        const targetContainer = this.#currentContainerElement;
        const children = [...targetContainer.children].filter(child =>
            child !== this.#draggedElement &&
            child !== this.#placeholderElement &&
            (!this.#options.filter || !child.matches(this.#options.filter))
        );

        const direction = this.#resolveDirection(targetContainer);
        let insertBeforeElement = null;

        if (direction === "grid") {
            insertBeforeElement = this.#getGridInsertBeforeElement(children, pointerX, pointerY);
        } else {
            for (const sibling of children) {
                const siblingRect = sibling.getBoundingClientRect();
                const siblingMidpoint = direction === "horizontal"
                    ? siblingRect.left + siblingRect.width  / 2
                    : siblingRect.top  + siblingRect.height / 2;
                const pointerPosition = direction === "horizontal" ? pointerX : pointerY;

                if (pointerPosition < siblingMidpoint) {
                    insertBeforeElement = sibling;
                    break;
                }
            }
        }

        if (insertBeforeElement) {
            if (this.#placeholderElement.nextSibling !== insertBeforeElement) {
                this.#animateLayoutChange(targetContainer, () => {
                    targetContainer.insertBefore(this.#placeholderElement, insertBeforeElement);
                });
            }
        } else {
            if (targetContainer.lastElementChild !== this.#placeholderElement) {
                this.#animateLayoutChange(targetContainer, () => {
                    targetContainer.appendChild(this.#placeholderElement);
                });
            }
        }
    }

    #animateLayoutChange(containerElement, changeDOM) {
        const duration = Number(this.#options.animation) || 0;
        if (duration <= 0 || typeof Element === "undefined" || !Element.prototype.animate) {
            changeDOM();
            return;
        }

        const getAnimatedChildren = () => [...containerElement.children].filter(child =>
            child !== this.#draggedElement &&
            child !== this.#placeholderElement &&
            (!this.#options.filter || !child.matches(this.#options.filter))
        );

        const firstRects = new Map(
            getAnimatedChildren().map(child => [child, child.getBoundingClientRect()])
        );

        changeDOM();

        for (const child of getAnimatedChildren()) {
            const firstRect = firstRects.get(child);
            if (!firstRect) continue;

            const lastRect = child.getBoundingClientRect();
            const deltaX = firstRect.left - lastRect.left;
            const deltaY = firstRect.top - lastRect.top;
            if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue;

            this.#layoutAnimations.get(child)?.cancel();
            const animation = child.animate(
                [
                    { transform: `translate(${deltaX}px, ${deltaY}px)` },
                    { transform: "translate(0, 0)" },
                ],
                {
                    duration,
                    easing: "ease",
                    fill: "both",
                }
            );
            this.#layoutAnimations.set(child, animation);
            animation.finished
                .catch(() => {})
                .finally(() => {
                    if (this.#layoutAnimations.get(child) === animation) {
                        this.#layoutAnimations.delete(child);
                    }
                });
        }
    }

    #getGridInsertBeforeElement(children, pointerX, pointerY) {
        if (!children.length) return null;

        const rowTolerance = 4;
        const rows = [];

        for (const element of children) {
            const rect = element.getBoundingClientRect();
            let row = rows.find(candidate => Math.abs(candidate.top - rect.top) <= rowTolerance);

            if (!row) {
                row = { top: rect.top, bottom: rect.bottom, items: [] };
                rows.push(row);
            }

            row.top = Math.min(row.top, rect.top);
            row.bottom = Math.max(row.bottom, rect.bottom);
            row.items.push({ element, rect });
        }

        rows.sort((a, b) => a.top - b.top);
        rows.forEach(row => row.items.sort((a, b) => a.rect.left - b.rect.left));

        let targetRow = rows[rows.length - 1];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const nextRow = rows[i + 1] ?? null;

            if (pointerY < row.top) {
                targetRow = row;
                break;
            }
            if (pointerY <= row.bottom) {
                targetRow = row;
                break;
            }
            if (nextRow && pointerY < nextRow.top) {
                targetRow = pointerY < row.bottom + (nextRow.top - row.bottom) / 2
                    ? row
                    : nextRow;
                break;
            }
        }

        for (const item of targetRow.items) {
            if (pointerX < item.rect.left + item.rect.width / 2) {
                return item.element;
            }
        }

        const nextRow = rows[rows.indexOf(targetRow) + 1];
        return nextRow?.items[0]?.element ?? null;
    }

    #resolveDirection(containerElement) {
        if (this.#options.direction !== "auto") return this.#options.direction;
        const style = getComputedStyle(containerElement);
        if (style.display === "grid" || style.display === "inline-grid") return "grid";
        if (style.display === "flex" || style.display === "inline-flex") {
            return (style.flexDirection === "row" || style.flexDirection === "row-reverse")
                ? "horizontal"
                : "vertical";
        }
        return "vertical";
    }

    #findDraggableParent(targetElement) {
        let current = targetElement;
        while (current && current !== this.#containerElement) {
            if (current.parentElement === this.#containerElement) return current;
            current = current.parentElement;
        }
        return null;
    }

    #findTargetContainer(pointerX, pointerY) {
        const groupName = this.#options.group;
        if (!groupName) return this.#containerElement;

        const groupInstances = UA_Sortable.getGroup(groupName);
        for (const instance of groupInstances) {
            if (instance === this) continue;
            if (instance.#options.disabled) continue;
            const containerRect = instance.#containerElement.getBoundingClientRect();
            if (
                pointerX >= containerRect.left &&
                pointerX <= containerRect.right &&
                pointerY >= containerRect.top  &&
                pointerY <= containerRect.bottom
            ) {
                return instance.#containerElement;
            }
        }
        return this.#containerElement;
    }
}

// --- Inject minimal CSS once ---
(function injectUASortableCSS() {
    if (typeof document === "undefined") return;
    if (document.getElementById("ua-sortable-styles")) return;
    const style = document.createElement("style");
    style.id = "ua-sortable-styles";
    style.textContent = [
        ".ua-sortable-drag{opacity:.95;box-shadow:0 8px 24px rgba(0,0,0,.18);transition:box-shadow .15s;}",
        ".ua-sortable-placeholder{border:2px dashed rgba(0,0,0,.18);border-radius:3px;box-sizing:border-box;background:rgba(0,0,0,.03);}",
        ".ua-sortable-active>.ua-sortable-over{border-top:2px solid var(--accent,#2563eb);}",
        ".ua-drag-handle{cursor:grab;touch-action:none;}",
        ".ua-drag-handle:active{cursor:grabbing;}",
    ].join("");
    document.head.appendChild(style);
})();

/**
 * Shorthand: make a container element sortable.
 * @param {HTMLElement} el
 * @param {object} [options]
 * @returns {UA_Sortable}
 */
export function uaMakeSortable(el, options = {}) {
    return new UA_Sortable(el, options);
}
