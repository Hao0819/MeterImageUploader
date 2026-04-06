// src/utils/ImageConverter.js
// Ported from meter_lcd_converter.py
// Mode 1 = Profile picture  (RGB565, 128x128)
// Mode 2 = Mono 1-bit       (not used in app yet)
// Mode 3 = Greeting screen  (1-bit mono, 128x128)

export const LCD_W = 128;
export const LCD_H = 128;

// ─── Profile (mode 1) ────────────────────────────────────────────
export const ASSET_W = 128;
export const ASSET_H = 128;
export const LCD_X = 0;
export const LCD_Y = 0;
export const RGB565_BYTES = ASSET_W * ASSET_H * 2;


// ─── Greeting (mode 3) ───────────────────────────────────────────
export const GREETING_W = 128;
export const GREETING_H = 128;
export const GREETING_BYTES = Math.ceil((GREETING_W * GREETING_H) / 8);

// ─── Image type constants ─────────────────────────────────────────
export const IMAGE_TYPE = {
    PROFILE: 'profile',
    LOGO: 'logo',
    GREETING: 'greeting',
};

// ─── Get dimensions by image type ────────────────────────────────
export function getDimensions(imageType) {
    switch (imageType) {
        case IMAGE_TYPE.LOGO:
            return { w: LOGO_W, h: LOGO_H };
        case IMAGE_TYPE.GREETING:
            return { w: GREETING_W, h: GREETING_H };
        default:
            return { w: ASSET_W, h: ASSET_H };
    }
}

// ─── RGB565 helpers ───────────────────────────────────────────────
function rgb565(r, g, b) {
    return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
}

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

// ─── 1-bit mono helpers ───────────────────────────────────────────
export function rgbaToMono1(rgbaPixels, width, height) {
    const packed = [];
    for (let y = 0; y < height; y++) {
        let currentByte = 0;
        let bitCount = 0;
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = rgbaPixels[idx];
            const g = rgbaPixels[idx + 1];
            const b = rgbaPixels[idx + 2];
            const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
            const bit = brightness > 127 ? 1 : 0;
            currentByte = (currentByte << 1) | bit;
            bitCount++;
            if (bitCount === 8) {
                packed.push(currentByte);
                currentByte = 0;
                bitCount = 0;
            }
        }
        if (bitCount > 0) {
            currentByte <<= (8 - bitCount);
            packed.push(currentByte);
        }
    }
    return new Uint8Array(packed);
}

// ─── Main converters ──────────────────────────────────────────────
export async function convertImageBuffer(fileBuffer, imageType = IMAGE_TYPE.PROFILE) {
    const jpeg = require('jpeg-js');
    const { w, h } = getDimensions(imageType);
    const decoded = jpeg.decode(fileBuffer, { useTArray: true, formatAsRGBA: true });
    if (decoded.width !== w || decoded.height !== h) {
        throw new Error(
            `Image must be ${w}×${h} after cropping. Got ${decoded.width}×${decoded.height}.`
        );
    }
    return rgbaToRgb565(decoded.data);
}


// ─── Alias exports for CropSend.jsx ──────────────────────────────
export const PROFILE_W = ASSET_W;
export const PROFILE_H = ASSET_H;
export const PROFILE_RGB565_BYTES = RGB565_BYTES;
export const GREETING_MONO_BYTES = GREETING_BYTES;

export async function convertProfileBuffer(fileBuffer) {
    return convertImageBuffer(fileBuffer, IMAGE_TYPE.PROFILE);
}

// ─── Checkerboard test pattern ────────────────────────────────────
export function generateCheckerboardGreeting(cellSize = 8) {
    const W = GREETING_W;
    const H = GREETING_H;
    const pixels = new Uint8Array(W * H);

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const col = Math.floor(x / cellSize);
            const row = Math.floor(y / cellSize);
            pixels[y * W + x] = (col + row) % 2 === 0 ? 1 : 0;
        }
    }

    const packed = [];
    for (let y = H - 1; y >= 0; y--) {
        let cur = 0, bits = 0;
        for (let x = W - 1; x >= 0; x--) {
            cur = (cur << 1) | pixels[y * W + x];
            bits++;
            if (bits === 8) { packed.push(cur); cur = 0; bits = 0; }
        }
        if (bits > 0) { cur <<= (8 - bits); packed.push(cur); }
    }
    return new Uint8Array(packed);
}