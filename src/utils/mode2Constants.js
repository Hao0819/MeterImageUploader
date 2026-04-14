// src/utils/mode2Constants.js
//
// Mode 2 专用常量、步骤定义、counter range 工具函数。
// 共用常量（CMD_MODE2、CHUNK_SIZE、COUNTER_BYTES 等）直接从 ble.js re-export。

export {
    CMD_MODE2,
    CHUNK_SIZE,
    COUNTER_BYTES,
    CMD_STOP,
} from './ble';

// ─── Mode 2 专用协议常量 ──────────────────────────────────────────────────────
export const LOGIC_PKT_SIZE = 256;

// Page counter 起始值
export const P1_COUNTER_START = 0;
export const P2_COUNTER_START = 256;
export const S1_COUNTER_START = 896;
export const S2_COUNTER_START = 912;
export const S3_COUNTER_START = 928;

// 每页的 logic packet 数量
export const IMAGE_LOGIC_PKTS = 128;  // 128 × 256 = 32768 bytes = 128×128×2 (RGB565)
export const SCRIPT_LOGIC_PKTS = 8;    // 8 × 256 = 2048 bytes = 128×128 / 8 (mono 1-bit)

export const MAX_RETRIES = 20;
export const RETRY_BACKOFF = 10;
export const STOP_WAIT_MS = 800;

// ─── Step 定义 ────────────────────────────────────────────────────────────────
export const STEPS = [
    { id: 'p1', label: 'P1', title: 'Image Page 1', desc: '128×128 RGB565', type: 'image', counter: P1_COUNTER_START, logicPkts: IMAGE_LOGIC_PKTS },
    { id: 'p2', label: 'P2', title: 'Image Page 2', desc: '128×128 RGB565', type: 'image', counter: P2_COUNTER_START, logicPkts: IMAGE_LOGIC_PKTS },
    { id: 's1', label: 'S1', title: 'Greeting Page 1', desc: '128×128 mono 1-bit', type: 'greeting', counter: S1_COUNTER_START, logicPkts: SCRIPT_LOGIC_PKTS },
    { id: 's2', label: 'S2', title: 'Greeting Page 2', desc: '128×128 mono 1-bit', type: 'greeting', counter: S2_COUNTER_START, logicPkts: SCRIPT_LOGIC_PKTS },
    { id: 's3', label: 'S3', title: 'Greeting Page 3', desc: '128×128 mono 1-bit', type: 'greeting', counter: S3_COUNTER_START, logicPkts: SCRIPT_LOGIC_PKTS },
];

// ─── Counter range（用于 log 着色）────────────────────────────────────────────
export const PAGE_COUNTER_RANGES = {
    p1: { start: P1_COUNTER_START, end: P1_COUNTER_START + IMAGE_LOGIC_PKTS * 2 - 1, color: '#2563eb', label: 'P1' },
    p2: { start: P2_COUNTER_START, end: P2_COUNTER_START + IMAGE_LOGIC_PKTS * 2 - 1, color: '#dc2626', label: 'P2' },
    s1: { start: S1_COUNTER_START, end: S1_COUNTER_START + SCRIPT_LOGIC_PKTS * 2 - 1, color: '#16a34a', label: 'S1' },
    s2: { start: S2_COUNTER_START, end: S2_COUNTER_START + SCRIPT_LOGIC_PKTS * 2 - 1, color: '#d97706', label: 'S2' },
    s3: { start: S3_COUNTER_START, end: S3_COUNTER_START + SCRIPT_LOGIC_PKTS * 2 - 1, color: '#7c3aed', label: 'S3' },
};

export function getPageForCounter(counter) {
    for (const [, range] of Object.entries(PAGE_COUNTER_RANGES)) {
        if (counter >= range.start && counter <= range.end) return range;
    }
    return null;
}