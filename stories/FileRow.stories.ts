import { createFileRow } from "../src/ui/fileRow";
import { withCard } from "./utils";

function buildRow(configure: (row: ReturnType<typeof createFileRow>) => void): HTMLElement {
  const list = document.createElement("ul");
  list.id = "file-list";
  const file = new File([new Uint8Array(32)], "session1-clip.mp4", { type: "video/mp4" });
  const row = createFileRow(list, file, "story-file-row", "sourcedata/raw/session1-clip.mp4");
  configure(row);
  return withCard(list);
}

export default {
  title: "Components/FileRow",
};

export const Queued = {
  name: "Queued",
  render: () => buildRow(() => {}),
};

export const Uploading = {
  name: "Uploading (in progress)",
  render: () =>
    buildRow((row) => {
      row.setBadge("Uploading", "busy");
      row.setProgress(0.62);
      row.setStatus("62%");
    }),
};

export const ReplacedUpdated = {
  name: "Replaced (content updated)",
  render: () =>
    buildRow((row) => {
      row.setBadge("Replaced", "ok");
      row.setStatus("content updated", "ok");
      row.setProgress(1, true);
    }),
};

export const ReplacedMatched = {
  name: "Replaced (matched existing content)",
  render: () =>
    buildRow((row) => {
      row.setBadge("Replaced", "ok");
      row.setStatus("matched existing content", "ok");
      row.setProgress(1, true);
    }),
};

export const Done = {
  name: "Done",
  render: () =>
    buildRow((row) => {
      row.setBadge("Done", "ok");
      row.setProgress(1, true);
    }),
};

export const Errored = {
  name: "Error",
  render: () =>
    buildRow((row) => {
      row.setBadge("Error", "err");
      row.setStatus("Upload failed: network connection was lost.", "err");
    }),
};
