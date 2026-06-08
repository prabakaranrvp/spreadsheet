# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

Browser-based spreadsheet SPA (React 19 + TypeScript, Create React App). Client-only: no backend, database, or Docker services. Data persists in browser `localStorage` under key `tekion.spreadsheet.v1`.

### Install dependencies

`npm install` fails on this repo due to a peer dependency conflict between `i18next@26` (expects TypeScript ^5|^6) and `react-scripts@5` (pins TypeScript 4.9). Use:

```bash
npm install --legacy-peer-deps
```

### Running the dev server

```bash
BROWSER=none npm start
```

Serves at **http://localhost:3000**. Set `PORT` to override the default port. No `.env` file is required.

### Tests

```bash
CI=true npm test -- --watchAll=false
```

Interactive watch mode: `npm test`.

### Build

```bash
npm run build
```

ESLint runs as part of `npm start` and `npm run build` (no separate `lint` script). A successful build with "No issues found" confirms lint passes.

### Hello-world verification

1. Open http://localhost:3000
2. Enter `10` in A1, `20` in A2
3. Enter `=SUM(A1:A2)` in A3 — result should be `30`

### Gotchas

- **Peer deps**: Always use `--legacy-peer-deps` for `npm install` until TypeScript is upgraded or `i18next` is downgraded.
- **Virtualized grid**: Only visible rows/columns are in the DOM; scroll to reach cells outside the viewport.
- **Test warnings**: Some tests log React `act(...)` warnings from Zustand store updates; all 192 tests still pass.
