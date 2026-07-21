import { withCard } from "./utils";

function buildDatasetCard(mode: "signed-out" | "dropdown" | "single"): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  card.id = "config-card";
  card.innerHTML = `
    <h2>Dataset</h2>
    <form id="config-form">
      <div class="grid">
        <select${mode === "dropdown" ? "" : " hidden"}>
          <option value="000123">Incoming: Throughput test (000123)</option>
          <option value="000456">Incoming: Another lab dataset (000456)</option>
        </select>
        <p class="dandiset-single"${
          mode === "signed-out" ? "" : " hidden"
        }>Please sign in to see your incoming datasets.</p>
        <p class="dandiset-single"${mode === "single" ? "" : " hidden"}>
          <span>Uploading directly to EMBER Dandiset <code>000475</code>, "Incoming: Throughput test"</span>
          <a class="dandiset-single-link" target="_blank" rel="noopener">View in archive ↗</a>
        </p>
      </div>
    </form>
  `;
  return withCard(card);
}

export default {
  title: "Components/ConnectionCard",
};

export const SignedOut = {
  name: "Signed out",
  render: () => buildDatasetCard("signed-out"),
};

export const MultipleDatasets = {
  name: "Multiple datasets",
  render: () => buildDatasetCard("dropdown"),
};

export const SingleDataset = {
  name: "Single dataset",
  render: () => buildDatasetCard("single"),
};
