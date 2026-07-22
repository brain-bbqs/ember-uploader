function required<T extends Element>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Expected #${id} to exist in the document`);
  return el as unknown as T;
}

export function getElements() {
  return {
    configForm: required<HTMLFormElement>("config-form"),
    dandisetId: required<HTMLSelectElement>("dandiset-id"),
    oauthSigninBtn: required<HTMLButtonElement>("oauth-signin-btn"),
    oauthSignedIn: required<HTMLDivElement>("oauth-signed-in"),
    oauthAvatar: required<HTMLSpanElement>("oauth-avatar"),
    oauthUsername: required<HTMLSpanElement>("oauth-username"),
    oauthSignoutBtn: required<HTMLButtonElement>("oauth-signout-btn"),
    dandisetMessage: required<HTMLParagraphElement>("dandiset-message"),
    dandisetSingle: required<HTMLParagraphElement>("dandiset-single"),
    dandisetSingleText: required<HTMLSpanElement>("dandiset-single-text"),
    progressSummary: required<HTMLDivElement>("progress-summary"),
    progressHashFill: required<HTMLDivElement>("progress-hash-fill"),
    progressHashPct: required<HTMLSpanElement>("progress-hash-pct"),
    progressHashDone: required<HTMLSpanElement>("progress-hash-done"),
    progressHashRate: required<HTMLSpanElement>("progress-hash-rate"),
    progressHashEta: required<HTMLSpanElement>("progress-hash-eta"),
    progressHashFiles: required<HTMLSpanElement>("progress-hash-files"),
    progressUploadFill: required<HTMLDivElement>("progress-upload-fill"),
    progressUploadPct: required<HTMLSpanElement>("progress-upload-pct"),
    progressUploadDone: required<HTMLSpanElement>("progress-upload-done"),
    progressUploadRate: required<HTMLSpanElement>("progress-upload-rate"),
    progressUploadEta: required<HTMLSpanElement>("progress-upload-eta"),
    progressUploadFiles: required<HTMLSpanElement>("progress-upload-files"),
    progressFooterLeft: required<HTMLSpanElement>("progress-footer-left"),
    progressFooterMid: required<HTMLSpanElement>("progress-footer-mid"),
    dropzone: required<HTMLDivElement>("dropzone"),
    browseFilesBtn: required<HTMLButtonElement>("browse-files-btn"),
    browseFolderBtn: required<HTMLButtonElement>("browse-folder-btn"),
    fileInput: required<HTMLInputElement>("file-input"),
    folderInput: required<HTMLInputElement>("folder-input"),
    fileList: required<HTMLUListElement>("file-list"),
    destRoot: required<HTMLDivElement>("dest-root"),
    expandDepthInput: required<HTMLInputElement>("expand-depth"),
    expandDepthValue: required<HTMLSpanElement>("expand-depth-value"),
    expandDepthBubble: required<HTMLSpanElement>("expand-depth-bubble"),
    expandDepthTicks: required<HTMLSpanElement>("expand-depth-ticks"),
    uploadBar: required<HTMLDivElement>("upload-bar"),
    uploadAllBtn: required<HTMLButtonElement>("upload-all-btn"),
    cancelAllBtn: required<HTMLButtonElement>("cancel-all-btn"),
    viewDatasetLink: required<HTMLAnchorElement>("view-dataset-link"),
    versionIndicator: required<HTMLAnchorElement>("version-indicator"),
    themeToggle: required<HTMLButtonElement>("theme-toggle"),
    whatsNewButton: required<HTMLButtonElement>("whats-new-button"),
    whatsNewModal: required<HTMLDialogElement>("whats-new-modal"),
    whatsNewClose: required<HTMLButtonElement>("whats-new-close"),
    whatsNewContent: required<HTMLDivElement>("whats-new-content"),
    whatsNewShowMore: required<HTMLButtonElement>("whats-new-show-more"),
  };
}

export type UploaderElements = ReturnType<typeof getElements>;
