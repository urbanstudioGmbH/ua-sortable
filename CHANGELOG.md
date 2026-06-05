# Changelog

All notable changes to `@urbanstudio/ua-sortable` will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.1] — 2026-06-05

### Fixed
- Drag direction detection: `direction: "auto"` now checks `display:flex/inline-flex` before reading `flex-direction` — previously non-flex containers were incorrectly detected as `horizontal` (CSS default value for `flex-direction` is `row` even on block elements)
- Placeholder now visible during drag as a dashed drop-indicator box (was `visibility:hidden`)
- `setPointerCapture` is now called before `pointer-events:none` is applied — fixes drag-down failing in some browsers
- Text selection during drag suppressed via `document.body.style.userSelect = "none"`
- Cross-frame compatibility: `instanceof HTMLElement` replaced with `nodeType === 1` check
- Original element is now used as its own drag ghost (no `cloneNode`) — renders with all inherited CSS intact

---

## [1.0.0] — 2026-06-05

### Added
- Initial release
- `UA_Sortable` class with full API (options, callbacks, instance + static methods)
- Pointer Events based drag (mouse, touch, stylus — no separate handling)
- `direction: "auto"` — detects `flex-direction` via `getComputedStyle`
- Cross-list drag via `group` option
- `confirm` callback for cross-list drops with async support
- `onSort`, `onMove`, `onDragStart`, `onDragEnd` callbacks
- `handle`, `filter`, `delay`, `delayOnTouchOnly` options
- `UA_Sortable.get()`, `getGroup()`, `snapshot()` static methods
- `UA_Sortable.initAll()` and `UA_Sortable.observe()` for declarative HTML API
- `data-ua-sortable` attribute + `data-sortable-*` attributes for HTML init
- `uaMakeSortable()` shorthand function
- Auto-injected minimal CSS (`ua-sortable-ghost`, `ua-drag-handle`, etc.)
- MutationObserver on container for auto-refresh on child changes
- ESM build (`src/Sortable.js`) + IIFE/CJS build (`dist/ua-sortable.js`)
