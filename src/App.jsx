import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { Board } from "./components/Board";
import { Table } from "./components/Table";
import { TaskDialog } from "./components/TaskDialog";
import { InlineError, LoadMore, Loading, Message } from "./components/ui";
import { createTask, removeTask, updateTask, useDebounce, useFilters, useHotkeys, useTasks, useUsers } from "./hooks";
import { useOverlay, useSettings } from "./store";
import {
  PRIORITIES,
  QUERY_KEYS,
  SEARCH_DEBOUNCE_MS,
  STATUSES,
  STRESS_TASK_COUNT,
  applyFilters,
  fullName,
  generateStressTasks,
  hasActiveFilters,
} from "./common/commonUtils";

export function Providers({ client, children }) {
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster position="bottom-right" closeButton richColors visibleToasts={4} />
    </QueryClientProvider>
  );
}

export default function App() {
  const { filters, view, update, clear } = useFilters();
  const tasks = useTasks();
  const users = useUsers();
  const queryClient = useQueryClient();
  const saving = useOverlay((s) => s.saving);
  const stressCount = useOverlay((s) => s.stress.length);
  const [dialog, setDialog] = useState({ open: false });
  const [stressBusy, setStressBusy] = useState(false);
  const searchRef = useRef(null);

  const visible = useMemo(() => applyFilters(tasks.tasks, filters), [tasks.tasks, filters]);
  const filtered = hasActiveFilters(filters);

  const openNew = useCallback(() => setDialog({ open: true }), []);
  const onEdit = useCallback((task) => setDialog({ open: true, task }), []);
  const onMove = useCallback((task, status) => {
    if (task.status !== status) updateTask(task, { status });
  }, []);
  const onSave = (values) =>
    dialog.task
      ? updateTask(dialog.task, values).then((ok) => ok && toast.success("Changes saved"))
      : createTask(values);

  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = tasks;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  // Table auto-load pauses after an error; the "Try again" button (loadMore) still works.
  const autoLoad = useCallback(() => {
    if (!isFetchNextPageError) loadMore();
  }, [isFetchNextPageError, loadMore]);

  const stressTest = async () => {
    setStressBusy(true);
    const generated = await generateStressTasks(
      STRESS_TASK_COUNT,
      users.users.map((u) => u.id),
    ).finally(() => setStressBusy(false));
    useOverlay.getState().setStress(generated);
    update({ view: "table" });
    toast.success(`Added ${STRESS_TASK_COUNT.toLocaleString()} test tasks`);
  };

  const resetLocal = () => {
    if (!window.confirm("Remove all local tasks and edits, and reload tasks from the server?")) return;
    useOverlay.getState().reset();
    queryClient.resetQueries({ queryKey: QUERY_KEYS.todos });
    toast.success("Local changes removed");
  };

  useHotkeys(useMemo(() => ({ "/": () => searchRef.current?.focus(), n: openNew }), [openNew]));

  const listProps = { tasks: visible, usersById: users.usersById, saving, onEdit, onDelete: removeTask, onMove };
  const loadMoreBar = (
    <LoadMore
      loaded={tasks.serverLoaded}
      total={tasks.serverTotal}
      hasNextPage={hasNextPage}
      isFetching={isFetchingNextPage}
      isError={isFetchNextPageError}
      onLoadMore={loadMore}
    />
  );

  let content;
  if (tasks.isPending) content = <Loading />;
  else if (tasks.isError)
    content = (
      <Message
        error
        title="Couldn't load tasks"
        body={tasks.error?.message}
        action={
          <button className="btn" onClick={() => tasks.refetch()}>
            Try again
          </button>
        }
      />
    );
  else if (visible.length === 0)
    content = filtered ? (
      <Message
        title="No tasks match these filters"
        body={
          hasNextPage
            ? "Only loaded tasks are searched. Load more tasks or change the filters."
            : "Change or clear the filters to see more tasks."
        }
        action={
          <button className="btn" onClick={clear}>
            Clear filters
          </button>
        }
      />
    ) : (
      <Message
        title="No tasks yet"
        body="Create the first task for your team."
        action={
          <button className="btn btn-primary" onClick={openNew}>
            New task
          </button>
        }
      />
    );
  else content = view === "board" ? <Board {...listProps} /> : <Table {...listProps} onEndReached={autoLoad} />;

  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Skip to tasks
      </a>
      <Header
        stressCount={stressCount}
        stressBusy={stressBusy}
        onStress={stressTest}
        onReset={resetLocal}
        onNew={openNew}
      />
      <Toolbar ref={searchRef} filters={filters} view={view} users={users.users} onChange={update} onClear={clear} />
      {users.isError && (
        <InlineError message="Couldn't load assignees. Names and photos are hidden." onRetry={() => users.refetch()} />
      )}

      <main id="main" tabIndex={-1}>
        {!tasks.isPending && !tasks.isError && (
          <p className="summary" aria-live="polite">
            {filtered
              ? `${visible.length.toLocaleString()} of ${tasks.tasks.length.toLocaleString()} tasks match`
              : `${tasks.tasks.length.toLocaleString()} tasks`}
          </p>
        )}
        {content}
        {!tasks.isPending && !tasks.isError && (visible.length > 0 || hasNextPage) && loadMoreBar}
      </main>

      <TaskDialog
        open={dialog.open}
        task={dialog.task}
        users={users.users}
        onClose={() => setDialog({ open: false })}
        onSave={onSave}
      />
    </div>
  );
}

function Header({ stressCount, stressBusy, onStress, onReset, onNew }) {
  const chaos = useSettings((s) => s.chaos);
  const setChaos = useSettings((s) => s.setChaos);
  return (
    <header className="app-header">
      <div className="brand">
        <h1>Team task board</h1>
        {chaos && (
          <span className="chaos-flag" role="status">
            Chaos mode on: slow responses, 1 in 5 saves fail
          </span>
        )}
      </div>
      <div className="header-actions">
        <button type="button" role="switch" aria-checked={chaos} className="switch" onClick={() => setChaos(!chaos)}>
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
          Chaos mode
        </button>
        {stressCount > 0 ? (
          <button type="button" className="btn btn-ghost" onClick={() => useOverlay.getState().clearStress()}>
            Remove {stressCount.toLocaleString()} test tasks
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={onStress} disabled={stressBusy}>
            {stressBusy ? "Generating…" : `Stress test: add ${STRESS_TASK_COUNT.toLocaleString()} tasks`}
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onReset}>
          Reset local changes
        </button>
        <button type="button" className="btn btn-primary" onClick={onNew} aria-keyshortcuts="n">
          New task <kbd className="kbd kbd-on-primary">N</kbd>
        </button>
      </div>
    </header>
  );
}

/** Typing updates the box at once; the URL (and the list) update after the debounce. */
const SearchBox = forwardRef(function SearchBox({ value, onChange }, ref) {
  const [text, setText] = useState(value);
  const debounced = useDebounce(text, SEARCH_DEBOUNCE_MS);
  useEffect(() => {
    if (debounced !== value) onChange(debounced);
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync back when the URL changes elsewhere (Clear filters, back button).
  useEffect(() => {
    if (value !== debounced) setText(value);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="search">
      <label htmlFor="search" className="sr-only">
        Search tasks
      </label>
      <svg className="search-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <input
        id="search"
        ref={ref}
        type="search"
        placeholder="Search tasks"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-keyshortcuts="/"
      />
      <kbd className="kbd" aria-hidden="true">
        /
      </kbd>
    </div>
  );
});

const FilterSelect = ({ label, value, allLabel, options, onChange }) => (
  <select className="filter" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">{allLabel}</option>
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

const Toolbar = forwardRef(function Toolbar({ filters, view, users, onChange, onClear }, searchRef) {
  const people = useMemo(() => users.map((u) => ({ value: u.id, label: fullName(u) })), [users]);
  return (
    <div className="toolbar" role="search">
      <SearchBox ref={searchRef} value={filters.q} onChange={(q) => onChange({ q })} />
      <div className="filters">
        <FilterSelect
          label="Filter by status"
          allLabel="All statuses"
          options={STATUSES}
          value={filters.status}
          onChange={(status) => onChange({ status })}
        />
        <FilterSelect
          label="Filter by priority"
          allLabel="All priorities"
          options={PRIORITIES}
          value={filters.priority}
          onChange={(priority) => onChange({ priority })}
        />
        <FilterSelect
          label="Filter by assignee"
          allLabel="Everyone"
          options={people}
          value={filters.assignee ?? ""}
          onChange={(v) => onChange({ assignee: v ? Number(v) : null })}
        />
        {hasActiveFilters(filters) && (
          <button className="btn btn-ghost btn-small" onClick={onClear}>
            Clear filters
          </button>
        )}
      </div>
      <div className="view-toggle" role="group" aria-label="View">
        {["board", "table"].map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => onChange({ view: v })}>
            {v === "board" ? "Board" : "Table"}
          </button>
        ))}
      </div>
    </div>
  );
});
