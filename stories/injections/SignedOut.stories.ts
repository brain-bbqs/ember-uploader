// Isolated stories for the "?test&signed_out" live test injection documented in docs/README.md --
// what the header sign-in control and the Dataset card look like to a signed-out visitor, in both
// color themes. Paste "?test&signed_out" into the running app's address bar to see the real thing.
import { withCard, withTheme } from "../utils";

function buildHeader(): HTMLElement {
  const header = document.createElement("div");
  header.className = "oauth-row";
  header.innerHTML = `<button type="button" class="primary">Sign in with EMBER</button>`;
  return withCard(header);
}

function buildDatasetCard(): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = `
    <div class="card-heading">
      <h2>Dataset</h2>
      <a class="view-dataset-link" target="_blank" rel="noopener" hidden>View dataset ↗</a>
    </div>
    <form>
      <div class="grid">
        <p class="dandiset-single">Please sign in to see your incoming datasets.</p>
      </div>
    </form>
  `;
  return withCard(card);
}

export default {
  title: "Injections/Signed out",
};

export const HeaderLight = {
  name: "Header (light)",
  render: () => withTheme("light", buildHeader),
};

export const HeaderDark = {
  name: "Header (dark)",
  render: () => withTheme("dark", buildHeader),
};

export const DatasetCardLight = {
  name: "Dataset card (light)",
  render: () => withTheme("light", buildDatasetCard),
};

export const DatasetCardDark = {
  name: "Dataset card (dark)",
  render: () => withTheme("dark", buildDatasetCard),
};
