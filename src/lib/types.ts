export interface DandiInstance {
  api: string;
  web: string | null;
}

export interface UploaderConfig {
  api: string;
  web: string | null;
  apiKey: string;
  dandisetId: string;
}

export interface StoredSettings {
  apiKey?: string;
  dandisetId?: string;
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

export interface VideoProbeResult {
  ok: boolean;
  duration?: number;
  width?: number;
  height?: number;
  reason?: string;
}
