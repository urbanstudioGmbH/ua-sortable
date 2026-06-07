# ua-sortable

**Pointer-Events-based drag-and-drop sorting for lists and grids.**  
No dependencies. No jQuery. No CDN required. Pure browser APIs.

[![npm](https://img.shields.io/npm/v/@urbanstudio/ua-sortable)](https://www.npmjs.com/package/@urbanstudio/ua-sortable)
[![license](https://img.shields.io/npm/l/@urbanstudio/ua-sortable)](LICENSE)
[![CDN](https://img.shields.io/badge/CDN-jsDelivr-orange)](https://cdn.jsdelivr.net/npm/@urbanstudio/ua-sortable/src/Sortable.js)

---

## What it does

`UA_Sortable` makes any list or grid container sortable by drag-and-drop using native [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events). Works with mouse, touch, and stylus — no special handling needed.

```js
new UA_Sortable(document.getElementById("myList"));
```

That is: one line to get a sortable list, one callback to persist the order, zero dependencies.

---

## Install

**npm:**
```sh
npm install @urbanstudio/ua-sortable
```

**CDN (jsDelivr — ESM):**
```html
<script type="module">
  import { UA_Sortable } from "https://cdn.jsdelivr.net/npm/@urbanstudio/ua-sortable/src/Sortable.js";
</script>
```

**CDN (jsDelivr — browser global `<script>`):**
```html
<script src="https://cdn.jsdelivr.net/npm/@urbanstudio/ua-sortable/dist/ua-sortable.js"></script>
```

**CDN (unpkg):**
```html
<script src="https://unpkg.com/@urbanstudio/ua-sortable/dist/ua-sortable.js"></script>
```

---

## Quick start

```js
import { UA_Sortable } from "@urbanstudio/ua-sortable";

new UA_Sortable(document.querySelector("ul"), {
    handle:    ".drag-handle",
    animation: 150,
    onSort:    (ids) => console.log("new order:", ids),
});
```

Or with the shorthand:
```js
import { uaMakeSortable } from "@urbanstudio/ua-sortable";

const sortable = uaMakeSortable(document.querySelector("ul"), {
    handle: ".drag-handle",
});
```

Or declarative HTML — auto-initialized by `UA_Sortable.observe()`:
```html
<ul data-ua-sortable data-sortable-handle=".drag-handle" data-sortable-group="tasks">
  <li data-id="1">Item 1 <span class="drag-handle">⠿</span></li>
  <li data-id="2">Item 2 <span class="drag-handle">⠿</span></li>
</ul>

<script type="module">
  import { UA_Sortable } from "@urbanstudio/ua-sortable";
  UA_Sortable.observe(document.body);
</script>
```

---

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `handle` | `string\|null` | `null` | CSS selector for drag handle. `null` = whole item is draggable. |
| `filter` | `string\|null` | `null` | CSS selector for items excluded from drag. |
| `group` | `string\|null` | `null` | Group name for cross-list drag. |
| `direction` | `string` | `"auto"` | `"vertical"`, `"horizontal"`, or `"auto"` (detects `flex-direction`; `grid`/`inline-grid` containers are treated as grid). |
| `animation` | `number` | `150` | Layout animation duration in ms when items shift around the placeholder. `0` = disabled. |
| `dataIdAttr` | `string` | `"data-id"` | Attribute used to identify items in callbacks. |
| `delay` | `number` | `0` | ms before drag starts after pointerdown. |
| `delayOnTouchOnly` | `boolean` | `false` | Apply `delay` only for touch input. |
| `disabled` | `boolean` | `false` | Disable drag on this instance. |
| `dragClass` | `string` | `"ua-sortable-drag"` | Class added to the dragged item while dragging. |
| `confirm` | `function\|null` | `null` | `(movedId, from, to) => Promise<bool>` — called before cross-list drop. Return `false` to cancel. |
| `onDragStart` | `function\|null` | `null` | `(el)` — drag begins. |
| `onDragEnd` | `function\|null` | `null` | `(el, didMove: bool)` — drag ends. |
| `onSort` | `function\|null` | `null` | `(ids[], container)` — order changed within same list. |
| `onMove` | `function\|null` | `null` | `(movedId, from, to, fromIds[], toIds[]) => bool\|Promise<bool>` — item moved to other list. |

---

## Instance methods

| Method | Description |
|--------|-------------|
| `toArray()` | IDs of all draggable children in current DOM order. |
| `enable()` | Enable drag. |
| `disable()` | Disable drag. |
| `refresh()` | Re-scan draggable children (after manual DOM changes). |
| `destroy()` | Remove all listeners, disconnect observers, unregister. |
| `option(name)` | Get option value. |
| `option(name, value)` | Set option value at runtime. |

---

## Static methods

| Method | Description |
|--------|-------------|
| `UA_Sortable.get(el)` | Instance for a container element. |
| `UA_Sortable.getGroup(name)` | All instances with this group name. |
| `UA_Sortable.snapshot(group?)` | `[{container, ids, group}]` — current order of all grouped instances. |
| `UA_Sortable.initAll(root?)` | Initialize all `[data-ua-sortable]` in `root`. |
| `UA_Sortable.observe(root)` | MutationObserver — auto-init new `[data-ua-sortable]` containers. |

---

## Cross-list drag

Containers sharing the same `group` name accept each other's items:

```js
const opts = {
    group: "tasks",
    onMove: (id, from, to, fromIds, toIds) => {
        api.moveTask(id, to.dataset.listId);
    },
};
new UA_Sortable(document.querySelector("#todo"),  opts);
new UA_Sortable(document.querySelector("#doing"), opts);
new UA_Sortable(document.querySelector("#done"),  opts);
```

With a confirmation dialog before cross-list drop:
```js
new UA_Sortable(el, {
    group: "rooms",
    confirm: async (id, from, to) => confirm(`Move item to "${to.dataset.label}"?`),
    onMove:  (id, from, to) => api.moveToSection(id, to.dataset.sectionId),
});
```

---

## Snapshot

```js
// Read current order of all containers in a group
const state = UA_Sortable.snapshot("tasks");
// [{ container: HTMLElement, ids: ["id1", "id2"], group: "tasks" }, ...]

state.forEach(({ container, ids }) => {
    api.saveOrder(container.dataset.listId, ids);
});
```

---

## CSS

Minimal styles are **injected automatically** on first use — no stylesheet to include.

```css
.ua-sortable-drag        { opacity: .95; box-shadow: 0 8px 24px rgba(0,0,0,.18); }
.ua-sortable-placeholder { border: 2px dashed rgba(0,0,0,.18); border-radius: 3px; background: rgba(0,0,0,.03); }
.ua-drag-handle          { cursor: grab; touch-action: none; }
.ua-drag-handle:active   { cursor: grabbing; }
```

The drop indicator uses `--accent` (CSS custom property) with fallback `#2563eb`.  
Override any of these in your own stylesheet.

---

## HTML attributes

When using `UA_Sortable.observe()` or `UA_Sortable.initAll()`:

| Attribute | Option |
|-----------|--------|
| `data-ua-sortable` | triggers init |
| `data-sortable-handle` | `handle` |
| `data-sortable-filter` | `filter` |
| `data-sortable-group` | `group` |
| `data-sortable-direction` | `direction` |
| `data-sortable-animation` | `animation` |
| `data-sortable-delay` | `delay` |

---

## Browser support

Pointer Events: Chrome 55+, Firefox 59+, Safari 13+, Edge 79+.  
No polyfills required.

---

## Design principles

`ua-sortable` tries to stay small and predictable.

It does not try to replace SortableJS.  
It does not try to support IE11.  
It does not ship a bundler, a build step, or a runtime dependency.

It simply:
1. listens for pointer events
2. moves a placeholder element as you drag
3. calls your callback with the new order

For everything else, use the `onMove` / `onSort` callbacks.

---

## License

MIT License

Copyright (c) 2026 Marian Feiler, [urbanstudio GmbH](https://urbanstudio.de)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
