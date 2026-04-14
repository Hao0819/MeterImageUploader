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
export const CMD_MODE2 = new Uint8Array([0xa8, 0x3c, 0x37, 0x1b]);
export const CMD_UPDATE_PROFILE_ONLY = new Uint8Array([0xa9, 0x3c, 0xd1, 0x77]);
export const CMD_UPDATE_GREETING_ONLY = new Uint8Array([0xa9, 0x3c, 0xd1, 0x78]);

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
const PACKET_DELAY_MS = 0;
const HALF_PACKET_DELAY_MS = 0;
const RETRY_BACKOFF_MS = 10;
const MAX_WRITE_RETRIES = 20;
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

// ─── Helpers (exported so Mode2Flow and others can import) ───────────────────
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function toBase64(bytes) {
    return Buffer.from(bytes).toString('base64');
}

export async function findServiceUuidByCharacteristic(device, characteristicUuid) {
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

export async function writeWithRetry(device, serviceUuid, charUuid, bytes, maxRetries = MAX_WRITE_RETRIES, debugLog) {
    for (let i = 0; i <= maxRetries; i++) {
        try {
            await writeBytes(device, serviceUuid, charUuid, bytes, true);
            return { ok: true, attempts: i + 1 };
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

export function buildPacket(counter, dataSlice) {
    const packet = new Uint8Array(COUNTER_BYTES + CHUNK_SIZE);
    packet[0] = counter & 0xff;
    packet[1] = (counter >> 8) & 0xff;
    packet.set(dataSlice, COUNTER_BYTES);
    return packet;
}

// ─── Main send function ───────────────────────────────────────────────────────
export async function sendCombined(device, profileBytes, greetingBytes, onProgress, updateType = 'both') {
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

        if (updateType === 'mode2') {
            onProgress?.(null, null, null, null, `📤 Sending MODE2 command...`);
            await writeBytes(device, ctrlServiceUuid, CHAR_UUID_CTRL, CMD_MODE2, false);
            await sleep(200);
            onProgress?.(null, null, null, null, `📤 Sending START...`);
            await writeBytes(device, ctrlServiceUuid, CHAR_UUID_CTRL, CMD_START, false);
            await sleep(100);
        } else if (updateType === 'profile') {
            onProgress?.(null, null, null, null, `📤 Sending UPDATE PROFILE ONLY...`);
            await writeBytes(device, ctrlServiceUuid, CHAR_UUID_CTRL, CMD_UPDATE_PROFILE_ONLY, false);
            await sleep(50);
            await writeBytes(device, ctrlServiceUuid, CHAR_UUID_CTRL, CMD_START, false);
            await sleep(100);
        } else if (updateType === 'greeting') {
            onProgress?.(null, null, null, null, `📤 Sending UPDATE GREETING ONLY...`);
            await writeBytes(device, ctrlServiceUuid, CHAR_UUID_CTRL, CMD_UPDATE_GREETING_ONLY, false);
            await sleep(50);
            await writeBytes(device, ctrlServiceUuid, CHAR_UUID_CTRL, CMD_START, false);
            await sleep(100);
        } else {
            onProgress?.(null, null, null, null, `📤 Sending START...`);
            await writeBytes(device, ctrlServiceUuid, CHAR_UUID_CTRL, CMD_START, false);
            await sleep(100);
        }

        const totalPackets = (profileBytes ? PROFILE_PACKETS : 0)
            + (greetingBytes ? GREETING_PACKETS : 0);
        let sent = 0;
        let lostCount = 0;

        const sendLogicPacket = async (baseCounter, logicData) => {
            const firstHalf = logicData.slice(0, CHUNK_SIZE);
            const secondHalf = logicData.slice(CHUNK_SIZE, LOGIC_PACKET_SIZE);
            const debugLog = (msg) => onProgress?.(null, null, null, null, msg);

            const t1 = Date.now();
            const packet1 = buildPacket(baseCounter, firstHalf);
            const { ok: ok1, attempts: attempts1 } = await writeWithRetry(
                device, dataServiceUuid, CHAR_UUID_DATA, packet1, MAX_WRITE_RETRIES, debugLog
            );
            const t2 = Date.now();
            if (!ok1) lostCount++;
            sent++;
            onProgress?.(sent, totalPackets, baseCounter, packet1,
                ok1
                    ? (attempts1 > 1
                        ? `🔄 CTR:${baseCounter} OK after ${attempts1} retries (${t2 - t1}ms)`
                        : `✅ CTR:${baseCounter} (${t2 - t1}ms)`)
                    : `❌ LOST CTR:${baseCounter} after ${attempts1} retries`
            );

            const packet2 = buildPacket(baseCounter + 1, secondHalf);
            const { ok: ok2, attempts: attempts2 } = await writeWithRetry(
                device, dataServiceUuid, CHAR_UUID_DATA, packet2, MAX_WRITE_RETRIES, debugLog
            );
            const t3 = Date.now();
            if (!ok2) lostCount++;
            sent++;
            onProgress?.(sent, totalPackets, baseCounter + 1, packet2,
                ok2
                    ? (attempts2 > 1
                        ? `🔄 CTR:${baseCounter + 1} OK after ${attempts2} retries (${t3 - t2}ms)`
                        : `✅ CTR:${baseCounter + 1} (${t3 - t2}ms)`)
                    : `❌ LOST CTR:${baseCounter + 1} after ${attempts2} retries`
            );
        };

        // Profile packets
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

        // Greeting packets
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

        // STOP
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