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

// ─── Protocol constants ───────────────────────────────────────────────────────
// 合并传输布局：
//   包 000–092 → Profile  (RGB565,  93×240 = 22,320 字节区段)
//   包 093–102 → Greeting (mono1,   10×240 =  2,256 字节区段)
//   合计 = 24,576 字节 = 24 KB
export const COUNTER_BYTES = 2;
export const DATA_BYTES_PER_PACKET = 240;
export const TOTAL_TRANSFER_BYTES = 24 * 1024;                                        // 24,576
export const TOTAL_PACKETS = Math.ceil(TOTAL_TRANSFER_BYTES / DATA_BYTES_PER_PACKET); // 103
export const GREETING_START_PACKET = 93; // Greeting从第93包开始

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

// ─── Build packet: 2-byte little-endian counter + 240 bytes payload ──────────
function buildPacket(packetIndex, chunk) {
    const packet = new Uint8Array(COUNTER_BYTES + DATA_BYTES_PER_PACKET);
    packet[0] = packetIndex & 0xff;         // low byte first
    packet[1] = (packetIndex >> 8) & 0xff;  // high byte second
    packet.set(chunk, 2);
    return packet;
}

// ─── Main send function ───────────────────────────────────────────────────────
/**
 * 合并发送 Profile + Greeting，共103包一次传输完成
 *
 * 布局：
 *   包 000–092 → profileBytes  (RGB565, 93×240 = 22,320 字节区段)
 *   包 093–102 → greetingBytes (mono1,  10×240 =  2,256 字节区段)
 *   合计 = 24,576 字节 = 24 KB ✅
 *
 * Protocol:
 *   1) Write CMD_START  → CHAR_UUID_CTRL  (519ebbd3-...)
 *   2) Write data pkts  → CHAR_UUID_DATA  (8f3c2a71-...)
 *   3) Write CMD_STOP   → CHAR_UUID_CTRL  (519ebbd3-...)
 *
 * @param {object}     device        BLE设备对象
 * @param {Uint8Array} profileBytes  Profile图片字节 (RGB565格式)
 * @param {Uint8Array} greetingBytes Greeting字节 (1-bit mono格式)
 * @param {function}   onProgress    (sent, total, idx) 回调
 *                                     sent  = 已发送包数 (从1开始)
 *                                     total = TOTAL_PACKETS (103)
 *                                     idx   = 当前包序号 (从0开始)
 */
export async function sendCombined(device, profileBytes, greetingBytes, onProgress) {

    // 建立 24,576 字节的合并缓冲区（全部初始化为 0）
    const combined = new Uint8Array(TOTAL_TRANSFER_BYTES).fill(0xFF);

    // 前段：Profile 放到位置 0 开始（最多放 22,320 字节）
    combined.set(
        profileBytes.slice(0, GREETING_START_PACKET * DATA_BYTES_PER_PACKET),
        0
    );

    // 后段：Greeting 放到位置 22,320 开始（最多放 2,256 字节）
    combined.set(
        greetingBytes.slice(0, (TOTAL_PACKETS - GREETING_START_PACKET) * DATA_BYTES_PER_PACKET),
        GREETING_START_PACKET * DATA_BYTES_PER_PACKET
    );

    // 找到 BLE 服务 UUID
    const ctrlServiceUuid = await findServiceUuidByCharacteristic(device, CHAR_UUID_CTRL);
    const dataServiceUuid = await findServiceUuidByCharacteristic(device, CHAR_UUID_DATA);

    // 1) 发送 START 命令
    await writeBytes(device, ctrlServiceUuid, CHAR_UUID_CTRL, CMD_START, false);
    await sleep(150);

    // 2) 发送 103 个数据包
    for (let i = 0; i < TOTAL_PACKETS; i++) {
        const offset = i * DATA_BYTES_PER_PACKET;
        const chunk = combined.slice(offset, offset + DATA_BYTES_PER_PACKET);
        const packet = buildPacket(i, chunk);

        const isLast = i === TOTAL_PACKETS - 1;
        await writeBytes(device, dataServiceUuid, CHAR_UUID_DATA, packet, false);

        onProgress?.(i + 1, TOTAL_PACKETS, i);
        await sleep(isLast ? 100 : 15);
    }

    await sleep(150);

    // 3) 发送 STOP 命令
    await writeBytes(device, ctrlServiceUuid, CHAR_UUID_CTRL, CMD_STOP, false);
}