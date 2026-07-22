/**
 * Wraps a story element in a centered container so components render at a
 * realistic width against the app background, matching the real page shell.
 */
export function withCard(element: HTMLElement): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.style.maxWidth = "640px";
  wrapper.style.margin = "1.5rem auto";
  wrapper.appendChild(element);
  return wrapper;
}

/**
 * Forces the app's data-theme attribute to `theme` before building a story, so it renders
 * deterministically regardless of the previewing browser's OS color-scheme preference or
 * whatever the previously-viewed story left `document.documentElement` set to.
 */
export function withTheme<T extends HTMLElement>(theme: "light" | "dark", build: () => T): T {
  document.documentElement.dataset.theme = theme;
  return build();
}
