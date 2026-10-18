import { describe, expect, test } from "bun:test";
import { graphRows } from "../src/gitGraph";

describe("graphRows", () => {
  test("a line: one lane", () => {
    const rows = graphRows([
      { hash: "c", parents: ["b"] },
      { hash: "b", parents: ["a"] },
      { hash: "a", parents: [] },
    ]);
    expect(rows.map((r) => r.col)).toEqual([0, 0, 0]);
    expect(rows[0].into).toEqual([]);
    expect(rows[1].into).toEqual([0]);
    expect(rows[2].out).toEqual([]);
    expect(rows.every((r) => r.width === 1)).toBe(true);
  });

  test("a merge: a branch opens and closes", () => {
    // m merges x into b; b and x both come from a
    const rows = graphRows([
      { hash: "m", parents: ["b", "x"] },
      { hash: "x", parents: ["a"] },
      { hash: "b", parents: ["a"] },
      { hash: "a", parents: [] },
    ]);
    expect(rows[0]).toMatchObject({ col: 0, out: [0, 1], width: 2 });
    expect(rows[1]).toMatchObject({ col: 1, into: [1], out: [1] });
    expect(rows[1].through).toEqual([[0, 0]]);
    // b's parent a: the lane of x waits for it already
    expect(rows[2]).toMatchObject({ col: 0, into: [0], out: [1] });
    expect(rows[3]).toMatchObject({ col: 1, into: [1], out: [] });
  });

  test("two tips side by side", () => {
    const rows = graphRows([
      { hash: "t1", parents: ["a"] },
      { hash: "t2", parents: ["a"] },
      { hash: "a", parents: [] },
    ]);
    expect(rows[0]).toMatchObject({ col: 0, into: [] });
    expect(rows[1]).toMatchObject({ col: 1, into: [], out: [0] });
    expect(rows[2]).toMatchObject({ col: 0, into: [0] });
  });
});
