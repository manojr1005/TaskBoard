import { render } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import App, { Providers } from "../App";
import { BASE_URL } from "../common/commonUtils";

export const todos = [
  { id: 1, todo: "Write the onboarding guide", completed: false, userId: 1 },
  { id: 2, todo: "Review open pull requests", completed: true, userId: 2 },
  { id: 3, todo: "Plan the sprint retro", completed: false, userId: 2 },
];
export const users = [
  { id: 1, firstName: "Emily", lastName: "Johnson", image: "" },
  { id: 2, firstName: "Michael", lastName: "Williams", image: "" },
];

/** MSW mocks DummyJSON at the network level, so the real API client runs in tests. */
export const server = setupServer(
  http.get(`${BASE_URL}/todos`, ({ request }) => {
    const url = new URL(request.url);
    const skip = Number(url.searchParams.get("skip") ?? 0);
    const page = todos.slice(skip, skip + Number(url.searchParams.get("limit") ?? 30));
    return HttpResponse.json({ todos: page, total: todos.length, skip, limit: page.length });
  }),
  http.get(`${BASE_URL}/users`, () => HttpResponse.json({ users })),
  http.post(`${BASE_URL}/todos/add`, async ({ request }) => HttpResponse.json({ id: 255, ...(await request.json()) })),
  http.put(`${BASE_URL}/todos/:id`, async ({ request, params }) =>
    HttpResponse.json({ id: Number(params.id), ...(await request.json()) }),
  ),
  http.delete(`${BASE_URL}/todos/:id`, ({ params }) => HttpResponse.json({ id: Number(params.id), isDeleted: true })),
);

function LocationProbe() {
  return <output data-testid="location">{useLocation().search}</output>;
}

export function renderApp(url = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Providers client={client}>
        <App />
        <LocationProbe />
      </Providers>
    </MemoryRouter>,
  );
}
