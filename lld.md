# Spreadsheet — Low-Level Design (LLD)

> **Companion to** [`data_layer.md`](./data_layer.md).
> `data_layer.md` specifies the **engine** (cell model, parser, dependency graph, recalc).
> This document specifies **how the whole system fits together** — the UI layer, the
> store boundary, the data-flow for every interaction, the keyboard/navigation state
> machine, the targeted re-render mechanism, and the test plan.
>
> Where the two overlap, `data_layer.md` is the source of truth for engine internals;
> this doc is the source of truth for the **UI ↔ store ↔ engine** contract.

---

## 0. Decisions to Lock Before Implementation

The scaffold is **Create React App + React 19 (JavaScript)**. The design doc is written in
TypeScript notation. The following choices are proposed; they shape every file below.

> **Status:** D1 (TypeScript) and D2–D3 (Zustand + @tanstack/react-virtual) are **confirmed**.

| # | Decision | Proposal | Rationale |
|---|---|---|---|
| D1 | Language | **TypeScript** (`.ts`/`.tsx`) | The engine is type-heavy (AST, unions, maps). Types are the cheapest correctness guarantee and the design is already typed. CRA supports TS with zero config. |
| D2 | State container | **Zustand** | Matches `data_layer.md`; selector subscriptions give us per-cell re-renders for free. Alternative considered: a hand-rolled store + `useSyncExternalStore` (drops a dep but re-implements selector equality). |
| D3 | Virtualization | **@tanstack/react-virtual** | Row **and** column windowing in one hook (`useVirtualizer` ×2). Alternative: `react-window` (needs `VariableSizeGrid`, less ergonomic for synced headers). |
| D4 | Test runner | **Jest + React Testing Library** (CRA default) | Already wired via `react-scripts test`. Engine tests are pure-function tests; no DOM needed for them. |
| D5 | Grid size | **26 cols (A–Z) × 100 rows**, fixed cell size (`W=96px`, `H=28px`) | Spec minimum. Fixed sizing keeps the virtualizer cheap and scroll-into-view math trivial. Columns beyond Z are out of scope. |
| D6 | Styling | **Tailwind CSS** (utility classes; CRACO or `@craco/craco` to inject the PostCSS pipeline into CRA 5) | Utility-first classes are highly AI-legible and AI-writable, keep styling co-located with markup, and avoid a separate CSS-naming layer. See §11. |
| D7 | i18n | **react-i18next + i18next** | Industry-standard, lazy namespace loading, pluralization, `Intl`-backed number/date formatting. All user-facing strings & number formats route through it. See §12. |
| D8 | a11y | **Native ARIA grid pattern** (no extra lib) — `role="grid"/"row"/"columnheader"/"rowheader"/"gridcell"`, roving `tabIndex`, live region for errors | The WAI-ARIA grid pattern is well specified and screen-reader tested; a library would add weight without covering our virtualized, single-focus model. See §13. |
| D9 | Persistence | **localStorage**, debounced, storing **only `raw` values** via `engine.snapshot()` | Reuses the engine's existing `snapshot/restore` (data_layer §8). Synchronous, zero-dep, survives reload. `raw`-only keeps payload tiny and lets computed values rebuild deterministically. See §14. |

> **Status:** D6–D9 (Tailwind, react-i18next, ARIA grid, localStorage) are **confirmed** additions.
> If TS is rejected, the same structure holds with `.js` + JSDoc `@typedef`s; only file
> extensions and the `tsconfig` change.

New dependencies to add:
- **Runtime:** `zustand`, `@tanstack/react-virtual`, `i18next`, `react-i18next`.
- **Styling (dev):** `tailwindcss`, `postcss`, `autoprefixer`, `@craco/craco` (CRA 5 ships
  PostCSS 7 internally; CRACO lets us point CRA at a Tailwind-compatible PostCSS config
  without ejecting).
- **Types (dev):** `typescript` + `@types/*`.

---

## 1. System Layering & Dependency Rule

```
┌──────────────────────────────────────────────────────────────────────┐
│ UI LAYER (React, .tsx)                                                 │
│   App → FormulaBar                                                      │
│       → VirtualGrid → ColHeader / RowHeader / Cell → CellEditor         │
│   GridKeyboardController (non-visual, owns key handling)               │
└───────────────┬────────────────────────────────────────────────────────┘
                │ hooks: useSpreadsheetStore(selector)
┌───────────────▼────────────────────────────────────────────────────────┐
│ STORE LAYER (Zustand)  — the ONLY bridge between UI and engine          │
│   ui state: selectedCell, editingCell, editBuffer                       │
│   versions: Map<CellId, number>   (per-cell re-render signal)           │
│   actions:  selectCell, enterEditMode, updateBuffer, commitEdit,        │
│             discardEdit, navigate                                       │
└───────────────┬────────────────────────────────────────────────────────┘
                │ engine.setCellRaw() / engine.getCell()
┌───────────────▼────────────────────────────────────────────────────────┐
│ ENGINE LAYER (pure, framework-free)  — specified in data_layer.md       │
│   SpreadsheetEngine · DependencyGraph · FormulaParser · Evaluator       │
└──────────────────────────────────────────────────────────────────────┘
```

**Dependency rule (enforced by review + lint boundaries):**

1. `engine/**` imports nothing from `react`, `zustand`, or `components/**`.
2. `components/**` never calls `engine.*` directly — only through store actions/selectors.
3. The store is the only module that holds an `engine` instance.

This is what makes the engine unit-testable headless and the UI swappable.

**Cross-cutting concerns** (Tailwind §11, i18n §12, a11y §13) live entirely in the **UI
layer**. The engine and store stay framework- and locale-agnostic: the engine emits
machine codes (`CellError`, raw `number`/`string`), and the UI layer is the single place
that formats numbers for a locale, translates labels, and emits ARIA semantics.

---

## 2. Module Inventory & Responsibilities

```
src/
├── engine/                       # see data_layer.md §10 for internals (locale/UI-agnostic)
│   ├── types.ts                  # CellId, Cell, CellValue, CellError, Direction
│   ├── RangeUtils.ts             # toCellId, parseCellId, colLetter, letterToIndex, expandRange, inBounds
│   ├── FormulaParser.ts          # tokenize + parse → AST + extractDeps
│   ├── FormulaEvaluator.ts       # evaluate(AST, getVal)
│   ├── DependencyGraph.ts        # forward/reverse maps, hasCycle, getRecalcOrder
│   ├── CellStore.ts              # Map<CellId,Cell> helpers, EMPTY_CELL, classifyType
│   └── SpreadsheetEngine.ts      # façade: setCellRaw / getCell / snapshot / restore
│
├── store/
│   ├── useSpreadsheetStore.ts    # Zustand store (state + actions + versions); wires persistence
│   ├── selectors.ts              # memoized selectors (useCell, useIsSelected, ...)
│   └── persistence.ts            # localStorage load/save of engine.snapshot() (§14)
│
├── ui/
│   ├── grid.config.ts            # ROWS, COLS, CELL_W, CELL_H, OVERSCAN
│   └── format.ts                 # displayValue(cell, t, nf) → string, errorKey(err), cellClasses(cell)
│
├── i18n/                         # §12
│   ├── index.ts                  # i18next init (lng detect, fallback 'en'), Intl.NumberFormat helper
│   └── locales/
│       ├── en/common.json        # UI labels, a11y aria-label templates, error display strings
│       └── <lang>/common.json    # additional locales (e.g. fr, hi) — same key shape
│
├── components/
│   ├── App.tsx                   # layout: FormulaBar + VirtualGrid; mounts keyboard controller
│   ├── FormulaBar.tsx            # shows raw of selectedCell; editable entry point
│   ├── VirtualGrid.tsx           # role="grid"; TanStack row+col virtualizer, scroll container, sticky headers
│   ├── ColHeader.tsx             # role="columnheader"; A..Z, highlights active column
│   ├── RowHeader.tsx             # role="rowheader"; 1..100, highlights active row
│   ├── Cell.tsx                  # role="gridcell"; version-gated display cell (memoized)
│   ├── CellEditor.tsx            # controlled <input> shown only for editingCell
│   ├── LiveRegion.tsx            # aria-live announcer for selection/errors (§13)
│   ├── LanguageSwitcher.tsx      # optional locale toggle (§12)
│   └── useGridKeyboard.ts        # keydown → store.navigate / enterEditMode / commit / discard
│
├── index.css                     # Tailwind @tailwind base/components/utilities (§11)
├── tailwind.config.js            # content globs, theme tokens (cell sizes mirror grid.config)
├── postcss.config.js             # tailwindcss + autoprefixer
├── craco.config.js               # injects PostCSS pipeline into CRA without eject
│
└── __tests__/                    # see §9
```

### 2.1 New UI-support modules (not in data_layer.md)

| Module | Responsibility | Key exports |
|---|---|---|
| `ui/grid.config.ts` | Single source of dimensions | `ROWS`, `COLS`, `CELL_W`, `CELL_H`, `OVERSCAN` |
| `ui/format.ts` | Map a `Cell` to a **locale-formatted** display string + Tailwind class set. The **only** place rendering interprets `type`/`error` and applies `Intl` number formatting. | `displayValue(cell, t, nf)`, `cellClasses(cell)`, `ERROR_KEY` |
| `i18n/index.ts` | i18next bootstrap + a shared `Intl.NumberFormat` keyed to active locale | `i18n`, `useNumberFormat()` |
| `components/LiveRegion.tsx` | Single polite/assertive `aria-live` region for screen-reader announcements | `<LiveRegion/>`, `announce(msg)` |
| `components/useGridKeyboard.ts` | Centralized keyboard state machine (§6) | `useGridKeyboard()` |
| `store/selectors.ts` | Stable, granular selectors so components subscribe to the minimum slice | `useCell(id)`, `useSelected()`, `useEditing()` |
| `store/persistence.ts` | Load/save the engine snapshot to localStorage; debounced, versioned, fail-safe | `loadSnapshot()`, `saveSnapshot(snap)`, `scheduleSave()`, `clearSaved()`, `STORAGE_KEY` |

---

## 3. The Store Contract (the critical boundary)

```ts
interface SpreadsheetState {
  /** Stable engine instance — created once, never replaced.
   *  Hydrated from localStorage at store-creation time (§14.3). */
  engine: SpreadsheetEngine;

  /** Per-cell re-render signal. Bumped for every cell in `affected`. */
  versions: Map<CellId, number>;

  // ---- UI state ----
  selectedCell: CellId;          // always defined; defaults to "A1"
  editingCell:  CellId | null;   // null = not in edit mode
  editBuffer:   string;          // live text while editing (mirrors the <input>)

  // ---- actions ----
  selectCell(id: CellId): void;
  enterEditMode(id: CellId, seed?: string): void; // seed = first typed char (type-to-edit)
  updateBuffer(value: string): void;
  commitEdit(opts?: { then?: Direction }): void;   // commit + optional navigate
  discardEdit(): void;
  navigate(dir: Direction): void;                  // moves selectedCell, clamped to grid
}

type Direction = 'up' | 'down' | 'left' | 'right' | 'tab' | 'shiftTab';
```

### 3.1 Why `versions: Map<CellId, number>`

`Cell` display data lives in the engine (a plain class, **not** reactive). React cannot
"see" engine mutations. The `versions` map is the reactive bridge:

- A `<Cell id>` subscribes to `versions.get(id)` via a selector.
- `commitEdit` bumps `versions` for **only** the `affected` ids returned by the engine.
- Zustand notifies subscribers; only the cells whose version changed re-render; each then
  pulls fresh data with `engine.getCell(id)`.

Result: editing `A1` re-renders `A1` + its dependents, never the whole grid. (§7)

### 3.2 Selectors (`store/selectors.ts`)

```ts
// Re-renders only when THIS cell's version changes.
export function useCell(id: CellId): Cell {
  const version = useSpreadsheetStore(s => s.versions.get(id) ?? 0);
  const engine  = useSpreadsheetStore(s => s.engine);
  // version is in the dep list so the memo recomputes on bump
  return useMemo(() => engine.getCell(id), [engine, id, version]);
}

export const useSelected = () => useSpreadsheetStore(s => s.selectedCell);
export const useEditing  = () => useSpreadsheetStore(s => s.editingCell);
```

> Selection highlight is handled WITHOUT re-rendering every cell: see §7.3.

---

## 4. Action Semantics (precise behavior)

### 4.1 `selectCell(id)`
- Set `selectedCell = id`.
- If currently editing a **different** cell → `commitEdit()` first (Sheets-like behavior).
- Does **not** enter edit mode.

### 4.2 `enterEditMode(id, seed?)`
- `editingCell = id`, `selectedCell = id`.
- `editBuffer = seed ?? engine.getCell(id).raw`.
  - Double-click / `Enter` / `F2` → `seed` undefined → buffer = existing raw (cursor at end).
  - Printable keypress (type-to-replace) → `seed` = that char → buffer = char (overwrite).

### 4.3 `updateBuffer(value)`
- `editBuffer = value`. Pure UI state; engine untouched. No recalculation while typing.

### 4.4 `commitEdit({ then })`  — **the only writer to the engine**
```
1. if editingCell == null: if (then) navigate(then); return.
2. raw = editBuffer
3. if raw === engine.getCell(editingCell).raw: no-op write → skip to 5 (no save)
4. result = engine.setCellRaw(editingCell, raw)   // → { affected: CellId[] }
   bumpVersions(result.affected)                   // triggers targeted re-render
   scheduleSave()                                  // debounced localStorage persist (§14.2)
5. editingCell = null; editBuffer = ""
6. if (then) navigate(then)
```
Commit triggers: `Enter` (`then:'down'`), `Tab` (`then:'tab'`), blur, selecting another cell.
`scheduleSave()` is the **only** persistence trigger on the write path — it runs after every
mutating commit (and after a cell clear, §6.1), never on selection or navigation.

### 4.5 `discardEdit()`
- `editingCell = null`, `editBuffer = ""`. Engine and versions untouched. Bound to `Escape`.
- No save (nothing changed).

### 4.6 `navigate(dir)`
- Compute next `(col,row)` from `selectedCell`, clamp to `[0,COLS) × [1,ROWS]`.
- `tab` = right (wrap optional, **off** for v1), `shiftTab` = left.
- Set `selectedCell`. The grid reacts by scrolling it into view (§7.4).
- If editing when navigation arrives via Tab/Enter, commit already happened in `commitEdit`.

---

## 5. Component Contracts

> All components consume `useTranslation()` for labels and the shared `useNumberFormat()`
> for numbers. ARIA roles per the WAI-ARIA grid pattern are noted inline (full spec §13).

### 5.1 `App.tsx`
- Renders `<FormulaBar/>` (top) + `<VirtualGrid/>` (fills remaining height) + `<LiveRegion/>`.
- Calls `useGridKeyboard()` once to install the global key handler on the grid container.
- Holds no business state. Wraps tree in `<Suspense>` for i18n namespace load.
- `lang` attribute on `<html>` kept in sync with active locale (set in `i18n/index.ts`).

### 5.2 `FormulaBar.tsx`
- Reads `selectedCell` + `useCell(selectedCell).raw`.
- Shows cell ref label (e.g. `A1`) + the **raw** string (formula or literal), per spec §6.
- Editing in the bar mirrors `editBuffer` and commits on Enter — same `commitEdit` path.
- **i18n**: visible label via `t('formulaBar.label')`. **a11y**: `<input aria-label=…>`,
  `aria-describedby` pointing at the active cell ref so SRs read "Formula for B3".

### 5.3 `VirtualGrid.tsx`
```ts
// Pseudo-contract
const rowV = useVirtualizer({ count: ROWS, getScrollElement: () => ref.current,
                              estimateSize: () => CELL_H, overscan: OVERSCAN });
const colV = useVirtualizer({ horizontal: true, count: COLS,
                              getScrollElement: () => ref.current,
                              estimateSize: () => CELL_W, overscan: OVERSCAN });
```
- Owns the single scroll container (`ref`). Renders only `rowV.getVirtualItems() ×
  colV.getVirtualItems()` cells (windowing).
- Sticky `ColHeader` (top) and `RowHeader` (left), kept in sync with the same virtualizers.
- Exposes `scrollCellIntoView(id)` (via ref/imperative handle or an effect on `selectedCell`).
- **a11y**: container `role="grid"`, `aria-rowcount={ROWS}` / `aria-colcount={COLS}` (the
  TRUE totals, not the windowed count, so SRs announce "row 5 of 100"); each rendered row
  wrapper `role="row"` with `aria-rowindex` set to the **absolute** index. Styling via
  Tailwind utility classes (§11).

### 5.4 `Cell.tsx`  (the hot path — must be cheap)
```ts
interface CellProps { col: number; row: number; }  // id derived: toCellId(col,row)
```
- Wrapped in `React.memo`. Subscribes via `useCell(id)` → re-renders only on version bump.
- Renders `displayValue(cell, t, nf)` with `cellClasses(cell)` (Tailwind text/number/error variants).
- `onClick` → `selectCell(id)`; `onDoubleClick` → `enterEditMode(id)`.
- If `editingCell === id`, renders `<CellEditor/>` instead of static text.
- Does **not** read `selectedCell` (avoids all cells re-rendering on selection move — §7.3).
- **a11y**: `role="gridcell"`, `aria-colindex` (absolute), and a computed `aria-label` that
  reads the **meaning** not the cell internals — e.g. `t('cell.aria', { ref:'B3',
  value: nf.format(30), formula:'=A1+B1' })` → "B3, 30, formula A1 plus B1". Error cells
  set `aria-label` to the spoken error (`t('error.divZero')`) so SRs don't read "#DIV/0!"
  literally. Roving `tabIndex`: `0` only for the selected cell, `-1` otherwise (§13.2).

### 5.5 `CellEditor.tsx`
- Controlled `<input value={editBuffer} onChange={updateBuffer}/>`, autofocused.
- Local `onKeyDown` is a no-op for navigation; the global controller (§6) handles
  Enter/Tab/Escape. `onBlur` → `commitEdit()`.
- **a11y**: `aria-label={t('cellEditor.aria', { ref })}`; focus is moved into the input on
  mount and returned to the gridcell on commit/discard so the SR focus ring is never lost.

### 5.6 `ColHeader.tsx` / `RowHeader.tsx`
- Render `colLetter(c)` / row number. Highlight the active col/row by subscribing to
  `selectedCell` (cheap — only two small components re-render on selection move).
- **a11y**: `role="columnheader"` / `role="rowheader"`. Column letters (A, B, …) are locale-
  invariant and stay literal; surrounding labels use `t()`.

### 5.7 `LiveRegion.tsx`
- A visually-hidden `aria-live="polite"` (and a second `assertive`) container.
- `announce(msg)` writes a string the SR reads aloud: selection moves ("B3, 30"), commit
  results, and errors ("Circular reference in B3"). Strings come from `t()` (§13.3).

---

## 6. Keyboard / Navigation State Machine (`useGridKeyboard.ts`)

Two modes: **NAVIGATE** (a cell selected, not editing) and **EDIT** (`editingCell != null`).

```
                ┌─────────── printable key / Enter / F2 / dblclick ──────────┐
                │                                                            ▼
        ┌───────────────┐                                          ┌──────────────────┐
        │   NAVIGATE     │                                          │       EDIT        │
        │ selectedCell   │                                          │ editingCell set   │
        └───────────────┘                                          └──────────────────┘
                ▲   │                                                   │   │   │
   Esc / commit │   │ Arrows→navigate                          Enter→commit(then:down)
                │   │ Tab→navigate(tab) / Shift+Tab→(shiftTab)  Tab  →commit(then:tab)
                │   │                                          Esc  →discardEdit
                └───┴──────────────────────────────────────────────┘
```

### 6.1 Key map

| Key | NAVIGATE | EDIT |
|---|---|---|
| `ArrowUp/Down/Left/Right` | `navigate(dir)` | (default input caret move) |
| `Enter` | `enterEditMode(sel)` | `commitEdit({then:'down'})` |
| `Shift+Enter` | `navigate('up')` | `commitEdit({then:'up'})` |
| `Tab` | `navigate('tab')` | `commitEdit({then:'tab'})` |
| `Shift+Tab` | `navigate('shiftTab')` | `commitEdit({then:'shiftTab'})` |
| `Escape` | — | `discardEdit()` |
| `F2` | `enterEditMode(sel)` | — |
| `Delete`/`Backspace` | `setCellRaw(sel,'')` (clear) | (default) |
| printable char | `enterEditMode(sel, char)` | (default typing) |

- Handler attached to the grid container; `preventDefault()` on Tab/Arrows/Enter to stop
  page scroll & focus loss.
- In EDIT mode, arrow keys are intentionally left to the input (caret movement), matching
  Excel's "enter" edit mode rather than "point" mode (documented limitation).

---

## 7. Rendering & Performance Strategy

This is the graded core; the mechanisms below map 1:1 to spec §7.

### 7.1 Windowing (virtual scrolling)
Only `visibleRows × visibleCols` (+ overscan) cells are mounted. For a typical viewport
(~20 rows × ~10 cols) that's ~200 DOM cells regardless of the 2,600-cell logical grid.

### 7.2 Targeted re-renders on edit
- `engine.setCellRaw` returns `affected` (the changed cell + transitive dependents only).
- Store bumps `versions` for exactly those ids.
- Each `<Cell>` subscribes to its own version → React re-renders only affected & mounted
  cells. Off-screen affected cells cost nothing until scrolled into view (they read fresh
  engine state on mount).

### 7.3 Selection highlight without grid-wide re-render
Naive approach (each cell reads `selectedCell`) re-renders **every mounted cell** on every
arrow press. We avoid this:
- Cells do not subscribe to `selectedCell`.
- A single absolutely-positioned **selection overlay** `<div>` is moved to
  `(col*CELL_W, row*CELL_H)` on selection change. Only that overlay + the two headers
  re-render. (Alternative: imperative `classList` toggle on prev/next cell DOM nodes.)

### 7.4 Auto-scroll active cell into view
`useEffect(() => rowV.scrollToIndex(row); colV.scrollToIndex(col), [selectedCell])` using
the virtualizers' `scrollToIndex({ align:'auto' })` so it only scrolls when off-screen.

### 7.5 Cheap cells
`Cell` is `React.memo`'d; `displayValue`/`cssClassFor` are pure and allocation-light;
handlers are stabilized (store actions are stable references in Zustand).

### 7.6 Recalc cost
Per edit: O(deps) graph update + O(affected) re-eval, not O(grid). Cycle check is one DFS
over the affected closure. At 26×100 this is microseconds.

---

## 8. End-to-End Sequence Flows

### 8.1 Edit & commit (`=A1+B1` into C1, Enter)
```
User dblclicks C1
  Cell.onDoubleClick → store.enterEditMode("C1")
    editingCell="C1"; editBuffer="" (or existing raw)
  <CellEditor> mounts, autofocus
User types "=A1+B1" → updateBuffer (per keystroke, engine untouched)
User presses Enter
  useGridKeyboard (EDIT) → commitEdit({then:'down'})
    engine.setCellRaw("C1","=A1+B1")
      parse → AST; extractDeps → {A1,B1}
      updateDependencyGraph: reverse[A1] += C1, reverse[B1] += C1
      hasCycle? no
      getRecalcOrder → [C1] ; evaluate → 30 (say)
      returns { affected:["C1"] }
    bumpVersions(["C1"])
    editingCell=null
    navigate('down') → selectedCell="C4"... (C2)
  Zustand notifies → only <Cell C1> re-renders, shows 30
```

### 8.2 Propagation (edit A1 that C1 depends on)
```
commitEdit on A1
  engine.setCellRaw("A1","5")
    getRecalcOrder via reverse edges → [A1, C1, <further dependents…>] (topo-sorted)
    re-evaluate each in order
    returns { affected:["A1","C1", ...] }
  bumpVersions(affected) → A1 and C1 (if mounted) re-render
```

### 8.3 Circular reference (A1=`=B1`, B1=`=A1`)
```
commitEdit B1="=A1"
  setCellRaw: update graph → hasCycle(B1) = true (back edge to A1)
  markCycleError: A1,B1 → error:'CIRCULAR_REF', computed:'#CIRCULAR_REF'
  returns { affected:["A1","B1"] }
  both cells render error styling; FormulaBar still shows raw "=A1"
```

### 8.4 Arrow navigation
```
ArrowRight (NAVIGATE) → navigate('right')
  selectedCell = next clamped id
  selection overlay effect repositions div; headers re-highlight
  scrollToIndex if off-screen
  (NO cell re-renders)
```

---

## 9. Test Plan (maps to spec deliverables)

All engine tests are pure; no DOM. Target: the four required areas + edge cases.

### 9.1 `FormulaParser.test.ts` — parsing & extraction
- Literals: `"42"`→number, `"hello"`→text, `""`→empty.
- `=A1` → CellRef AST; `=A1+B2*2` → correct BinOp precedence (`*` binds tighter).
- Parens: `=(A1+B1)*2`.
- `=SUM(A1:A10)` / `=AVERAGE(B1:B5)` → RangeFunc with from/to.
- `extractDeps`: `=A1+SUM(B1:B3)` → `{A1,B1,B2,B3}`.
- Errors: `=A1+` → PARSE_ERROR; `=BLAH(A1:A2)` → NAME_ERROR; `=ZZ999` / out-of-bounds → INVALID_REF.

### 9.2 `FormulaEvaluator.test.ts` — evaluation correctness
- Arithmetic incl. precedence & parens; unary/empty-as-0 (`=A1+1` with A1 empty → 1).
- `SUM`/`AVERAGE` skipping empties; AVERAGE of empty range behavior (documented).
- `=1/0` → DIV_ZERO; text-in-arithmetic (`="x"+1`) → error.
- Injected `getVal` mock proves evaluator has no store dependency.

### 9.3 `DependencyGraph.test.ts` — graph updates
- Adding deps populates forward+reverse symmetrically.
- Editing a formula removes stale reverse edges (old dep no longer points to editor).
- Removing a formula clears its forward set and all its reverse contributions.
- `getRecalcOrder` returns topo order (`A1` before `B1=A1` before `C1=B1`).

### 9.4 `SpreadsheetEngine.test.ts` — integration / propagation / cycles
- Set A1=5, B1=`=A1*2` → B1.computed=10; edit A1=7 → B1 recalcs to 14 (propagation).
- `affected` list contains exactly the changed cell + dependents.
- Cycle: A1=`=B1`, B1=`=A1` → both CIRCULAR_REF; breaking the cycle recovers values.
- Self-ref A1=`=A1` → CIRCULAR_REF.
- `snapshot`/`restore` round-trip reproduces computed values from raw only.

### 9.5 UI smoke tests (RTL, lighter)
- Type into a cell + Enter commits and shows computed value.
- Escape discards.
- Arrow keys move selection; FormulaBar reflects selected cell's raw.

### 9.6 Cross-cutting tests (i18n + a11y) — see §12.5, §13.5
- `format.test.ts`: `displayValue` formats numbers per locale (`en` vs `fr`); error codes
  map to the right `display` glyph and `spoken` phrase.
- `jest-axe` smoke: rendered grid has no critical a11y violations.
- Focus/ARIA: selected cell has `tabIndex=0` (others `-1`); `aria-rowcount`/`aria-colcount`
  equal `ROWS`/`COLS`; arrow-key move updates `document.activeElement` + live-region text.

### 9.7 Persistence tests (`persistence.test.ts`) — see §14.6
- Round-trip: `saveSnapshot(engine.snapshot())` then `loadSnapshot()` → restoring into a
  fresh engine reproduces every cell's `raw` and recomputed value.
- Resilience: corrupt JSON, wrong `version`, and oversized/`QuotaExceededError` writes never
  throw — `loadSnapshot` returns `null`, `saveSnapshot` warns and no-ops.
- Debounce: N rapid `scheduleSave()` calls result in exactly one `localStorage.setItem`
  (fake timers); `beforeunload` flush forces an immediate write.
- Hydration: store created with a pre-seeded localStorage blob boots with those values.

---

## 10. Error Handling (UI surface of data_layer §9)

`ui/format.ts` is the single mapping point. Note it now takes `t` (translator) and `nf`
(`Intl.NumberFormat`) so display is **locale-aware**, and returns **Tailwind** class strings.
The engine still emits machine codes (`CellError`); the mapping to glyphs/words lives here.

```ts
// Maps engine codes → i18n keys. The visible glyph ("#DIV/0!") and the spoken
// text ("Division by zero") are BOTH defined in the locale files (§12), keyed off these.
const ERROR_KEY: Record<CellError, string> = {
  CIRCULAR_REF: 'error.circular', DIV_ZERO: 'error.divZero',
  INVALID_REF: 'error.ref', PARSE_ERROR: 'error.parse', NAME_ERROR: 'error.name',
};

function displayValue(cell: Cell, t: TFunction, nf: Intl.NumberFormat): string {
  if (cell.error) return t(`${ERROR_KEY[cell.error]}.display`);   // e.g. "#DIV/0!"
  if (cell.computed == null) return '';
  return typeof cell.computed === 'number' ? nf.format(cell.computed) : cell.computed;
}

// Spoken form for aria-label / live region (full words, not glyphs).
function ariaValue(cell: Cell, t: TFunction, nf: Intl.NumberFormat): string {
  if (cell.error) return t(`${ERROR_KEY[cell.error]}.spoken`);   // e.g. "Division by zero"
  return displayValue(cell, t, nf);
}

// Tailwind utility classes (numbers right-aligned, text left, errors red).
function cellClasses(cell: Cell): string {
  const base = 'h-7 px-1 leading-7 truncate border-b border-r border-gray-200';
  if (cell.error) return `${base} text-right text-red-600 bg-red-50`;
  if (cell.type === 'number' || cell.type === 'formula') return `${base} text-right tabular-nums`;
  return `${base} text-left`;
}
```

> **Locale ↔ engine boundary:** the engine parses formulas with a canonical grammar
> (`.`-decimal, `,`-free per data_layer §4). Locale formatting is **display-only** — we do
> not parse locale-grouped input in v1 (documented limitation, §15-A6).

---

## 11. Styling — Tailwind CSS (D6)

### 11.1 Why Tailwind here
- **AI-legibility:** utility classes keep intent inline (`text-right text-red-600`), so AI
  edits are local and unambiguous — no jumping to a separate `.css` to learn a class.
- **No naming layer:** avoids BEM/semantic-class bikeshedding; the design is small enough
  that utilities are net-shorter than hand-written CSS.
- **Tree-shaken:** JIT only emits classes that appear in `content` globs → tiny CSS.

### 11.2 CRA 5 integration (no eject)
CRA 5 does not expose its PostCSS config. We use **CRACO**:
- `craco.config.js` injects `postcss.config.js` (`tailwindcss` + `autoprefixer`).
- `package.json` scripts switch `react-scripts` → `craco` (`start`/`build`/`test`).
- `index.css` adds the three Tailwind layers; imported once in `index.tsx`.

```js
// tailwind.config.js (excerpt) — keep cell dims in sync with ui/grid.config.ts
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: { spacing: { cell: '96px', cellh: '28px' },
                     fontFamily: { /* RTL-safe stacks */ } } },
};
```

### 11.3 Conventions
- Dynamic per-cell classes come from `ui/format.ts#cellClasses` (§10) — the single source,
  so the hot path doesn't build class strings ad hoc.
- Fixed pixel dimensions (`CELL_W/H`) stay in `grid.config.ts` and are used for inline
  `transform`/positioning (virtualizer math); Tailwind handles everything else (borders,
  color, alignment, focus ring).
- Selection ring + focus styles use Tailwind `ring-*` / `outline-*`; RTL handled with
  logical utilities (`ps-*`/`pe-*`) so the i18n RTL story (§12.4) needs no class rewrites.

---

## 12. Internationalization — react-i18next (D7)

### 12.1 Scope
Every user-facing string and every displayed **number** is localized. Cell **content the
user typed** is not translated (it's data). Column letters A–Z stay literal (spreadsheet
convention, locale-invariant).

### 12.2 Setup (`i18n/index.ts`)
- `i18next` + `react-i18next` + `LanguageDetector`; `fallbackLng: 'en'`; namespace `common`.
- Locale JSON under `i18n/locales/<lng>/common.json`, lazy-loaded.
- On language change: update `<html lang>` and `dir` (LTR/RTL), and rebuild the shared
  `Intl.NumberFormat` (see 12.3).

### 12.3 Number formatting (the important one for a spreadsheet)
- A single `Intl.NumberFormat(locale)` instance is memoized per active locale and shared via
  `useNumberFormat()` (constructing `Intl.NumberFormat` per cell would be a hot-path cost).
- Used by `ui/format.ts` for **display only**. Example: `1234.5` → `1,234.5` (en) /
  `1 234,5` (fr) / `1,234.5` (hi).
- **Input is canonical**, not localized: formulas/numbers are typed and parsed with `.`
  decimals (engine grammar, data_layer §4). We do not reverse-parse grouped locale input in
  v1 (limitation A6). This keeps the engine locale-free and deterministic in tests.

### 12.4 Key shape (`common.json`)
```jsonc
{
  "formulaBar": { "label": "Formula", "aria": "Formula for cell {{ref}}" },
  "cell":       { "aria": "{{ref}}, {{value}}", "ariaFormula": "{{ref}}, {{value}}, formula {{raw}}" },
  "cellEditor": { "aria": "Editing {{ref}}" },
  "error": {
    "divZero":  { "display": "#DIV/0!",        "spoken": "Division by zero" },
    "circular": { "display": "#CIRCULAR_REF",  "spoken": "Circular reference" },
    "ref":      { "display": "#REF!",          "spoken": "Invalid reference" },
    "parse":    { "display": "#ERROR!",        "spoken": "Formula parse error" },
    "name":     { "display": "#NAME?",         "spoken": "Unknown function" }
  },
  "a11y": { "selected": "Selected {{ref}}, {{value}}", "gridLabel": "Spreadsheet" }
}
```
> `display` vs `spoken`: the grid shows the terse glyph; the screen reader hears the full
> phrase (§13). Both are translatable.

### 12.5 Testing
- Engine tests are locale-free (no `Intl`), so they're stable across CI locales.
- A `format.test.ts` asserts `displayValue` under `en` and one non-`.`-decimal locale (e.g.
  `fr`) to lock the display contract. Missing-key detection via i18next `saveMissing` in dev.

---

## 13. Accessibility — Screen-Reader-Ready Grid (D8)

Target: **WAI-ARIA "grid" pattern** + WCAG 2.1 AA. The challenge is marrying a11y with
**virtualization** (most cells are not in the DOM) and **single-focus navigation**.

### 13.1 Roles & structure
```
div role="grid" aria-label={t('a11y.gridLabel')}
    aria-rowcount={ROWS} aria-colcount={COLS}      ← TRUE totals (not windowed)
  └ div role="row" aria-rowindex={absoluteRow}
      ├ div role="columnheader"  (col headers)
      ├ div role="rowheader"     (row header)
      └ div role="gridcell" aria-colindex={absoluteCol} aria-label={ariaValue}
```
Using **absolute** `aria-row/colindex` (1-based) while only rendering a window is exactly
what the ARIA spec prescribes for virtualized grids — SRs announce "row 42 of 100" correctly
even though only ~20 rows exist in the DOM.

### 13.2 Focus model — roving tabIndex
- The grid container is a single tab stop. Inside, **exactly one** gridcell has
  `tabIndex=0` (the `selectedCell`); all others are `-1`.
- Arrow/Tab/Enter navigation (already in §6) moves selection; an effect moves DOM focus to
  the newly selected cell so the SR follows. Because selection already auto-scrolls the cell
  into view (§7.4), the focus target is guaranteed mounted before we focus it.
- Edit mode moves focus into the `<input>`; commit/discard returns focus to the gridcell.
- This adds **one** subscriber to `selectedCell` (the focus effect) — it does not violate the
  §7.3 "cells don't subscribe to selection" rule; the overlay + focus effect live in the grid
  shell, not in 200 cells.

### 13.3 Announcements (`LiveRegion.tsx`)
- A polite `aria-live` region announces selection changes: `t('a11y.selected', {ref, value})`.
- An assertive region announces errors on commit (e.g. circular ref) so they're not missed.
- Announcements are **debounced/coalesced** during rapid arrow navigation to avoid SR
  chatter (announce the final landing cell, not every intermediate).

### 13.4 Visual a11y
- Selection uses a visible focus ring (Tailwind `ring-2`), not color alone.
- Error cells convey state via icon/text + color (not color alone) → WCAG 1.4.1.
- Contrast: error red and grid lines chosen ≥ 4.5:1 against background.
- Respect `prefers-reduced-motion` for any scroll/transition.

### 13.5 Testing
- `jest-axe` smoke test on the rendered grid (no critical violations).
- RTL tests assert: selected cell has `tabIndex=0` and others `-1`; `aria-rowcount`/
  `colcount` equal `ROWS`/`COLS`; arrow-key move updates `document.activeElement` and emits
  the expected live-region text.

---

## 14. Persistence — localStorage (D9)

Goal: edits survive a page reload. The engine already serializes to a `raw`-only snapshot
(`engine.snapshot()` / `engine.restore()`, data_layer §8); persistence is a thin adapter
around it. The engine and the rest of the store stay storage-agnostic.

### 14.1 What is stored
- **Only `raw` values** (what the user typed) plus a small envelope — never computed values,
  errors, or the dependency graph. Computed state is fully rebuilt by `restore()` (which
  replays each `setCellRaw`), so it's always consistent with the current engine logic.
- Envelope adds a schema `version` and `savedAt` for forward-compatibility / migrations.

```ts
// store/persistence.ts
const STORAGE_KEY = 'tekion.spreadsheet.v1';
const SCHEMA_VERSION = 1;

interface PersistedDoc {
  version: number;             // SCHEMA_VERSION — guards against stale/incompatible blobs
  savedAt: string;             // ISO timestamp (debug / "last saved" UI later)
  sheet:   SerializedSheet;    // = engine.snapshot() → { cells: [{id, raw}, ...] }
}
```

> We deliberately persist `selectedCell`/locale separately (or not at all in v1). The grid
> document (`sheet`) is the only thing the spec requires to survive reload.

### 14.2 Saving — debounced, on the write path only
- `commitEdit` (and cell-clear, §6.1) call `scheduleSave()` after a successful mutation.
- `scheduleSave()` **debounces** (~300–500 ms trailing) so rapid edits collapse into one
  write — `localStorage.setItem` is synchronous and blocks the main thread, so we avoid
  writing on every keystroke (we don't anyway — only on commit) and on every commit burst.
- A `beforeunload`/`visibilitychange` handler **flushes** any pending debounce so a reload
  immediately after an edit is never lost.
- `saveSnapshot(snap)` wraps `JSON.stringify(envelope)` in try/catch — a `QuotaExceededError`
  or private-mode failure logs a warning and degrades gracefully (app keeps working
  in-memory; persistence is best-effort, never blocks editing).

```
scheduleSave():  clearTimeout(timer); timer = setTimeout(flushSave, DEBOUNCE_MS)
flushSave():     saveSnapshot(engine.snapshot())     // try/catch, JSON.stringify
beforeunload:    flushSave()                          // cancel timer + write now
```

### 14.3 Loading — at store creation (hydration)
- When the Zustand store is created, the engine is constructed and then **hydrated** once:
  ```
  const engine = new SpreadsheetEngine();
  const saved  = loadSnapshot();                 // parse + validate envelope
  if (saved) engine.restore(saved.sheet);        // replays raw → recomputes everything
  ```
- `loadSnapshot()` is **defensive**: `JSON.parse` in try/catch, validate
  `version === SCHEMA_VERSION` and shape; on any mismatch/corruption it returns `null`
  (optionally `clearSaved()`), so a bad blob can never crash boot — we fall back to an
  empty sheet.
- Because `restore()` recomputes from `raw`, a reload reproduces all formula results and
  re-derives the dependency graph and any errors (incl. circular refs) deterministically.

### 14.4 Why `raw`-only (vs caching computed)
| Choice | Why |
|---|---|
| Store `raw` only | Tiny payload (well under quota for 26×100), and computed values can never drift from engine logic — they're re-derived. Matches data_layer §8. |
| Schema `version` envelope | Lets us evolve the format; old/garbage blobs are rejected cleanly. |
| Debounce + unload flush | Bounds write frequency (main-thread cost) without risking data loss on reload. |
| `try/catch` everywhere | Storage can be disabled/full (Safari private mode, quotas). Persistence must be best-effort, never a hard dependency. |

### 14.5 Reset / clear
- A small "Clear sheet" action calls `engine.restore({cells:[]})` (or re-news the engine),
  bumps versions for all previously-populated cells, and `clearSaved()` removes the key.

### 14.6 Testing (see §9.7)
- `persistence.test.ts` with a mocked `localStorage`: round-trip save→load reproduces cell
  raws; corrupt/oversized/old-version blobs return `null` without throwing; debounce
  coalesces N rapid `scheduleSave()` calls into one `setItem`.
- An engine-level test already covers `snapshot/restore` correctness (§9.4); persistence
  tests focus on the storage adapter, not re-testing the engine.

---

## 15. Build Order (implementation checklist)

1. **Config**: add deps (D1–D3, D6–D7), `tsconfig.json`, CRACO + Tailwind + PostCSS,
   `i18n/index.ts` + `en/common.json`, rename entrypoints to `.tsx`.
2. **Engine** (TDD, no UI): `types` → `RangeUtils` → `FormulaParser` → `FormulaEvaluator`
   → `DependencyGraph` → `CellStore` → `SpreadsheetEngine`. Land §9.1–9.4 tests green.
   (Engine is locale-/UI-free, so this step is unaffected by D6–D9.)
3. **Store + persistence**: `useSpreadsheetStore` + `selectors`; verify `affected`→`versions`
   plumbing; add `persistence.ts` (hydrate on create, `scheduleSave` on commit) — §9.7 green.
4. **UI shell**: `grid.config`, `format` (Tailwind + i18n), `VirtualGrid` with `role="grid"`
   + ARIA indices (windowing + headers + scroll).
5. **Interaction**: `Cell`, `CellEditor`, `FormulaBar`, `useGridKeyboard` + selection overlay
   + roving `tabIndex` + focus management.
6. **a11y/i18n polish**: `LiveRegion` announcements, `LanguageSwitcher`, RTL pass,
   `jest-axe` + `format.test.ts`.
7. **Final polish**: auto-scroll-into-view, error styling, `beforeunload` save flush,
   README perf/a11y/i18n/persistence sections.
8. **UI smoke tests** (§9.5).

---

## 16. Open Questions / Assumptions

- **A1**: Tab at last column does **not** wrap to next row in v1 (clamps). Easy to flip.
- **A2**: AVERAGE of an all-empty range → returns `0` (vs `#DIV/0!`); will document final choice.
- **A3**: Empty cell referenced in arithmetic = `0` (per data_layer §4.4).
- **A4**: No undo UI in v1 even though engine supports `snapshot/restore` (data_layer §8).
- **A5**: Single sheet, no AA+ columns (per spec out-of-scope).
- **A6**: Numbers are **displayed** locale-formatted but **entered/parsed** canonically
  (`.`-decimal); locale-grouped input parsing is out of scope for v1 (§12.3).
- **A7**: Shipping `en` + one demo locale (e.g. `fr` or `hi`) to prove the i18n pipeline;
  full translation coverage is not a goal.
- **A8**: a11y targets WCAG 2.1 AA and the ARIA grid pattern; verified with `jest-axe` +
  manual VoiceOver/NVDA spot-checks, not a full audit.
- **A9**: Persistence is **single-document**, browser-local (localStorage), best-effort, and
  unencrypted. No multi-tab sync, no backend, no conflict resolution in v1. A schema
  `version` guards future migrations; on mismatch we discard and start empty (§14.3).
