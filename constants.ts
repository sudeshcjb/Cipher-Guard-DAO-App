// A safe large prime for SSS (Mersenne Prime 2^521 - 1). 
// This is much larger than our 256-bit AES keys, ensuring no overflow in the finite field.
export const PRIME_MODULUS = (2n ** 521n) - 1n;

export const DEFAULT_CONFIG = {
  totalShares: 5,
  threshold: 3,
};

export const MAX_SHARES = 10;
export const MIN_SHARES = 2;
