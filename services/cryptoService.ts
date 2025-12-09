import { PRIME_MODULUS } from '../constants';
import { Share } from '../types';

// --- AES-256-GCM Helpers ---

export const generateAESKey = async (): Promise<CryptoKey> => {
  return window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
};

export const exportKeyToHex = async (key: CryptoKey): Promise<string> => {
  const exported = await window.crypto.subtle.exportKey("raw", key);
  return bufferToHex(exported);
};

export const importKeyFromHex = async (hex: string): Promise<CryptoKey> => {
  const buffer = hexToBuffer(hex);
  return window.crypto.subtle.importKey(
    "raw",
    buffer,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
};

export const encryptFile = async (file: File, key: CryptoKey): Promise<{ encryptedData: ArrayBuffer; iv: Uint8Array; hash: string }> => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const fileBuffer = await file.arrayBuffer();
  
  // Calculate hash of original file for audit
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', fileBuffer);
  const hash = bufferToHex(hashBuffer);

  const encryptedData = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    fileBuffer
  );

  return { encryptedData, iv, hash };
};

export const decryptFile = async (encryptedData: ArrayBuffer, iv: Uint8Array, key: CryptoKey): Promise<ArrayBuffer> => {
  return window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    encryptedData
  );
};

// --- Shamir's Secret Sharing Implementation (Finite Field Arithmetic) ---

// Generate a random BigInt < PRIME
const randomBigInt = (): bigint => {
  // We need a random number up to ~521 bits. 
  // Crypto.getRandomValues gives bytes. 66 bytes = 528 bits.
  const array = new Uint8Array(66);
  window.crypto.getRandomValues(array);
  let hex = "0x" + bufferToHex(array.buffer);
  let val = BigInt(hex);
  return val % PRIME_MODULUS;
};

// Polynomial evaluation: f(x) = sum(coeffs[i] * x^i)
const evalPoly = (coeffs: bigint[], x: bigint): bigint => {
  let result = 0n;
  let powerOfX = 1n;
  
  for (const coeff of coeffs) {
    result = (result + (coeff * powerOfX)) % PRIME_MODULUS;
    powerOfX = (powerOfX * x) % PRIME_MODULUS;
  }
  return result;
};

// Split secret into n shares with threshold k
export const splitSecret = (secretHex: string, n: number, k: number): Share[] => {
  const secret = BigInt("0x" + secretHex);
  
  // Coefficients: [secret, a1, a2, ..., ak-1]
  const coeffs: bigint[] = [secret];
  for (let i = 1; i < k; i++) {
    coeffs.push(randomBigInt());
  }

  const shares: Share[] = [];
  for (let i = 1; i <= n; i++) {
    const x = BigInt(i);
    const y = evalPoly(coeffs, x);
    shares.push({
      id: i,
      data: `${x.toString(16)}-${y.toString(16)}` // store as hex strings "x-y"
    });
  }
  return shares;
};

// Lagrange Interpolation to reconstruct secret
export const reconstructSecret = (shares: Share[]): string => {
  // We need at least k shares, but the math works with any subset of size >= k.
  // We assume the caller checks if shares.length >= k.
  
  const points = shares.map(s => {
    const [xHex, yHex] = s.data.split('-');
    return { x: BigInt("0x" + xHex), y: BigInt("0x" + yHex) };
  });

  let secret = 0n;

  for (let j = 0; j < points.length; j++) {
    const { x: xj, y: yj } = points[j];
    
    // Compute Lagrange basis polynomial L_j(0)
    // L_j(0) = product(xm / (xm - xj)) for m != j
    let numerator = 1n;
    let denominator = 1n;

    for (let m = 0; m < points.length; m++) {
      if (m === j) continue;
      const xm = points[m].x;
      
      numerator = (numerator * xm) % PRIME_MODULUS;
      // (xm - xj) might be negative, handle mod
      let diff = (xm - xj) % PRIME_MODULUS;
      if (diff < 0n) diff += PRIME_MODULUS;
      denominator = (denominator * diff) % PRIME_MODULUS;
    }

    // Modular inverse of denominator
    const invDenominator = modInverse(denominator, PRIME_MODULUS);
    
    const term = (yj * numerator * invDenominator) % PRIME_MODULUS;
    secret = (secret + term) % PRIME_MODULUS;
  }

  // Ensure positive result
  if (secret < 0n) secret += PRIME_MODULUS;

  // Pad to 64 chars (256 bits) if necessary, though exported keys are usually fixed length
  let hex = secret.toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex;
  return hex;
};

// Extended Euclidean Algorithm for modular inverse
const modInverse = (a: bigint, m: bigint): bigint => {
  let m0 = m;
  let y = 0n;
  let x = 1n;

  if (m === 1n) return 0n;

  while (a > 1n) {
    const q = a / m;
    let t = m;
    m = a % m;
    a = t;
    t = y;
    y = x - q * y;
    x = t;
  }

  if (x < 0n) x += m0;
  return x;
};


// --- Utilities ---

export const bufferToHex = (buffer: ArrayBuffer): string => {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
};

export const hexToBuffer = (hex: string): ArrayBuffer => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
};

export const bufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

export const base64ToBuffer = (base64: string): ArrayBuffer => {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
};
