function required<T extends Element>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Expected #${id} to exist in the document`);
  return el as unknown as T;
}

export function getElements() {
  return {
    dandisetId: required<HTMLSelectElement>("dandiset-id"),
    oauthSigninBtn: required<HTMLButtonElement>("oauth-signin-btn"),
    oauthSignedIn: required<HTMLDivElement>("oauth-signed-in"),
    oauthAvatar: required<HTMLSpanElement>("oauth-avatar"),
    oauthUsername: required<HTMLSpanElement>("oauth-username"),
    oauthSignoutBtn: required<HTMLButtonElement>("oauth-signout-btn"),
    dandisetSingle: required<HTMLParagraphElement>("dandiset-single"),
    dandisetSingleText: required<HTMLSpanElement>("dandiset-single-text"),
    dandisetSingleLink: required<HTMLAnchorElement>("dandiset-single-link"),
    progressSummary: required<HTMLDivElement>("progress-summary"),
    progressHashFill: required<HTMLDivElement>("progress-hash-fill"),
    progressHashText: required<HTMLSpanElement>("progress-hash-text"),
    progressUploadFill: required<HTMLDivElement>("progress-upload-fill"),
    progressUploadText: required<HTMLSpanElement>("progress-upload-text"),
    progressFooterLeft: required<HTMLSpanElement>("progress-footer-left"),
    progressFooterMid: required<HTMLSpanElement>("progress-footer-mid"),
    progressFooterRight: required<HTMLSpanElement>("progress-footer-right"),
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
    viewDatasetLink: required<HTMLAnchorElement>("view-dataset-link"),
    versionIndicator: document.getElementById("version-indicator"),
    whatsNewButton: required<HTMLButtonElement>("whats-new-button"),
    whatsNewModal: required<HTMLDialogElement>("whats-new-modal"),
    whatsNewClose: required<HTMLButtonElement>("whats-new-close"),
    whatsNewContent: required<HTMLDivElement>("whats-new-content"),
  };
}

export type UploaderElements = ReturnType<typeof getElements>;
