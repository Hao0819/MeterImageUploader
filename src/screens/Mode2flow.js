// src/screens/Mode2Flow.js
//
// Extended Mode (Mode 2) multi-step upload flow:
//   App input order:  P1 → P2 → S1 → S2 → S3
//   HW display order: P1 → S1 → S2 → S3 → P2
//
// Packet counter mapping:
//   P1: counters   0 – 255   (128 logic packets × 2)
//   P2: counters 256 – 511   (128 logic packets × 2)
//   S1: counter  starts 896  (8 logic packets × 2)
//   S2: counter  starts 912  (8 logic packets × 2)
//   S3: counter  starts 928  (8 logic packets × 2)
//
// Commands:
//   Mode 2 start:        A8 3C 37 1B
//   Update Profile only: A9 3C D1 77
//   Update Greeting only:A9 3C D1 78

import React, { useState, useRef, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    SafeAreaView, ScrollView, TextInput, Alert,
    Image, Modal,
} from 'react-native';
import RNFS from 'react-native-fs';
import ImageCropPicker from 'react-native-image-crop-picker';
import { captureRef } from 'react-native-view-shot';
import { Buffer } from 'buffer';

import { rgbaToRgb565, rgbaToMono1, PROFILE_W, PROFILE_H, GREETING_W, GREETING_H } from '../utils/ImageConverter';
import GreetingRenderer from '../utils/GreetingRenderer';

const jpeg = require('jpeg-js');

// ─── Constants ────────────────────────────────────────────────────────────────
import { CHAR_UUID_CTRL, CHAR_UUID_DATA, CMD_START, CMD_STOP } from '../utils/ble';

const CMD_MODE2 = new Uint8Array([0xa8, 0x3c, 0x37, 0x1b]);
const CHUNK_SIZE = 128;
const LOGIC_PKT_SIZE = 256;
const COUNTER_BYTES = 2;

// Page counter start values
const P1_COUNTER_START = 0;
const P2_COUNTER_START = 256;
const S1_COUNTER_START = 896;
const S2_COUNTER_START = 912;
const S3_COUNTER_START = 928;

// Logic packets per page
const IMAGE_LOGIC_PKTS = 128;   // 128 × 256 = 32768 bytes = 128×128×2 (RGB565)
const SCRIPT_LOGIC_PKTS = 8;    // 8 × 256 = 2048 bytes = 128×128 / 8 (mono 1-bit)

const MAX_RETRIES = 20;
const RETRY_BACKOFF = 10;
const STOP_WAIT_MS = 800;

// ─── Step definitions ─────────────────────────────────────────────────────────
const STEPS = [
    { id: 'p1', label: 'P1', title: 'Image Page 1', desc: '128×128 RGB565', type: 'image', counter: P1_COUNTER_START, logicPkts: IMAGE_LOGIC_PKTS },
    { id: 'p2', label: 'P2', title: 'Image Page 2', desc: '128×128 RGB565', type: 'image', counter: P2_COUNTER_START, logicPkts: IMAGE_LOGIC_PKTS },
    { id: 's1', label: 'S1', title: 'Greeting Page 1', desc: '128×128 mono 1-bit', type: 'greeting', counter: S1_COUNTER_START, logicPkts: SCRIPT_LOGIC_PKTS },
    { id: 's2', label: 'S2', title: 'Greeting Page 2', desc: '128×128 mono 1-bit', type: 'greeting', counter: S2_COUNTER_START, logicPkts: SCRIPT_LOGIC_PKTS },
    { id: 's3', label: 'S3', title: 'Greeting Page 3', desc: '128×128 mono 1-bit', type: 'greeting', counter: S3_COUNTER_START, logicPkts: SCRIPT_LOGIC_PKTS },
];

// Counter ranges for each page (for log colouring)
const PAGE_COUNTER_RANGES = {
    p1: { start: P1_COUNTER_START, end: P1_COUNTER_START + IMAGE_LOGIC_PKTS * 2 - 1, color: '#2563eb', label: 'P1' },
    p2: { start: P2_COUNTER_START, end: P2_COUNTER_START + IMAGE_LOGIC_PKTS * 2 - 1, color: '#dc2626', label: 'P2' },
    s1: { start: S1_COUNTER_START, end: S1_COUNTER_START + SCRIPT_LOGIC_PKTS * 2 - 1, color: '#16a34a', label: 'S1' },
    s2: { start: S2_COUNTER_START, end: S2_COUNTER_START + SCRIPT_LOGIC_PKTS * 2 - 1, color: '#d97706', label: 'S2' },
    s3: { start: S3_COUNTER_START, end: S3_COUNTER_START + SCRIPT_LOGIC_PKTS * 2 - 1, color: '#7c3aed', label: 'S3' },
};

function getPageForCounter(counter) {
    for (const [id, range] of Object.entries(PAGE_COUNTER_RANGES)) {
        if (counter >= range.start && counter <= range.end) return range;
    }
    return null;
}

// ─── BLE helpers ──────────────────────────────────────────────────────────────
function toBase64(bytes) { return Buffer.from(bytes).toString('base64'); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function findService(device, charUuid) {
    const services = await device.services();
    for (const svc of services) {
        const chars = await device.characteristicsForService(svc.uuid);
        if (chars.find(c => c.uuid.toLowerCase() === charUuid.toLowerCase())) return svc.uuid;
    }
    throw new Error(`Service not found for char: ${charUuid}`);
}

function buildPacket(counter, dataSlice) {
    const pkt = new Uint8Array(COUNTER_BYTES + CHUNK_SIZE);
    pkt[0] = counter & 0xff;
    pkt[1] = (counter >> 8) & 0xff;
    pkt.set(dataSlice, COUNTER_BYTES);
    return pkt;
}

async function writeWithRetry(device, svcUuid, charUuid, bytes, onLog) {
    const value = toBase64(bytes);
    for (let i = 0; i <= MAX_RETRIES; i++) {
        try {
            await device.writeCharacteristicWithResponseForService(svcUuid, charUuid, value);
            return { ok: true, attempts: i + 1 };
        } catch (err) {
            const msg = err.message || '';
            if (msg.includes('not connected') || msg.includes('disconnected')) {
                onLog?.(`❌ Disconnected, aborting`);
                return { ok: false, attempts: i + 1 };
            }
            onLog?.(`⚠️ Retry ${i + 1}/${MAX_RETRIES}: ${msg}`);
            if (i < MAX_RETRIES) await sleep(RETRY_BACKOFF);
        }
    }
    return { ok: false, attempts: MAX_RETRIES + 1 };
}

// ─── Image converter helpers ──────────────────────────────────────────────────
// Profile image: URI → RGB565 (same as Mode 1)
async function uriToRgb565(uri) {
    const b64 = await RNFS.readFile(uri, 'base64');
    const buf = Buffer.from(b64, 'base64');
    const decoded = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
    if (decoded.width !== PROFILE_W || decoded.height !== PROFILE_H) {
        throw new Error(`Image must be ${PROFILE_W}×${PROFILE_H}. Got ${decoded.width}×${decoded.height}`);
    }
    return rgbaToRgb565(decoded.data);
}


// ─── PacketLogViewer Modal ────────────────────────────────────────────────────
function PacketLogViewer({ visible, onClose, packetLogs, sendStats }) {
    const scrollRef = useRef(null);

    const p1Logs = packetLogs.filter(l => l.pageId === 'p1');
    const p2Logs = packetLogs.filter(l => l.pageId === 'p2');
    const s1Logs = packetLogs.filter(l => l.pageId === 's1');
    const s2Logs = packetLogs.filter(l => l.pageId === 's2');
    const s3Logs = packetLogs.filter(l => l.pageId === 's3');

    const p2Warnings = p2Logs.filter(l => l.retries > 0 || !l.ok);
    const p2CounterIssues = p2Logs.filter(l => l.counter < P2_COUNTER_START || l.counter > P2_COUNTER_START + IMAGE_LOGIC_PKTS * 2 - 1);

    const statItems = [
        { label: 'P1', count: p1Logs.length, expected: IMAGE_LOGIC_PKTS * 2, color: PAGE_COUNTER_RANGES.p1.color },
        { label: 'P2', count: p2Logs.length, expected: IMAGE_LOGIC_PKTS * 2, color: PAGE_COUNTER_RANGES.p2.color },
        { label: 'S1', count: s1Logs.length, expected: SCRIPT_LOGIC_PKTS * 2, color: PAGE_COUNTER_RANGES.s1.color },
        { label: 'S2', count: s2Logs.length, expected: SCRIPT_LOGIC_PKTS * 2, color: PAGE_COUNTER_RANGES.s2.color },
        { label: 'S3', count: s3Logs.length, expected: SCRIPT_LOGIC_PKTS * 2, color: PAGE_COUNTER_RANGES.s3.color },
    ];

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={lv.container}>
                <View style={lv.header}>
                    <TouchableOpacity onPress={onClose} style={lv.closeBtn}>
                        <Text style={lv.closeTxt}>✕ Close</Text>
                    </TouchableOpacity>
                    <Text style={lv.headerTitle}>Packet Log</Text>
                    <Text style={lv.headerCount}>{packetLogs.length} pkts</Text>
                </View>

                {sendStats && (
                    <View style={lv.summaryBar}>
                        <Text style={lv.summaryTxt}>
                            Total sent: <Text style={{ fontWeight: '700' }}>{sendStats.totalSent}</Text>
                            {'  '}Lost: <Text style={[{ fontWeight: '700' }, sendStats.totalLost > 0 && { color: '#dc2626' }]}>{sendStats.totalLost}</Text>
                            {'  '}Retries: <Text style={{ fontWeight: '700' }}>{sendStats.totalRetries}</Text>
                        </Text>
                    </View>
                )}

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={lv.statsScroll} contentContainerStyle={lv.statsRow}>
                    {statItems.map(item => {
                        const ok = item.count === item.expected;
                        return (
                            <View key={item.label} style={[lv.statCard, { borderColor: item.color }]}>
                                <Text style={[lv.statLabel, { color: item.color }]}>{item.label}</Text>
                                <Text style={[lv.statCount, !ok && { color: '#dc2626' }]}>
                                    {item.count}/{item.expected}
                                </Text>
                                <Text style={lv.statStatus}>{ok ? '✓ OK' : '⚠️ Mismatch'}</Text>
                            </View>
                        );
                    })}
                </ScrollView>

                {(p2Warnings.length > 0 || p2CounterIssues.length > 0) && (
                    <View style={lv.warnBanner}>
                        <Text style={lv.warnTitle}>⚠️ P2 Issues Detected</Text>
                        {p2Warnings.length > 0 && (
                            <Text style={lv.warnLine}>• {p2Warnings.length} packets had retries or failures</Text>
                        )}
                        {p2CounterIssues.length > 0 && (
                            <Text style={lv.warnLine}>• {p2CounterIssues.length} packets outside expected counter range (256–511)</Text>
                        )}
                        <Text style={lv.warnNote}>P2 expected counters: 0x0100 – 0x01FF</Text>
                    </View>
                )}

                <View style={lv.legendRow}>
                    {Object.values(PAGE_COUNTER_RANGES).map(r => (
                        <View key={r.label} style={lv.legendItem}>
                            <View style={[lv.legendDot, { backgroundColor: r.color }]} />
                            <Text style={lv.legendTxt}>{r.label}</Text>
                        </View>
                    ))}
                </View>

                <ScrollView ref={scrollRef} style={lv.logScroll} contentContainerStyle={{ padding: 10 }}>
                    {packetLogs.length === 0 ? (
                        <Text style={lv.emptyTxt}>No packets logged yet.</Text>
                    ) : (
                        packetLogs.map((entry, i) => {
                            const pageRange = getPageForCounter(entry.counter);
                            const borderColor = pageRange?.color ?? '#e2e8f0';
                            const hasIssue = !entry.ok || entry.retries > 0;
                            return (
                                <View key={i} style={[lv.logRow, { borderLeftColor: borderColor }, hasIssue && lv.logRowWarn]}>
                                    <Text style={lv.logNum}>{String(i + 1).padStart(4, '0')}</Text>
                                    <View style={lv.logBody}>
                                        <Text style={lv.logMeta}>
                                            <Text style={[lv.logPage, { color: borderColor }]}>{entry.pageId?.toUpperCase() ?? '??'}</Text>
                                            {'  CTR:'}
                                            <Text style={lv.logCtr}>
                                                {entry.counter.toString(16).toUpperCase().padStart(4, '0')}
                                                {' '}({entry.counter})
                                            </Text>
                                            {entry.retries > 0 && (
                                                <Text style={lv.logRetry}>{`  ⚠️ ${entry.retries} retry`}</Text>
                                            )}
                                            {!entry.ok && (
                                                <Text style={lv.logFail}>{'  ❌ FAIL'}</Text>
                                            )}
                                        </Text>
                                        <Text style={lv.logHex}>{entry.hex}</Text>
                                    </View>
                                </View>
                            );
                        })
                    )}
                </ScrollView>

                <View style={lv.footer}>
                    <TouchableOpacity
                        style={[lv.jumpBtn, { backgroundColor: PAGE_COUNTER_RANGES.p2.color }]}
                        onPress={() => {
                            const firstP2Idx = packetLogs.findIndex(l => l.pageId === 'p2');
                            if (firstP2Idx >= 0 && scrollRef.current) {
                                scrollRef.current.scrollTo({ y: firstP2Idx * 44, animated: true });
                            }
                        }}
                    >
                        <Text style={lv.jumpTxt}>Jump to P2 ↓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[lv.jumpBtn, { backgroundColor: '#475569' }]}
                        onPress={() => scrollRef.current?.scrollToEnd({ animated: true })}
                    >
                        <Text style={lv.jumpTxt}>↓ End</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </Modal>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Mode2Flow({ navigation, route }) {
    const { device, deviceName, phase } = route.params;

    const [currentStep, setCurrentStep] = useState(0);
    const [sending, setSending] = useState(false);
    const [done, setDone] = useState(false);
    const [progress, setProgress] = useState({ sent: 0, total: 0, page: '' });
    const [log, setLog] = useState([]);
    const [showLogViewer, setShowLogViewer] = useState(false);

    const packetLogsRef = useRef([]);
    const [packetLogSnapshot, setPacketLogSnapshot] = useState([]);
    const sendStatsRef = useRef({ totalSent: 0, totalLost: 0, totalRetries: 0 });

    const logBufRef = useRef([]);
    const logScrollRef = useRef(null);
    const cancelRef = useRef(false);

    // Greeting view refs for captureRef (one per greeting page)
    const greetingRefs = {
        s1: useRef(null),
        s2: useRef(null),
        s3: useRef(null),
    };


    // Page data state
    const [pages, setPages] = useState({
        p1: { uri: null },
        p2: { uri: null },
        s1: { text: '' },
        s2: { text: '' },
        s3: { text: '' },
    });

    const addLog = useCallback((msg) => {
        const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logBufRef.current.push(line);
        setLog([...logBufRef.current]);
        setTimeout(() => logScrollRef.current?.scrollToEnd({ animated: false }), 30);
    }, []);

    // ─── Image picker ─────────────────────────────────────────────────────────
    const pickImage = async (pageId) => {
        try {
            const img = await ImageCropPicker.openPicker({
                width: PROFILE_W, height: PROFILE_H,
                cropping: true,
                cropperToolbarTitle: `Crop to ${PROFILE_W}×${PROFILE_H}`,
                cropperActiveWidgetColor: '#2563eb',
                compressImageQuality: 1,
            });
            setPages(prev => ({ ...prev, [pageId]: { uri: img.path } }));
        } catch (e) {
            if (e.code !== 'E_PICKER_CANCELLED') Alert.alert('Error', e.message);
        }
    };

    const openCamera = (pageId) => {
        navigation.navigate('Camera', {
            device, deviceName, phase,
            onImageCaptured: (uri) => {
                setPages(prev => ({ ...prev, [pageId]: { uri } }));
            },
        });
    };

    // ─── Validation ───────────────────────────────────────────────────────────
    const validateAll = () => {
        for (const step of STEPS) {
            if (step.type === 'image' && !pages[step.id].uri) {
                Alert.alert('Missing image', `Please select an image for ${step.title}`);
                return false;
            }
            if (step.type === 'greeting' && !pages[step.id].text.trim()) {
                Alert.alert('Missing greeting', `Please enter text for ${step.title}`);
                return false;
            }
        }
        return true;
    };

    const convertGreetingToBytesFromRef = async (viewRef) => {
        const uri = await captureRef(viewRef, {
            format: 'jpg',
            quality: 1.0,
            width: GREETING_W,
            height: GREETING_H,
            result: 'tmpfile',
        });

        const RNFS = require('react-native-fs');
        const base64 = await RNFS.readFile(uri, 'base64');
        const binary = atob(base64);
        const buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            buffer[i] = binary.charCodeAt(i);
        }

        const jpeg = require('jpeg-js');
        const decoded = jpeg.decode(buffer.buffer, { useTArray: true, formatAsRGBA: true });
        const rgba = decoded.data;
        const W = decoded.width;
        const H = decoded.height;

        // RGBA → 1-bit mono（与 Mode 1 完全一致）
        const monoPixels = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) {
            const r = rgba[i * 4];
            const g = rgba[i * 4 + 1];
            const b = rgba[i * 4 + 2];
            const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
            monoPixels[i] = brightness < 127 ? 1 : 0;
        }

        // 打包
        const packed = [];
        for (let y = 0; y < H; y++) {
            let cur = 0, bits = 0;
            for (let x = 0; x < W; x++) {
                cur = (cur << 1) | monoPixels[y * W + x];
                bits++;
                if (bits === 8) { packed.push(cur); cur = 0; bits = 0; }
            }
            if (bits > 0) { cur <<= (8 - bits); packed.push(cur); }
        }

        return new Uint8Array(packed);
    };

    // ─── Send all pages ───────────────────────────────────────────────────────
    const sendAll = async () => {
        if (!validateAll()) return;

        cancelRef.current = false;
        logBufRef.current = [];
        packetLogsRef.current = [];
        sendStatsRef.current = { totalSent: 0, totalLost: 0, totalRetries: 0 };
        setLog([]);
        setPacketLogSnapshot([]);
        setSending(true);
        setDone(false);

        try {
            // 发送前逐个截图缓存 greeting bytes
            addLog('📸 Pre-converting greeting pages...');
            const greetingBytesMap = {};
            const greetingSteps = STEPS.filter(st => st.type === 'greeting');

            await sleep(100);

            for (const gStep of greetingSteps) {
                const ref = greetingRefs[gStep.id];

                if (!ref?.current) {
                    throw new Error(`${gStep.id} offscreen view is null`);
                }

                addLog(`  Converting ${gStep.id}...`);
                greetingBytesMap[gStep.id] = await convertGreetingToBytesFromRef(ref.current);
                addLog(`  ${gStep.id} done: ${greetingBytesMap[gStep.id].length} bytes`);
            }
            addLog('✅ All greetings pre-converted');

            const ctrlSvc = await findService(device, CHAR_UUID_CTRL);
            const dataSvc = await findService(device, CHAR_UUID_DATA);

            // ✅ 只发 CMD_MODE2，它本身就是 Mode 2 的开始命令
            addLog('📤 Sending Mode 2 command...');
            await device.writeCharacteristicWithoutResponseForService(
                ctrlSvc, CHAR_UUID_CTRL, toBase64(CMD_MODE2)
            );
            await sleep(200);

            // 3) Subscribe to CTRL notifications
            const ctrlSub = device.monitorCharacteristicForService(
                ctrlSvc, CHAR_UUID_CTRL,
                (err, char) => {
                    if (err || !char) return;
                    const bytes = Buffer.from(char.value, 'base64');
                    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
                    addLog(`🔔 CTRL: ${hex}`);
                }
            );

            // 4) Send each page: P1 → P2 → S1 → S2 → S3
            let totalLost = 0;
            let totalRetries = 0;

            for (const step of STEPS) {
                if (cancelRef.current) break;

                addLog(`\n📄 Sending ${step.title} (counter start: ${step.counter}, expected range: ${step.counter}–${step.counter + step.logicPkts * 2 - 1})...`);

                let pageBytes;
                if (step.type === 'image') {
                    addLog(`  Converting image to RGB565...`);
                    pageBytes = await uriToRgb565(pages[step.id].uri);
                    addLog(`  Converted: ${pageBytes.length} bytes`);
                    if (step.id === 'p2') {
                        const previewHex = Array.from(pageBytes.slice(0, 8))
                            .map(b => b.toString(16).padStart(2, '0').toUpperCase())
                            .join(' ');
                        addLog(`  [P2 DEBUG] First 8 bytes of RGB565 data: ${previewHex}`);
                    }
                } else {
                    addLog(`  Using pre-converted bytes for ${step.id}...`);
                    pageBytes = greetingBytesMap[step.id];
                    if (!pageBytes) {
                        throw new Error(`${step.id} bytes not found in cache`);
                    }
                    addLog(`  ${step.id}: ${pageBytes.length} bytes`);
                    const nonZero = pageBytes.filter(b => b !== 0).length;
                    addLog(`  Non-zero bytes: ${nonZero} / ${pageBytes.length}`);
                }

                const totalPkts = step.logicPkts * 2;

                for (let j = 0; j < step.logicPkts; j++) {
                    if (cancelRef.current) break;

                    const baseCounter = step.counter + j * 2;
                    const logicData = pageBytes.slice(j * LOGIC_PKT_SIZE, (j + 1) * LOGIC_PKT_SIZE);

                    const pkt1 = buildPacket(baseCounter, logicData.slice(0, CHUNK_SIZE));
                    const t1 = Date.now();
                    const { ok: ok1, attempts: att1 } = await writeWithRetry(device, dataSvc, CHAR_UUID_DATA, pkt1, addLog);
                    if (!ok1) totalLost++;
                    if (att1 > 1) totalRetries += (att1 - 1);

                    packetLogsRef.current.push({
                        pageId: step.id,
                        counter: baseCounter,
                        hex: Array.from(pkt1.slice(0, 16)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
                        ok: ok1,
                        retries: att1 - 1,
                    });

                    setProgress({ sent: j * 2 + 1, total: totalPkts, page: step.label });
                    if (att1 > 1) addLog(`🔄 ${step.label} CTR:${baseCounter} OK after ${att1} retries (${Date.now() - t1}ms)`);

                    const pkt2 = buildPacket(baseCounter + 1, logicData.slice(CHUNK_SIZE));
                    const t2 = Date.now();
                    const { ok: ok2, attempts: att2 } = await writeWithRetry(device, dataSvc, CHAR_UUID_DATA, pkt2, addLog);
                    if (!ok2) totalLost++;
                    if (att2 > 1) totalRetries += (att2 - 1);

                    packetLogsRef.current.push({
                        pageId: step.id,
                        counter: baseCounter + 1,
                        hex: Array.from(pkt2.slice(0, 16)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
                        ok: ok2,
                        retries: att2 - 1,
                    });

                    setProgress({ sent: j * 2 + 2, total: totalPkts, page: step.label });
                    if (att2 > 1) addLog(`🔄 ${step.label} CTR:${baseCounter + 1} OK after ${att2} retries (${Date.now() - t2}ms)`);

                    if ((j + 1) % 20 === 0 || j + 1 === step.logicPkts) {
                        addLog(`  ${step.label}: ${j + 1}/${step.logicPkts} logic packets`);
                    }
                }

                await sleep(20);
                addLog(`✅ ${step.title} done`);
            }

            addLog(`\n📤 Sending STOP...`);
            await device.writeCharacteristicWithoutResponseForService(
                ctrlSvc, CHAR_UUID_CTRL, toBase64(CMD_STOP)
            );
            await sleep(STOP_WAIT_MS);

            ctrlSub.remove();

            sendStatsRef.current = {
                totalSent: packetLogsRef.current.length,
                totalLost: totalLost,
                totalRetries: totalRetries,
            };

            addLog(`\n✅ All pages sent. Lost: ${totalLost} packets, Retries: ${totalRetries}`);
            setPacketLogSnapshot([...packetLogsRef.current]);
            setDone(true);

        } catch (err) {
            addLog(`❌ Error: ${err.message}`);
            Alert.alert('Send Error', err.message);
            setPacketLogSnapshot([...packetLogsRef.current]);
        } finally {
            setSending(false);
        }
    };

    const step = STEPS[currentStep];
    const canSend = STEPS.every(s =>
        s.type === 'image' ? !!pages[s.id].uri : !!pages[s.id].text.trim()
    );

    // ─── Done screen ──────────────────────────────────────────────────────────
    if (done) {
        const stats = sendStatsRef.current;
        const p2Logs = packetLogSnapshot.filter(l => l.pageId === 'p2');
        const p2Issues = p2Logs.filter(l => !l.ok || l.retries > 0);
        const hasIssues = stats.totalLost > 0 || stats.totalRetries > 0;

        return (
            <SafeAreaView style={s.container}>
                <PacketLogViewer
                    visible={showLogViewer}
                    onClose={() => setShowLogViewer(false)}
                    packetLogs={packetLogSnapshot}
                    sendStats={stats}
                />
                <View style={s.doneWrap}>
                    <View style={s.doneCard}>
                        <View style={[s.doneIconCircle, hasIssues && { borderColor: '#fcd34d', backgroundColor: '#fffbeb' }]}>
                            <Text style={s.doneIconTxt}>{hasIssues ? '⚠' : '✓'}</Text>
                        </View>
                        <Text style={s.doneTitle}>Upload Complete</Text>
                        <Text style={s.doneMsg}>All 5 pages (P1, P2, S1, S2, S3) sent</Text>

                        <View style={s.doneSummaryRow}>
                            <View style={s.doneStat}>
                                <Text style={s.doneStatNum}>{stats.totalSent}</Text>
                                <Text style={s.doneStatLabel}>Packets</Text>
                            </View>
                            <View style={s.doneStat}>
                                <Text style={[s.doneStatNum, stats.totalLost > 0 && { color: '#dc2626' }]}>
                                    {stats.totalLost}
                                </Text>
                                <Text style={s.doneStatLabel}>Lost</Text>
                            </View>
                            <View style={s.doneStat}>
                                <Text style={[s.doneStatNum, stats.totalRetries > 0 && { color: '#d97706' }]}>
                                    {stats.totalRetries}
                                </Text>
                                <Text style={s.doneStatLabel}>Retries</Text>
                            </View>
                        </View>

                        {p2Issues.length > 0 && (
                            <View style={s.p2WarnBox}>
                                <Text style={s.p2WarnTxt}>⚠️ P2 had {p2Issues.length} packet issue(s) — tap View Log to inspect</Text>
                            </View>
                        )}

                        <TouchableOpacity style={s.viewLogBtn} onPress={() => setShowLogViewer(true)}>
                            <Text style={s.viewLogTxt}>📋  View Packet Log ({packetLogSnapshot.length})</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={s.donePrimaryBtn} onPress={() => navigation.navigate('BleScanner')}>
                            <Text style={s.doneBtnTxt}>Back to Scanner</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.doneSecondaryBtn} onPress={() => {
                            setDone(false);
                            setCurrentStep(0);
                            setPages({ p1: { uri: null }, p2: { uri: null }, s1: { text: '' }, s2: { text: '' }, s3: { text: '' } });
                            logBufRef.current = [];
                            setLog([]);
                            packetLogsRef.current = [];
                            setPacketLogSnapshot([]);
                        }}>
                            <Text style={s.doneSecondaryTxt}>Send Again</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={s.container}>
            <PacketLogViewer
                visible={showLogViewer}
                onClose={() => setShowLogViewer(false)}
                packetLogs={packetLogSnapshot}
                sendStats={sendStatsRef.current}
            />

       

            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

                {/* Header */}
                <View style={s.header}>
                    <View style={s.headerRow}>
                        <TouchableOpacity onPress={() => navigation.goBack()} disabled={sending}>
                            <Text style={[s.backText, sending && s.dim]}>‹ Back</Text>
                        </TouchableOpacity>
                        <View style={s.connBadge}>
                            <View style={s.connDot} />
                            <Text style={s.connText}>{deviceName}</Text>
                        </View>
                    </View>
                    <Text style={s.title}>Extended Mode</Text>
                    <Text style={s.subtitle}>Fill in all 5 pages, then send</Text>
                </View>

                {/* Step progress bar */}
                <View style={s.stepRow}>
                    {STEPS.map((st, idx) => {
                        const filled = st.type === 'image'
                            ? !!pages[st.id].uri
                            : !!pages[st.id].text.trim();
                        const active = idx === currentStep;
                        return (
                            <TouchableOpacity
                                key={st.id}
                                style={[
                                    s.stepPill,
                                    active && s.stepPillActive,
                                    filled && !active && s.stepPillDone,
                                ]}
                                onPress={() => setCurrentStep(idx)}
                                disabled={sending}
                            >
                                <Text style={[
                                    s.stepPillTxt,
                                    active && s.stepPillTxtActive,
                                    filled && !active && s.stepPillTxtDone,
                                ]}>
                                    {filled && !active ? '✓ ' : ''}{st.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Active step card */}
                <View style={s.stepCard}>
                    <View style={s.stepCardHeader}>
                        <Text style={s.stepCardTitle}>{step.title}</Text>
                        <Text style={s.stepCardDesc}>{step.desc}</Text>
                        <Text style={s.stepCardCounter}>
                            Counter range: {step.counter} – {step.counter + step.logicPkts * 2 - 1}
                            {'  (0x'}{step.counter.toString(16).padStart(4, '0').toUpperCase()}
                            {' – 0x'}{(step.counter + step.logicPkts * 2 - 1).toString(16).padStart(4, '0').toUpperCase()}{')'}
                        </Text>
                    </View>

                    {step.type === 'image' ? (
                        <View>
                            {pages[step.id].uri ? (
                                <View style={s.imgPreviewWrap}>
                                    <Image
                                        source={{ uri: pages[step.id].uri }}
                                        style={s.imgPreview}
                                        resizeMode="cover"
                                    />
                                    <TouchableOpacity
                                        style={s.changeImgBtn}
                                        onPress={() => pickImage(step.id)}
                                        disabled={sending}
                                    >
                                        <Text style={s.changeImgTxt}>Change image</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <View style={s.imgBtns}>
                                    <TouchableOpacity
                                        style={[s.imgBtn, s.imgBtnBlue]}
                                        onPress={() => openCamera(step.id)}
                                        disabled={sending}
                                    >
                                        <Text style={s.imgBtnTxt}>📷  Camera</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[s.imgBtn, s.imgBtnGreen]}
                                        onPress={() => pickImage(step.id)}
                                        disabled={sending}
                                    >
                                        <Text style={s.imgBtnTxt}>🖼️  Gallery</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    ) : (
                        <View>
                            <TextInput
                                style={s.scriptInput}
                                multiline
                                placeholder={`Enter greeting text for ${step.title}…`}
                                placeholderTextColor="#94a3b8"
                                value={pages[step.id].text}
                                onChangeText={txt =>
                                    setPages(prev => ({ ...prev, [step.id]: { text: txt } }))
                                }
                                editable={!sending}
                            />

                            {pages[step.id].text.trim().length > 0 && (
                                <View style={s.previewWrap}>
                                    <Text style={s.previewLabel}>Preview</Text>
                                    <GreetingRenderer
                                        text={pages[step.id].text || ' '}
                                    />
                                </View>
                            )}
                        </View>
                    ) }

                    {/* Step nav */}
                    <View style={s.stepNavRow}>
                        <TouchableOpacity
                            style={[s.stepNavBtn, currentStep === 0 && s.stepNavBtnDim]}
                            onPress={() => setCurrentStep(i => Math.max(0, i - 1))}
                            disabled={currentStep === 0 || sending}
                        >
                            <Text style={s.stepNavTxt}>‹ Prev</Text>
                        </TouchableOpacity>
                        <Text style={s.stepNavCount}>{currentStep + 1} / {STEPS.length}</Text>
                        <TouchableOpacity
                            style={[s.stepNavBtn, currentStep === STEPS.length - 1 && s.stepNavBtnDim]}
                            onPress={() => setCurrentStep(i => Math.min(STEPS.length - 1, i + 1))}
                            disabled={currentStep === STEPS.length - 1 || sending}
                        >
                            <Text style={s.stepNavTxt}>Next ›</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Overview */}
                <View style={s.overviewCard}>
                    <Text style={s.overviewTitle}>Pages Overview</Text>
                    {STEPS.map(st => {
                        const filled = st.type === 'image' ? !!pages[st.id].uri : !!pages[st.id].text.trim();
                        return (
                            <View key={st.id} style={s.overviewRow}>
                                <View style={[s.overviewDot, { backgroundColor: filled ? '#22c55e' : '#e2e8f0' }]} />
                                <Text style={s.overviewLabel}>{st.label} · {st.title}</Text>
                                <Text style={s.overviewCounterHint}>
                                    {st.counter}–{st.counter + st.logicPkts * 2 - 1}
                                </Text>
                                <Text style={[s.overviewStatus, { color: filled ? '#16a34a' : '#94a3b8' }]}>
                                    {filled ? 'Ready' : 'Empty'}
                                </Text>
                            </View>
                        );
                    })}
                </View>

                {/* Send progress */}
                {sending && (
                    <View style={s.progressCard}>
                        <Text style={s.progressPage}>
                            Sending: <Text style={{ fontWeight: '700', color: '#2563eb' }}>{progress.page}</Text>
                        </Text>
                        <View style={s.progTrack}>
                            <View style={[s.progFill, {
                                width: progress.total > 0
                                    ? `${Math.round(progress.sent / progress.total * 100)}%`
                                    : '0%'
                            }]} />
                        </View>
                        <Text style={s.progTxt}>
                            {progress.sent} / {progress.total} packets
                            {progress.total > 0 ? ` (${Math.round(progress.sent / progress.total * 100)}%)` : ''}
                        </Text>
                        <TouchableOpacity
                            style={s.cancelBtn}
                            onPress={() => { cancelRef.current = true; }}
                        >
                            <Text style={s.cancelTxt}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Send button */}
                {!sending && (
                    <TouchableOpacity
                        style={[s.sendBtn, !canSend && s.sendBtnDim]}
                        onPress={sendAll}
                        disabled={!canSend || sending}
                    >
                        <Text style={s.sendTxt}>
                            {canSend ? 'Send All Pages via BLE' : 'Fill all pages to send'}
                        </Text>
                    </TouchableOpacity>
                )}

                {packetLogSnapshot.length > 0 && !sending && (
                    <TouchableOpacity
                        style={s.viewLogBtn}
                        onPress={() => setShowLogViewer(true)}
                    >
                        <Text style={s.viewLogTxt}>📋  View Packet Log ({packetLogSnapshot.length} packets)</Text>
                    </TouchableOpacity>
                )}

                {/* Log */}
                {log.length > 0 && (
                    <View style={s.logBox}>
                        <Text style={s.logLabel}>Log ({log.length} lines)</Text>
                        <ScrollView
                            ref={logScrollRef}
                            style={{ maxHeight: 300 }}
                            nestedScrollEnabled
                        >
                            {log.map((line, i) => (
                                <Text key={i} style={s.logLine}>{line}</Text>
                            ))}
                        </ScrollView>
                    </View>
                )}
                <View style={s.hiddenCanvas}>
                    <GreetingRenderer
                        text={pages.s1.text.trim() || ' '}
                        viewRef={greetingRefs.s1}
                    />
                    <GreetingRenderer
                        text={pages.s2.text.trim() || ' '}
                        viewRef={greetingRefs.s2}
                    />
                    <GreetingRenderer
                        text={pages.s3.text.trim() || ' '}
                        viewRef={greetingRefs.s3}
                    />
                </View>

            </ScrollView>
        </SafeAreaView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    scroll: { padding: 20, paddingBottom: 48 },

    // Hidden off-screen container for GreetingRenderer capture
    hiddenCanvas: {
        position: 'absolute',
        top: -9999,
        left: -9999,
        opacity: 0,
    },

    header: { marginBottom: 16 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    backText: { color: '#16a34a', fontSize: 17, fontWeight: '600' },
    dim: { opacity: 0.4 },
    connBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#f0fdf4', paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 20, borderWidth: 1, borderColor: '#bbf7d0',
    },
    connDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' },
    connText: { fontSize: 12, color: '#15803d', fontWeight: '600' },
    title: { fontSize: 26, fontWeight: '700', color: '#0f172a', letterSpacing: -0.3, marginBottom: 2 },
    subtitle: { fontSize: 13, color: '#64748b' },

    stepRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    stepPill: {
        flex: 1, paddingVertical: 8, borderRadius: 10,
        backgroundColor: '#e2e8f0', alignItems: 'center',
    },
    stepPillActive: { backgroundColor: '#2563eb' },
    stepPillDone: { backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac' },
    stepPillTxt: { fontSize: 12, fontWeight: '700', color: '#64748b' },
    stepPillTxtActive: { color: '#fff' },
    stepPillTxtDone: { color: '#16a34a', fontSize: 10 },

    stepCard: {
        backgroundColor: '#fff', borderRadius: 18, padding: 18,
        borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 14,
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    stepCardHeader: { marginBottom: 14 },
    stepCardTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
    stepCardDesc: { fontSize: 12, color: '#64748b', marginBottom: 4 },
    stepCardCounter: { fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' },

    imgBtns: { flexDirection: 'row', gap: 10, marginBottom: 8 },
    imgBtn: {
        flex: 1, paddingVertical: 14, borderRadius: 12,
        alignItems: 'center', borderWidth: 1,
    },
    imgBtnBlue: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
    imgBtnGreen: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
    imgBtnTxt: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
    imgPreviewWrap: { alignItems: 'center', marginBottom: 8 },
    imgPreview: { width: 128, height: 128, borderRadius: 10, marginBottom: 10 },
    changeImgBtn: {
        backgroundColor: '#f1f5f9', borderRadius: 8,
        paddingHorizontal: 16, paddingVertical: 8,
    },
    changeImgTxt: { fontSize: 13, color: '#475569', fontWeight: '600' },

    scriptInput: {
        backgroundColor: '#f8fafc', borderRadius: 12,
        borderWidth: 1, borderColor: '#e2e8f0',
        padding: 12, fontSize: 13, color: '#0f172a',
        minHeight: 80, textAlignVertical: 'top',
    },

    previewWrap: { alignItems: 'center', marginTop: 10 },
    previewLabel: { fontSize: 11, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },

    stepNavRow: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', marginTop: 14,
    },
    stepNavBtn: {
        backgroundColor: '#f1f5f9', borderRadius: 8,
        paddingHorizontal: 16, paddingVertical: 8,
    },
    stepNavBtnDim: { opacity: 0.35 },
    stepNavTxt: { fontSize: 14, color: '#475569', fontWeight: '600' },
    stepNavCount: { fontSize: 13, color: '#94a3b8', fontWeight: '500' },

    overviewCard: {
        backgroundColor: '#fff', borderRadius: 16, padding: 16,
        borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 14,
    },
    overviewTitle: { fontSize: 13, fontWeight: '700', color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
    overviewRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
    overviewDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
    overviewLabel: { flex: 1, fontSize: 13, color: '#334155', fontWeight: '500' },
    overviewCounterHint: { fontSize: 10, color: '#94a3b8', fontFamily: 'monospace', marginRight: 8 },
    overviewStatus: { fontSize: 12, fontWeight: '600' },

    progressCard: {
        backgroundColor: '#eff6ff', borderRadius: 14, padding: 16,
        borderWidth: 1, borderColor: '#bfdbfe', marginBottom: 14,
    },
    progressPage: { fontSize: 13, color: '#1e40af', marginBottom: 10 },
    progTrack: {
        height: 8, backgroundColor: '#bfdbfe', borderRadius: 999,
        overflow: 'hidden', marginBottom: 6,
    },
    progFill: { height: '100%', backgroundColor: '#2563eb', borderRadius: 999 },
    progTxt: { fontSize: 12, color: '#1e40af', textAlign: 'center', fontWeight: '500' },
    cancelBtn: {
        marginTop: 10, backgroundColor: '#dc2626', borderRadius: 10,
        padding: 10, alignItems: 'center',
    },
    cancelTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },

    sendBtn: {
        backgroundColor: '#2563eb', borderRadius: 14,
        padding: 18, alignItems: 'center', marginBottom: 12,
    },
    sendBtnDim: { opacity: 0.45 },
    sendTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },

    viewLogBtn: {
        backgroundColor: '#f8fafc', borderRadius: 12, padding: 14,
        alignItems: 'center', marginBottom: 14,
        borderWidth: 1.5, borderColor: '#cbd5e1',
    },
    viewLogTxt: { fontSize: 14, color: '#334155', fontWeight: '600' },

    logBox: {
        backgroundColor: '#fff', borderRadius: 14, padding: 14,
        borderWidth: 1, borderColor: '#e2e8f0',
    },
    logLabel: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
    logLine: { fontSize: 11, color: '#475569', fontFamily: 'monospace', lineHeight: 18 },

    // Done screen
    doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    doneCard: {
        backgroundColor: '#fff', borderRadius: 24, padding: 32,
        alignItems: 'center', width: '100%',
        borderWidth: 1, borderColor: '#e2e8f0',
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 16,
        shadowOffset: { width: 0, height: 4 }, elevation: 3,
    },
    doneIconCircle: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: '#eff6ff', borderWidth: 2, borderColor: '#93c5fd',
        alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    },
    doneIconTxt: { fontSize: 32, color: '#2563eb' },
    doneTitle: { fontSize: 24, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
    doneMsg: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 16, lineHeight: 20 },
    doneSummaryRow: {
        flexDirection: 'row', gap: 24, marginBottom: 16,
        paddingVertical: 12, paddingHorizontal: 20,
        backgroundColor: '#f8fafc', borderRadius: 12, width: '100%',
        justifyContent: 'center',
    },
    doneStat: { alignItems: 'center' },
    doneStatNum: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
    doneStatLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },
    p2WarnBox: {
        backgroundColor: '#fef3c7', borderRadius: 10, padding: 10,
        borderWidth: 1, borderColor: '#fcd34d', marginBottom: 12, width: '100%',
    },
    p2WarnTxt: { fontSize: 12, color: '#92400e', textAlign: 'center', fontWeight: '500' },
    donePrimaryBtn: {
        backgroundColor: '#2563eb', borderRadius: 12,
        paddingHorizontal: 32, paddingVertical: 14, width: '100%',
        alignItems: 'center', marginBottom: 10,
    },
    doneBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
    doneSecondaryBtn: {
        backgroundColor: '#f1f5f9', borderRadius: 12,
        paddingHorizontal: 32, paddingVertical: 14, width: '100%',
        alignItems: 'center',
    },
    doneSecondaryTxt: { color: '#475569', fontWeight: '600', fontSize: 15 },
});

// ─── Log viewer styles ────────────────────────────────────────────────────────
const lv = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        padding: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
        backgroundColor: '#fff',
    },
    closeBtn: { paddingHorizontal: 4 },
    closeTxt: { color: '#dc2626', fontSize: 14, fontWeight: '700' },
    headerTitle: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
    headerCount: { color: '#64748b', fontSize: 12 },
    summaryBar: {
        backgroundColor: '#f1f5f9', paddingVertical: 8, paddingHorizontal: 16,
        borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    },
    summaryTxt: { fontSize: 12, color: '#334155' },
    statsScroll: { flexGrow: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
    statsRow: { flexDirection: 'row', padding: 10, gap: 8 },
    statCard: {
        alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14,
        borderRadius: 10, borderWidth: 2, backgroundColor: '#f8fafc', minWidth: 60,
    },
    statLabel: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
    statCount: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
    statStatus: { fontSize: 10, color: '#64748b', marginTop: 2 },
    warnBanner: {
        backgroundColor: '#fef3c7', padding: 12,
        borderBottomWidth: 1, borderBottomColor: '#fcd34d',
    },
    warnTitle: { fontSize: 13, fontWeight: '700', color: '#92400e', marginBottom: 4 },
    warnLine: { fontSize: 12, color: '#92400e', marginBottom: 2 },
    warnNote: { fontSize: 11, color: '#b45309', fontFamily: 'monospace', marginTop: 4 },
    legendRow: {
        flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingVertical: 8,
        backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendTxt: { fontSize: 11, color: '#334155', fontWeight: '600' },
    logScroll: { flex: 1 },
    emptyTxt: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 32, fontStyle: 'italic' },
    logRow: {
        flexDirection: 'row', alignItems: 'flex-start',
        paddingVertical: 5, paddingHorizontal: 8,
        borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
        borderLeftWidth: 3, borderLeftColor: '#e2e8f0',
    },
    logRowWarn: { backgroundColor: '#fff7ed' },
    logNum: { color: '#94a3b8', fontSize: 10, fontFamily: 'monospace', width: 36, marginRight: 6, marginTop: 1, lineHeight: 16 },
    logBody: { flex: 1 },
    logMeta: { fontSize: 11, fontFamily: 'monospace', lineHeight: 16, marginBottom: 1 },
    logPage: { fontWeight: '700', fontSize: 11 },
    logCtr: { color: '#334155' },
    logRetry: { color: '#d97706', fontWeight: '600' },
    logFail: { color: '#dc2626', fontWeight: '700' },
    logHex: { fontSize: 10, color: '#64748b', fontFamily: 'monospace', lineHeight: 15 },
    footer: {
        flexDirection: 'row', gap: 10, padding: 12,
        borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#fff',
    },
    jumpBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
    jumpTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
});