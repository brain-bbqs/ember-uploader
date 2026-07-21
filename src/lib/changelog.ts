function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderInline(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html;
}

function renderVersionBody(body: string): string {
  let html = "";
  let inList = false;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#### ")) {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += `<h4>${renderInline(line.slice(5))}</h4>`;
    } else if (line.startsWith("- ")) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${renderInline(line.slice(2))}</li>`;
    } else {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += `<p>${renderInline(line)}</p>`;
    }
  }
  if (inList) html += "</ul>";
  return html;
}

/** Renders the latest `versionCount` version sections of a CHANGELOG.md-style document as HTML. */
export function renderChangelogHtml(markdown: string, versionCount = 3): string {
  const versions = markdown.split(/^## /m).slice(1, versionCount + 1);
  return versions
    .map((block) => {
      const newline = block.indexOf("\n");
      const version = (newline === -1 ? block : block.slice(0, newline)).trim();
      const body = newline === -1 ? "" : block.slice(newline + 1);
      return `<section class="changelog-version"><h3>${escapeHtml(version)}</h3>${renderVersionBody(body)}</section>`;
    })
    .join("");
}
