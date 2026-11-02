// TipBtn: an icon button with its tooltip (Vuetify's), its tip its name for
// the screen readers too.
import { defineComponent, type PropType } from "vue";
import { VBtn, VTooltip } from "./vuetify";

export default defineComponent({
  name: "TipBtn",
  inheritAttrs: false,
  props: {
    icon: { type: String, required: true },
    tip: { type: String, required: true },
    size: { type: String, default: "x-small" },
    variant: { type: String as PropType<"text" | "tonal" | "flat" | "outlined">, default: "text" },
    color: { type: String, default: undefined },
    disabled: { type: Boolean, default: false },
    href: { type: String, default: undefined },
    download: { type: [String, Boolean], default: undefined },
  },
  emits: { click: (_e: MouseEvent) => true },
  setup(props, { attrs, emit }) {
    return () => (
      <VTooltip text={props.tip} location="bottom" openDelay={300}>
        {{
          activator: ({ props: a }: { props: Record<string, unknown> }) => (
            <VBtn {...a} {...attrs} size={props.size} variant={props.variant} color={props.color} density="comfortable"
              icon={props.icon} disabled={props.disabled} href={props.href} download={props.download} aria-label={props.tip}
              onClick={(e: MouseEvent) => emit("click", e)} />
          ),
        }}
      </VTooltip>
    );
  },
});
