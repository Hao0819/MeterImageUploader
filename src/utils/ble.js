import { BleManager } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';

export const CHAR_UUID = '519ebbd3-78e1-4e86-90c1-d40616058d88';

// Start / Stop
export const CMD_START = new Uint8Array([0xa7, 0x3c, 0xd1, 0x5e]);
export const CMD_STOP = new Uint8Array([0x9b, 0x42]);

// 协议定义
export const COUNTER_BYTES = 2;
export const DATA_BYTES_PER_PACKET = 240;                                            // ← 改成240
export const TOTAL_TRANSFER_BYTES = 24 * 1024;                                       // 24576
export const TOTAL_PACKETS = Math.ceil(TOTAL_TRANSFER_BYTES / DATA_BYTES_PER_PACKET); // 103 ✅

let _manager = null;

export const getManager = () => {
    if (!_manager) _manager = new BleManager();
    return _manager;
};

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

export function startScan(onDevice, onError) {
    const mgr = getManager();
    const seen = new Set();

    mgr.startDeviceScan(null, { allowDuplicates: false }, (err, device) => {
        if (err) {
            onError?.(err.message);
            return;
        }

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

export async function connectDevice(deviceId) {
    const mgr = getManager();
    mgr.stopDeviceScan();

    let device = await mgr.connectToDevice(deviceId, { timeout: 10000 });
    device = await device.discoverAllServicesAndCharacteristics();

    try {
        if (Platform.OS === 'android' && device.requestMTU) {
            device = await device.requestMTU(247);
        }
    } catch (_) {
        // ignore
    }

    return device;
}

export async function disconnectDevice(device) {
    try {
        await device?.cancelConnection();
    } catch (_) {
        // ignore
    }
}

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

async function writeBytes(device, serviceUuid, bytes, withResponse = false) {
    const value = toBase64(bytes);

    if (withResponse) {
        return device.writeCharacteristicWithResponseForService(
            serviceUuid,
            CHAR_UUID,
            value
        );
    }

    return device.writeCharacteristicWithoutResponseForService(
        serviceUuid,
        CHAR_UUID,
        value
    );
}

// 把真实图片数据补齐到 24576 bytes
function normalizeToProtocolSize(imageBytes) {
    if (!(imageBytes instanceof Uint8Array)) {
        throw new Error('imageBytes must be Uint8Array');
    }

    if (imageBytes.length > TOTAL_TRANSFER_BYTES) {
        throw new Error(
            `Image bytes too large: ${imageBytes.length} > ${TOTAL_TRANSFER_BYTES}`
        );
    }

    const out = new Uint8Array(TOTAL_TRANSFER_BYTES);
    out.set(imageBytes, 0);
    return out;
}

// 2 bytes counter + 240 bytes data = 242 bytes per packet
function buildPacket(packetIndex, chunk) {
    const packet = new Uint8Array(COUNTER_BYTES + DATA_BYTES_PER_PACKET); // 2+240=242

    // big-endian counter
    packet[0] = (packetIndex >> 8) & 0xff;
    packet[1] = packetIndex & 0xff;

    packet.set(chunk, 2);
    return packet;
}

export async function sendImage(device, imageBytes, onProgress) {
    const serviceUuid = await findServiceUuidByCharacteristic(device, CHAR_UUID);

    // 先补到固定 24KB
    const protocolBytes = normalizeToProtocolSize(imageBytes);

    // 1) START
    await writeBytes(device, serviceUuid, CMD_START, false);
    await sleep(150);

    // 2) DATA — 103 packets x 240 bytes each
    for (let i = 0; i < TOTAL_PACKETS; i++) {
        const offset = i * DATA_BYTES_PER_PACKET;
        const chunk = protocolBytes.slice(offset, offset + DATA_BYTES_PER_PACKET); // 240 bytes
        const packet = buildPacket(i, chunk);

        const isLast = i === TOTAL_PACKETS - 1;
        await writeBytes(device, serviceUuid, packet, isLast); // 最后一包用 withResponse 确保送达
        onProgress?.(i + 1, TOTAL_PACKETS);

        await sleep(isLast ? 100 : 15); // 最后一包多等一下
    }

    await sleep(150); // 发完所有包后等久一点再发 STOP

    // 3) STOP
    await writeBytes(device, serviceUuid, CMD_STOP, false);
}