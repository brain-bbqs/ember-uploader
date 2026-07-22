import { withCard, withTheme } from "./utils";

type Mode = "signed-out" | "zero" | "dropdown" | "single";

const MESSAGE_TEXT: Record<"signed-out" | "zero", string> = {
  "signed-out": "Please sign in to see your incoming datasets.",
  zero: "You have not been added to any direct-upload datasets; please reach out to EMBER/BBQS admins to request this.",
};

function buildDatasetCard(mode: Mode): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  card.id = "config-card";
  const showMessage = mode === "signed-out" || mode === "zero";
  card.innerHTML = `
    <div class="card-heading">
      <h2>Dataset</h2>
      <a class="view-dataset-link" target="_blank" rel="noopener"${showMessage ? " hidden" : ""}>View dataset ↗</a>
    </div>
    <form id="config-form">
      <div class="grid">
        <select${mode === "dropdown" ? "" : " hidden"}>
          <option value="000123">Incoming: Throughput test (000123)</option>
          <option value="000456">Incoming: Another lab dataset (000456)</option>
        </select>
        <p class="dandiset-single"${showMessage ? "" : " hidden"}>${showMessage ? MESSAGE_TEXT[mode] : ""}</p>
        <p class="dandiset-single"${mode === "single" ? "" : " hidden"}>
          <span>Uploading directly to EMBER Dandiset <code>000475</code>, "Incoming: Throughput test"</span>
        </p>
      </div>
    </form>
  `;
  return withCard(card);
}

export default {
  title: "Components/DatasetCard",
};

export const SignedOutLight = {
  name: "Signed out (light)",
  render: () => withTheme("light", () => buildDatasetCard("signed-out")),
};

export const SignedOutDark = {
  name: "Signed out (dark)",
  render: () => withTheme("dark", () => buildDatasetCard("signed-out")),
};

export const ZeroDatasetsLight = {
  name: "Zero datasets (light)",
  render: () => withTheme("light", () => buildDatasetCard("zero")),
};

export const ZeroDatasetsDark = {
  name: "Zero datasets (dark)",
  render: () => withTheme("dark", () => buildDatasetCard("zero")),
};

export const MultipleDatasetsLight = {
  name: "Multiple datasets (light)",
  render: () => withTheme("light", () => buildDatasetCard("dropdown")),
};

export const MultipleDatasetsDark = {
  name: "Multiple datasets (dark)",
  render: () => withTheme("dark", () => buildDatasetCard("dropdown")),
};

export const SingleDatasetLight = {
  name: "Single dataset (light)",
  render: () => withTheme("light", () => buildDatasetCard("single")),
};

export const SingleDatasetDark = {
  name: "Single dataset (dark)",
  render: () => withTheme("dark", () => buildDatasetCard("single")),
};
