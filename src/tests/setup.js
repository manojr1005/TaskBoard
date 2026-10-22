import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { useOverlay, useSettings } from "../store";
import { CHAOS_DELAY_MS, CHAOS_FAIL_RATE } from "../common/commonUtils";
import { server } from "./helpers";

// jsdom gaps used by sonner.
window.matchMedia ??= (query) => ({
  matches: false,
  media: query,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
});
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  localStorage.clear();
  useOverlay.getState().reset();
  useSettings.setState({ chaos: false, chaosDelayMs: CHAOS_DELAY_MS, chaosFailRate: CHAOS_FAIL_RATE });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
