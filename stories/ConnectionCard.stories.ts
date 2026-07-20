import { withCard } from "./utils";

function buildConnectionCard(status?: { text: string; kind: "ok" | "err" | "busy" }): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  card.id = "config-card";
  card.innerHTML = `
    <h2>1 · Connection</h2>
    <form id="config-form">
      <div class="grid">
        <label>
          <span>DANDI instance</span>
          <select id="instance">
            <option value="dandi">DANDI (dandiarchive.org)</option>
            <option value="dandi-sandbox">DANDI Sandbox (sandbox.dandiarchive.org)</option>
            <option value="ember-dandi">EMBER-DANDI (dandi.emberarchive.org)</option>
            <option value="ember-dandi-sandbox">EMBER-DANDI Sandbox (dandi.sandbox.emberarchive.org)</option>
            <option value="custom">Custom…</option>
          </select>
        </label>
        <label>
          <span>API key</span>
          <input type="password" placeholder="paste your DANDI API key" autocomplete="off" spellcheck="false" />
        </label>
        <label>
          <span>Dandiset ID</span>
          <input type="text" placeholder="e.g. 000123 or DANDI:000123" spellcheck="false" />
        </label>
        <label>
          <span>Destination folder <em>(optional)</em></span>
          <input type="text" placeholder="e.g. videos/session1" spellcheck="false" />
        </label>
      </div>
    </form>
    <div class="status-bar${status ? ` ${status.kind}` : ""}"${status ? "" : " hidden"}>
      <span class="sr-only">${status?.text ?? ""}</span>
    </div>
  `;
  return withCard(card);
}

export default {
  title: "Components/ConnectionCard",
};

export const Default = {
  name: "Default",
  render: () => buildConnectionCard(),
};

export const Connected = {
  name: "Connected",
  render: () => buildConnectionCard({ text: "Connected to DANDI as test-user.", kind: "ok" }),
};

export const ConnectionError = {
  name: "Connection error",
  render: () => buildConnectionCard({ text: "Could not connect: invalid API key.", kind: "err" }),
};
