import { memo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { COLUMN_PAGE_SIZE, LABEL, STATUSES, STATUS_ORDER } from "../common/commonUtils";
import { Assignee, DueDate, PriorityBadge, StatusSelect } from "./ui";

const taskOf = (item) => item?.data.current?.task;

/** Keyboard drag: Left/Right jumps a whole column. Space picks up/drops, Escape cancels. */
function columnCoordinates(event, { context, currentCoordinates }) {
  const delta = { ArrowRight: 1, ArrowLeft: -1 }[event.code];
  if (!delta) return undefined;
  event.preventDefault();
  const current = context.over?.id ?? taskOf(context.active)?.status;
  const target = STATUS_ORDER[Math.max(0, Math.min(STATUS_ORDER.length - 1, STATUS_ORDER.indexOf(current) + delta))];
  const rect = context.droppableRects.get(target);
  return rect ? { x: rect.left + 12, y: rect.top + 56 } : currentCoordinates;
}

/** Screen-reader announcements for each drag step. */
const announcements = {
  onDragStart: ({ active }) =>
    `Picked up ${taskOf(active).title}. Use left and right arrow keys to change column, Space to drop, Escape to cancel.`,
  onDragOver: ({ active, over }) =>
    over ? `${taskOf(active).title} is over ${LABEL[over.id]}.` : "Not over a column.",
  onDragEnd: ({ active, over }) =>
    over ? `Moved ${taskOf(active).title} to ${LABEL[over.id]}.` : "Dropped. Status unchanged.",
  onDragCancel: ({ active }) => `Cancelled. ${taskOf(active).title} was not moved.`,
};

const instructions = {
  draggable:
    "To move a task, press Space on its drag handle, use the left and right arrow keys to choose a column, then press Space again. You can also use the status menu on each card.",
};

export function Board({ tasks, usersById, saving, onEdit, onDelete, onMove }) {
  const [active, setActive] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnCoordinates }),
  );
  const cardProps = { usersById, saving, onEdit, onDelete, onMove };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      accessibility={{ announcements, screenReaderInstructions: instructions }}
      onDragStart={(e) => setActive(taskOf(e.active))}
      onDragCancel={() => setActive(null)}
      onDragEnd={({ active, over }) => {
        setActive(null);
        const task = taskOf(active);
        if (task && over && over.id !== task.status) onMove(task, over.id);
      }}
    >
      <div className="board">
        {STATUSES.map((s) => (
          <Column
            key={s.value}
            status={s.value}
            title={s.label}
            tasks={tasks.filter((t) => t.status === s.value)}
            {...cardProps}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {active && <CardView task={active} user={usersById.get(active.userId)} overlay />}
      </DragOverlay>
    </DndContext>
  );
}

function Column({ status, title, tasks, usersById, saving, ...handlers }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [limit, setLimit] = useState(COLUMN_PAGE_SIZE); // render cap keeps 5,000 tasks usable
  const hidden = tasks.length - limit;

  return (
    <section
      ref={setNodeRef}
      className={`column column-${status}`}
      data-over={isOver || undefined}
      aria-labelledby={`col-${status}`}
    >
      <header className="column-head">
        <h2 id={`col-${status}`}>{title}</h2>
        <span className="count" aria-label={`${tasks.length} tasks`}>
          {tasks.length}
        </span>
      </header>
      <div className="column-body">
        {tasks.length === 0 && <p className="column-empty">Drop tasks here</p>}
        {tasks.slice(0, limit).map((t) => (
          <TaskCard key={t.id} task={t} user={usersById.get(t.userId)} saving={!!saving[t.id]} {...handlers} />
        ))}
        {hidden > 0 && (
          <button className="btn btn-ghost btn-block" onClick={() => setLimit((l) => l + COLUMN_PAGE_SIZE)}>
            Show {Math.min(COLUMN_PAGE_SIZE, hidden)} more of {hidden}
          </button>
        )}
      </div>
    </section>
  );
}

const TaskCard = memo(function TaskCard(props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.task.id,
    data: { task: props.task },
  });
  return (
    <CardView {...props} cardRef={setNodeRef} dragging={isDragging} handleProps={{ ...listeners, ...attributes }} />
  );
});

/** Card markup, shared by the live card and the drag preview (overlay). */
function CardView({ task, user, saving, onEdit, onDelete, onMove, cardRef, dragging, handleProps, overlay }) {
  return (
    <article
      ref={cardRef}
      className={overlay ? "card card-overlay" : "card"}
      data-dragging={dragging || undefined}
      data-saving={saving || undefined}
      aria-busy={saving || undefined}
    >
      <div className="card-top">
        {!overlay && (
          <button type="button" className="drag-handle" aria-label={`Drag ${task.title}`} {...handleProps}>
            <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
              {[2, 8, 14].flatMap((y) => [
                <circle key={`a${y}`} cx="2" cy={y} r="1.5" />,
                <circle key={`b${y}`} cx="8" cy={y} r="1.5" />,
              ])}
            </svg>
          </button>
        )}
        <PriorityBadge priority={task.priority} />
        <DueDate task={task} />
        {saving && <span className="saving">Saving…</span>}
      </div>

      {overlay ? (
        <p className="card-title">{task.title}</p>
      ) : (
        <button type="button" className="card-title" onClick={() => onEdit(task)}>
          {task.title}
        </button>
      )}

      <div className="card-foot">
        <Assignee user={user} />
        {!overlay && (
          <div className="card-actions">
            <StatusSelect task={task} onMove={onMove} />
            <button
              type="button"
              className="icon-btn"
              aria-label={`Delete ${task.title}`}
              onClick={() => onDelete(task)}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path
                  d="M2 4h10M5.5 4V2.5h3V4M3.5 4l.6 8h5.8l.6-8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
