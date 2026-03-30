// src/utils/ImageConverter.js
// Ported from meter_lcd_converter.py
// Mode 1 = Profile picture  (RGB565, 88x128)
// Mode 2 = Mono 1-bit       (not used in app yet)
// Mode 3 = Company logo     (RGB565, 35x58)
// Mode 4 = Greeting screen  (1-bit mono, 128x128)

export const LCD_W = 128;
export const LCD_H = 128;

// ─── Profile (mode 1) ────────────────────────────────────────────
export const ASSET_W = 95;
export const ASSET_H = 110;
export const LCD_X = Math.floor((LCD_W - ASSET_W) / 2); // 20
export const LCD_Y = Math.floor((LCD_H - ASSET_H) / 2); // 0
export const RGB565_BYTES = ASSET_W * ASSET_H * 2;        // 20,900

// ─── Logo (mode 3) ───────────────────────────────────────────────
export const LOGO_W = 35;
export const LOGO_H = 58;
export const LOGO_RGB565_BYTES = LOGO_W * LOGO_H * 2;     // 4,060

// ─── Greeting (mode 4) ───────────────────────────────────────────
export const GREETING_W = 120;
export const GREETING_H = 120;
export const GREETING_BYTES = Math.ceil((GREETING_W * GREETING_H) / 8); // 1,800

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

// ─── Text wrap helper ─────────────────────────────────────────────
function wrapText(text, maxPixelW, charW, gap) {
    const cellW = charW + gap;
    const maxCharsPerLine = Math.floor((maxPixelW + gap) / cellW);
    const words = text.split(' ');
    const lines = [];
    let current = '';

    words.forEach(word => {
        while (word.length > maxCharsPerLine) {
            if (current) { lines.push(current); current = ''; }
            lines.push(word.slice(0, maxCharsPerLine));
            word = word.slice(maxCharsPerLine);
        }
        const trial = current ? current + ' ' + word : word;
        if (trial.length <= maxCharsPerLine) {
            current = trial;
        } else {
            if (current) lines.push(current);
            current = word;
        }
    });
    if (current) lines.push(current);
    return lines.length ? lines : [''];
}

// ─── Convert greeting text to 1-bit mono ─────────────────────────
export function convertGreetingText(text) {
    const FONT = get5x7Font();
    const CHAR_W = 5;
    const CHAR_H = 7;
    const CHAR_GAP = 2;
    const LINE_GAP = 6;
    const MARGIN = 6;

    const W = GREETING_W;
    const H = GREETING_H;
    const pixels = new Uint8Array(W * H); // 0=black, 1=white

    const maxLineW = W - MARGIN * 2;
    const lines = wrapText(text, maxLineW, CHAR_W, CHAR_GAP);

    const lineH = CHAR_H + LINE_GAP;
    const totalTextH = lines.length * lineH - LINE_GAP;
    const startY = Math.floor((H - totalTextH) / 2);

    // 1. 正常画字：左到右，上到下
    lines.forEach((line, li) => {
        const linePixelW = line.length * (CHAR_W + CHAR_GAP) - CHAR_GAP;
        const startX = Math.floor((W - linePixelW) / 2);
        const y0 = startY + li * lineH;

        [...line].forEach((ch, ci) => {
            const cols = FONT[ch] || FONT[' '];
            const x0 = startX + ci * (CHAR_W + CHAR_GAP);

            cols.forEach((colMask, col) => {
                for (let row = 0; row < CHAR_H; row++) {
                    const bit = (colMask >> row) & 1;
                    const px = (W - 1) - (x0 + col);  
                    const py = y0 + row;

                    if (px >= 0 && px < W && py >= 0 && py < H) {
                        pixels[py * W + px] = bit;
                    }
                }
            });
        });
    });
    const packed = [];
    for (let y = 0; y < H; y++) {          // ← Y改成正常顺序
        let cur = 0, bits = 0;
        for (let x = W - 1; x >= 0; x--) { // ← X反转（不动）
            cur = (cur << 1) | pixels[y * W + x];
            bits++;
            if (bits === 8) { packed.push(cur); cur = 0; bits = 0; }
        }
        if (bits > 0) { cur <<= (8 - bits); packed.push(cur); }
    }
    return new Uint8Array(packed);
}

// ─── Hex preview ──────────────────────────────────────────────────
export function hexPreview(bytes, bytesPerPacket = 240, totalPackets = null) {
    const packetCount = totalPackets ?? Math.ceil(bytes.length / bytesPerPacket);
    const lines = [];
    for (let idx = 0; idx < packetCount; idx++) {
        const start = idx * bytesPerPacket;
        const chunk = bytes.slice(start, start + bytesPerPacket);
        const lo = (idx & 0xff).toString(16).padStart(2, '0').toUpperCase();
        const hi = ((idx >> 8) & 0xff).toString(16).padStart(2, '0').toUpperCase();
        const preview = Array.from(chunk.slice(0, 16))
            .map(b => b.toString(16).padStart(2, '0').toUpperCase())
            .join(' ');
        lines.push(`📦 #${String(idx).padStart(3, '0')} [${lo} ${hi}] ${idx + 1}/${packetCount} | ${preview}...`);
    }
    return lines.join('\n');
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

    // Pack pixels to 1-bit mono (flip vertically + horizontally for device)
    const packed = [];
    for (let y = H - 1; y >= 0; y--) {
        let cur = 0, bits = 0;
        for (let x = W - 1; x >= 0; x--) {   // ← x 也反向
            cur = (cur << 1) | pixels[y * W + x];
            bits++;
            if (bits === 8) { packed.push(cur); cur = 0; bits = 0; }
        }
        if (bits > 0) { cur <<= (8 - bits); packed.push(cur); }
    }
    return new Uint8Array(packed);
}

// ─── 5×7 Pixel font (ASCII 0x20–0x7E) ────────────────────────────
function get5x7Font() {
    return {
        ' ': [0x00, 0x00, 0x00, 0x00, 0x00],
        '!': [0x00, 0x5F, 0x00, 0x00, 0x00],
        '"': [0x07, 0x00, 0x07, 0x00, 0x00],
        '#': [0x14, 0x7F, 0x14, 0x7F, 0x14],
        '$': [0x24, 0x2A, 0x7F, 0x2A, 0x12],
        '%': [0x23, 0x13, 0x08, 0x64, 0x62],
        '&': [0x36, 0x49, 0x55, 0x22, 0x50],
        '\'': [0x00, 0x05, 0x03, 0x00, 0x00],
        '(': [0x00, 0x1C, 0x22, 0x41, 0x00],
        ')': [0x00, 0x41, 0x22, 0x1C, 0x00],
        '*': [0x08, 0x2A, 0x1C, 0x2A, 0x08],
        '+': [0x08, 0x08, 0x3E, 0x08, 0x08],
        ',': [0x00, 0x50, 0x30, 0x00, 0x00],
        '-': [0x08, 0x08, 0x08, 0x08, 0x08],
        '.': [0x00, 0x60, 0x60, 0x00, 0x00],
        '/': [0x20, 0x10, 0x08, 0x04, 0x02],
        '0': [0x3E, 0x51, 0x49, 0x45, 0x3E],
        '1': [0x00, 0x42, 0x7F, 0x40, 0x00],
        '2': [0x42, 0x61, 0x51, 0x49, 0x46],
        '3': [0x21, 0x41, 0x45, 0x4B, 0x31],
        '4': [0x18, 0x14, 0x12, 0x7F, 0x10],
        '5': [0x27, 0x45, 0x45, 0x45, 0x39],
        '6': [0x3C, 0x4A, 0x49, 0x49, 0x30],
        '7': [0x01, 0x71, 0x09, 0x05, 0x03],
        '8': [0x36, 0x49, 0x49, 0x49, 0x36],
        '9': [0x06, 0x49, 0x49, 0x29, 0x1E],
        ':': [0x00, 0x36, 0x36, 0x00, 0x00],
        ';': [0x00, 0x56, 0x36, 0x00, 0x00],
        '<': [0x00, 0x08, 0x14, 0x22, 0x41],
        '=': [0x14, 0x14, 0x14, 0x14, 0x14],
        '>': [0x41, 0x22, 0x14, 0x08, 0x00],
        '?': [0x02, 0x01, 0x51, 0x09, 0x06],
        '@': [0x32, 0x49, 0x79, 0x41, 0x3E],
        'A': [0x7E, 0x11, 0x11, 0x11, 0x7E],
        'B': [0x7F, 0x49, 0x49, 0x49, 0x36],
        'C': [0x3E, 0x41, 0x41, 0x41, 0x22],
        'D': [0x7F, 0x41, 0x41, 0x22, 0x1C],
        'E': [0x7F, 0x49, 0x49, 0x49, 0x41],
        'F': [0x7F, 0x09, 0x09, 0x09, 0x01],
        'G': [0x3E, 0x41, 0x41, 0x49, 0x7A],
        'H': [0x7F, 0x08, 0x08, 0x08, 0x7F],
        'I': [0x00, 0x41, 0x7F, 0x41, 0x00],
        'J': [0x20, 0x40, 0x41, 0x3F, 0x01],
        'K': [0x7F, 0x08, 0x14, 0x22, 0x41],
        'L': [0x7F, 0x40, 0x40, 0x40, 0x40],
        'M': [0x7F, 0x02, 0x04, 0x02, 0x7F],
        'N': [0x7F, 0x04, 0x08, 0x10, 0x7F],
        'O': [0x3E, 0x41, 0x41, 0x41, 0x3E],
        'P': [0x7F, 0x09, 0x09, 0x09, 0x06],
        'Q': [0x3E, 0x41, 0x51, 0x21, 0x5E],
        'R': [0x7F, 0x09, 0x19, 0x29, 0x46],
        'S': [0x46, 0x49, 0x49, 0x49, 0x31],
        'T': [0x01, 0x01, 0x7F, 0x01, 0x01],
        'U': [0x3F, 0x40, 0x40, 0x40, 0x3F],
        'V': [0x1F, 0x20, 0x40, 0x20, 0x1F],
        'W': [0x3F, 0x40, 0x38, 0x40, 0x3F],
        'X': [0x63, 0x14, 0x08, 0x14, 0x63],
        'Y': [0x07, 0x08, 0x70, 0x08, 0x07],
        'Z': [0x61, 0x51, 0x49, 0x45, 0x43],
        '[': [0x00, 0x7F, 0x41, 0x41, 0x00],
        '\\': [0x02, 0x04, 0x08, 0x10, 0x20],
        ']': [0x00, 0x41, 0x41, 0x7F, 0x00],
        '^': [0x04, 0x02, 0x01, 0x02, 0x04],
        '_': [0x40, 0x40, 0x40, 0x40, 0x40],
        '`': [0x00, 0x01, 0x02, 0x04, 0x00],
        'a': [0x20, 0x54, 0x54, 0x54, 0x78],
        'b': [0x7F, 0x48, 0x44, 0x44, 0x38],
        'c': [0x38, 0x44, 0x44, 0x44, 0x20],
        'd': [0x38, 0x44, 0x44, 0x48, 0x7F],
        'e': [0x38, 0x54, 0x54, 0x54, 0x18],
        'f': [0x08, 0x7E, 0x09, 0x01, 0x02],
        'g': [0x0C, 0x52, 0x52, 0x52, 0x3E],
        'h': [0x7F, 0x08, 0x04, 0x04, 0x78],
        'i': [0x00, 0x44, 0x7D, 0x40, 0x00],
        'j': [0x20, 0x40, 0x44, 0x3D, 0x00],
        'k': [0x7F, 0x10, 0x28, 0x44, 0x00],
        'l': [0x00, 0x41, 0x7F, 0x40, 0x00],
        'm': [0x7C, 0x04, 0x18, 0x04, 0x78],
        'n': [0x7C, 0x08, 0x04, 0x04, 0x78],
        'o': [0x38, 0x44, 0x44, 0x44, 0x38],
        'p': [0x7C, 0x14, 0x14, 0x14, 0x08],
        'q': [0x08, 0x14, 0x14, 0x18, 0x7C],
        'r': [0x7C, 0x08, 0x04, 0x04, 0x08],
        's': [0x48, 0x54, 0x54, 0x54, 0x20],
        't': [0x04, 0x3F, 0x44, 0x40, 0x20],
        'u': [0x3C, 0x40, 0x40, 0x20, 0x7C],
        'v': [0x1C, 0x20, 0x40, 0x20, 0x1C],
        'w': [0x3C, 0x40, 0x30, 0x40, 0x3C],
        'x': [0x44, 0x28, 0x10, 0x28, 0x44],
        'y': [0x0C, 0x50, 0x50, 0x50, 0x3C],
        'z': [0x44, 0x64, 0x54, 0x4C, 0x44],
        '{': [0x00, 0x08, 0x36, 0x41, 0x00],
        '|': [0x00, 0x00, 0x7F, 0x00, 0x00],
        '}': [0x00, 0x41, 0x36, 0x08, 0x00],
        '~': [0x08, 0x04, 0x08, 0x10, 0x08],
    };
}