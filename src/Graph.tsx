// Graph: a commit's row of the graph of a log (gitGraph): the lanes through
// it, into its node and out of it, the node — the Git panel's log, the
// RefPicker's.
import type { GraphRow } from "./gitGraph";

const LANE = 12; // a lane's width, px
const ROW = 24; // a commit's row's height, px
const COLORS = ["#1e88e5", "#43a047", "#e53935", "#fb8c00", "#8e24aa", "#00acc1", "#6d4c41", "#d81b60"];
const color = (lane: number) => COLORS[lane % COLORS.length];

export default function Graph(props: { row: GraphRow }) {
  const r = props.row;
  const x = (lane: number) => lane * LANE + LANE / 2;
  const mid = ROW / 2;
  return (
    <svg class="gad-git__git-graph" width={r.width * LANE} height={ROW}>
      {r.through.map(([a, b]) => (
        <line x1={x(a)} y1={0} x2={x(b)} y2={ROW} stroke={color(a)} stroke-width={2} />
      ))}
      {r.into.map((j) => (
        <path d={`M${x(j)} 0 C ${x(j)} ${mid / 2}, ${x(r.col)} ${mid / 2}, ${x(r.col)} ${mid}`} stroke={color(j)} stroke-width={2} fill="none" />
      ))}
      {r.out.map((j) => (
        <path d={`M${x(r.col)} ${mid} C ${x(r.col)} ${mid + mid / 2}, ${x(j)} ${mid + mid / 2}, ${x(j)} ${ROW}`} stroke={color(j)} stroke-width={2} fill="none" />
      ))}
      <circle cx={x(r.col)} cy={mid} r={4} fill={color(r.col)} />
    </svg>
  );
}
