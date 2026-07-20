function required<T extends Element>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Expected #${id} to exist in the document`);
  return el as unknown as T;
}

export function getElements() {
  return {
    apiKey: required<HTMLInputElement>("api-key"),
    dandisetId: required<HTMLInputElement>("dandiset-id"),
    connectStatusDot: required<HTMLSpanElement>("connect-status-dot"),
    connectStatusText: required<HTMLSpanElement>("connect-status-text"),
    apiKeyHelp: required<HTMLButtonElement>("api-key-help"),
    apiKeyHelpText: required<HTMLParagraphElement>("api-key-help-text"),
    dropzone: required<HTMLDivElement>("dropzone"),
    fileInput: required<HTMLInputElement>("file-input"),
    fileList: required<HTMLUListElement>("file-list"),
    probeVideo: required<HTMLVideoElement>("probe-video"),
    versionIndicator: document.getElementById("version-indicator"),
  };
}

export type UploaderElements = ReturnType<typeof getElements>;
