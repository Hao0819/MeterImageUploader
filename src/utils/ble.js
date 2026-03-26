import { BleManager } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';
import { IMAGE_TYPE } from './ImageConverter';

// ─── Characteristic UUIDs ─────────────────────────────────────────────────────
// Control UUID — used for START and STOP commands
export const CHAR_UUID_CTRL = '519ebbd3-78e1-4e86-90c1-d40616058d88';

// Data UUID — used for all data packets
export const CHAR_UUID_DATA = '8f3c2a71-6d94-4b8e-a1f7-3c5d9e24b6a8';

// Logo and Greeting use the same data UUID as Profile
export const CHAR_UUID_LOGO = CHAR_UUID_DATA;
export const CHAR_UUID_GREETING = CHAR_UUID_DATA;

/** Pick the right DATA characteristic UUID for the given imageType */
export function getDataCharUuid(imageType) {
    switch (imageType) {
        case IMAGE_TYPE.LOGO: return CHAR_UUID_LOGO;
        case IMAGE_TYPE.GREETING: return CHAR_UUID_GREETING;
        default: return CHAR_UUID_DATA;  // profile
    }
}

// Keep old export so nothing else breaks
export const CHAR_UUID = CHAR_UUID_CTRL;

// ─── Start / Stop commands ────────────────────────────────────────────────────
export const CMD_START = new Uint8Array([0xa7, 0x3c, 0xd1, 0x5e]);
export const CMD_STOP = new Uint8Array([0x9b, 0x42]);

// ─── Protocol constants ───────────────────────────────────────────────────────
export const COUNTER_BYTES = 2;
export const DATA_BYTES_PER_PACKET = 240;
export const TOTAL_TRANSFER_BYTES = 24 * 1024;                                        // 24576
export const TOTAL_PACKETS = Math.ceil(TOTAL_TRANSFER_BYTES / DATA_BYTES_PER_PACKET); // 103

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

// ─── Pad image data to protocol size (24 KB) ─────────────────────────────────
function normalizeToProtocolSize(imageBytes) {
    if (!(imageBytes instanceof Uint8Array)) {
        throw new Error('imageBytes must be Uint8Array');
    }
    if (imageBytes.length > TOTAL_TRANSFER_BYTES) {
        throw new Error(`Image bytes too large: ${imageBytes.length} > ${TOTAL_TRANSFER_BYTES}`);
    }

    const out = new Uint8Array(TOTAL_TRANSFER_BYTES);
    out.set(imageBytes, 0);
    return out;
}

// ─── Build packet: 2-byte big-endian counter + 240 bytes data ────────────────
function buildPacket(packetIndex, chunk) {
    const packet = new Uint8Array(COUNTER_BYTES + DATA_BYTES_PER_PACKET);
    packet[0] = packetIndex & 0xff;         // ✅ 低位在前
    packet[1] = (packetIndex >> 8) & 0xff;  // ✅ 高位在后
    packet.set(chunk, 2);
    return packet;
}

// ─── Main send function ───────────────────────────────────────────────────────
/**
 * Protocol:
 *   1) Write CMD_START  → CHAR_UUID_CTRL  (519ebbd3-...)
 *   2) Write data pkts  → CHAR_UUID_DATA  (8f3c2a71-...) [or logo/greeting UUID]
 *   3) Write CMD_STOP   → CHAR_UUID_CTRL  (519ebbd3-...)
 *
 * @param {object}     device      BLE device object
 * @param {Uint8Array} imageBytes  Raw bytes to send
 * @param {string}     imageType   IMAGE_TYPE constant
 * @param {function}   onProgress  (sent, total) callback
 */
export async function sendImage(device, imageBytes, imageType = IMAGE_TYPE.PROFILE, onProgress) {
    const dataCharUuid = getDataCharUuid(imageType);

    // Find service UUIDs for both characteristics
    const ctrlServiceUuid = await findServiceUuidByCharacteristic(device, CHAR_UUID_CTRL);
    const dataServiceUuid = await findServiceUuidByCharacteristic(device, dataCharUuid);

    // Pad to fixed 24 KB
    const protocolBytes = normalizeToProtocolSize(imageBytes);

    // 1) START → control UUID
    await writeBytes(device, ctrlServiceUuid, CHAR_UUID_CTRL, CMD_START, false);
    await sleep(150);

    // 2) DATA → data UUID
    for (let i = 0; i < TOTAL_PACKETS; i++) {
        const offset = i * DATA_BYTES_PER_PACKET;
        const chunk = protocolBytes.slice(offset, offset + DATA_BYTES_PER_PACKET);
        const packet = buildPacket(i, chunk);

        const isLast = i === TOTAL_PACKETS - 1;
        await writeBytes(device, dataServiceUuid, dataCharUuid, packet, isLast);
        onProgress?.(i + 1, TOTAL_PACKETS);

        await sleep(isLast ? 100 : 15);
    }

    await sleep(150);

    // 3) STOP → control UUID
    await writeBytes(device, ctrlServiceUuid, CHAR_UUID_CTRL, CMD_STOP, false);
}