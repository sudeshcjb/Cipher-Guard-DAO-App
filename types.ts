
export interface Share {
  id: number;
  data: string; // Hex string of the share (x, y combined or just y if x is implicit, but we'll be explicit: "x-y")
}

export interface EncryptedFile {
  name: string;
  type: string;
  size: number;
  data: string; // Base64 of encrypted data
  iv: string; // Base64 of IV
  hash: string; // SHA-256 hash of the original file for integrity/blockchain
}

export interface AuditLog {
  id: string;
  timestamp: number;
  action: 'UPLOAD' | 'DISTRIBUTE_SHARES' | 'RECOVERY_ATTEMPT' | 'RECOVERY_SUCCESS' | 'RECOVERY_FAILED' | 'CONFIG_CHANGE';
  actor: string;
  details: string;
  fileHash?: string;
}

export interface AppConfig {
  totalShares: number; // n
  threshold: number; // k
}
