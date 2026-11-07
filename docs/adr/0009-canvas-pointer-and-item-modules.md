# ADR 0009: Canvas pointer host and item renderer modules

- Status: Proposed
- Date: 2026-11-07
- Deciders: GridScalr maintainer
- Supersedes: none
- Related: [0001](0001-feature-modules.md), [0008](0008-integration-module-boundaries.md), [#60](https://github.com/MajorJohnDoe/gridscalr/issues/60)

## Context

`CanvasView` still owns the pointer event listeners, gesture state and the
decision of which gesture a pointer event starts. Item rendering has already
been split into `src/canvas/items/`, leaving `src/canvas/itemRenderer.ts` as a
thin dispatcher. The remaining work needs an explicit boundary so pointer logic
cannot grow back into `CanvasView` and so new item families cannot regrow the
dispatcher.

The pointer work is risky because event ordering, pointer capture, double-click,
pen/touch priority and platform webview quirks are not fully covered by unit
tests. A single large extraction would make regressions hard to attribute.

## Decision

### Pointer controller

`PointerController` owns pointer input, gesture state and the decision of which
gesture a pointer event starts. `CanvasView` keeps the scene: renderer, canvases,
page sizes, hit testing, editors, draft creation, crop mode and the public test
API.

```text
src/canvas/pointer/
  PointerController.ts  event state machine, cursor, wheel, long-press and gesture dispatch
  PointerHost.ts        the explicit host surface CanvasView implements
  contextMenu.ts        context menus, measurement-label actions and label connections
  creation.ts           creation-tool pointer-down branches and draft start/finish
  doubleClick.ts        double-click target resolution and edit dispatch
  drag.ts               item move, vertex, label and measurement-label drag
  transform.ts          resize, group scale and rotation application
  pointerState.ts       drag, marquee and pan state shapes
  groupHandles.ts       group selection handles shared by pointer and renderer
```

`PointerHost` exposes only the scene facts and commands the controller needs:

- geometry: `isReadOnly`, `viewport`;
- mode: `cropActive`, `cropCursor`;
- gesture state: `dragState`, `labelConnectActive`;
- hover: `hoverHandle`, `hoverLabelResize`;
- commands: `setHostCursor`, `drawInteraction`, `zoomAt`, `cancelGesture`,
  `openContextMenu`.

The list is deliberately explicit. If a later gesture needs a new fact, it is
added to `PointerHost` and documented in the same change. The controller may
import `store` and `src/model`, but never `CanvasView`.

### Item renderer modules

`src/canvas/itemRenderer.ts` is a public dispatcher under 200 lines. One module
per item family lives under `src/canvas/items/`:

```text
src/canvas/items/
  context.ts       ItemRenderContext and shared panel/label helpers
  dispatch.ts      rotation, shared setup and the kind switch
  measurement.ts   length, angle, slope, radius, diameter, arc, area, volume
  shapes.ts        pen, line, arrow, rect, ellipse, highlight, polyline, rail, cloud shape
  text.ts          text, textbox and rich text runs
  symbols.ts       symbol, tag and inspection badge
  images.ts        image drawing and opacity
  annotations.ts   callout, stamp, delta and cloud label
  counts.ts        count symbol and count-type glyph
```

Shared setup stays in `dispatch.ts`. Family modules receive the existing render
context and never read `CanvasView` fields or DOM state.

### File budgets

`file-budgets.json` is blocking in CI. A listed file may not grow above its
recorded budget; every extraction lowers its recorded line count. New files under
`src/canvas/items/` are limited to 400 lines and new files under
`src/canvas/pointer/` to 500 lines. Generated files are excluded.

## Consequences

- `CanvasView` remains the integration point for the scene and test bridge, but
  pointer gestures and item drawing live in modules.
- The pointer extraction can land in reviewable steps: host and helpers first,
  then marquee/pan, drag/transform, creation, touch, context menus and finally
  the cutover that deletes the old handlers.
- Shared pointer state and event ordering must be preserved exactly; the
  regression gate is `test:canvas`, `test:touch`, `test:ui` and the screenshot
  diff after every step.
- Adding a pointer feature means adding a documented `PointerHost` method rather
  than reaching into `CanvasView`.
