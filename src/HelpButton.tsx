// HelpButton is a "?" that opens, on its click, what a panel does and how to
// use it: its text, a paragraph a line ("- " lines as a list).
import { defineComponent, type PropType } from "vue";
import { VBtn, VCard, VCardText, VMenu } from "./vuetify";

export default defineComponent({
  name: "HelpButton",
  props: {
    text: { type: String, required: true },
    title: { type: String, default: "" },
    id: { type: String as PropType<string>, default: "" },
  },
  setup(props) {
    const body = () => {
      const out: unknown[] = [];
      let list: string[] = [];
      const flush = () => {
        if (list.length) out.push(<ul class="gad-git__help-list">{list.map((l) => <li>{l}</li>)}</ul>);
        list = [];
      };
      for (const line of props.text.split("\n")) {
        if (line.startsWith("- ")) list.push(line.slice(2));
        else {
          flush();
          if (line.trim()) out.push(<p>{line}</p>);
        }
      }
      flush();
      return out;
    };
    return () => (
      <VMenu location="bottom end" maxWidth={420} closeOnContentClick={false}>
        {{
          activator: ({ props: a }: { props: Record<string, unknown> }) => (
            <VBtn {...a} size="x-small" variant="text" density="comfortable" icon="mdi-help-circle-outline"
              class="gad-git__help" title={props.title} data-help={props.id} />
          ),
          default: () => (
            <VCard class="gad-git__help-card" data-help-card={props.id}>
              <VCardText>
                {props.title && <div class="text-subtitle-2 mb-1">{props.title}</div>}
                {body()}
              </VCardText>
            </VCard>
          ),
        }}
      </VMenu>
    );
  },
});
