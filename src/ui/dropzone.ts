import type { UploaderElements } from "./elements";
import type { DroppedFile } from "../lib/fileTree";

const IGNORED_NAMES = new Set([".git", ".datalad", ".git-annex"]);

interface FileSystemEntryLike {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
}

interface FileSystemFileEntryLike extends FileSystemEntryLike {
  isFile: true;
  file(success: (file: File) => void, error?: (err: unknown) => void): void;
}

interface FileSystemDirectoryReaderLike {
  readEntries(success: (entries: FileSystemEntryLike[]) => void, error?: (err: unknown) => void): void;
}

interface FileSystemDirectoryEntryLike extends FileSystemEntryLike {
  isDirectory: true;
  createReader(): FileSystemDirectoryReaderLike;
}

function readAllEntries(reader: FileSystemDirectoryReaderLike): Promise<FileSystemEntryLike[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntryLike[] = [];
    const readBatch = () => {
      reader.readEntries((entries) => {
        if (!entries.length) {
          resolve(all);
          return;
        }
        all.push(...entries);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

async function walkEntry(entry: FileSystemEntryLike, relativeDir: string, out: DroppedFile[]): Promise<void> {
  if (IGNORED_NAMES.has(entry.name)) return;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntryLike).file(resolve, reject));
    out.push({ file, relativePath: relativeDir });
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntryLike;
    const children = await readAllEntries(dirEntry.createReader());
    const nextDir = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    for (const child of children) {
      await walkEntry(child, nextDir, out);
    }
  }
}

export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<DroppedFile[]> {
  const items = Array.from(dataTransfer.items || []);
  const entries = items
    .map((item) => (item.kind === "file" ? (item.webkitGetAsEntry?.() as FileSystemEntryLike | null) : null))
    .filter((e): e is FileSystemEntryLike => !!e);
  if (entries.length) {
    const out: DroppedFile[] = [];
    for (const entry of entries) {
      await walkEntry(entry, "", out);
    }
    return out;
  }
  // Fallback for browsers without webkitGetAsEntry support: flat files only.
  return Array.from(dataTransfer.files || []).map((file) => ({ file, relativePath: "" }));
}

function filesFromFileList(fileList: FileList): DroppedFile[] {
  const out: DroppedFile[] = [];
  for (const file of Array.from(fileList)) {
    // webkitdirectory-selected files carry the folder structure in webkitRelativePath,
    // e.g. "myfolder/sub/clip.mp4"; strip the filename to get the containing folder path.
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || "";
    const segments = rel.split("/");
    const dirSegments = segments.slice(0, -1);
    if (dirSegments.some((s) => IGNORED_NAMES.has(s))) continue;
    out.push({ file, relativePath: dirSegments.join("/") });
  }
  return out;
}

export function initDropzone(els: UploaderElements, addFiles: (entries: DroppedFile[]) => void): void {
  const dz = els.dropzone;
  dz.addEventListener("click", () => els.fileInput.click());
  dz.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      els.fileInput.click();
    }
  });
  els.fileInput.addEventListener("change", () => {
    if (els.fileInput.files?.length) addFiles(filesFromFileList(els.fileInput.files));
    els.fileInput.value = "";
  });
  els.folderPickerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    els.folderInput.click();
  });
  els.folderInput.addEventListener("change", () => {
    if (els.folderInput.files?.length) addFiles(filesFromFileList(els.folderInput.files));
    els.folderInput.value = "";
  });
  ["dragenter", "dragover"].forEach((evt) =>
    dz.addEventListener(evt, (e) => {
      e.preventDefault();
      dz.classList.add("dragover");
    }),
  );
  ["dragleave", "drop"].forEach((evt) =>
    dz.addEventListener(evt, (e) => {
      e.preventDefault();
      dz.classList.remove("dragover");
    }),
  );
  dz.addEventListener("drop", (e) => {
    if (!e.dataTransfer) return;
    void collectDroppedFiles(e.dataTransfer).then((entries) => {
      if (entries.length) addFiles(entries);
    });
  });
  // Prevent the browser from navigating away when a file misses the dropzone.
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());
}
