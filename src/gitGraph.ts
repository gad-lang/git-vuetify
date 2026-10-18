// The graph of a log of commits (the Git panel's): each commit in a lane —
// a column —, the lines from it to its parents. The commits come newest
// first, each before its parents (git log --topo-order).

export interface GraphCommit {
  hash: string;
  parents: string[];
}

/** GraphRow is how a commit's row is drawn. */
export interface GraphRow {
  /** the lane of the commit's node */
  col: number;
  /** the lanes going through the row, top to bottom: [from, to] */
  through: [number, number][];
  /** the lanes coming into the node from above */
  into: number[];
  /** the lanes going out of the node below, to its parents */
  out: number[];
  /** the lanes the row has: its width */
  width: number;
}

// graphRows are the rows of the commits, in their order. lanes holds, by
// column, the hash each lane waits for (the parent of the commit above it).
export function graphRows(commits: GraphCommit[]): GraphRow[] {
  const lanes: (string | null)[] = [];
  const free = () => {
    const i = lanes.indexOf(null);
    return i < 0 ? lanes.length : i;
  };
  return commits.map((c) => {
    let col = lanes.indexOf(c.hash);
    // a tip: no lane waited for it, none comes into it
    const tip = col < 0;
    if (tip) {
      col = free();
      lanes[col] = c.hash;
    }
    // the lanes that wait for it come into it
    const into: number[] = [];
    lanes.forEach((h, j) => {
      if (h === c.hash && !(tip && j === col)) into.push(j);
    });
    const before = lanes.slice();
    for (const j of into) lanes[j] = null;
    lanes[col] = null;
    // its parents: the first in its lane — unless a lane waits for it
    // already —, the others in a lane waiting for them, or a new one
    const out: number[] = [];
    c.parents.forEach((p, i) => {
      let j = lanes.indexOf(p);
      if (j < 0) {
        j = i === 0 ? col : free();
        lanes[j] = p;
      }
      out.push(j);
    });
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    // the other lanes go through: where they were
    const through: [number, number][] = [];
    before.forEach((h, j) => {
      if (h !== null && h !== c.hash && lanes[j] === h) through.push([j, j]);
    });
    const width = Math.max(before.length, lanes.length, col + 1, ...out.map((j) => j + 1));
    return { col, through, into, out, width };
  });
}
