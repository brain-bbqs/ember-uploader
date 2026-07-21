import { withCard } from "./utils";

function buildDropzone(dragover: boolean): HTMLElement {
  const dz = document.createElement("div");
  dz.id = "dropzone";
  dz.tabIndex = 0;
  dz.setAttribute("role", "button");
  dz.setAttribute("aria-label", "Drop your research contents here, or click to browse");
  if (dragover) dz.classList.add("dragover");
  dz.innerHTML = `
    <div class="dz-inner">
      <div class="dz-icon">⬆️</div>
      <p>Drop your research contents here, or click to browse</p>
      <p class="dz-alt">or <button type="button" class="linklike">select a folder</button></p>
    </div>
  `;
  return withCard(dz);
}

export default {
  title: "Components/Dropzone",
};

export const Idle = {
  name: "Idle",
  render: () => buildDropzone(false),
};

export const DragOver = {
  name: "Drag over",
  render: () => buildDropzone(true),
};
