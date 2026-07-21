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
    progressSummary: required<HTMLDivElement>("progress-summary"),
    progressSummaryFill: required<HTMLDivElement>("progress-summary-fill"),
    progressSummaryText: required<HTMLSpanElement>("progress-summary-text"),
    dropzone: required<HTMLDivElement>("dropzone"),
    fileInput: required<HTMLInputElement>("file-input"),
    folderInput: required<HTMLInputElement>("folder-input"),
    folderPickerBtn: required<HTMLButtonElement>("folder-picker-btn"),
    fileList: required<HTMLUListElement>("file-list"),
    destRoot: required<HTMLDivElement>("dest-root"),
    expandDepthInput: required<HTMLInputElement>("expand-depth"),
    expandDepthValue: required<HTMLSpanElement>("expand-depth-value"),
    expandDepthTicks: required<HTMLDataListElement>("expand-depth-ticks"),
    uploadBar: required<HTMLDivElement>("upload-bar"),
    uploadAllBtn: required<HTMLButtonElement>("upload-all-btn"),
    cancelAllBtn: required<HTMLButtonElement>("cancel-all-btn"),
    versionIndicator: document.getElementById("version-indicator"),
  };
}

export type UploaderElements = ReturnType<typeof getElements>;
