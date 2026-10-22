import { useEffect, useRef, useState } from "react";
import { LABEL, STATUS, STATUSES, fullName, todayISO } from "../common/commonUtils";

export function Assignee({ user }) {
  const [broken, setBroken] = useState(false);
  const initials = user ? user.firstName[0] + user.lastName[0] : "?";
  return (
    <span className="assignee">
      {user?.image && !broken ? (
        <img
          className="avatar"
          src={user.image}
          width={24}
          height={24}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="avatar avatar-fallback" aria-hidden="true">
          {initials}
        </span>
      )}
      <span className="assignee-name">{fullName(user)}</span>
    </span>
  );
}

export const PriorityBadge = ({ priority }) => (
  <span className={`priority priority-${priority}`}>
    <span className="priority-bars" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
    {LABEL[priority]}
  </span>
);

const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export function DueDate({ task }) {
  if (!task.dueDate) return null;
  const overdue = task.status !== STATUS.DONE && task.dueDate < todayISO();
  return (
    <span className={overdue ? "due due-overdue" : "due"}>
      <time dateTime={task.dueDate}>{dateFormat.format(new Date(`${task.dueDate}T00:00:00`))}</time>
      {overdue && <span className="sr-only"> (overdue)</span>}
    </span>
  );
}

/** Status dropdown on every card and row: the keyboard-friendly alternative to drag and drop. */
export const StatusSelect = ({ task, onMove }) => (
  <select
    className="select-compact"
    aria-label={`Status for ${task.title}`}
    value={task.status}
    onChange={(e) => onMove(task, e.target.value)}
  >
    {STATUSES.map((s) => (
      <option key={s.value} value={s.value}>
        {s.label}
      </option>
    ))}
  </select>
);

export const Loading = () => (
  <div className="state" role="status">
    <div className="skeleton-grid" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
    <span className="sr-only">Loading tasks…</span>
  </div>
);

/** Empty and error states. */
export const Message = ({ title, body, action, error }) => (
  <div className={error ? "state state-error" : "state"} role={error ? "alert" : undefined}>
    <h2>{title}</h2>
    <p>{body}</p>
    {action}
  </div>
);

export const InlineError = ({ message, onRetry }) => (
  <div className="inline-error" role="alert">
    <span>{message}</span>
    <button className="btn btn-small" onClick={onRetry}>
      Try again
    </button>
  </div>
);

/** Infinite scroll: loads the next page when this bar scrolls into view; the button is the fallback. */
export function LoadMore({ loaded, total, hasNextPage, isFetching, isError, onLoadMore }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !hasNextPage || isError || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetching) onLoadMore();
      },
      {
        rootMargin: "300px",
      },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [hasNextPage, isFetching, isError, onLoadMore]);

  if (isError) return <InlineError message="Couldn't load more tasks." onRetry={onLoadMore} />;
  return (
    <div className="load-more" ref={ref}>
      <span className="muted">
        {loaded} of {total} server tasks loaded
      </span>
      {hasNextPage && (
        <button className="btn btn-small" onClick={onLoadMore} disabled={isFetching}>
          {isFetching ? "Loading…" : "Load more tasks"}
        </button>
      )}
    </div>
  );
}
