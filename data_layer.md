# Spreadsheet Engine — Data Layer Design Document

> **Scope**: Data model, formula parser, dependency graph, and state management.  
> UI layer (virtualization, keyboard handling) is referenced but not detailed here.

---

## 1. High-Level Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                        UI Layer (React)                       │
│   VirtualGrid  │  CellEditor  │  FormulaBar  │  KeyboardNav  │
└────────────────────────┬──────────────────────────────────────┘
                         │ reads / dispatches actions
┌────────────────────────▼──────────────────────────────────────┐
│                   SpreadsheetStore (Zustand)                   │
│  selectedCell | editingCell | rawValues | computedValues       │
└───────┬────────────────┬──────────────────────────────────────┘
        │                │
        │ commit()        │ getComputed()
┌───────▼──────┐  ┌──────▼────────────────────────────────────┐
│ FormulaParser│  │             SpreadsheetEngine              │
│  tokenize()  │  │  setCellRaw()  recalculate()  getCell()   │
│  parse()     │  └──────┬────────────────────┬───────────────┘
│  evaluate()  │         │                    │
└──────────────┘  ┌──────▼──────┐   ┌────────▼────────┐
                  │   CellStore  │   │  DependencyGraph │
                  │  Map<id,Cell>│   │  forward + back  │
                  └─────────────┘   └─────────────────┘
```

Clean rule: **Engine never imports from React. UI never mutates CellStore directly.**

---

## 2. Core Data Structures

### 2.1 Cell ID

Canonical string key: `"A1"`, `"Z100"`. Never store row/col as separate fields at rest.

```ts
type CellId = string;  // e.g. "B3"

function toCellId(col: number, row: number): CellId {
  return `${colLetter(col)}${row}`;   // colLetter(0) => "A"
}

function parseCellId(id: CellId): { col: number; row: number } {
  const match = id.match(/^([A-Z]+)(\d+)$/);
  // col: letterToIndex(match[1]),  row: parseInt(match[2])
}
```

### 2.2 Cell

```ts
interface Cell {
  id:       CellId;
  raw:      string;       // what the user typed — "=A1+B1", "42", "hello"
  computed: CellValue;    // resolved value shown in the grid
  type:     CellType;
  error:    CellError | null;
}

type CellValue = string | number | null;

type CellType =
  | 'empty'
  | 'text'
  | 'number'
  | 'formula';

type CellError =
  | 'CIRCULAR_REF'
  | 'DIV_ZERO'
  | 'INVALID_REF'
  | 'PARSE_ERROR'
  | 'NAME_ERROR';   // unknown function
```

`computed` is always a display-ready value. The UI never re-evaluates — it only reads `computed`.

### 2.3 CellStore

```ts
// Primary store — sparse Map; absent key = empty cell
type CellStore = Map<CellId, Cell>;

// Computed value cache — derived from CellStore, rebuilt on recalc
type ComputedCache = Map<CellId, CellValue | CellError>;
```

Only cells that have been touched live in `CellStore`. This keeps memory lean for the 26×100 grid where most cells are empty.

---

## 3. Dependency Graph

Two adjacency maps for O(1) lookups in both directions:

```ts
interface DependencyGraph {
  // forward: cell → set of cells it depends ON
  // e.g. B1 = "=A1+C1"  →  forward.get("B1") = {"A1", "C1"}
  forward: Map<CellId, Set<CellId>>;

  // reverse: cell → set of cells that depend ON IT
  // e.g. reverse.get("A1") = {"B1", "D5", ...}
  reverse: Map<CellId, Set<CellId>>;
}
```

### 3.1 Update on Edit

When cell `X` is edited with a new formula:

```
1. Remove X from the forward deps of all its old dependencies
   (reverse[old_dep].delete(X) for each old_dep)

2. Parse new formula, extract referenced cell IDs

3. Set forward[X] = new set of referenced IDs

4. For each new dep D:
     reverse[D] = reverse[D] ?? new Set()
     reverse[D].add(X)

5. Trigger recalculation starting from X
```

### 3.2 Circular Dependency Detection

Done via DFS before committing any recalculation:

```ts
function hasCycle(graph: DependencyGraph, startId: CellId): boolean {
  const visited = new Set<CellId>();
  const stack   = new Set<CellId>();

  function dfs(id: CellId): boolean {
    if (stack.has(id))   return true;   // back edge → cycle
    if (visited.has(id)) return false;

    visited.add(id);
    stack.add(id);

    for (const dep of graph.forward.get(id) ?? []) {
      if (dfs(dep)) return true;
    }

    stack.delete(id);
    return false;
  }

  return dfs(startId);
}
```

If a cycle is detected, all cells in the cycle get `error: 'CIRCULAR_REF'` and `computed: '#CIRCULAR_REF'`. No further evaluation is attempted for those cells.

### 3.3 Topological Recalculation Order

When cell `X` changes, only its dependents need recalculation — not the entire grid.

```ts
function getRecalcOrder(graph: DependencyGraph, changedId: CellId): CellId[] {
  // BFS/DFS over reverse edges starting from changedId
  // Returns affected cells in topological order (roots first)
  const order: CellId[] = [];
  const visited = new Set<CellId>();
  const queue = [changedId];

  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    order.push(id);
    for (const dep of graph.reverse.get(id) ?? []) {
      queue.push(dep);
    }
  }

  return topoSort(order, graph);  // stable topo sort within the affected set
}
```

This ensures `B1 = =A1` is evaluated before `C1 = =B1` when `A1` changes.

---

## 4. Formula Parser

### 4.1 Grammar (subset)

```
formula     := "=" expr
expr        := term (("+"|"-") term)*
term        := factor (("*"|"/") factor)*
factor      := number | string | cellRef | rangeFunc | "(" expr ")"
cellRef     := [A-Z]+ [0-9]+           // e.g. A1, BC23
rangeFunc   := IDENT "(" cellRef ":" cellRef ")"   // SUM(A1:A10)
```

### 4.2 Tokenizer

```ts
type TokenType =
  | 'NUMBER' | 'STRING' | 'CELL_REF' | 'FUNC_NAME'
  | 'LPAREN' | 'RPAREN' | 'COLON'
  | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH'
  | 'EOF';

interface Token { type: TokenType; value: string; }

function tokenize(input: string): Token[] { /* regex-based scan */ }
```

### 4.3 Recursive Descent Parser → AST

```ts
type ASTNode =
  | { kind: 'Number';   value: number }
  | { kind: 'Text';     value: string }
  | { kind: 'CellRef';  id: CellId }
  | { kind: 'BinOp';    op: '+' | '-' | '*' | '/'; left: ASTNode; right: ASTNode }
  | { kind: 'RangeFunc'; name: 'SUM' | 'AVERAGE'; from: CellId; to: CellId };

function parse(tokens: Token[]): ASTNode { /* recursive descent */ }
```

### 4.4 Evaluator

```ts
function evaluate(
  node:   ASTNode,
  getVal: (id: CellId) => CellValue   // injected — no direct store access
): CellValue | CellError {

  switch (node.kind) {
    case 'Number':    return node.value;
    case 'Text':      return node.value;
    case 'CellRef': {
      const v = getVal(node.id);
      if (v === null) return 0;   // empty cell = 0 in arithmetic
      return v;
    }
    case 'BinOp': {
      const l = evaluate(node.left,  getVal);
      const r = evaluate(node.right, getVal);
      if (typeof l !== 'number' || typeof r !== 'number') return 'PARSE_ERROR';
      if (node.op === '/' && r === 0) return 'DIV_ZERO';
      return applyOp(node.op, l, r);
    }
    case 'RangeFunc': {
      const cells = expandRange(node.from, node.to);
      const vals  = cells.map(id => getVal(id) ?? 0).filter(isNumber);
      return node.name === 'SUM'
        ? vals.reduce((a, b) => a + b, 0)
        : vals.reduce((a, b) => a + b, 0) / vals.length;
    }
  }
}
```

`getVal` is a closure passed in by the engine — the parser/evaluator has zero knowledge of the store. This makes both unit-testable in isolation.

### 4.5 Dependency Extraction

Run a separate AST walk (before evaluation) to collect referenced cells:

```ts
function extractDeps(node: ASTNode): Set<CellId> {
  const deps = new Set<CellId>();
  walk(node, n => {
    if (n.kind === 'CellRef')   deps.add(n.id);
    if (n.kind === 'RangeFunc') expandRange(n.from, n.to).forEach(id => deps.add(id));
  });
  return deps;
}
```

---

## 5. SpreadsheetEngine API

The single public façade consumed by the store:

```ts
class SpreadsheetEngine {
  private cells:  CellStore       = new Map();
  private graph:  DependencyGraph = { forward: new Map(), reverse: new Map() };
  private parser: FormulaParser;

  /** Set raw input, update deps, recalculate dependents */
  setCellRaw(id: CellId, raw: string): RecalcResult {
    const isFormula = raw.startsWith('=');
    const newDeps   = isFormula ? this.parser.extractDeps(raw) : new Set<CellId>();

    this.updateDependencyGraph(id, newDeps);

    if (hasCycle(this.graph, id)) {
      this.markCycleError(id);
      return { affected: [id] };
    }

    const order   = getRecalcOrder(this.graph, id);
    const affected = this.recalcInOrder(id, raw, order);
    return { affected };
  }

  /** Read computed value — O(1) */
  getCell(id: CellId): Cell {
    return this.cells.get(id) ?? EMPTY_CELL(id);
  }

  /** Snapshot for serialization / undo */
  snapshot(): SerializedSheet {
    return { cells: [...this.cells.entries()].map(([id, c]) => ({ id, raw: c.raw })) };
  }

  restore(snap: SerializedSheet): void {
    this.cells.clear();
    this.graph = { forward: new Map(), reverse: new Map() };
    for (const { id, raw } of snap.cells) this.setCellRaw(id, raw);
  }
}

interface RecalcResult {
  affected: CellId[];   // UI subscribes to this to trigger targeted re-renders
}
```

---

## 6. State Management (Zustand)

```ts
interface SpreadsheetState {
  // Engine instance (stable ref)
  engine: SpreadsheetEngine;

  // UI state
  selectedCell:  CellId | null;
  editingCell:   CellId | null;
  editBuffer:    string;          // live text in the input during edit mode

  // Actions
  selectCell:    (id: CellId) => void;
  enterEditMode: (id: CellId) => void;
  updateBuffer:  (value: string) => void;
  commitEdit:    () => void;
  discardEdit:   () => void;
  navigate:      (direction: Direction) => void;
}
```

`commitEdit` is the only place that calls `engine.setCellRaw()`. On return, the `affected` list is used to invalidate a per-cell version counter, triggering targeted re-renders.

### 6.1 Targeted Re-render Strategy

Each `<Cell>` component subscribes only to its own version counter:

```ts
// In store
const versions = new Map<CellId, number>();

// On commit:
for (const id of affected) {
  versions.set(id, (versions.get(id) ?? 0) + 1);
}

// In Cell component:
const version = useStore(s => s.versions.get(cellId) ?? 0);
// React re-renders only when version changes → only affected cells update
```

This avoids full-grid re-render on every edit.

---

## 7. Virtual Scrolling Integration

The engine is decoupled from rendering entirely. The virtualization layer (TanStack Virtual) manages which rows/cols are in the DOM. The engine always holds the full cell map — virtualization only controls what's rendered.

```
Engine (full 26×100 map)  →  VirtualGrid (renders visible window only)
                              ↑
                         TanStack Virtual
                         (overscan = 2 rows/cols)
```

On scroll, new cells mount and read from the engine synchronously — no fetch, no async.

---

## 8. Serialization & Undo

```ts
// Undo stack — store snapshots before each commit
type UndoStack = SerializedSheet[];

// On commitEdit:
undoStack.push(engine.snapshot());
engine.setCellRaw(id, raw);

// On undo:
const prev = undoStack.pop();
engine.restore(prev);
```

Only `raw` values are serialized. Computed values are fully derived on restore.

---

## 9. Error Handling Matrix

| Situation | Stored `error` | Displayed in cell |
|---|---|---|
| `=1/0` | `DIV_ZERO` | `#DIV/0!` |
| `=ZZ999` (out of bounds) | `INVALID_REF` | `#REF!` |
| `=BLAH()` unknown function | `NAME_ERROR` | `#NAME?` |
| `=A1+` malformed | `PARSE_ERROR` | `#ERROR!` |
| `=A1` where A1 refs back | `CIRCULAR_REF` | `#CIRCULAR_REF` |

Formula bar always shows the raw `=...` string regardless of error state.

---

## 10. File & Folder Structure

```
src/
├── engine/
│   ├── SpreadsheetEngine.ts    # public façade
│   ├── CellStore.ts            # Map + Cell types
│   ├── DependencyGraph.ts      # forward/reverse maps, cycle detection, topo sort
│   ├── FormulaParser.ts        # tokenizer + AST
│   ├── FormulaEvaluator.ts     # evaluate(AST, getVal)
│   ├── RangeUtils.ts           # expandRange, colLetter, parseCellId
│   └── types.ts                # CellId, Cell, CellValue, CellError, etc.
│
├── store/
│   └── useSpreadsheetStore.ts  # Zustand store, versions map
│
├── components/
│   ├── VirtualGrid.tsx         # TanStack Virtual outer shell
│   ├── Cell.tsx                # reads engine via store, version-gated
│   ├── CellEditor.tsx          # controlled input, commit/discard
│   ├── FormulaBar.tsx          # shows raw value of selected cell
│   ├── ColHeader.tsx
│   └── RowHeader.tsx
│
└── __tests__/
    ├── FormulaParser.test.ts
    ├── FormulaEvaluator.test.ts
    ├── DependencyGraph.test.ts
    └── SpreadsheetEngine.test.ts
```

---

## 11. Key Design Decisions & Tradeoffs

| Decision | Rationale | Tradeoff |
|---|---|---|
| Sparse `Map<CellId, Cell>` | Memory-efficient for mostly-empty grids | Slightly more coordinate math vs 2D array |
| String cell IDs (`"A1"`) | Human-readable, easy to debug, natural formula reference | Parsing overhead on every lookup (mitigated by `parseCellId` memoization) |
| Recursive descent parser | Simple to extend, good error messages | More code than a PEG library; acceptable for this scope |
| `getVal` injected into evaluator | Parser/evaluator are pure functions, trivially testable | Slight indirection in call chain |
| Version counters per cell | Surgical re-renders — only affected cells update | Extra bookkeeping per commit |
| DFS cycle detection before recalc | Catches cycles before any mutation | Extra O(E) pass per edit — negligible at 26×100 scale |
| Zustand over Redux | Less boilerplate, co-located actions | Harder to middleware/devtools compared to Redux |
| TanStack Virtual over react-window | Row + column virtualization in one library, TypeScript-native | Heavier API surface than react-window |

---

## 12. Out of Scope (per spec)

- Cell styling (bold, color, font)
- Multi-cell selection / range paste
- Copy-paste
- Persistent storage / backend sync
- Columns beyond Z (AA, AB... — parseable but not required)