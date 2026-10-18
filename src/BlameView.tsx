// BlameView shows a file with who changed each line last (as IntelliJ's
// annotate): at the left of the lines, the commit of each run of them — its
// date and author, its hash, its summary on hover —, its color warmer the
// newer it is; a click on it chooses the commit (onCommit).
import { computed, defineComponent, type PropType } from "vue";
import { VProgressLinear } from "./vuetify";
import type { GitBlame } from "./api";

// NOT_COMMITTED is blame's hash of a line not committed yet.
export const NOT_COMMITTED = "0000000000000000000000000000000000000000";

const day = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { dateStyle: "short" });
};
const when = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
};

export default defineComponent({
  name: "BlameView",
  props: {
    blame: { type: Object as PropType<GitBlame>, default: undefined },
    error: { type: String, default: "" },
    binaryText: { type: String, default: "" },
    notCommitted: { type: String, default: "Not committed yet" },
    onCommit: { type: Function as PropType<(hash: string) => void>, default: undefined },
  },
  setup(props) {
    // the age of each commit, 0 (the oldest) to 1 (the newest)
    const heat = computed(() => {
      const b = props.blame;
      const out: Record<string, number> = {};
      if (!b) return out;
      const times = Object.entries(b.commits).map(([h, c]) => [h, new Date(c.date).getTime()] as const).filter(([, t]) => !isNaN(t));
      const ts = times.map(([, t]) => t);
      const min = Math.min(...ts), max = Math.max(...ts);
      for (const [h, t] of times) out[h] = max > min ? (t - min) / (max - min) : 1;
      out[NOT_COMMITTED] = 1;
      return out;
    });
    const width = computed(() => String(props.blame?.lines.length ?? 0).length);

    return () => {
      const b = props.blame;
      if (props.error) return <div class="pa-4 text-error" data-blame-error>{props.error}</div>;
      if (!b) return <VProgressLinear indeterminate color="primary" />;
      if (b.binary) return <div class="pa-4 text-medium-emphasis">{props.binaryText}</div>;
      return (
        <div class="gad-git__blame" data-blame>
          <table>
            <tbody>
              {b.lines.map((l, i) => {
                const c = b.commits[l.hash];
                const first = i === 0 || b.lines[i - 1].hash !== l.hash;
                const none = l.hash === NOT_COMMITTED;
                const title = none
                  ? props.notCommitted
                  : c
                    ? `${l.hash.slice(0, 10)}\n${c.author} <${c.email}>\n${when(c.date)}\n\n${c.summary}${c.path ? `\n${c.path}` : ""}`
                    : l.hash;
                return (
                  <tr key={i} class={{ "gad-git__blame-first": first }}>
                    <td
                      class={["gad-git__blame-ann", { "gad-git__blame-ann--none": none }]}
                      style={{ background: `rgba(var(--v-theme-primary), ${(0.03 + 0.22 * (heat.value[l.hash] ?? 0)).toFixed(3)})` }}
                      title={title}
                      data-blame-commit={first ? l.hash : undefined}
                      onClick={() => !none && props.onCommit?.(l.hash)}
                    >
                      {first && (none
                        ? <span class="gad-git__blame-author">{props.notCommitted}</span>
                        : c && (
                          <>
                            <span class="gad-git__blame-date">{day(c.date)}</span>
                            <span class="gad-git__blame-author">{c.author}</span>
                            <code class="gad-git__blame-hash">{l.hash.slice(0, 7)}</code>
                          </>
                        ))}
                    </td>
                    <td class="gad-git__blame-num" style={{ minWidth: `${width.value + 1}ch` }}>{i + 1}</td>
                    <td class="gad-git__blame-code">{l.content || " "}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    };
  },
});
