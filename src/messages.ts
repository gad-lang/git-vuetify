import { computed, type ComputedRef, type InjectionKey } from "vue";
import { useWords, type Locales } from "./i18n";

/** GitMessages are the texts of the Changes and Git panels (and of the diff
 * browser in them), translatable: the panels' `messages` prop gives them —
 * any left out is DEFAULT_GIT_MESSAGES' (English). GIT_MESSAGES_PT_BR has
 * them in Brazilian Portuguese. */
export interface GitMessages {
  /** the Changes panel's title (its tab, its toolbar button) */
  changes: string;
  /** the Git panel's title */
  git: string;
  refresh: string;
  /** the diff browser's tree */
  files: string;
  /** the Git panel's lists of branches */
  branches: string;
  remoteBranches: string;
  /** loads more commits of the log */
  more: string;
  /** shown with no commit chosen */
  chooseCommit: string;
  /** the button that downloads the commit's patch, and its title */
  patch: string;
  downloadCommitPatch: string;
  /** the titles of the downloads of a file of a commit */
  downloadFile: string;
  downloadPatch: string;
  /** the old side of a root commit's file */
  noParent: string;
  /** the Git panel's modes: the branch's log, a file's history, a compare */
  log: string;
  fileHistory: string;
  compare: string;
  /** the branch navigated (its choice), the repository's default marked */
  branch: string;
  defaultBranch: string;
  /** the file whose history is shown, and the button that takes the one open */
  file: string;
  useOpenFile: string;
  chooseFile: string;
  /** a compare's sides, swapped by a button; the working files as one */
  compareFrom: string;
  compareTo: string;
  swap: string;
  workingFiles: string;
  /** compares the commit (of a file's history) with a branch or the working file */
  compareWith: string;
  /** how two commits are compared */
  compareHint: string;
  chooseRefs: string;
  /** the log's filters: their button and dialog, their fields */
  filters: string;
  search: string;
  searchHint: string;
  authors: string;
  fileName: string;
  fileNameHint: string;
  content: string;
  contentHint: string;
  commitMessage: string;
  period: string;
  since: string;
  until: string;
  last7: string;
  last30: string;
  lastYear: string;
  apply: string;
  clear: string;
  /** shown when no commit matches the filters */
  noCommits: string;
  /** the button of a file's view that shows its blame, and a line not committed */
  blame: string;
  notCommitted: string;
  helpFilters: string;
  /** the "?" of each part of the Changes and Git panels: its title, and what
   * it does and how to use it (a paragraph a line, "- " lines a list) */
  help: string;
  helpChanges: string;
  helpBranches: string;
  helpLog: string;
  helpFileHistory: string;
  helpCommit: string;
  helpCompare: string;
  // the diff browser
  old: string;
  current: string;
  binary: string;
  noChanges: string;
  renamedTo: string;
  unchanged: string;
  loading: string;
  loadError: string;
  undo: string;
  redo: string;
  save: string;
  saving: string;
  saved: string;
  unsaved: string;
  revert: string;
  prev: string;
  next: string;
}

export const DEFAULT_GIT_MESSAGES: GitMessages = {
  changes: "Changes",
  git: "Git",
  refresh: "Refresh",
  files: "Files",
  branches: "Branches",
  remoteBranches: "Remote",
  more: "More",
  chooseCommit: "Choose a commit.",
  patch: "Patch",
  downloadCommitPatch: "Download the patch of the commit",
  downloadFile: "Download the file (this commit's)",
  downloadPatch: "Download the patch (from the commit before)",
  noParent: "(none)",
  log: "Log",
  fileHistory: "File history",
  compare: "Compare",
  branch: "Branch",
  defaultBranch: "default",
  file: "File",
  useOpenFile: "Use the file open in the editor",
  chooseFile: "Type or choose a file.",
  compareFrom: "From",
  compareTo: "To",
  swap: "Swap",
  workingFiles: "Working files",
  compareWith: "Compare with",
  compareHint: "Ctrl+click another commit to compare the two.",
  chooseRefs: "Choose what to compare: branches, commits or the working files.",
  filters: "Filters",
  search: "Search",
  searchHint: "In the message, or a hash",
  authors: "Authors",
  fileName: "File name",
  fileNameHint: "Part of the name, or a pattern (*.gadx)",
  content: "Content",
  contentHint: "Text of a line added or taken out",
  commitMessage: "Commit message",
  period: "Period",
  since: "From",
  until: "To",
  last7: "7 days",
  last30: "30 days",
  lastYear: "1 year",
  apply: "Apply",
  clear: "Clear",
  noCommits: "No commit matches.",
  blame: "Blame: who changed each line last",
  notCommitted: "Not committed yet",
  helpFilters:
    "Chooses the commits shown. The search applies as it is typed; the other filters, by Apply. Case aside.\n- Search: text in the message, or the start of a commit's hash.\n- Authors: one or more (any of them).\n- File name (log only): commits that changed a file whose name has the text, or matches a pattern (*.gadx).\n- Content: commits whose changes added or took out a line with the text.\n- Commit message: text in the whole message.\n- Period: from and to (dates).\nThe filters applied show as chips above the commits — the x of one takes it out —; filtered, the log has no graph.",
  help: "Help",
  helpChanges:
    "The files changed and not committed, each compared with its last commit.\n- Click a file in the tree to see its diff.\n- Edit the current side (right) and save it; revert a change with the arrow between the sides.\n- F7 / Shift+F7 go to the next / previous change.",
  helpBranches:
    "The branches of the repository: local ones, then the remotes'. The one marked \"default\" is the repository's default branch, navigated at first.\n- Click a branch to navigate it: the log, or the file's history, shows its commits.\n- The branch can be chosen in the bar too.",
  helpLog:
    "The commits of the branch navigated, newest first, as a graph of their parents.\n- Click a commit to see its message and the files it changed.\n- Ctrl+click (⌘+click) another commit to compare the two: every file changed between them.\n- \"More\" loads older commits.\n- The filter icon chooses the commits shown (search, authors, file name, content, message, period).",
  helpFileHistory:
    "The commits of the branch that changed the file — the one open in the editor, or typed in the bar —, renames followed (R: the commit renamed it).\n- Click a commit to see the file's change in it.\n- Ctrl+click (⌘+click) another commit to compare the file in the two.\n- \"Compare with\" compares the file, as the commit has it, with another branch's or the working one.\n- The filter icon chooses the commits shown.",
  helpCommit:
    "What was chosen: a commit's message and files, or a compare. Each file in the tree opens its diff — old at the left, new at the right —, scrolled together.\n- F7 / Shift+F7 go to the next / previous change.\n- A commit's file can be downloaded, as the commit has it, and its patch.\n- The blame button of a file shows who changed each line last (as IntelliJ's annotate): a click on a line's commit shows it.\n- The edge above the files resizes the message.",
  helpCompare:
    "What changed from a ref to another, file by file: \"From\" and \"To\" take a branch, a commit's hash or the working files (\"To\" only).\n- Type or choose the two refs; the swap button exchanges them.\n- Click a file in the tree to see its diff.",
  old: "Old",
  current: "Current",
  binary: "A binary file: it is not compared.",
  noChanges: "No changes.",
  renamedTo: "Renamed to",
  unchanged: "Its content did not change.",
  loading: "Loading…",
  loadError: "The diff could not be loaded.",
  undo: "Undo",
  redo: "Redo",
  save: "Save",
  saving: "Saving…",
  saved: "Saved",
  unsaved: "Not saved",
  revert: "Revert: the old part into the current",
  prev: "Previous change (Shift+F7)",
  next: "Next change (F7)",
};

/** GIT_MESSAGES_PT_BR are the texts in Brazilian Portuguese. */
export const GIT_MESSAGES_PT_BR: GitMessages = {
  changes: "Alterações",
  git: "Git",
  refresh: "Atualizar",
  files: "Arquivos",
  branches: "Branches",
  remoteBranches: "Remotas",
  more: "Mais",
  chooseCommit: "Escolha um commit.",
  patch: "Patch",
  downloadCommitPatch: "Baixar o patch do commit",
  downloadFile: "Baixar o arquivo (deste commit)",
  downloadPatch: "Baixar o patch (desde o commit anterior)",
  noParent: "(nenhum)",
  log: "Log",
  fileHistory: "Histórico do arquivo",
  compare: "Comparar",
  branch: "Branch",
  defaultBranch: "padrão",
  file: "Arquivo",
  useOpenFile: "Usar o arquivo aberto no editor",
  chooseFile: "Digite ou escolha um arquivo.",
  compareFrom: "De",
  compareTo: "Para",
  swap: "Inverter",
  workingFiles: "Arquivos de trabalho",
  compareWith: "Comparar com",
  compareHint: "Ctrl+clique em outro commit para comparar os dois.",
  chooseRefs: "Escolha o que comparar: branches, commits ou os arquivos de trabalho.",
  filters: "Filtros",
  search: "Pesquisar",
  searchHint: "Na mensagem, ou um hash",
  authors: "Autores",
  fileName: "Nome do arquivo",
  fileNameHint: "Parte do nome, ou um padrão (*.gadx)",
  content: "Conteúdo",
  contentHint: "Texto de uma linha adicionada ou removida",
  commitMessage: "Mensagem do commit",
  period: "Período",
  since: "De",
  until: "Até",
  last7: "7 dias",
  last30: "30 dias",
  lastYear: "1 ano",
  apply: "Aplicar",
  clear: "Limpar",
  noCommits: "Nenhum commit encontrado.",
  blame: "Blame: quem alterou cada linha por último",
  notCommitted: "Ainda não commitado",
  helpFilters: "Escolhe os commits mostrados. A pesquisa é aplicada ao digitar; os demais filtros, por Aplicar. Sem diferenciar maiúsculas.\n- Pesquisar: texto na mensagem, ou o início do hash de um commit.\n- Autores: um ou mais (qualquer deles).\n- Nome do arquivo (só no log): commits que alteraram um arquivo cujo nome tem o texto, ou casa com um padrão (*.gadx).\n- Conteúdo: commits cujas alterações adicionaram ou removeram uma linha com o texto.\n- Mensagem do commit: texto na mensagem inteira.\n- Período: de e até (datas).\nOs filtros aplicados aparecem como chips acima dos commits — o x de um o remove —; filtrado, o log fica sem o grafo.",
  help: "Ajuda",
  helpChanges: "Os arquivos alterados e ainda não commitados, cada um comparado com o seu último commit.\n- Clique num arquivo da árvore para ver o diff.\n- Edite o lado atual (à direita) e salve; reverta uma alteração com a seta entre os lados.\n- F7 / Shift+F7 vão para a próxima / anterior alteração.",
  helpBranches: "As branches do repositório: as locais, depois as dos remotos. A marcada \"padrão\" é a branch padrão do repositório, navegada ao abrir.\n- Clique numa branch para navegá-la: o log, ou o histórico do arquivo, mostra os commits dela.\n- A branch também pode ser escolhida na barra.",
  helpLog: "Os commits da branch navegada, do mais novo ao mais antigo, como um grafo dos seus pais.\n- Clique num commit para ver a mensagem e os arquivos que ele alterou.\n- Ctrl+clique (⌘+clique) em outro commit para comparar os dois: todos os arquivos alterados entre eles.\n- \"Mais\" carrega commits mais antigos.\n- O ícone de filtro escolhe os commits mostrados (pesquisa, autores, nome do arquivo, conteúdo, mensagem, período).",
  helpFileHistory: "Os commits da branch que alteraram o arquivo — o aberto no editor, ou digitado na barra —, seguindo renomeações (R: o commit o renomeou).\n- Clique num commit para ver a alteração do arquivo nele.\n- Ctrl+clique (⌘+clique) em outro commit para comparar o arquivo nos dois.\n- \"Comparar com\" compara o arquivo, como o commit o tem, com o de outra branch ou com o de trabalho.\n- O ícone de filtro escolhe os commits mostrados.",
  helpCommit: "O que foi escolhido: a mensagem e os arquivos de um commit, ou uma comparação. Cada arquivo da árvore abre o seu diff — o antigo à esquerda, o novo à direita —, com rolagem sincronizada.\n- F7 / Shift+F7 vão para a próxima / anterior alteração.\n- O arquivo de um commit pode ser baixado, como o commit o tem, e também o seu patch.\n- O botão de blame de um arquivo mostra quem alterou cada linha por último (como o annotate do IntelliJ): um clique no commit de uma linha o mostra.\n- A borda acima dos arquivos redimensiona a mensagem.",
  helpCompare: "O que mudou de uma ref para outra, arquivo por arquivo: \"De\" e \"Para\" aceitam uma branch, o hash de um commit ou os arquivos de trabalho (só \"Para\").\n- Digite ou escolha as duas refs; o botão de inverter troca os lados.\n- Clique num arquivo da árvore para ver o diff.",
  old: "Antigo",
  current: "Atual",
  binary: "Um arquivo binário: não é comparado.",
  noChanges: "Nenhuma alteração.",
  renamedTo: "Renomeado para",
  unchanged: "O conteúdo não mudou.",
  loading: "Carregando…",
  loadError: "Não foi possível carregar o diff.",
  undo: "Desfazer",
  redo: "Refazer",
  save: "Salvar",
  saving: "Salvando…",
  saved: "Salvo",
  unsaved: "Não salvo",
  revert: "Desfazer: a parte antiga no atual",
  prev: "Alteração anterior (Shift+F7)",
  next: "Próxima alteração (F7)",
};

export const GitMessagesKey: InjectionKey<ComputedRef<GitMessages>> = Symbol("gad-git-messages");

/** GIT_I18N_NAMESPACE is the namespace of the panels' words in the app's
 * vue-i18n: `{ gadGit: { refresh: "…", … } }` in a locale's messages. */
export const GIT_I18N_NAMESPACE = "gadGit";

/** GIT_I18N_MESSAGES are the defaults by locale, as vue-i18n's messages
 * (`createI18n({ messages: GIT_I18N_MESSAGES })`, or merged). */
export const GIT_I18N_MESSAGES: Locales<{ gadGit: GitMessages }> = {
  en: { gadGit: DEFAULT_GIT_MESSAGES },
  pt: { gadGit: GIT_MESSAGES_PT_BR },
};

/** useGitMessages are the panels' words — the app's vue-i18n's (gadGit), in
 * its locale, over the defaults —, the given ones over them. In setup. */
export const useGitMessages = (given?: () => Partial<GitMessages> | undefined): ComputedRef<GitMessages> =>
  useWords<GitMessages>(GIT_I18N_NAMESPACE, { en: DEFAULT_GIT_MESSAGES, pt: GIT_MESSAGES_PT_BR }, given);

/** gitMessagesOf are the messages given over the defaults (an empty one is
 * the default's too). */
export const gitMessagesOf = (given: () => Partial<GitMessages> | undefined) =>
  computed<GitMessages>(() => {
    const m = { ...DEFAULT_GIT_MESSAGES };
    for (const [k, v] of Object.entries(given() ?? {})) if (v) (m as Record<string, string>)[k] = v;
    return m;
  });

/** diffLabels are the diff browser's label props of the messages. */
export const diffLabels = (m: GitMessages) => ({
  filesTitle: m.files,
  oldLabel: m.old,
  newLabel: m.current,
  binaryText: m.binary,
  emptyText: m.noChanges,
  renamedText: m.renamedTo,
  unchangedText: m.unchanged,
  loadingText: m.loading,
  loadErrorText: m.loadError,
  undoText: m.undo,
  redoText: m.redo,
  saveText: m.save,
  savingText: m.saving,
  savedText: m.saved,
  unsavedText: m.unsaved,
  revertText: m.revert,
  prevText: m.prev,
  nextText: m.next,
});
