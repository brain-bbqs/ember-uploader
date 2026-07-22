export interface DandiInstance {
  api: string;
  web: string;
  oauth: string;
}

export interface UploaderConfig {
  api: string;
  web: string;
  accessToken: string;
  dandisetId: string;
}

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  /** ms since epoch */
  expiresAt: number;
}

export interface StoredSettings {
  dandisetId?: string;
  oauth?: OAuthTokenSet;
}

export interface FilePart {
  number: number;
  offset: number;
  size: number;
}

export interface ServerPart {
  part_number: number;
  size: number;
  upload_url: string;
}

export interface UploadInitResponse {
  upload_id: string;
  parts: ServerPart[];
}

export interface CompletedPart {
  part_number: number;
  size: number;
  etag: string;
}

export interface Asset {
  asset_id: string;
  path: string;
}
