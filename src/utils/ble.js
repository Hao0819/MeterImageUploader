import { BleManager } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';

// ─── Characteristic UUIDs ─────────────────────────────────────────────────────
export const CHAR_UUID_CTRL = '519ebbd3-78e1-4e86-90c1-d40616058d88';
export const CHAR_UUID_DATA = '8f3c2a71-6d94-4b8e-a1f7-3c5d9e24b6a8';
export const CHAR_UUID = CHAR_UUID_CTRL;

// ─── Start / Stop commands ────────────────────────────────────────────────────
export const CMD_START = new Uint8Array([0xa7, 0x3c, 0xd1, 0x5e]);
export const CMD_STOP = new Uint8Array([0x9b, 0x42]);
export const COUNTER_BYTES = 2;
export const CHUNK_SIZE = 128;
export const PROFILE_PACKETS = 256;              // counter 0–255
export const GREETING_START_COUNTER = 896;       // counter 896–911
export const GREETING_PACKETS = 16;
export const PROFILE_BYTES_TOTAL = PROFILE_PACKETS * CHUNK_SIZE;    // 32KB
export const GREETING_BYTES_TOTAL = GREETING_PACKETS * CHUNK_SIZE;  // 2KB
// ─── Manager singleton ────────────────────────────────────────────────────────
let _manager = null;
export const getManager = () => {
    if (!_manager) _manager = new BleManager();
    return _manager;
};

// ─── Permissions ──────────────────────────────────────────────────────────────
export async function requestBlePermissions() {
    if (Platform.OS !== 'android') return true;

    const perms = [];
    if (Platform.Version >= 31) {
        perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
        perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
    } else {
        perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }

    const results = await PermissionsAndroid.requestMultiple(perms);
    return Object.values(results).every(v => v === PermissionsAndroid.RESULTS.GRANTED);
}

// ─── Scan ─────────────────────────────────────────────────────────────────────
export function startScan(onDevice, onError) {
    const mgr = getManager();
    const seen = new Set();

    mgr.startDeviceScan(null, { allowDuplicates: false }, (err, device) => {
        if (err) { onError?.(err.message); return; }
        if (!device) return;

        const name = device.name || device.localName;
        if (!name) return;

        if (!seen.has(device.id)) {
            seen.add(device.id);
            onDevice(device);
        }
    });

    return () => mgr.stopDeviceScan();
}

// ─── Connect ──────────────────────────────────────────────────────────────────
export async function connectDevice(deviceId) {
    const mgr = getManager();
    mgr.stopDeviceScan();

    let device = await mgr.connectToDevice(deviceId, { timeout: 10000 });
    device = await device.discoverAllServicesAndCharacteristics();

    try {
        if (Platform.OS === 'android' && device.requestMTU) {
            device = await device.requestMTU(247);
        }
    } catch (_) { /* ignore */ }

    return device;
}

// ─── Disconnect ───────────────────────────────────────────────────────────────
export async function disconnectDevice(device) {
    try { await device?.cancelConnection(); } catch (_) { /* ignore */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function toBase64(bytes) {
    return Buffer.from(bytes).toString('base64');
}

async function findServiceUuidByCharacteristic(device, characteristicUuid) {
    const services = await device.services();

    for (const service of services) {
        const chars = await device.characteristicsForService(service.uuid);
        const found = chars.find(
            c => c.uuid.toLowerCase() === characteristicUuid.toLowerCase()
        );
        if (found) return service.uuid;
    }

    throw new Error(`Characteristic not found: ${characteristicUuid}`);
}

async function writeBytes(device, serviceUuid, charUuid, bytes, withResponse = false) {
    const value = toBase64(bytes);

    if (withResponse) {
        return device.writeCharacteristicWithResponseForService(serviceUuid, charUuid, value);
    }
    return device.writeCharacteristicWithoutResponseForService(serviceUuid, charUuid, value);
}

// ─── Retry helper ─────────────────────────────────────────────────────────────
async function writeWithRetry(device, serviceUuid, charUuid, packet, maxRetries = 20) {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            await writeBytes(device, serviceUuid, charUuid, packet, false);
            return { success: true, attempts: attempt + 1 };
        } catch (err) {
            lastErr = err;
            if (attempt < maxRetries) await sleep(1);
        }
    }
    return { success: false, attempts: maxRetries + 1, error: lastErr };
}

// ─── Main send function ───────────────────────────────────────────────────────
/**
 * 合并发送 Profile + Greeting
 *
 * 每包 256 字节，拆成两次 BLE 写入发送：
 *   第一次：2字节counter + 前字节数据  = 130 字节
 *   第二次：             后128字节数据  = 128 字节
 *
 * 布局：
 *   包 000–175 → profileBytes  (RGB565)
 *   包 176–???  → greetingBytes (mono1)
 *
 * Protocol:
 *   1) Write CMD_START  → CHAR_UUID_CTRL  (519ebbd3-...)
 *   2) Write data pkts  → CHAR_UUID_DATA  (8f3c2a71-...)  ← 每包写两次
 *   3) Write CMD_STOP   → CHAR_UUID_CTRL  (519ebbd3-...)
 *
 * @param {object}     device        BLE设备对象
 * @param {Uint8Array} profileBytes  Profile图片字节 (RGB565格式)
 * @param {Uint8Array} greetingBytes Greeting字节 (1-bit mono格式)
 * @param {function}   onProgress    (sent, total, idx) 回调
 *                                     sent  = 已发送包数 (从1开始)
 *                                     total = TOTAL_PACKETS
 *                                     idx   = 当前包序号 (从0开始)
 */
export async function sendCombined(device, profileBytes, greetingBytes, onProgress) {

    const ctrlServiceUuid = await findServiceUuidByCharacteristic(device, CHAR_UUID_CTRL);
    const dataServiceUuid = await findServiceUuidByCharacteristic(device, CHAR_UUID_DATA);

    // 1) START
    await writeBytes(device, ctrlServiceUuid, CHAR_UUID_CTRL, CMD_START, false);
    await sleep(10);

    const totalWrites = PROFILE_PACKETS + GREETING_PACKETS;
    let sent = 0;
    const MAX_RETRIES = 20;

    const sendPacket = async (counter, dataSlice) => {
        const packet = new Uint8Array(COUNTER_BYTES + CHUNK_SIZE);
        packet[0] = counter & 0xff;
        packet[1] = (counter >> 8) & 0xff;
        packet.set(dataSlice, COUNTER_BYTES);

        const result = await writeWithRetry(device, dataServiceUuid, CHAR_UUID_DATA, packet, MAX_RETRIES);
        sent++;

        if (result.success) {
            if (result.attempts > 1) {
                onProgress?.(sent, totalWrites, counter, packet,
                    `⚠️ CTR:${counter.toString(16).toUpperCase().padStart(4, '0')} recovered after ${result.attempts} attempts`
                );
            } else {
                onProgress?.(sent, totalWrites, counter, packet);
            }
        } else {
            onProgress?.(sent, totalWrites, counter, packet,
                `❌ LOST CTR:${counter.toString(16).toUpperCase().padStart(4, '0')} after ${MAX_RETRIES} retries - ${result.error?.message}`
            );
        }
    };

    // ✅ 控制并发数量的函数
    const sendWithConcurrency = async (packets) => {
        const CONCURRENCY = 3; // 每次最多 3 包并发
        for (let i = 0; i < packets.length; i += CONCURRENCY) {
            const chunk = packets.slice(i, i + CONCURRENCY);
            await Promise.all(chunk.map(({ counter, data }) => sendPacket(counter, data)));
            await sleep(2); // 每批之间只等 2ms
        }
    };

    // 2) Profile: counter 0–255
    const profilePackets = Array.from({ length: PROFILE_PACKETS }, (_, j) => ({
        counter: j,
        data: profileBytes.slice(j * CHUNK_SIZE, (j + 1) * CHUNK_SIZE),
    }));
    await sendWithConcurrency(profilePackets);

    await sleep(10);

    // 3) Greeting: counter 896–911
    const greetingPackets = Array.from({ length: GREETING_PACKETS }, (_, j) => ({
        counter: GREETING_START_COUNTER + j,
        data: greetingBytes.slice(j * CHUNK_SIZE, (j + 1) * CHUNK_SIZE),
    }));
    await sendWithConcurrency(greetingPackets);

    await sleep(10);

    // 4) STOP
    await writeBytes(device, ctrlServiceUuid, CHAR_UUID_CTRL, CMD_STOP, false);
}