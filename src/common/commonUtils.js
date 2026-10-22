/**
 * commonUtils.js — shared constants and pure helpers. Every other file imports from here.
 *
 * Shapes:
 *   API todo (DummyJSON): { id: number, todo, completed: boolean, userId }
 *   User:                 { id, firstName, lastName, image }
 *   Task (UI):            { id: string, title, status, priority, dueDate: "yyyy-mm-dd" | null, userId, source }
 */

// ---------- API ----------
export const BASE_URL = "https://dummyjson.com";
export const PAGE_SIZE = 20;
export const USERS_PATH = "/users?limit=0&select=firstName,lastName,image";
export const QUERY_KEYS = { todos: ["todos"], users: ["users"] };
export const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

// ---------- Chaos mode ----------
export const CHAOS_DELAY_MS = 1500; // appended as ?delay=
export const CHAOS_FAIL_RATE = 0.2; // ~20% of writes fail

// ---------- Timing & validation ----------
export const UNDO_MS = 5000;
export const SEARCH_DEBOUNCE_MS = 300;
export const TITLE_MIN = 5;
export const TITLE_MAX = 120;

// ---------- Status & priority ----------
export const STATUS = { TODO: "todo", IN_PROGRESS: "in_progress", DONE: "done" };
export const STATUSES = [
  { value: STATUS.TODO, label: "Todo" },
  { value: STATUS.IN_PROGRESS, label: "In progress" },
  { value: STATUS.DONE, label: "Done" },
];
export const PRIORITY = { HIGH: "high", MEDIUM: "medium", LOW: "low" };
export const PRIORITIES = [
  { value: PRIORITY.HIGH, label: "High" },
  { value: PRIORITY.MEDIUM, label: "Medium" },
  { value: PRIORITY.LOW, label: "Low" },
];
export const STATUS_ORDER = STATUSES.map((s) => s.value);
export const PRIORITY_VALUES = PRIORITIES.map((p) => p.value);
export const LABEL = Object.fromEntries([...STATUSES, ...PRIORITIES].map((o) => [o.value, o.label]));
export const RANK = { todo: 1, in_progress: 2, done: 3, low: 1, medium: 2, high: 3 }; // for table sorting
const PRIORITY_SEED = [PRIORITY.MEDIUM, PRIORITY.HIGH, PRIORITY.LOW]; // default for server todos (id % 3)

// ---------- Sources, ids, storage ----------
export const SOURCE = { SERVER: "server", LOCAL: "local", STRESS: "stress" };
export const STRESS_PREFIX = "stress-";
export const isStressId = (id) => id.startsWith(STRESS_PREFIX);
export const localId = () => `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const STORAGE_KEYS = { settings: "ttb-settings", overlay: "ttb-overlay" };

// ---------- UI ----------
export const ROW_HEIGHT = 52; // table rows (virtualizer)
export const COLUMN_PAGE_SIZE = 50; // Kanban cards per column before "Show more"
export const STRESS_TASK_COUNT = 5000;

// ---------- Helpers ----------
export const fullName = (u) => (u ? `${u.firstName} ${u.lastName}` : "Unassigned");
export const errorText = (e) => (e instanceof Error ? e.message : "Unknown error");
export const todayISO = () => new Date().toISOString().slice(0, 10);

/** DummyJSON todo → UI task. Priority is seeded; status comes from `completed`. */
export const fromApi = (t) => ({
  id: String(t.id),
  title: t.todo,
  status: t.completed ? STATUS.DONE : STATUS.TODO,
  priority: PRIORITY_SEED[t.id % 3],
  dueDate: null,
  userId: t.userId,
  source: SOURCE.SERVER,
});

/** UI task → body for POST/PUT. */
export const toApi = (t) => ({ todo: t.title, completed: t.status === STATUS.DONE, userId: t.userId });

/** Server pages are the base; the local overlay (creates, edits, deletes) is applied on top. */
export function mergeTasks({ server, created, createdOrder, edits, deleted, pendingDelete, stress }) {
  const hidden = (id) => deleted[id] || pendingDelete[id];
  const patched = (t) => (edits[t.id] ? { ...t, ...edits[t.id] } : t);
  const seen = new Set();
  const fromServer = server
    .filter((t) => !seen.has(t.id) && seen.add(t.id)) // dedupe overlapping pages
    .map(fromApi);
  return [...createdOrder.map((id) => created[id]).filter(Boolean), ...fromServer, ...stress]
    .filter((t) => !hidden(t.id))
    .map(patched);
}

export const EMPTY_FILTERS = { q: "", status: "", priority: "", assignee: null };
export const hasActiveFilters = (f) => Boolean(f.q || f.status || f.priority || f.assignee !== null);

export function applyFilters(tasks, f) {
  if (!hasActiveFilters(f)) return tasks;
  const q = f.q.trim().toLowerCase();
  return tasks.filter(
    (t) =>
      (!q || t.title.toLowerCase().includes(q)) &&
      (!f.status || t.status === f.status) &&
      (!f.priority || t.priority === f.priority) &&
      (f.assignee === null || t.userId === f.assignee),
  );
}

/** Faker is loaded on demand so it stays out of the main bundle. */
export async function generateStressTasks(count, userIds) {
  const { faker } = await import("@faker-js/faker/locale/en");
  const pick = faker.helpers.arrayElement;
  return Array.from({ length: count }, (_, i) => ({
    id: `${STRESS_PREFIX}${i + 1}`,
    title: faker.hacker.phrase().slice(0, TITLE_MAX),
    status: pick(STATUS_ORDER),
    priority: pick(PRIORITY_VALUES),
    dueDate: faker.datatype.boolean() ? faker.date.soon({ days: 60 }).toISOString().slice(0, 10) : null,
    userId: pick(userIds.length ? userIds : [1]),
    source: SOURCE.STRESS,
  }));
}
