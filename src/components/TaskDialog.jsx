import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  PRIORITIES,
  PRIORITY,
  PRIORITY_VALUES,
  STATUS,
  STATUSES,
  STATUS_ORDER,
  TITLE_MAX,
  TITLE_MIN,
  fullName,
} from "../common/commonUtils";

export const taskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .min(TITLE_MIN, `Title must be at least ${TITLE_MIN} characters`)
    .max(TITLE_MAX, `Title must be ${TITLE_MAX} characters or fewer`),
  status: z.enum(STATUS_ORDER),
  priority: z.enum(PRIORITY_VALUES),
  userId: z.coerce.number().int().positive("Choose an assignee"),
  dueDate: z
    .string()
    .optional()
    .transform((v) => v || null),
});

/** Label + control + error, wired for screen readers. */
function Field({ id, label, error, children, hint }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint}
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error.message}
        </p>
      )}
    </div>
  );
}

export function TaskForm({ task, users, onSubmit, onCancel }) {
  const { register, handleSubmit, watch, formState } = useForm({
    resolver: zodResolver(taskSchema),
    mode: "onTouched",
    defaultValues: {
      title: task?.title ?? "",
      status: task?.status ?? STATUS.TODO,
      priority: task?.priority ?? PRIORITY.MEDIUM,
      userId: task?.userId ?? users[0]?.id ?? 0,
      dueDate: task?.dueDate ?? "",
    },
  });
  const { errors } = formState;
  const length = (watch("title") ?? "").trim().length;
  const a11y = (name) => ({
    id: name,
    "aria-invalid": errors[name] ? "true" : "false",
    "aria-describedby": `${name}-error`,
    ...register(name),
  });

  return (
    <form className="task-form" noValidate onSubmit={handleSubmit(onSubmit)}>
      <h2 id="task-dialog-title">{task ? "Edit task" : "New task"}</h2>

      <Field
        id="title"
        label="Title"
        error={errors.title}
        hint={
          <div className="field-meta">
            <span className="muted">
              {TITLE_MIN} to {TITLE_MAX} characters
            </span>
            <span className={length > TITLE_MAX ? "counter counter-over" : "counter"} aria-hidden="true">
              {length}/{TITLE_MAX}
            </span>
          </div>
        }
      >
        <input autoFocus autoComplete="off" {...a11y("title")} />
      </Field>

      <div className="field-row">
        <Field id="status" label="Status">
          <select {...a11y("status")}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="priority" label="Priority">
          <select {...a11y("priority")}>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="field-row">
        <Field id="userId" label="Assignee" error={errors.userId}>
          <select {...a11y("userId")}>
            {users.length === 0 && <option value={0}>Loading people…</option>}
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {fullName(u)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="dueDate" label="Due date">
          <input type="date" {...a11y("dueDate")} />
        </Field>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          {task ? "Save changes" : "Create task"}
        </button>
      </div>
    </form>
  );
}

/** Native <dialog>: focus trap, Escape and inert background for free. Focus returns to the opener on close. */
export function TaskDialog({ open, task, users, onClose, onSave }) {
  const ref = useRef(null);
  const opener = useRef(null);

  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal ? d.showModal() : d.setAttribute("open", "");
    } else if (!open && d.open) {
      d.close ? d.close() : d.removeAttribute("open");
      opener.current?.focus?.();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="task-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <TaskForm
          key={task?.id ?? "new"}
          task={task}
          users={users}
          onCancel={onClose}
          onSubmit={(values) => {
            onSave(values);
            onClose();
          }}
        />
      )}
    </dialog>
  );
}
