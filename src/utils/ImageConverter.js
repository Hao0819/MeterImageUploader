// src/utils/imageConverter.js
// Ported from meter_lcd_converter.py
// Mode 1 = RGB565 color (profile picture)
// Mode 2 = 1-bit mono (not implemented in app yet)

export const ASSET_W = 70;
export const ASSET_H = 118;
export const LCD_W = 128;
export const LCD_H = 128;

// LCD center position for the asset
export const LCD_X = Math.floor((LCD_W - ASSET_W) / 2); // 29
export const LCD_Y = Math.floor((LCD_H - ASSET_H) / 2); // 5

// Expected byte counts
export const RGB565_BYTES = ASSET_W * ASSET_H * 2; // 16,520

// Convert one RGB888 pixel to RGB565 (16-bit big-endian)
function rgb565(r, g, b) {
    return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
}

/**
 * Convert a flat RGBA Uint8Array (from jpeg-js decode) to RGB565 Uint8Array.
 * Input:  [r,g,b,a, r,g,b,a, ...] — ASSET_W × ASSET_H × 4 bytes
 * Output: [hi,lo, hi,lo, ...] — ASSET_W × ASSET_H × 2 bytes
 */
export function rgbaToRgb565(rgbaPixels) {
    const pixelCount = rgbaPixels.length / 4;
    const out = new Uint8Array(pixelCount * 2);
    for (let i = 0; i < pixelCount; i++) {
        const r = rgbaPixels[i * 4];
        const g = rgbaPixels[i * 4 + 1];
        const b = rgbaPixels[i * 4 + 2];
        const v = rgb565(r, g, b);
        out[i * 2] = (v >> 8) & 0xff;
        out[i * 2 + 1] = v & 0xff;
    }
    return out;
}

/**
 * Convert raw JPEG/PNG file buffer (from RNFS.readFile base64 → Buffer)
 * to RGB565 byte array using jpeg-js for pixel decoding.
 *
 * Usage:
 *   import RNFS from 'react-native-fs';
 *   const b64  = await RNFS.readFile(imageUri, 'base64');
 *   const buf  = Buffer.from(b64, 'base64');
 *   const bytes = await convertImageBuffer(buf);
 */
export async function convertImageBuffer(fileBuffer) {
    // jpeg-js decodes JPEG → {width, height, data: Uint8Array RGBA}
    const jpeg = require('jpeg-js');
    const decoded = jpeg.decode(fileBuffer, { useTArray: true, formatAsRGBA: true });

    if (decoded.width !== ASSET_W || decoded.height !== ASSET_H) {
        throw new Error(
            `Image must be ${ASSET_W}×${ASSET_H} after cropping. Got ${decoded.width}×${decoded.height}.`
        );
    }

    return rgbaToRgb565(decoded.data);
}

/** Hex preview string for first N bytes */
export function hexPreview(bytes, n = 16) {
    return Array.from(bytes.slice(0, n))
        .map(b => '0x' + b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
}