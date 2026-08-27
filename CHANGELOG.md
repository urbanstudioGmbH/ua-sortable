# Changelog

All notable changes to `@urbanstudio/ua-sortable` will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.5] — 2026-08-27

### Changed
- **npm publishing**: Switched the release workflow from a long-lived npm token to trusted publishing with GitHub Actions OIDC.
- **cdnjs metadata**: Updated the repository metadata to the current cdnjs package schema.

---

## [1.0.4] — 2026-06-07

### Fixed
- **Grid sorting stability**: Grid placeholder positioning now groups items by visual rows and uses row-aware midpoint checks instead of depending on the exact element under the pointer. This avoids placeholder oscillation in multi-row grids.
- **Layout animation**: The `animation` option now performs FLIP-style layout animations for items that shift around the placeholder. `0` disables these animations.

---

## [1.0.3] — 2026-06-06

### Fixed
- **Grid placeholder height**: Added `align-self:start` to prevent grid containers from stretching the placeholder to full row height.
- **Grid placeholder position**: Replaced row-based Y-scan with an exact X+Y hit-test to find the hovered cell — placeholder now correctly follows the pointer across all columns, not just the first.
- **Drag flicker**: `#updatePlaceholderPosition` is now throttled via `requestAnimationFrame` — DOM insertions only happen once per frame instead of on every `pointermove` event. Ghost element position still updates immediately.
- **Redundant DOM moves**: Placeholder `insertBefore`/`appendChild` is skipped when the placeholder is already in the correct position.

---

## [1.0.2] — 2026-06-06

### Fixed
- **Filter — nested descendants**: `filter` option now uses `closest()` so clicking any descendant of a filtered element (e.g. a button inside a `.btngroup`) correctly suppresses drag start. Previously only exact-match elements were excluded.
- **Grid containers**: `direction: "auto"` now correctly detects `display:grid` and `display:inline-grid` containers and uses 2D placeholder positioning. Previously grid containers fell through to the vertical path.
- **Grid placeholder position**: When dragging in a grid, the placeholder is inserted after the hovered cell when the pointer is on the right half — previously always inserted before.
- **Confirm dialog freeze**: Pointer listeners (`pointermove`, `pointerup`, `pointercancel`) are now removed before awaiting the `confirm` callback, preventing ghost movement during the dialog.
- **Cross-container revert**: `#revertDrag` no longer calls `insertBefore` for cross-container drops (item is already in the source container); only same-container reverts move the element back.

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
