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
          <span>API key</span>
          <input type="password" placeholder="paste your DANDI API key" autocomplete="off" spellcheck="false" />
        </label>
        <label>
          <span
            >Dandiset ID
            <span class="status-indicator" role="status" aria-live="polite">
              <span class="status-dot${status ? ` ${status.kind}` : ""}"${status ? "" : " hidden"}></span>
              <span class="status-text${status?.kind === "err" ? "" : " sr-only"}">${status?.text ?? ""}</span>
            </span>
          </span>
          <input type="text" placeholder="e.g. 000123 or DANDI:000123" spellcheck="false" />
        </label>
      </div>
    </form>
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
