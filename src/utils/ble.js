// import { BleManager } from 'react-native-ble-plx';
// import { Platform, PermissionsAndroid } from 'react-native';
// import { Buffer } from 'buffer';

// // ─── Characteristic UUIDs ─────────────────────────────────────────────────────
// export const CHAR_UUID_CTRL = '519ebbd3-78e1-4e86-90c1-d40616058d88';
// export const CHAR_UUID_DATA = '8f3c2a71-6d94-4b8e-a1f7-3c5d9e24b6a8';
// export const CHAR_UUID = CHAR_UUID_CTRL;

// // ─── Start / Stop commands ────────────────────────────────────────────────────
// export const CMD_START = new Uint8Array([0xa7, 0x3c, 0xd1, 0x5e]);
// export const CMD_STOP = new Uint8Array([0x9b, 0x42]);
// export const COUNTER_BYTES = 2;
// export const CHUNK_SIZE = 128;
// export const PROFILE_PACKETS = 256;              // counter 0–255
// export const GREETING_START_COUNTER = 896;       // counter 896–911
// export const GREETING_PACKETS = 16;
// export const PROFILE_BYTES_TOTAL = PROFILE_PACKETS * CHUNK_SIZE;    // 32KB
// export const GREETING_BYTES_TOTAL = GREETING_PACKETS * CHUNK_SIZE;  // 2KB
// // ─── Manager singleton ────────────────────────────────────────────────────────
// let _manager = null;
// export const getManager = () => {
//     if (!_manager) _manager = new BleManager();
//     return _manager;
// };

// // ─── Permissions ──────────────────────────────────────────────────────────────
// export async function requestBlePermissions() {
//     if (Platform.OS !== 'android') return true;

//     const perms = [];
//     if (Platform.Version >= 31) {
//         perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
//         perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
//     } else {
//         perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
//     }

//     const results = await PermissionsAndroid.requestMultiple(perms);
//     return Object.values(results).every(v => v === PermissionsAndroid.RESULTS.GRANTED);
// }

// // ─── Scan ─────────────────────────────────────────────────────────────────────
// export function startScan(onDevice, onError) {
//     const mgr = getManager();
//     const seen = new Set();

//     mgr.startDeviceScan(null, { allowDuplicates: false }, (err, device) => {
//         if (err) { onError?.(err.message); return; }
//         if (!device) return;

//         const name = device.name || device.localName;
//         if (!name) return;

//         if (!seen.has(device.id)) {
//             seen.add(device.id);
//             onDevice(device);
//         }
//     });

//     return () => mgr.stopDeviceScan();
// }

// // ─── Connect ──────────────────────────────────────────────────────────────────
// export async function connectDevice(deviceId) {
//     const mgr = getManager();
//     mgr.stopDeviceScan();

//     let device = await mgr.connectToDevice(deviceId, { timeout: 10000 });
//     device = await device.discoverAllServicesAndCharacteristics();

//     try {
//         if (Platform.OS === 'android' && device.requestMTU) {
//             device = await device.requestMTU(247);
//         }
//     } catch (_) { /* ignore */ }

//     return device;
// }

// // ─── Disconnect ───────────────────────────────────────────────────────────────
// export async function disconnectDevice(device) {
//     try { await device?.cancelConnection(); } catch (_) { /* ignore */ }
// }

// // ─── Helpers ──────────────────────────────────────────────────────────────────
// function sleep(ms) {
//     return new Promise(resolve => setTimeout(resolve, ms));
// }

// function toBase64(bytes) {
//     return Buffer.from(bytes).toString('base64');
// }

// async function findServiceUuidByCharacteristic(device, characteristicUuid) {
//     const services = await device.services();

//     for (const service of services) {
//         const chars = await device.characteristicsForService(service.uuid);
//         const found = chars.find(
//             c => c.uuid.toLowerCase() === characteristicUuid.toLowerCase()
//         );
//         if (found) return service.uuid;
//     }

//     throw new Error(`Characteristic not found: ${characteristicUuid}`);
// }

// async function writeBytes(device, serviceUuid, charUuid, bytes, withResponse = false) {
//     const value = toBase64(bytes);

//     if (withResponse) {
//         return device.writeCharacteristicWithResponseForService(serviceUuid, charUuid, value);
//     }
//     return device.writeCharacteristicWithoutResponseForService(serviceUuid, charUuid, value);
// }

// // ─── Retry helper ─────────────────────────────────────────────────────────────
// async function writeWithRetry(device, serviceUuid, charUuid, bytes, maxRetries = 20) {
//     let lastErr;
//     for (let attempt = 0; attempt <= maxRetries; attempt++) {
//         try {
//             await writeBytes(device, serviceUuid, charUuid, bytes, false); // ← 改回 false
//             return { success: true, attempts: attempt + 1 };
//         } catch (err) {
//             lastErr = err;
//             if (attempt < maxRetries) await sleep(5);
//         }
//     }
//     return { success: false, attempts: maxRetries + 1, error: lastErr };
// }

// // ─── Main send function ───────────────────────────────────────────────────────
// /**
//  * 合并发送 Profile + Greeting
//  *
//  * 每包 256 字节，拆成两次 BLE 写入发送：
//  *   第一次：2字节counter + 前字节数据  = 130 字节
//  *   第二次：             后128字节数据  = 128 字节
//  *
//  * 布局：
//  *   包 000–175 → profileBytes  (RGB565)
//  *   包 176–???  → greetingBytes (mono1)
//  *
//  * Protocol:
//  *   1) Write CMD_START  → CHAR_UUID_CTRL  (519ebbd3-...)
//  *   2) Write data pkts  → CHAR_UUID_DATA  (8f3c2a71-...)  ← 每包写两次
//  *   3) Write CMD_STOP   → CHAR_UUID_CTRL  (519ebbd3-...)
//  *
//  * @param {object}     device        BLE设备对象
//  * @param {Uint8Array} profileBytes  Profile图片字节 (RGB565格式)
//  * @param {Uint8Array} greetingBytes Greeting字节 (1-bit mono格式)
//  * @param {function}   onProgress    (sent, total, idx) 回调
//  *                                     sent  = 已发送包数 (从1开始)
//  *                                     total = TOTAL_PACKETS
//  *                                     idx   = 当前包序号 (从0开始)
//  */
// export async function sendCombined(device, profileBytes, greetingBytes, onProgress) {
//     const ctrlServiceUuid = await findServiceUuidByCharacteristic(device, CHAR_UUID_CTRL);
//     const dataServiceUuid = await findServiceUuidByCharacteristic(device, CHAR_UUID_DATA);

//     // 1) START
//     await writeBytes(device, ctrlServiceUuid, CHAR_UUID_CTRL, CMD_START, false);
//     await sleep(20);  // ← 给设备多一点准备时间

//     const totalWrites = PROFILE_PACKETS + GREETING_PACKETS;
//     let sent = 0;
//     const MAX_RETRIES = 20;

//     const sendPacket = async (counter, dataSlice) => {
//         const packet = new Uint8Array(COUNTER_BYTES + CHUNK_SIZE);
//         packet[0] = counter & 0xff;
//         packet[1] = (counter >> 8) & 0xff;
//         packet.set(dataSlice, COUNTER_BYTES);

//         const result = await writeWithRetry(device, dataServiceUuid, CHAR_UUID_DATA, packet, MAX_RETRIES);
//         sent++;

//         if (result.success) {
//             if (result.attempts > 1) {
//                 onProgress?.(sent, totalWrites, counter, packet,
//                     `⚠️ CTR:${counter.toString(16).toUpperCase().padStart(4, '0')} recovered after ${result.attempts} attempts`
//                 );
//             } else {
//                 onProgress?.(sent, totalWrites, counter, packet);
//             }
//         } else {
//             onProgress?.(sent, totalWrites, counter, packet,
//                 `❌ LOST CTR:${counter.toString(16).toUpperCase().padStart(4, '0')} after ${MAX_RETRIES} retries - ${result.error?.message}`
//             );
//         }
//     };
//     const sendWithConcurrency = async (packets) => {
//         for (const { counter, data } of packets) {
//             await sendPacket(counter, data);
//             await sleep(1); // ← 每包等 1ms，串行发送
//         }
//     };

//     // 2) Profile: counter 0–255
//     const profilePackets = Array.from({ length: PROFILE_PACKETS }, (_, j) => ({
//         counter: j,
//         data: profileBytes.slice(j * CHUNK_SIZE, (j + 1) * CHUNK_SIZE),
//     }));
//     await sendWithConcurrency(profilePackets);

//     await sleep(20);

//     // 3) Greeting: counter 896–911
//     const greetingPackets = Array.from({ length: GREETING_PACKETS }, (_, j) => ({
//         counter: GREETING_START_COUNTER + j,
//         data: greetingBytes.slice(j * CHUNK_SIZE, (j + 1) * CHUNK_SIZE),
//     }));
//     await sendWithConcurrency(greetingPackets);

//     await sleep(20);

//     // 4) STOP
//     await writeBytes(device, ctrlServiceUuid, CHAR_UUID_CTRL, CMD_STOP, false);
// }

// import { BleManager } from 'react-native-ble-plx';
// import { Platform, PermissionsAndroid } from 'react-native';
// import { Buffer } from 'buffer';

// // ─── Characteristic UUIDs ─────────────────────────────────────────────────────
// export const CHAR_UUID_CTRL = '519ebbd3-78e1-4e86-90c1-d40616058d88';
// export const CHAR_UUID_DATA = '8f3c2a71-6d94-4b8e-a1f7-3c5d9e24b6a8';
// export const CHAR_UUID = CHAR_UUID_CTRL;

// // ─── Start / Stop commands ────────────────────────────────────────────────────
// export const CMD_START = new Uint8Array([0xa7, 0x3c, 0xd1, 0x5e]);
// export const CMD_STOP = new Uint8Array([0x9b, 0x42]);

// export const COUNTER_BYTES = 2;
// export const CHUNK_SIZE = 128;
// export const PROFILE_PACKETS = 256;
// export const GREETING_START_COUNTER = 896;
// export const GREETING_PACKETS = 16;
// export const PROFILE_BYTES_TOTAL = PROFILE_PACKETS * CHUNK_SIZE;
// export const GREETING_BYTES_TOTAL = GREETING_PACKETS * CHUNK_SIZE;

// // ─── Manager singleton ────────────────────────────────────────────────────────
// let _manager = null;
// export const getManager = () => {
//     if (!_manager) _manager = new BleManager();
//     return _manager;
// };

// // ─── Permissions ──────────────────────────────────────────────────────────────
// export async function requestBlePermissions() {
//     if (Platform.OS !== 'android') return true;
//     const perms = [];
//     if (Platform.Version >= 31) {
//         perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
//         perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
//     } else {
//         perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
//     }
//     const results = await PermissionsAndroid.requestMultiple(perms);
//     return Object.values(results).every(v => v === PermissionsAndroid.RESULTS.GRANTED);
// }

// // ─── Scan ─────────────────────────────────────────────────────────────────────
// export function startScan(onDevice, onError) {
//     const mgr = getManager();
//     const seen = new Set();
//     mgr.startDeviceScan(null, { allowDuplicates: false }, (err, device) => {
//         if (err) { onError?.(err.message); return; }
//         if (!device) return;
//         const name = device.name || device.localName;
//         if (!name) return;
//         if (!seen.has(device.id)) {
//             seen.add(device.id);
//             onDevice(device);
//         }
//     });
//     return () => mgr.stopDeviceScan();
// }

// // ─── Connect ──────────────────────────────────────────────────────────────────
// export async function connectDevice(deviceId) {
//     const mgr = getManager();
//     mgr.stopDeviceScan();
//     let device = await mgr.connectToDevice(deviceId, { timeout: 10000 });
//     device = await device.discoverAllServicesAndCharacteristics();
//     try {
//         if (Platform.OS === 'android' && device.requestMTU) {
//             device = await device.requestMTU(247);
//         }
//     } catch (_) { /* ignore */ }
//     return device;
// }

// // ─── Disconnect ───────────────────────────────────────────────────────────────
// export async function disconnectDevice(device) {
//     try { await device?.cancelConnection(); } catch (_) { /* ignore */ }
// }

// // ─── Helpers ──────────────────────────────────────────────────────────────────
// function sleep(ms) {
//     return new Promise(resolve => setTimeout(resolve, ms));
// }

// function toBase64(bytes) {
//     return Buffer.from(bytes).toString('base64');
// }

// async function findServiceUuidByCharacteristic(device, characteristicUuid) {
//     const services = await device.services();
//     for (const service of services) {
//         const chars = await device.characteristicsForService(service.uuid);
//         const found = chars.find(
//             c => c.uuid.toLowerCase() === characteristicUuid.toLowerCase()
//         );
//         if (found) return service.uuid;
//     }
//     throw new Error(`Characteristic not found: ${characteristicUuid}`);
// }

// async function writeBytes(device, serviceUuid, charUuid, bytes, withResponse = false) {
//     const value = toBase64(bytes);
//     if (withResponse) {
//         return device.writeCharacteristicWithResponseForService(serviceUuid, charUuid, value);
//     }
//     return device.writeCharacteristicWithoutResponseForService(serviceUuid, charUuid, value);
// }

// // ─── Main send function ───────────────────────────────────────────────────────
// export async function sendCombined(device, profileBytes, greetingBytes, onProgress) {
//     const ctrlServiceUuid = await findServiceUuidByCharacteristic(device, CHAR_UUID_CTRL);
//     const dataServiceUuid = await findServiceUuidByCharacteristic(device, CHAR_UUID_DATA);

//     // Step 1: Send START command
//     await writeBytes(device, ctrlServiceUuid, CHAR_UUID_CTRL, CMD_START, false);
//     await sleep(20);

//     const totalPackets = PROFILE_PACKETS + GREETING_PACKETS; // 272 packets
//     let sent = 0;

//     // Step 2: Send single packet
//     // Each packet = 2 bytes counter + 128 bytes data = 130 bytes
//     const sendPacket = async (counter, dataSlice) => {
//         const packet = new Uint8Array(COUNTER_BYTES + CHUNK_SIZE);
//         packet[0] = counter & 0xff;
//         packet[1] = (counter >> 8) & 0xff;
//         packet.set(dataSlice, COUNTER_BYTES);

//         try {
//             await writeBytes(device, dataServiceUuid, CHAR_UUID_DATA, packet, false);
//         } catch (err) {
//             // If buffer full, wait 50ms and retry once
//             await sleep(50);
//             try {
//                 await writeBytes(device, dataServiceUuid, CHAR_UUID_DATA, packet, false);
//             } catch (_) { /* Give up */ }
//         }

//         sent++;
//         onProgress?.(sent, totalPackets, counter, packet);
//     };

//     // Step 3: Send all packets with 36ms delay each
//     // 272 packets x 36ms = ~9.8 seconds total
//     const sendAllPackets = async (packets) => {
//         for (const { counter, data } of packets) {
//             await sendPacket(counter, data);
//             await sleep(36);
//         }
//     };

//     // Send Profile: counter 0-255
//     const profilePackets = Array.from({ length: PROFILE_PACKETS }, (_, j) => ({
//         counter: j,
//         data: profileBytes.slice(j * CHUNK_SIZE, (j + 1) * CHUNK_SIZE),
//     }));
//     await sendAllPackets(profilePackets);
//     await sleep(20);

//     // Send Greeting: counter 896-911
//     const greetingPackets = Array.from({ length: GREETING_PACKETS }, (_, j) => ({
//         counter: GREETING_START_COUNTER + j,
//         data: greetingBytes.slice(j * CHUNK_SIZE, (j + 1) * CHUNK_SIZE),
//     }));
//     await sendAllPackets(greetingPackets);
//     await sleep(20);

//     // Step 4: Send STOP command
//     await writeBytes(device, ctrlServiceUuid, CHAR_UUID_CTRL, CMD_STOP, false);
// }

import { BleManager } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';

// ─── Characteristic UUIDs ────────────────────────────────────────────────────
export const CHAR_UUID_CTRL = '519ebbd3-78e1-4e86-90c1-d40616058d88';
export const CHAR_UUID_DATA = '8f3c2a71-6d94-4b8e-a1f7-3c5d9e24b6a8';
export const CHAR_UUID = CHAR_UUID_CTRL;

// ─── Start / Stop commands ───────────────────────────────────────────────────
export const CMD_START = new Uint8Array([0xa7, 0x3c, 0xd1, 0x5e]);
export const CMD_STOP = new Uint8Array([0x9b, 0x42]);

// ─── 协议常量 ────────────────────────────────────────────────────────────────
export const COUNTER_BYTES = 2;
export const CHUNK_SIZE = 128;
export const LOGIC_PACKET_SIZE = 256;

export const PROFILE_LOGIC_PACKETS = 128;
export const PROFILE_PACKETS = PROFILE_LOGIC_PACKETS * 2;
export const PROFILE_BYTES_TOTAL = PROFILE_LOGIC_PACKETS * LOGIC_PACKET_SIZE;

export const GREETING_START_COUNTER = 896;
export const GREETING_LOGIC_PACKETS = 8;
export const GREETING_PACKETS = GREETING_LOGIC_PACKETS * 2;
export const GREETING_BYTES_TOTAL = GREETING_LOGIC_PACKETS * LOGIC_PACKET_SIZE;

// ─── 时间常量 ────────────────────────────────────────────────────────────────
const PACKET_DELAY_MS = 0;      // ← 改成0，write with response 本身就有等待
const HALF_PACKET_DELAY_MS = 0; // ← 改成0
const RETRY_BACKOFF_MS = 10;    // ← retry 间隔改小
const MAX_WRITE_RETRIES = 20;   // ← 改回20
const STOP_WAIT_MS = 800;

// ─── Manager singleton ───────────────────────────────────────────────────────
let _manager = null;
export const getManager = () => {
    if (!_manager) _manager = new BleManager();
    return _manager;
};

// ─── Permissions ─────────────────────────────────────────────────────────────
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

// ─── Scan ────────────────────────────────────────────────────────────────────
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

// ─── Connect ─────────────────────────────────────────────────────────────────
export async function connectDevice(deviceId, onDisconnect) {
    const mgr = getManager();
    mgr.stopDeviceScan();
    let device = await mgr.connectToDevice(deviceId, { timeout: 10000 });
    device = await device.discoverAllServicesAndCharacteristics();
    try {
        if (Platform.OS === 'android' && device.requestMTU) {
            device = await device.requestMTU(247);
        }
    } catch (_) { /* ignore */ }

    if (onDisconnect) {
        mgr.onDeviceDisconnected(deviceId, (err, disconnectedDevice) => {
            onDisconnect(err, disconnectedDevice);
        });
    }

    return device;
}

// ─── Disconnect ──────────────────────────────────────────────────────────────
export async function disconnectDevice(device) {
    try { await device?.cancelConnection(); } catch (_) { /* ignore */ }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

// async function writeWithRetry(device, serviceUuid, charUuid, bytes, maxRetries = MAX_WRITE_RETRIES, debugLog) {
//     for (let i = 0; i <= maxRetries; i++) {
//         try {
//             await writeBytes(device, serviceUuid, charUuid, bytes, true);
//             return true;
//         } catch (err) {
//             const msg = err.message || '';
//             // 断线了就不用再 retry，直接放弃
//             if (msg.includes('not connected') || msg.includes('disconnected')) {
//                 debugLog?.(`❌ Device disconnected, abort retry`);
//                 return false;
//             }
//             debugLog?.(`⚠️ Write failed (attempt ${i + 1}/${maxRetries}): ${msg}`);
//             if (i < maxRetries) await sleep(RETRY_BACKOFF_MS);
//         }
//     }
//     return false;
// }
async function writeWithRetry(device, serviceUuid, charUuid, bytes, maxRetries = MAX_WRITE_RETRIES, debugLog) {
    for (let i = 0; i <= maxRetries; i++) {
        try {
            await writeBytes(device, serviceUuid, charUuid, bytes, true);
            return { ok: true, attempts: i + 1 };  // ← 返回尝试次数
        } catch (err) {
            const msg = err.message || '';
            if (msg.includes('not connected') || msg.includes('disconnected')) {
                debugLog?.(`❌ Device disconnected, abort retry`);
                return { ok: false, attempts: i + 1 };
            }
            debugLog?.(`⚠️ Retry ${i + 1}/${maxRetries}: ${msg}`);
            if (i < maxRetries) await sleep(RETRY_BACKOFF_MS);
        }
    }
    return { ok: false, attempts: maxRetries + 1 };
}

// ─── 构建一次BLE写入包（130字节）────────────────────────────────────────────
function buildPacket(counter, dataSlice) {
    const packet = new Uint8Array(COUNTER_BYTES + CHUNK_SIZE);
    packet[0] = counter & 0xff;
    packet[1] = (counter >> 8) & 0xff;
    packet.set(dataSlice, COUNTER_BYTES);
    return packet;
}

// ─── TODO: 等老板修好固件后，在这里实现重发逻辑 ─────────────────────────────
// 格式还未确认，老板会告知：
// - CTRL ACK 里哪些 bytes 表示缺失包
// - 是 bitmap 还是 counter 列表
// - 重发时需不需要先发请求命令
// async function retryMissingPackets(...) { }

// ─── Main send function ───────────────────────────────────────────────────────
export async function sendCombined(device, profileBytes, greetingBytes, onProgress) {
    const ctrlServiceUuid = await findServiceUuidByCharacteristic(device, CHAR_UUID_CTRL);
    const dataServiceUuid = await findServiceUuidByCharacteristic(device, CHAR_UUID_DATA);

    const ctrlSubscription = device.monitorCharacteristicForService(
        ctrlServiceUuid,
        CHAR_UUID_CTRL,
        (err, characteristic) => {
            if (err) {
                onProgress?.(null, null, null, null, `⚠️ CTRL error: ${err.message}`);
                return;
            }
            const bytes = Buffer.from(characteristic.value, 'base64');
            const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
            const dec = Array.from(bytes).map(b => b.toString().padStart(3, ' ')).join(' ');
            const bin = Array.from(bytes).map(b => b.toString(2).padStart(8, '0')).join(' ');
            onProgress?.(null, null, null, null, `🔔 CTRL HEX: ${hex}`);
            onProgress?.(null, null, null, null, `🔔 CTRL DEC: ${dec}`);
            onProgress?.(null, null, null, null, `🔔 CTRL BIN: ${bin}`);
        }
    );

    let dataSubscription = null;

    try {
        // 先订阅 DATA notify
        dataSubscription = device.monitorCharacteristicForService(
            dataServiceUuid,
            CHAR_UUID_DATA,
            (err, characteristic) => {
                if (err) return;
                const bytes = Buffer.from(characteristic.value, 'base64');
                const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
                onProgress?.(null, null, null, null, `🔔 DATA: ${hex}`);
            }
        );

        // 然后再发 START
        onProgress?.(null, null, null, null, `📤 Sending START...`);
        await writeBytes(device, ctrlServiceUuid, CHAR_UUID_CTRL, CMD_START, false);
        await sleep(100); // ← 改小

        const totalPackets = (profileBytes ? PROFILE_PACKETS : 0)
            + (greetingBytes ? GREETING_PACKETS : 0);
        let sent = 0;
        let lostCount = 0;

        // const sendLogicPacket = async (baseCounter, logicData) => {
        //     const firstHalf = logicData.slice(0, CHUNK_SIZE);
        //     const secondHalf = logicData.slice(CHUNK_SIZE, LOGIC_PACKET_SIZE);
        //     const debugLog = (msg) => onProgress?.(null, null, null, null, msg);

        //     const t1 = Date.now();
        //     const packet1 = buildPacket(baseCounter, firstHalf);
        //     const ok1 = await writeWithRetry(device, dataServiceUuid, CHAR_UUID_DATA, packet1, MAX_WRITE_RETRIES, debugLog);
        //     const t2 = Date.now();

        //     if (!ok1) lostCount++;
        //     sent++;
        //     onProgress?.(sent, totalPackets, baseCounter, packet1,
        //         ok1 ? `✅ CTR:${baseCounter} (${t2 - t1}ms)` : `❌ LOST CTR:${baseCounter}`);

        //     const packet2 = buildPacket(baseCounter + 1, secondHalf);
        //     const ok2 = await writeWithRetry(device, dataServiceUuid, CHAR_UUID_DATA, packet2, MAX_WRITE_RETRIES, debugLog);
        //     const t3 = Date.now();

        //     if (!ok2) lostCount++;
        //     sent++;
        //     onProgress?.(sent, totalPackets, baseCounter + 1, packet2,
        //         ok2 ? `✅ CTR:${baseCounter + 1} (${t3 - t2}ms)` : `❌ LOST CTR:${baseCounter + 1}`);
        // };
        const sendLogicPacket = async (baseCounter, logicData) => {
            const firstHalf = logicData.slice(0, CHUNK_SIZE);
            const secondHalf = logicData.slice(CHUNK_SIZE, LOGIC_PACKET_SIZE);
            const debugLog = (msg) => onProgress?.(null, null, null, null, msg);

            const t1 = Date.now();
            const packet1 = buildPacket(baseCounter, firstHalf);
            const { ok: ok1, attempts: attempts1 } = await writeWithRetry(device, dataServiceUuid, CHAR_UUID_DATA, packet1, MAX_WRITE_RETRIES, debugLog);
            const t2 = Date.now();
            if (!ok1) lostCount++;
            sent++;
            onProgress?.(sent, totalPackets, baseCounter, packet1,
                ok1
                    ? (attempts1 > 1 ? `🔄 CTR:${baseCounter} OK after ${attempts1} retries (${t2 - t1}ms)` : `✅ CTR:${baseCounter} (${t2 - t1}ms)`)
                    : `❌ LOST CTR:${baseCounter} after ${attempts1} retries`
            );

            const packet2 = buildPacket(baseCounter + 1, secondHalf);
            const { ok: ok2, attempts: attempts2 } = await writeWithRetry(device, dataServiceUuid, CHAR_UUID_DATA, packet2, MAX_WRITE_RETRIES, debugLog);
            const t3 = Date.now();
            if (!ok2) lostCount++;
            sent++;
            onProgress?.(sent, totalPackets, baseCounter + 1, packet2,
                ok2
                    ? (attempts2 > 1 ? `🔄 CTR:${baseCounter + 1} OK after ${attempts2} retries (${t3 - t2}ms)` : `✅ CTR:${baseCounter + 1} (${t3 - t2}ms)`)
                    : `❌ LOST CTR:${baseCounter + 1} after ${attempts2} retries`
            );
        };

        // 2) Profile
        if (profileBytes) {
            for (let j = 0; j < PROFILE_LOGIC_PACKETS; j++) {
                const baseCounter = j * 2;
                const logicData = profileBytes.slice(
                    j * LOGIC_PACKET_SIZE,
                    (j + 1) * LOGIC_PACKET_SIZE
                );
                await sendLogicPacket(baseCounter, logicData);
            }
            await sleep(20);
        }

        // 3) Greeting
        if (greetingBytes) {
            for (let j = 0; j < GREETING_LOGIC_PACKETS; j++) {
                const baseCounter = GREETING_START_COUNTER + j * 2;
                const logicData = greetingBytes.slice(
                    j * LOGIC_PACKET_SIZE,
                    (j + 1) * LOGIC_PACKET_SIZE
                );
                await sendLogicPacket(baseCounter, logicData);
            }
            await sleep(20);
        }

        // 4) STOP
        onProgress?.(null, null, null, null, `📤 Sending STOP...`);
        await writeBytes(device, ctrlServiceUuid, CHAR_UUID_CTRL, CMD_STOP, false);
        await sleep(STOP_WAIT_MS);

        onProgress?.(null, null, null, null,
            `✅ Send complete. Lost: ${lostCount}/${totalPackets}`
        );

    } finally {
        ctrlSubscription.remove();
        dataSubscription?.remove();
    }
}