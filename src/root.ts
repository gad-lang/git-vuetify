// useGitRoot is the workspace's folder in the repository (GitApi.root; ""
// its root, or when the API does not say): asked once.
import { ref, type Ref } from "vue";
import type { GitApi } from "./api";

export function useGitRoot(git: GitApi): Ref<string> {
  const root = ref("");
  git.root?.().then(
    (r) => (root.value = r),
    () => {
      /* not said: the root */
    },
  );
  return root;
}
