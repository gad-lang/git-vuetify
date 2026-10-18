// ResizeHandle — the edge a pane is resized by: dragged (the pointer held
// down), it tells how far it moved since the drag began; double-clicked, it
// asks for the size to be reset. `col` resizes a width (dragged sideways),
// `row` a height (dragged up and down). Shared by the IDE's panes (Git,
// Playground, Notebook, the merge view) and the admin's editors of rvq
// (vx-gad-code, vx-codemirror's help).
import { defineComponent, h, ref, type PropType } from "vue";

export default defineComponent({
  name: "ResizeHandle",
  props: {
    /** col: a width, dragged sideways; row: a height, dragged up and down. */
    direction: { type: String as PropType<"col" | "row">, default: "col" },
    /** Called as it is dragged: the pixels moved since the drag began. */
    onDrag: { type: Function as PropType<(delta: number) => void>, required: true },
    /** Called as the drag begins (to take the size it begins from). */
    onStart: { type: Function as PropType<() => void>, default: undefined },
    /** Called on a double click: the size back to its default. */
    onReset: { type: Function as PropType<() => void>, default: undefined },
  },
  setup(props) {
    const dragging = ref(false);
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const el = e.currentTarget as HTMLElement;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // a pointer the browser does not track: the moves still reach it
      }
      const start = props.direction === "col" ? e.clientX : e.clientY;
      dragging.value = true;
      props.onStart?.();
      const move = (ev: PointerEvent) => props.onDrag((props.direction === "col" ? ev.clientX : ev.clientY) - start);
      const up = () => {
        dragging.value = false;
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    };
    return () =>
      h("div", {
        class: ["gad-resize-handle", `gad-resize-handle--${props.direction}`, { "gad-resize-handle--dragging": dragging.value }],
        role: "separator",
        "aria-orientation": props.direction === "col" ? "vertical" : "horizontal",
        style: {
          flex: "0 0 5px",
          alignSelf: "stretch",
          cursor: props.direction === "col" ? "col-resize" : "row-resize",
          touchAction: "none",
          userSelect: "none",
          background: dragging.value ? "rgba(var(--v-theme-primary), 0.35)" : "transparent",
          ...(props.direction === "col" ? { width: "5px", margin: "0 -2px" } : { height: "5px", margin: "-2px 0" }),
          position: "relative",
          zIndex: 3,
        },
        onPointerdown: down,
        onDblclick: () => props.onReset?.(),
      });
  },
});
