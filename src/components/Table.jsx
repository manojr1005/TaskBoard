import { useEffect, useMemo, useRef, useState } from "react";
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { RANK, ROW_HEIGHT, fullName } from "../common/commonUtils";
import { Assignee, DueDate, PriorityBadge, StatusSelect } from "./ui";

const byRank = (key) => (a, b) => RANK[a.original[key]] - RANK[b.original[key]];
const ARIA_SORT = { asc: "ascending", desc: "descending" };

/** Virtualized table: only visible rows are in the DOM, so 5,000+ rows stay smooth. */
export function Table({ tasks, usersById, saving, onEdit, onDelete, onMove, onEndReached }) {
  const [sorting, setSorting] = useState([]);
  const scrollRef = useRef(null);

  const columns = useMemo(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <button type="button" className="row-title" data-row={row.index} onClick={() => onEdit(row.original)}>
            {row.original.title}
          </button>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        sortingFn: byRank("status"),
        cell: ({ row }) => <StatusSelect task={row.original} onMove={onMove} />,
      },
      {
        accessorKey: "priority",
        header: "Priority",
        sortingFn: byRank("priority"),
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        id: "assignee",
        header: "Assignee",
        accessorFn: (t) => fullName(usersById.get(t.userId)),
        cell: ({ row }) => <Assignee user={usersById.get(row.original.userId)} />,
      },
      {
        id: "dueDate",
        header: "Due",
        accessorFn: (t) => t.dueDate ?? "",
        cell: ({ row }) => <DueDate task={row.original} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="row-actions">
            {saving[row.id] && <span className="saving">Saving…</span>}
            <button
              type="button"
              className="btn btn-small btn-ghost"
              aria-label={`Delete ${row.original.title}`}
              onClick={() => onDelete(row.original)}
            >
              Delete
            </button>
          </span>
        ),
      },
    ],
    [usersById, saving, onEdit, onDelete, onMove],
  );

  const table = useReactTable({
    data: tasks,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (t) => t.id,
  });
  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const items = virtualizer.getVirtualItems();
  const lastIndex = items.at(-1)?.index ?? -1;

  // Infinite scroll: fetch the next server page when nearing the end.
  useEffect(() => {
    if (lastIndex >= rows.length - 10) onEndReached();
  }, [lastIndex, rows.length, onEndReached]);

  // Arrow Up/Down moves focus between row titles, scrolling virtual rows into view.
  const onKeyDown = (e) => {
    const current = e.target.closest("[data-row]");
    if (!current || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    e.preventDefault();
    const from = rows.findIndex((r) => r.index === Number(current.dataset.row));
    const to = Math.max(0, Math.min(rows.length - 1, from + (e.key === "ArrowDown" ? 1 : -1)));
    virtualizer.scrollToIndex(to);
    const focus = () => scrollRef.current?.querySelector(`[data-row="${rows[to].index}"]`)?.focus();
    requestAnimationFrame(() => requestAnimationFrame(focus));
  };

  const padTop = items[0]?.start ?? 0;
  const padBottom = items.length ? virtualizer.getTotalSize() - items.at(-1).end : 0;
  const spacer = (height) =>
    height > 0 && (
      <tr aria-hidden="true">
        <td style={{ height }} colSpan={columns.length} />
      </tr>
    );

  return (
    <div className="table-scroll" ref={scrollRef} tabIndex={-1}>
      <table className="table" aria-rowcount={rows.length + 1}>
        <thead>
          <tr>
            {table.getFlatHeaders().map((h) => {
              const dir = h.column.getIsSorted();
              const label = flexRender(h.column.columnDef.header, h.getContext());
              return (
                <th
                  key={h.id}
                  className={`th-${h.id}`}
                  aria-sort={h.column.getCanSort() ? (ARIA_SORT[dir] ?? "none") : undefined}
                >
                  {h.column.getCanSort() ? (
                    <button type="button" className="th-sort" onClick={h.column.getToggleSortingHandler()}>
                      {label}
                      <span aria-hidden="true" className="sort-mark">
                        {{ asc: "▲", desc: "▼" }[dir]}
                      </span>
                    </button>
                  ) : (
                    label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody onKeyDown={onKeyDown}>
          {spacer(padTop)}
          {items.map((vi) => {
            const row = rows[vi.index];
            return (
              <tr
                key={row.id}
                style={{ height: ROW_HEIGHT }}
                aria-rowindex={vi.index + 2}
                data-saving={saving[row.id] || undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            );
          })}
          {spacer(padBottom)}
        </tbody>
      </table>
    </div>
  );
}
