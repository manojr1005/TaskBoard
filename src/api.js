import { useSettings } from "./store";
import { BASE_URL, PAGE_SIZE, USERS_PATH, WRITE_METHODS } from "./common/commonUtils";

export class ApiError extends Error {}

/**
 * Every request goes through here. Chaos mode adds ?delay= to all requests
 * and fails ~20% of writes, so no component needs to know about it.
 */
export async function request(path, { method = "GET", body } = {}) {
  const { chaos, chaosDelayMs, chaosFailRate } = useSettings.getState();
  const url = new URL(BASE_URL + path);
  if (chaos) url.searchParams.set("delay", chaosDelayMs);

  if (chaos && WRITE_METHODS.includes(method) && Math.random() < chaosFailRate) {
    await new Promise((r) => setTimeout(r, chaosDelayMs));
    throw new ApiError("Chaos mode: simulated server failure");
  }

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  }).catch(() => {
    throw new ApiError("Network error. Check your connection.");
  });
  if (!res.ok) throw new ApiError(`Request failed (${res.status})`);
  return res.json();
}

export const api = {
  todos: (skip) => request(`/todos?limit=${PAGE_SIZE}&skip=${skip}`),
  users: () => request(USERS_PATH).then((d) => d.users),
  create: (body) => request("/todos/add", { method: "POST", body }),
  update: (id, body) => request(`/todos/${id}`, { method: "PUT", body }),
  remove: (id) => request(`/todos/${id}`, { method: "DELETE" }),
};
