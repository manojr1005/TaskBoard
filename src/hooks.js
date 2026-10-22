import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import { api } from "./api";
import { useOverlay } from "./store";
import {
  PRIORITY_VALUES,
  QUERY_KEYS,
  SOURCE,
  STATUS_ORDER,
  UNDO_MS,
  errorText,
  localId,
  mergeTasks,
  toApi,
} from "./common/commonUtils";

export function useDebounce(value, ms) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Filters and view live in the URL, so refresh and shared links keep the view. */
export function useFilters() {
  const [params, setParams] = useSearchParams();
  const oneOf = (key, allowed) => (allowed.includes(params.get(key)) ? params.get(key) : "");

  const filters = useMemo(() => {
    const assignee = Number(params.get("assignee"));
    return {
      q: params.get("q") ?? "",
      status: oneOf("status", STATUS_ORDER),
      priority: oneOf("priority", PRIORITY_VALUES),
      assignee: Number.isInteger(assignee) && assignee > 0 ? assignee : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const update = useCallback(
    (patch) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === "" || value == null || (key === "view" && value === "board")) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const clear = useCallback(
    () =>
      setParams((prev) => new URLSearchParams(prev.get("view") ? { view: prev.get("view") } : {}), { replace: true }),
    [setParams],
  );

  return { filters, view: params.get("view") === "table" ? "table" : "board", update, clear };
}

export function useUsers() {
  const query = useQuery({ queryKey: QUERY_KEYS.users, queryFn: api.users, staleTime: Infinity });
  const usersById = useMemo(() => new Map((query.data ?? []).map((u) => [u.id, u])), [query.data]);
  return { users: query.data ?? [], usersById, isError: query.isError, refetch: query.refetch };
}

/** Server pages (infinite query) merged with the local overlay. */
export function useTasks() {
  const query = useInfiniteQuery({
    queryKey: QUERY_KEYS.todos,
    queryFn: ({ pageParam }) => api.todos(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const next = last.skip + last.todos.length;
      return last.todos.length && next < last.total ? next : undefined;
    },
    staleTime: 60_000,
  });

  const overlay = useOverlay(
    useShallow((s) => ({
      created: s.created,
      createdOrder: s.createdOrder,
      edits: s.edits,
      deleted: s.deleted,
      pendingDelete: s.pendingDelete,
      stress: s.stress,
    })),
  );
  const server = useMemo(() => query.data?.pages.flatMap((p) => p.todos) ?? [], [query.data]);
  const tasks = useMemo(() => mergeTasks({ server, ...overlay }), [server, overlay]);

  return {
    ...query,
    tasks,
    serverLoaded: new Set(server.map((t) => t.id)).size,
    serverTotal: query.data?.pages[0]?.total ?? 0,
  };
}

// ---------- Write actions (optimistic + rollback) ----------
// Plain functions: they read and write the store directly, so no hook is needed.

const overlay = () => useOverlay.getState();
const writeSeq = new Map(); // per-task counter: an older failed write must not roll back a newer one
const deleteTimers = new Map();

export async function createTask(input) {
  const task = { ...input, id: localId(), source: SOURCE.LOCAL };
  overlay().addCreated(task);
  overlay().setFlag("saving", task.id, true);
  try {
    // DummyJSON returns a fake id that it can't find later, so the local id is kept.
    await api.create(toApi(task));
    toast.success("Task created");
  } catch (e) {
    overlay().removeCreated(task.id);
    toast.error("Couldn't create task. It was removed.", {
      description: errorText(e),
      action: { label: "Retry", onClick: () => createTask(input) },
    });
  } finally {
    overlay().setFlag("saving", task.id, false);
  }
}

export async function updateTask(task, patch) {
  const snap = overlay().snapshot(task.id);
  const seq = (writeSeq.get(task.id) ?? 0) + 1;
  writeSeq.set(task.id, seq);
  overlay().applyPatch(task.id, patch);

  if (task.source !== SOURCE.SERVER) return true; // local and stress tasks live only in the overlay

  const isLatest = () => writeSeq.get(task.id) === seq;
  overlay().setFlag("saving", task.id, true);
  try {
    await api.update(Number(task.id), toApi({ ...task, ...patch })); // full shape, not a diff
    return true;
  } catch (e) {
    if (isLatest()) {
      overlay().restore(snap);
      toast.error(`Couldn't save "${task.title}". Changes were reverted.`, { description: errorText(e) });
    }
    return false;
  } finally {
    if (isLatest()) overlay().setFlag("saving", task.id, false);
  }
}

/** Hide now, offer Undo for UNDO_MS, and only send DELETE once the window closes. */
export function removeTask(task) {
  overlay().setFlag("pendingDelete", task.id, true);

  const finalize = async () => {
    deleteTimers.delete(task.id);
    try {
      if (task.source === SOURCE.SERVER) await api.remove(Number(task.id));
      overlay().confirmDelete(task.id);
    } catch (e) {
      overlay().setFlag("pendingDelete", task.id, false);
      toast.error(`Couldn't delete "${task.title}". It was restored.`, { description: errorText(e) });
    }
  };
  deleteTimers.set(task.id, setTimeout(finalize, UNDO_MS));

  toast(`Deleted "${task.title}"`, {
    duration: UNDO_MS,
    action: {
      label: "Undo",
      onClick: () => {
        clearTimeout(deleteTimers.get(task.id));
        deleteTimers.delete(task.id);
        overlay().setFlag("pendingDelete", task.id, false);
        toast.success("Task restored");
      },
    },
  });
}

/** Single-key shortcuts, ignored while typing or when a dialog is open. */
export function useHotkeys(map) {
  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(el?.tagName) || el?.isContentEditable;
      if (e.metaKey || e.ctrlKey || e.altKey || typing || document.querySelector("dialog[open]")) return;
      if (map[e.key]) {
        e.preventDefault();
        map[e.key]();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map]);
}
