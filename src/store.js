import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CHAOS_DELAY_MS, CHAOS_FAIL_RATE, STORAGE_KEYS, isStressId } from "./common/commonUtils";

export const useSettings = create()(
  persist(
    (set) => ({
      chaos: false,
      chaosDelayMs: CHAOS_DELAY_MS,
      chaosFailRate: CHAOS_FAIL_RATE,
      setChaos: (chaos) => set({ chaos }),
    }),
    { name: STORAGE_KEYS.settings },
  ),
);

const omit = (obj, id) => {
  if (!(id in obj)) return obj;
  const { [id]: _removed, ...rest } = obj;
  return rest;
};

const EMPTY = { created: {}, createdOrder: [], edits: {}, deleted: {}, pendingDelete: {}, saving: {}, stress: [] };

/**
 * The overlay keeps everything DummyJSON can't remember (it fakes all writes):
 *   created       tasks made in this browser (local ids)
 *   edits         patches over server/stress tasks (incl. priority, dueDate, in_progress)
 *   deleted       tombstones
 *   pendingDelete hidden during the undo window   (not persisted)
 *   saving        writes in flight                 (not persisted)
 *   stress        generated test tasks             (not persisted)
 */
export const useOverlay = create()(
  persist(
    (set, get) => ({
      ...EMPTY,

      addCreated: (task) =>
        set((s) => ({ created: { ...s.created, [task.id]: task }, createdOrder: [task.id, ...s.createdOrder] })),

      removeCreated: (id) =>
        set((s) => ({ created: omit(s.created, id), createdOrder: s.createdOrder.filter((x) => x !== id) })),

      applyPatch: (id, patch) =>
        set((s) =>
          s.created[id]
            ? { created: { ...s.created, [id]: { ...s.created[id], ...patch } } }
            : { edits: { ...s.edits, [id]: { ...s.edits[id], ...patch } } },
        ),

      /** What the overlay held for a task before a write, so it can be rolled back. */
      snapshot: (id) => (get().created[id] ? { id, task: get().created[id] } : { id, patch: get().edits[id] }),

      restore: ({ id, task, patch }) =>
        set((s) => {
          if (task) return s.created[id] ? { created: { ...s.created, [id]: task } } : {};
          return { edits: patch ? { ...s.edits, [id]: patch } : omit(s.edits, id) };
        }),

      /** Toggle an id in a flag map ("saving" or "pendingDelete"). */
      setFlag: (key, id, on) => set((s) => ({ [key]: on ? { ...s[key], [id]: true } : omit(s[key], id) })),

      confirmDelete: (id) =>
        set((s) => ({
          pendingDelete: omit(s.pendingDelete, id),
          created: omit(s.created, id),
          createdOrder: s.createdOrder.filter((x) => x !== id),
          edits: omit(s.edits, id),
          // Only server tasks need a tombstone; local and stress ones simply disappear.
          deleted: s.created[id] || isStressId(id) ? s.deleted : { ...s.deleted, [id]: true },
          stress: isStressId(id) ? s.stress.filter((t) => t.id !== id) : s.stress,
        })),

      setStress: (stress) => set({ stress }),
      clearStress: () =>
        set((s) => ({
          stress: [],
          edits: Object.fromEntries(Object.entries(s.edits).filter(([id]) => !isStressId(id))),
        })),
      reset: () => set(EMPTY),
    }),
    {
      name: STORAGE_KEYS.overlay,
      version: 1,
      partialize: ({ created, createdOrder, edits, deleted }) => ({ created, createdOrder, edits, deleted }),
    },
  ),
);
