/**
 * js/utils/md5.js
 * Pure-JS RFC 1321 MD5 implementation for arbitrary binary Uint8Array/Blob/File payloads.
 */

const SHIFT = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
];

const K = new Uint32Array(64);
for (let i = 0; i < 64; i++) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
}

function rotl(x, c) {
    return ((x << c) | (x >>> (32 - c))) >>> 0;
}

function toHexLE(word) {
    let hex = '';
    for (let i = 0; i < 4; i++) {
        const byte = (word >>> (i * 8)) & 0xff;
        hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
}

/**
 * Computes the lowercase 32-character hex MD5 digest of a byte array.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function md5Bytes(bytes) {
    const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const origLen = input.length;

    // Pad to 56 mod 64 bytes, plus 8 bytes for 64-bit little-endian bit length
    const paddedLen = (((origLen + 8) >>> 6) + 1) << 6;
    const padded = new Uint8Array(paddedLen);
    padded.set(input);
    padded[origLen] = 0x80;

    const bitLenLow = (origLen * 8) >>> 0;
    const bitLenHigh = Math.floor((origLen * 8) / 0x100000000) >>> 0;
    const view = new DataView(padded.buffer);
    view.setUint32(paddedLen - 8, bitLenLow, true);
    view.setUint32(paddedLen - 4, bitLenHigh, true);

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;

    const M = new Uint32Array(16);

    for (let offset = 0; offset < paddedLen; offset += 64) {
        for (let j = 0; j < 16; j++) {
            M[j] = view.getUint32(offset + j * 4, true);
        }

        let A = a0;
        let B = b0;
        let C = c0;
        let D = d0;

        for (let i = 0; i < 64; i++) {
            let F;
            let g;
            if (i < 16) {
                F = ((B & C) | ((~B) & D)) >>> 0;
                g = i;
            } else if (i < 32) {
                F = ((D & B) | ((~D) & C)) >>> 0;
                g = (5 * i + 1) % 16;
            } else if (i < 48) {
                F = (B ^ C ^ D) >>> 0;
                g = (3 * i + 5) % 16;
            } else {
                F = (C ^ (B | (~D))) >>> 0;
                g = (7 * i) % 16;
            }

            const sum = (A + F + K[i] + M[g]) >>> 0;
            A = D;
            D = C;
            C = B;
            B = (B + rotl(sum, SHIFT[i])) >>> 0;
        }

        a0 = (a0 + A) >>> 0;
        b0 = (b0 + B) >>> 0;
        c0 = (c0 + C) >>> 0;
        d0 = (d0 + D) >>> 0;
    }

    return toHexLE(a0) + toHexLE(b0) + toHexLE(c0) + toHexLE(d0);
}

/**
 * Computes the MD5 hash for a browser File or Blob.
 * @param {Blob|File} fileOrBlob
 * @returns {Promise<string>}
 */
export async function computeFileMd5(fileOrBlob) {
    const buffer = await fileOrBlob.arrayBuffer();
    return md5Bytes(new Uint8Array(buffer));
}
