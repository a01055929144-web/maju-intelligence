import { expect, it } from "vitest";
import { LIST_CHUNK, visibleCount } from "../domains/route/list-chunk";

it("draws one chunk, grows with the limit, and always reaches the selected row", () => {
  expect(visibleCount(LIST_CHUNK, 3023, -1)).toBe(100);
  expect(visibleCount(LIST_CHUNK, 3023, 250)).toBe(251);
  expect(visibleCount(LIST_CHUNK + 100, 150, -1)).toBe(150);
  expect(visibleCount(LIST_CHUNK, 0, -1)).toBe(0);
});
