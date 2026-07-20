import { humanSize } from "../lib/format";

export type BadgeKind = "busy" | "ok" | "warn" | "err";

export interface FileRow {
  el: HTMLLIElement;
  pathInput: HTMLInputElement;
  status: HTMLDivElement;
  setBadge(text: string, kind: BadgeKind): void;
  setStatus(text: string, kind?: BadgeKind | ""): void;
  setProgress(fraction: number, done?: boolean): void;
  clearActions(): void;
  addAction(label: string, handler: () => void, primary?: boolean): HTMLButtonElement;
}

export function createFileRow(fileList: HTMLUListElement, file: File, id: string): FileRow {
  const li = document.createElement("li");
  li.className = "file-item";
  li.id = id;
  li.innerHTML = `
    <div class="file-head">
      <span class="badge busy" data-role="badge">Queued</span>
      <span class="file-name"></span>
      <span class="file-size">${humanSize(file.size)}</span>
    </div>
    <div class="file-path">
      <span class="prefix-label">Archive path:</span>
      <input type="text" data-role="path" spellcheck="false" />
    </div>
    <div class="progress" data-role="progress-wrap" hidden><div data-role="progress"></div></div>
    <div class="file-status" data-role="status"></div>
    <div class="file-actions" data-role="actions"></div>
  `;
  li.querySelector(".file-name")!.textContent = file.name;
  fileList.appendChild(li);

  const badge = li.querySelector<HTMLSpanElement>('[data-role="badge"]')!;
  const pathInput = li.querySelector<HTMLInputElement>('[data-role="path"]')!;
  const progressWrap = li.querySelector<HTMLDivElement>('[data-role="progress-wrap"]')!;
  const progressBar = li.querySelector<HTMLDivElement>('[data-role="progress"]')!;
  const status = li.querySelector<HTMLDivElement>('[data-role="status"]')!;
  const actions = li.querySelector<HTMLDivElement>('[data-role="actions"]')!;

  const row: FileRow = {
    el: li,
    pathInput,
    status,
    setBadge(text, kind) {
      badge.textContent = text;
      badge.className = `badge ${kind}`;
    },
    setStatus(text, kind = "") {
      status.textContent = text;
      status.className = `file-status ${kind}`;
    },
    setProgress(fraction, done = false) {
      progressWrap.hidden = false;
      progressWrap.classList.toggle("done", done);
      progressBar.style.width = `${(fraction * 100).toFixed(1)}%`;
    },
    clearActions() {
      actions.replaceChildren();
    },
    addAction(label, handler, primary = false) {
      const btn = document.createElement("button");
      btn.textContent = label;
      if (primary) btn.classList.add("primary");
      btn.addEventListener("click", handler);
      actions.appendChild(btn);
      return btn;
    },
  };
  return row;
}

export function askUser<T>(
  row: FileRow,
  message: string,
  choices: { label: string; value: T; primary?: boolean }[],
): Promise<T> {
  // Renders buttons on the row and resolves with the value of the clicked one.
  return new Promise((resolve) => {
    row.setStatus(message, "warn");
    row.clearActions();
    for (const choice of choices) {
      row.addAction(
        choice.label,
        () => {
          row.clearActions();
          resolve(choice.value);
        },
        Boolean(choice.primary),
      );
    }
  });
}
