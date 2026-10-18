// The icon of a file of the diff's tree, by its extension (as gad's IDE's
// explorer shows them); the gad family's own are images (gadFileIcons).
const ICONS: Record<string, string> = {
  gad: "mdi-language-go",
  gadt: "mdi-file-code-outline",
  gadx: "mdi-xml",
  json: "mdi-code-json",
  yaml: "mdi-file-cog-outline",
  yml: "mdi-file-cog-outline",
  html: "mdi-language-html5",
  htm: "mdi-language-html5",
  css: "mdi-language-css3",
  scss: "mdi-sass",
  js: "mdi-language-javascript",
  mjs: "mdi-language-javascript",
  cjs: "mdi-language-javascript",
  jsx: "mdi-language-javascript",
  ts: "mdi-language-typescript",
  mts: "mdi-language-typescript",
  cts: "mdi-language-typescript",
  tsx: "mdi-language-typescript",
  md: "mdi-language-markdown-outline",
  mdx: "mdi-language-markdown-outline",
  markdown: "mdi-language-markdown-outline",
  go: "mdi-language-go",
  py: "mdi-language-python",
  vue: "mdi-vuejs",
};

/** fileIconFor is the mdi icon of path, by its extension. */
export function fileIconFor(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return (dot === -1 ? undefined : ICONS[name.slice(dot + 1).toLowerCase()]) ?? "mdi-file-outline";
}
