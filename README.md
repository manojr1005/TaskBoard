# Team Task Board

A React (JavaScript) task board on the DummyJSON mock API. It has a Kanban view and a table view, filters synced to the URL, optimistic writes with rollback, undo delete, a chaos mode, and a 5,000-task stress test.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # Vitest + React Testing Library + MSW
npm run build
```

## Files

```
src/
  common/commonUtils.js   shared constants and pure helpers
  api.js                  single fetch wrapper (chaos mode) + DummyJSON calls
  store.js                Zustand: settings (chaos) + overlay (local truth)
  hooks.js                useFilters (URL), useTasks, useUsers, useDebounce, useHotkeys
                          + write actions: createTask, updateTask, removeTask
  App.jsx                 layout, header, toolbar, states, wiring
  components/
    Board.jsx             Kanban + drag and drop (mouse and keyboard)
    Table.jsx             sortable, virtualized table
    TaskDialog.jsx        zod schema, form, native <dialog>
    ui.jsx                assignee, badges, status menu, states, load more
  tests/                  app.test.jsx, helpers.jsx (MSW + fixtures), setup.js
```

### What `commonUtils.js` holds

- **API:** `BASE_URL`, `PAGE_SIZE`, `USERS_PATH`, `QUERY_KEYS`
- **Chaos:** `CHAOS_DELAY_MS`, `CHAOS_FAIL_RATE`
- **Timing:** `UNDO_MS`, `SEARCH_DEBOUNCE_MS`
- **Validation:** `TITLE_MIN`, `TITLE_MAX`
- **Status and priority:** `STATUS`, `STATUSES`, `PRIORITY`, `PRIORITIES`, `LABEL`, `RANK`
- **Sources and ids:** `SOURCE`, `localId()`, `isStressId()`
- **UI:** `ROW_HEIGHT`, `COLUMN_PAGE_SIZE`, `STRESS_TASK_COUNT`
- **Logic:** `fromApi`, `toApi`, `mergeTasks`, `applyFilters`, `generateStressTasks`

Change a value once there and the whole app follows.

## Requirements map

| # | Requirement | Where |
|---|---|---|
| 1 | Tasks joined with assignee name and avatar | `useUsers` (`usersById` Map), `Assignee` in `ui.jsx` |
| 2 | Create and edit, 5–120 character title, priority, due date | `TaskDialog.jsx` |
| 3 | Kanban with drag and drop, table toggle | `Board.jsx`, `Table.jsx`, view toggle in `App.jsx` |
| 4 | Debounced search, status, priority and assignee filters | `SearchBox` in `App.jsx`, `applyFilters` |
| 5 | Filters in the URL | `useFilters` |
| 6 | Loading, empty and error states | `Loading`, `Message`, `InlineError`, `LoadMore` |
| 7 | Server pagination (`limit` and `skip`) | `useInfiniteQuery` in `useTasks`; infinite scroll in both views |
| 8 | Chaos mode | `request()` in `api.js` |
| 9 | Optimistic updates, rollback and toast | `createTask` and `updateTask` in `hooks.js` |
| 10 | Undo delete for 5 seconds | `removeTask` |
| 11 | Data consistency | `store.js` overlay plus `mergeTasks` (see below) |
| 12 | 5,000-task stress test, smooth table | `generateStressTasks`, TanStack Virtual |
| 13 | Keyboard navigation and drag alternative | dnd-kit keyboard sensor, status menu, table arrow keys |
| 14 | Tests | `tests/app.test.jsx` |

## Data consistency

DummyJSON fakes every write. It answers with success but stores nothing, so a refetch returns the original data. It also gives every created todo the same fake id, which then 404s on `PUT` and `DELETE`.

To handle this, the app keeps an **overlay** (`store.js`) on top of the server data:

- **Creates** get a `local-…` id and live in `created`. The `POST` is still sent, so chaos mode and rollback apply. Local tasks never get a `PUT` or `DELETE`.
- **Edits** are patches in `edits[id]`. These also hold the frontend-only fields: priority, due date, and the `in_progress` status.
- **Deletes** become tombstones in `deleted`. During the undo window the id sits in `pendingDelete`.
- **Rendering** uses `mergeTasks(serverPages, overlay)`: local creates first, then server todos with patches applied and duplicates removed, then stress tasks. Hidden ids are dropped.
- The overlay is saved in localStorage, so a refresh or refetch shows the same data. **Reset local changes** clears it.

Writes follow two rules:

- `PUT` sends the full todo, not just the changed field, so the latest successful write is always complete.
- Each task has a write counter. If an older write fails after a newer one has started, the older one does not roll back.

## Chaos, optimistic updates and undo

- **Chaos mode:** `request()` adds `?delay=1500` to every call and fails about 20% of writes. Components don't know chaos mode exists.
- **Update:**
  1. Snapshot the task's overlay entry.
  2. Apply the change and show it.
  3. Send the request.
  4. On failure, restore the snapshot and show a toast.
- **Create:** the task is added and shown immediately. If the request fails, it is removed and the toast offers **Retry**.
- **Delete:**
  1. Hide the task and show an **Undo** toast for 5 seconds.
  2. Send `DELETE` only after the window closes.
  3. If that request fails, the task comes back with a toast.

## Performance and accessibility

- **Stress test:** faker is loaded lazily and generates 5,000 tasks.
- **Table:** virtualized, so only about 40 rows are in the DOM at a time.
- **Kanban:** renders 50 cards per column, with a "Show more" button.
- **Keyboard drag:** focus a card's drag handle, press Space, use ←/→ to jump between columns, press Space to drop. Esc cancels.
- **Other keyboard support:**
  - Every card and row has a status menu, as an alternative to dragging.
  - In the table, ↑/↓ moves between rows.
  - `/` focuses search and `n` opens New task.
- **Screen readers and dialog:** each drag step is announced. The dialog is a native `<dialog>` that returns focus when closed.
- **Display:** visible focus rings, a skip link, dark mode, and reduced-motion support.

## Library choices

| Library | Why |
|---|---|
| TanStack Query | Caching, infinite pagination, loading and error state |
| Zustand | Small store; `getState()` works outside React, so the actions are plain functions |
| dnd-kit | Accessible drag and drop (keyboard sensor, announcements) |
| TanStack Table + Virtual | Headless sorting, plus virtualization for 5,000 rows |
| react-hook-form + zod | Fast forms; validation rules defined once in a schema |
| react-router | `useSearchParams` for URL-synced filters |
| sonner | Toasts with Undo and Retry actions |
| Vitest + RTL + MSW | Tests go through the real fetch layer |

## Tradeoffs

- **Filtering happens on the client, over loaded pages.** DummyJSON can't filter todos. The empty state offers **Load more**, and the table auto-loads more pages while you scroll.
- **Server todos get a default priority** (`id % 3`), because DummyJSON has no priority field.
- **Local data is per browser.** It lives in localStorage. Closing the tab during the undo window cancels the delete.
- **No reordering within a column**, because the API has no position field.

## What I'd improve

- Use real server ids and cache invalidation with a real API.
- Reorder cards within a column.
- Playwright end-to-end tests and an axe accessibility check.
- Retry with backoff and an offline queue.
- Virtualize the Kanban columns.
- Bulk actions in the table.
