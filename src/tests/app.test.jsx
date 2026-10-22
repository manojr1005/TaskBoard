import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { TaskForm } from "../components/TaskDialog";
import { BASE_URL } from "../common/commonUtils";
import { useOverlay, useSettings } from "../store";
import { renderApp, server, users } from "./helpers";

const TITLE = "Write the onboarding guide";
const column = (name) => screen.getByRole("region", { name });
const task = (name) => screen.queryByRole("button", { name });
const saveFailed = (title) => `Couldn't save "${title}". Changes were reverted.`;

describe("form validation", () => {
  const setup = () => {
    const onSubmit = vi.fn();
    render(<TaskForm users={users} onSubmit={onSubmit} onCancel={() => {}} />);
    const user = userEvent.setup();
    const submit = () => user.click(screen.getByRole("button", { name: "Create task" }));
    return { onSubmit, user, submit, title: screen.getByLabelText("Title") };
  };

  it("requires a title", async () => {
    const { submit, onSubmit } = setup();
    await submit();
    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects fewer than 5 characters, ignoring surrounding spaces", async () => {
    const { user, title, submit, onSubmit } = setup();
    await user.type(title, "   abc   ");
    await submit();
    expect(await screen.findByText("Title must be at least 5 characters")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects more than 120 characters", async () => {
    const { user, title, submit, onSubmit } = setup();
    await user.click(title);
    await user.paste("x".repeat(121));
    await submit();
    expect(await screen.findByText("Title must be 120 characters or fewer")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("accepts the 5 and 120 character boundaries and submits trimmed values", async () => {
    const { user, title, submit, onSubmit } = setup();
    await user.type(title, "  Ship!  ");
    await user.selectOptions(screen.getByLabelText("Priority"), "high");
    await submit();
    expect(onSubmit.mock.calls[0][0]).toEqual({
      title: "Ship!",
      status: "todo",
      priority: "high",
      userId: 1,
      dueDate: null,
    });

    await user.clear(title);
    await user.click(title);
    await user.paste("y".repeat(120));
    await submit();
    expect(onSubmit.mock.calls[1][0]).toMatchObject({ title: "y".repeat(120) });
  });
});

describe("optimistic updates", () => {
  it("moves the card immediately, then rolls back with a toast when the save fails", async () => {
    server.use(
      http.put(`${BASE_URL}/todos/:id`, async () => {
        await delay(100);
        return new HttpResponse(null, { status: 500 });
      }),
    );
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("button", { name: TITLE });

    await user.selectOptions(screen.getByLabelText(`Status for ${TITLE}`), "done");
    expect(within(column("Done")).getByText(TITLE)).toBeInTheDocument(); // before the server answers
    expect(within(column("Todo")).queryByText(TITLE)).not.toBeInTheDocument();

    expect(await screen.findByText(saveFailed(TITLE))).toBeInTheDocument();
    await waitFor(() => expect(within(column("Todo")).getByText(TITLE)).toBeInTheDocument());
    expect(useOverlay.getState().edits["1"]).toBeUndefined();
  });

  it("keeps the change when the save succeeds", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("button", { name: TITLE });
    await user.selectOptions(screen.getByLabelText(`Status for ${TITLE}`), "in_progress");
    await waitFor(() => expect(useOverlay.getState().saving["1"]).toBeUndefined());
    expect(within(column("In progress")).getByText(TITLE)).toBeInTheDocument();
    expect(useOverlay.getState().edits["1"]).toEqual({ status: "in_progress" });
  });

  it("chaos mode fails writes in the API client and the UI rolls back", async () => {
    useSettings.setState({ chaos: true, chaosDelayMs: 10 });
    const random = vi.spyOn(Math, "random").mockReturnValue(0.1); // below the 0.2 fail rate
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("button", { name: TITLE });
    await user.selectOptions(screen.getByLabelText(`Status for ${TITLE}`), "done");
    expect(await screen.findByText(saveFailed(TITLE))).toBeInTheDocument();
    expect(within(column("Todo")).getByText(TITLE)).toBeInTheDocument();
    random.mockRestore();
  });

  it("undo restores a deleted task and never sends the DELETE", async () => {
    const deleted = vi.fn();
    server.use(
      http.delete(`${BASE_URL}/todos/:id`, () => {
        deleted();
        return HttpResponse.json({});
      }),
    );
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("button", { name: TITLE });

    await user.click(screen.getByRole("button", { name: `Delete ${TITLE}` }));
    expect(task(TITLE)).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("button", { name: TITLE })).toBeInTheDocument();
    expect(deleted).not.toHaveBeenCalled();
  });
});

describe("filter flow", () => {
  it("filters by status and writes it to the URL", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("button", { name: TITLE });
    await user.selectOptions(screen.getByLabelText("Filter by status"), "done");

    expect(task("Review open pull requests")).toBeInTheDocument();
    expect(task(TITLE)).not.toBeInTheDocument();
    expect(task("Plan the sprint retro")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("status=done");
    expect(screen.getByText("1 of 3 tasks match")).toBeInTheDocument();
  });

  it("restores filters from a shared link", async () => {
    renderApp("/?assignee=2&q=retro");
    expect(await screen.findByRole("button", { name: "Plan the sprint retro" })).toBeInTheDocument();
    expect(task("Review open pull requests")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search tasks")).toHaveValue("retro");
    expect(screen.getByLabelText("Filter by assignee")).toHaveValue("2");
  });

  it("debounces search, shows the empty state, and clears", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("button", { name: TITLE });

    await user.type(screen.getByLabelText("Search tasks"), "nothing like this");
    expect(task(TITLE)).toBeInTheDocument(); // debounce hasn't fired yet
    expect(await screen.findByText("No tasks match these filters")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("q=nothing");

    await user.click(within(screen.getByRole("main")).getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(task(TITLE)).toBeInTheDocument());
    expect(screen.getByLabelText("Search tasks")).toHaveValue("");
  });
});
