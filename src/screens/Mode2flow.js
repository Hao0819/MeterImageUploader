// src/screens/Mode2Flow.js
//
// Extended Mode (Mode 2) multi-step upload flow:
//   App input order:  P1 → P2 → S1 → S2 → S3
//   HW display order: P1 → S1 → S2 → S3 → P2

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    TextInput,
    Alert,
    Image,
    Platform,
} from 'react-native';
import RNFS from 'react-native-fs';
import ImageCropPicker from 'react-native-image-crop-picker';
import { captureRef } from 'react-native-view-shot';
import { Buffer } from 'buffer';
import { COLORS, UI } from '../theme/ui';

// BLE utils
import {
    CHAR_UUID_CTRL,
    CHAR_UUID_DATA,
    CMD_STOP,
    toBase64,
    sleep,
    findServiceUuidByCharacteristic,
    buildPacket,
    writeWithRetry,
    getManager,
} from '../utils/ble';

// Mode 2 constants
import {
    CMD_MODE2,
    CHUNK_SIZE,
    LOGIC_PKT_SIZE,
    STEPS,
    STOP_WAIT_MS,
} from '../utils/mode2Constants';

// Image utils
import {
    rgbaToRgb565,
    PROFILE_W,
    PROFILE_H,
    GREETING_W,
    GREETING_H,
} from '../utils/ImageConverter';

import GreetingRenderer from '../utils/GreetingRenderer';
import PacketLogViewer from '../components/PacketLogViewer';

const jpeg = require('jpeg-js');

// ─── Image converter helpers ──────────────────────────────────────────────────
async function uriToRgb565(uri) {
    const b64 = await RNFS.readFile(uri, 'base64');
    const buf = Buffer.from(b64, 'base64');
    const decoded = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });

    const srcW = decoded.width;
    const srcH = decoded.height;
    let rgba = decoded.data;

    if (srcW !== PROFILE_W || srcH !== PROFILE_H) {
        if (Math.abs(srcW - PROFILE_W) > 2 || Math.abs(srcH - PROFILE_H) > 2) {
            throw new Error(`Image must be ${PROFILE_W}×${PROFILE_H}. Got ${srcW}×${srcH}`);
        }

        console.warn(`[uriToRgb565] 修正 ${srcW}×${srcH} → ${PROFILE_W}×${PROFILE_H}`);
        const dst = new Uint8Array(PROFILE_W * PROFILE_H * 4);
        const xR = srcW / PROFILE_W;
        const yR = srcH / PROFILE_H;

        for (let y = 0; y < PROFILE_H; y++) {
            for (let x = 0; x < PROFILE_W; x++) {
                const sx = Math.min(Math.floor(x * xR), srcW - 1);
                const sy = Math.min(Math.floor(y * yR), srcH - 1);
                const si = (sy * srcW + sx) * 4;
                const di = (y * PROFILE_W + x) * 4;

                dst[di] = rgba[si];
                dst[di + 1] = rgba[si + 1];
                dst[di + 2] = rgba[si + 2];
                dst[di + 3] = rgba[si + 3];
            }
        }

        rgba = dst;
    }

    return rgbaToRgb565(rgba);
}

async function convertGreetingToBytesFromRef(viewRef, debugId) {
    const uri = await captureRef(viewRef, {
        format: 'jpg',
        quality: 1.0,
        pixelRatio: 1,
    });

    const base64 = await RNFS.readFile(uri, 'base64');
    const binary = atob(base64);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        buffer[i] = binary.charCodeAt(i);
    }

    const decoded = jpeg.decode(buffer.buffer, { useTArray: true, formatAsRGBA: true });
    const srcW = decoded.width;
    const srcH = decoded.height;
    const srcRgba = decoded.data;

    const dstW = GREETING_W;
    const dstH = GREETING_H;
    let rgba;

    if (srcW === dstW && srcH === dstH) {
        rgba = srcRgba;
    } else {
        console.log(`[${debugId}] Scaling ${srcW}×${srcH} → ${dstW}×${dstH}`);
        rgba = new Uint8Array(dstW * dstH * 4);
        const xRatio = srcW / dstW;
        const yRatio = srcH / dstH;

        for (let y = 0; y < dstH; y++) {
            for (let x = 0; x < dstW; x++) {
                const srcX = Math.floor(x * xRatio);
                const srcY = Math.floor(y * yRatio);
                const srcIdx = (srcY * srcW + srcX) * 4;
                const dstIdx = (y * dstW + x) * 4;

                rgba[dstIdx] = srcRgba[srcIdx];
                rgba[dstIdx + 1] = srcRgba[srcIdx + 1];
                rgba[dstIdx + 2] = srcRgba[srcIdx + 2];
                rgba[dstIdx + 3] = srcRgba[srcIdx + 3];
            }
        }
    }

    const monoPixels = new Uint8Array(dstW * dstH);
    for (let i = 0; i < dstW * dstH; i++) {
        const r = rgba[i * 4];
        const g = rgba[i * 4 + 1];
        const b = rgba[i * 4 + 2];
        monoPixels[i] = (0.299 * r + 0.587 * g + 0.114 * b) < 127 ? 1 : 0;
    }

    const packed = [];
    for (let y = 0; y < dstH; y++) {
        let cur = 0;
        let bits = 0;
        for (let x = 0; x < dstW; x++) {
            cur = (cur << 1) | monoPixels[y * dstW + x];
            bits++;
            if (bits === 8) {
                packed.push(cur);
                cur = 0;
                bits = 0;
            }
        }
        if (bits > 0) {
            cur <<= (8 - bits);
            packed.push(cur);
        }
    }

    return new Uint8Array(packed);
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Mode2Flow({ navigation, route }) {
    const { device, deviceName, phase } = route.params;
    const deviceId = device?.id || 'Unknown ID';

    const [isConnected, setIsConnected] = useState(true);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [sendStats, setSendStats] = useState({ totalSent: 0, totalLost: 0, totalRetries: 0 });
    const [currentStep, setCurrentStep] = useState(0);
    const [sending, setSending] = useState(false);
    const [done, setDone] = useState(false);
    const [progress, setProgress] = useState({ sent: 0, total: 0, page: '' });
    const [showLogViewer, setShowLogViewer] = useState(false);
    const [packetLogSnapshot, setPacketLogSnapshot] = useState([]);

    const packetLogsRef = useRef([]);
    const sendStatsRef = useRef({ totalSent: 0, totalLost: 0, totalRetries: 0 });
    const logBufRef = useRef([]);
    const cancelRef = useRef(false);
    const connectedDeviceRef = useRef(device);

    const greetingRefS1 = useRef(null);
    const greetingRefS2 = useRef(null);
    const greetingRefS3 = useRef(null);

    const greetingRefs = {
        s1: greetingRefS1,
        s2: greetingRefS2,
        s3: greetingRefS3,
    };

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
    }, []);

    useEffect(() => {
        const sub = getManager().onDeviceDisconnected(device.id, () => {
            setIsConnected(false);
            addLog('⚠️ Device disconnected');
        });

        const unsubBlur = navigation.addListener('blur', () => {
            sub.remove();
        });

        return () => {
            sub.remove();
            unsubBlur();
        };
    }, [device.id, navigation, addLog]);

    const reconnect = async () => {
        setIsReconnecting(true);
        addLog('Connecting...');
        try {
            try {
                await connectedDeviceRef.current?.cancelConnection();
            } catch (_) { }

            await sleep(300);

            let reconnected = await getManager().connectToDevice(device.id, { timeout: 10000 });
            reconnected = await reconnected.discoverAllServicesAndCharacteristics();

            try {
                if (reconnected.requestMTU) {
                    await reconnected.requestMTU(247);
                }
            } catch (_) { }

            connectedDeviceRef.current = reconnected;
            setIsConnected(true);
            addLog('Connected!');
        } catch (err) {
            addLog('Connect failed: ' + err.message);
        } finally {
            setIsReconnecting(false);
        }
    };

    // ─── Image picker ──────────────────────────────────────────────────────────
    const pickImage = async (pageId) => {
        try {
            const img = await ImageCropPicker.openPicker({
                width: PROFILE_W,
                height: PROFILE_H,
                cropping: true,
                cropperToolbarTitle: `Crop to ${PROFILE_W}×${PROFILE_H}`,
                cropperActiveWidgetColor: '#2563eb',
                compressImageQuality: 1,
            });
            setPages(prev => ({ ...prev, [pageId]: { uri: img.path } }));
        } catch (e) {
            if (e.code !== 'E_PICKER_CANCELLED') {
                Alert.alert('Error', e.message);
            }
        }
    };

    const openCamera = (pageId) => {
        navigation.navigate('Camera', {
            device,
            deviceName,
            phase,
            onImageCaptured: (uri) => {
                setPages(prev => ({ ...prev, [pageId]: { uri } }));
            },
        });
    };

    // ─── Validation ────────────────────────────────────────────────────────────
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

    // ─── Send all pages ────────────────────────────────────────────────────────
    const sendAll = async () => {
        if (!validateAll()) return;

        const currentId = connectedDeviceRef.current?.id || device.id;

        try {
            const stillConnected = await getManager().isDeviceConnected(currentId);
            if (!stillConnected) {
                setIsConnected(false);
                Alert.alert('Disconnected', 'Please reconnect first.');
                return;
            }
        } catch (_) { }

        const activeDevice = connectedDeviceRef.current || device;
        if (!activeDevice) {
            Alert.alert('Error', 'No active BLE device');
            return;
        }
        connectedDeviceRef.current = activeDevice;

        let heartbeatTimer = null;
        if (Platform.OS === 'ios') {
            heartbeatTimer = setInterval(async () => {
                try {
                    await getManager().isDeviceConnected(activeDevice.id);
                } catch (_) { }
            }, 1500);
        }

        cancelRef.current = false;
        logBufRef.current = [];
        packetLogsRef.current = [];
        sendStatsRef.current = { totalSent: 0, totalLost: 0, totalRetries: 0 };
        setPacketLogSnapshot([]);
        setSending(true);
        setDone(false);

        let ctrlSub = null;

        try {
            addLog('Pre-converting greeting pages...');
            const greetingBytesMap = {};
            await sleep(100);

            for (const gStep of STEPS.filter(st => st.type === 'greeting')) {
                const ref = greetingRefs[gStep.id];
                if (!ref?.current) throw new Error(`${gStep.id} offscreen view is null`);

                addLog(`Converting ${gStep.id}...`);
                greetingBytesMap[gStep.id] = await convertGreetingToBytesFromRef(ref.current, gStep.id);
                addLog(`${gStep.id} done: ${greetingBytesMap[gStep.id].length} bytes`);
            }

            addLog('All greetings pre-converted');

            clearInterval(heartbeatTimer);
            heartbeatTimer = null;

            const ctrlSvc = await findServiceUuidByCharacteristic(activeDevice, CHAR_UUID_CTRL);
            const dataSvc = await findServiceUuidByCharacteristic(activeDevice, CHAR_UUID_DATA);

            addLog('Sending Mode 2 command...');
            await activeDevice.writeCharacteristicWithoutResponseForService(
                ctrlSvc,
                CHAR_UUID_CTRL,
                toBase64(CMD_MODE2)
            );
            await sleep(200);

            ctrlSub = activeDevice.monitorCharacteristicForService(
                ctrlSvc,
                CHAR_UUID_CTRL,
                (err, char) => {
                    if (err || !char?.value) return;
                    const bytes = Buffer.from(char.value, 'base64');
                    const hex = Array.from(bytes)
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join(' ');
                    addLog(`CTRL: ${hex}`);
                }
            );

            let totalLost = 0;
            let totalRetries = 0;

            for (const step of STEPS) {
                if (cancelRef.current) break;

                addLog(`Sending ${step.title} (counter start: ${step.counter})...`);

                let pageBytes;
                if (step.type === 'image') {
                    addLog('Converting image to RGB565...');
                    pageBytes = await uriToRgb565(pages[step.id].uri);
                    addLog(`Converted: ${pageBytes.length} bytes`);
                } else {
                    pageBytes = greetingBytesMap[step.id];
                    if (!pageBytes) throw new Error(`${step.id} bytes not found in cache`);
                    const nonZero = pageBytes.filter(b => b !== 0).length;
                    addLog(`${step.id}: ${pageBytes.length} bytes, non-zero: ${nonZero}`);
                }

                const totalPkts = step.logicPkts * 2;

                for (let j = 0; j < step.logicPkts; j++) {
                    if (cancelRef.current) break;

                    const baseCounter = step.counter + j * 2;
                    const logicData = pageBytes.slice(
                        j * LOGIC_PKT_SIZE,
                        (j + 1) * LOGIC_PKT_SIZE
                    );

                    const pkt1 = buildPacket(baseCounter, logicData.slice(0, CHUNK_SIZE));
                    const { ok: ok1, attempts: att1 } = await writeWithRetry(
                        activeDevice,
                        dataSvc,
                        CHAR_UUID_DATA,
                        pkt1,
                        undefined,
                        addLog
                    );
                    if (!ok1) totalLost++;
                    if (att1 > 1) totalRetries += (att1 - 1);

                    packetLogsRef.current.push({
                        pageId: step.id,
                        counter: baseCounter,
                        hex: Array.from(pkt1.slice(0, 16))
                            .map(b => b.toString(16).padStart(2, '0').toUpperCase())
                            .join(' '),
                        ok: ok1,
                        retries: att1 - 1,
                    });

                    setProgress({
                        sent: j * 2 + 1,
                        total: totalPkts,
                        page: step.label,
                    });

                    const pkt2 = buildPacket(baseCounter + 1, logicData.slice(CHUNK_SIZE));
                    const { ok: ok2, attempts: att2 } = await writeWithRetry(
                        activeDevice,
                        dataSvc,
                        CHAR_UUID_DATA,
                        pkt2,
                        undefined,
                        addLog
                    );
                    if (!ok2) totalLost++;
                    if (att2 > 1) totalRetries += (att2 - 1);

                    packetLogsRef.current.push({
                        pageId: step.id,
                        counter: baseCounter + 1,
                        hex: Array.from(pkt2.slice(0, 16))
                            .map(b => b.toString(16).padStart(2, '0').toUpperCase())
                            .join(' '),
                        ok: ok2,
                        retries: att2 - 1,
                    });

                    setProgress({
                        sent: j * 2 + 2,
                        total: totalPkts,
                        page: step.label,
                    });

                    if ((j + 1) % 20 === 0 || j + 1 === step.logicPkts) {
                        addLog(`${step.label}: ${j + 1}/${step.logicPkts} logic packets`);
                    }
                }

                await sleep(20);
                addLog(`${step.title} done`);
            }

            addLog('Sending STOP...');
            await activeDevice.writeCharacteristicWithoutResponseForService(
                ctrlSvc,
                CHAR_UUID_CTRL,
                toBase64(CMD_STOP)
            );
            await sleep(STOP_WAIT_MS);

            try {
                ctrlSub?.remove();
            } catch (_) { }

            sendStatsRef.current = {
                totalSent: packetLogsRef.current.length,
                totalLost,
                totalRetries,
            };

            addLog(`All pages sent. Lost: ${totalLost}, Retries: ${totalRetries}`);
            setSendStats(sendStatsRef.current);
            setPacketLogSnapshot([...packetLogsRef.current]);
            setDone(true);
        } catch (err) {
            addLog(`Error: ${err.message}`);
            Alert.alert('Send Error', err.message);
            setPacketLogSnapshot([...packetLogsRef.current]);
            setSendStats(sendStatsRef.current);
        } finally {
            clearInterval(heartbeatTimer);
            try {
                ctrlSub?.remove();
            } catch (_) { }
            setSending(false);
        }
    };

    const step = STEPS[currentStep];
    const canSend = STEPS.every(st =>
        st.type === 'image' ? !!pages[st.id].uri : !!pages[st.id].text.trim()
    );

    return (
        <SafeAreaView style={s.container}>
            <PacketLogViewer
                visible={showLogViewer}
                onClose={() => setShowLogViewer(false)}
                packetLogs={packetLogSnapshot}
                sendStats={sendStats}
            />

            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
                <View style={s.header}>
                    <View style={s.headerRow}>
                        <TouchableOpacity onPress={() => navigation.goBack()} disabled={sending}>
                            <Text style={[s.backText, sending && s.dim]}>‹ Back</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => navigation.navigate('PhaseSelect', { device, deviceName })}
                            disabled={sending}
                        >
                            <Text style={{ fontSize: 22, opacity: sending ? 0.4 : 1 }}>🏠</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={s.deviceBar}>
                        <View style={s.deviceLeft}>
                            <View
                                style={[
                                    s.connDot2,
                                    { backgroundColor: isConnected ? '#22c55e' : '#ef4444' },
                                ]}
                            />
                            <View style={{ flexShrink: 1, flex: 1 }}>
                                <Text style={s.connText2} numberOfLines={1}>{deviceName}</Text>
                                <Text style={s.connId2} numberOfLines={1}>{deviceId}</Text>
                            </View>
                        </View>

                        {isConnected ? (
                            <Text style={s.connStatus}>Connected</Text>
                        ) : (
                            <TouchableOpacity
                                onPress={reconnect}
                                disabled={isReconnecting || sending}
                                style={[s.reconnectBtn, (isReconnecting || sending) && { opacity: 0.5 }]}
                            >
                                <Text style={s.reconnectTxt}>
                                    {isReconnecting ? 'Connecting...' : 'Reconnect'}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <Text style={s.title}>Extended Mode</Text>
                </View>

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
                                <Text
                                    style={[
                                        s.stepPillTxt,
                                        active && s.stepPillTxtActive,
                                        filled && !active && s.stepPillTxtDone,
                                    ]}
                                >
                                    {filled && !active ? '✓ ' : ''}
                                    {st.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <View style={s.stepCard}>
                    <View style={s.stepCardHeader}>
                        <Text style={s.stepCardTitle}>{step.title}</Text>
                        <Text style={s.stepCardDesc}>{step.desc}</Text>
                        <Text style={s.stepCardCounter}>
                            Counter range: {step.counter} – {step.counter + step.logicPkts * 2 - 1}
                            {'  (0x'}
                            {step.counter.toString(16).padStart(4, '0').toUpperCase()}
                            {' – 0x'}
                            {(step.counter + step.logicPkts * 2 - 1).toString(16).padStart(4, '0').toUpperCase()}
                            {')'}
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
                                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                                        <TouchableOpacity
                                            style={[s.changeImgBtn, { flex: 1, alignItems: 'center' }]}
                                            onPress={() => openCamera(step.id)}
                                            disabled={sending}
                                        >
                                            <Text style={s.changeImgTxt}>Camera</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[s.changeImgBtn, { flex: 1, alignItems: 'center' }]}
                                            onPress={() => pickImage(step.id)}
                                            disabled={sending}
                                        >
                                            <Text style={s.changeImgTxt}>Gallery</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ) : (
                                <View style={s.imgBtns}>
                                    <TouchableOpacity
                                        style={s.imgBtn}
                                        onPress={() => openCamera(step.id)}
                                        disabled={sending}
                                    >
                                        <Text style={s.imgBtnTxt}>Camera</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={s.imgBtn}
                                        onPress={() => pickImage(step.id)}
                                        disabled={sending}
                                    >
                                        <Text style={s.imgBtnTxt}>Gallery</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    ) : (() => {
                        const hasArabic = /[\u0600-\u06FF]/.test(pages[step.id].text);
                        const hasChinese = /[\u4E00-\u9FFF]/.test(pages[step.id].text);
                        const MAX_CHARS = hasArabic ? 130 : hasChinese ? 50 : 135;
                        const charCount = pages[step.id].text.length;

                        return (
                            <View>
                                <TextInput
                                    style={[s.scriptInput, charCount >= MAX_CHARS && { borderColor: '#dc2626' }]}
                                    multiline
                                    maxLength={MAX_CHARS}
                                    placeholder={`Enter greeting text for ${step.title}…`}
                                    placeholderTextColor="#94a3b8"
                                    value={pages[step.id].text}
                                    onChangeText={txt =>
                                        setPages(prev => ({ ...prev, [step.id]: { text: txt } }))
                                    }
                                    editable={!sending}
                                />
                                <Text
                                    style={[s.charCount, charCount >= MAX_CHARS && { color: '#dc2626' }]}
                                >
                                    {charCount} / {MAX_CHARS}
                                </Text>

                                {pages[step.id].text.trim().length > 0 && (
                                    <View style={s.previewWrap}>
                                        <Text style={s.previewLabel}>Preview</Text>
                                        <GreetingRenderer text={pages[step.id].text || ' '} />
                                    </View>
                                )}
                            </View>
                        );
                    })()}

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

                <View style={s.overviewCard}>
                    <Text style={s.overviewTitle}>Pages Overview</Text>
                    {STEPS.map(st => {
                        const filled = st.type === 'image'
                            ? !!pages[st.id].uri
                            : !!pages[st.id].text.trim();

                        return (
                            <View key={st.id} style={s.overviewRow}>
                                <View
                                    style={[
                                        s.overviewDot,
                                        { backgroundColor: filled ? '#22c55e' : '#e2e8f0' },
                                    ]}
                                />
                                <Text style={s.overviewLabel}>{st.label} · {st.title}</Text>
                                <Text style={s.overviewCounterHint}>
                                    {st.counter}–{st.counter + st.logicPkts * 2 - 1}
                                </Text>
                                <Text
                                    style={[
                                        s.overviewStatus,
                                        { color: filled ? '#16a34a' : '#94a3b8' },
                                    ]}
                                >
                                    {filled ? 'Ready' : 'Empty'}
                                </Text>
                            </View>
                        );
                    })}
                </View>

                {sending && (
                    <View style={s.progressCard}>
                        <Text style={s.progressPage}>
                            Sending: <Text style={{ fontWeight: '700', color: '#2563eb' }}>{progress.page}</Text>
                        </Text>
                        <View style={s.progTrack}>
                            <View
                                style={[
                                    s.progFill,
                                    {
                                        width:
                                            progress.total > 0
                                                ? `${Math.round((progress.sent / progress.total) * 100)}%`
                                                : '0%',
                                    },
                                ]}
                            />
                        </View>
                        <Text style={s.progTxt}>
                            {progress.sent} / {progress.total} packets
                            {progress.total > 0
                                ? ` (${Math.round((progress.sent / progress.total) * 100)}%)`
                                : ''}
                        </Text>
                    </View>
                )}

                {sending && (
                    <TouchableOpacity
                        style={[s.sendBtn, { backgroundColor: '#dc2626', marginTop: -8 }]}
                        onPress={() => {
                            cancelRef.current = true;
                        }}
                    >
                        <Text style={s.sendTxt}>Cancel</Text>
                    </TouchableOpacity>
                )}

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

                {done && (
                    <View style={s.doneCard}>
                        <Text style={s.doneTxt}>
                            Transfer complete
                            {sendStats.totalLost > 0 ? `  ${sendStats.totalLost} lost` : ''}
                            {sendStats.totalRetries > 0 ? `  ${sendStats.totalRetries} retries` : ''}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                            <TouchableOpacity
                                style={s.doneBtn}
                                onPress={() => {
                                    setDone(false);
                                    setCurrentStep(0);
                                    setPages({
                                        p1: { uri: null },
                                        p2: { uri: null },
                                        s1: { text: '' },
                                        s2: { text: '' },
                                        s3: { text: '' },
                                    });
                                    logBufRef.current = [];
                                    packetLogsRef.current = [];
                                    setPacketLogSnapshot([]);
                                }}
                            >
                                <Text style={s.doneBtnTxt}>Send Again</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[s.doneBtn, { backgroundColor: '#475569' }]}
                                onPress={() => navigation.navigate('BleScanner')}
                            >
                                <Text style={s.doneBtnTxt}>Start Over</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {packetLogSnapshot.length > 0 && !sending && (
                    <TouchableOpacity
                        style={s.viewLogBtn}
                        onPress={() => setShowLogViewer(true)}
                    >
                        <Text style={s.viewLogTxt}>
                            View Packet Log ({packetLogSnapshot.length} packets)
                        </Text>
                    </TouchableOpacity>
                )}

                <View style={s.hiddenCanvas}>
                    <GreetingRenderer key="s1" text={pages.s1.text.trim() || ' '} viewRef={greetingRefS1} />
                    <GreetingRenderer key="s2" text={pages.s2.text.trim() || ' '} viewRef={greetingRefS2} />
                    <GreetingRenderer key="s3" text={pages.s3.text.trim() || ' '} viewRef={greetingRefS3} />
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    container: UI.screen,
    scroll: UI.scroll,

    hiddenCanvas: {
        position: 'absolute',
        top: -9999,
        left: -9999,
        opacity: 0,
        flexDirection: 'column',
    },

    header: { marginBottom: 16 },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        paddingTop: 8,
        minHeight: 44,
    },
    backText: {
        color: COLORS.primary,
        fontSize: 17,
        fontWeight: '600',
    },
    dim: { opacity: 0.4 },

    title: {
        fontSize: 26,
        fontWeight: '700',
        color: COLORS.text,
        letterSpacing: -0.3,
        marginBottom: 2,
    },
    subtitle: {
        fontSize: 13,
        color: COLORS.subtext,
    },

    stepRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
    },
    stepPill: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: '#e2e8f0',
        alignItems: 'center',
    },
    stepPillActive: {
        backgroundColor: COLORS.primary,
    },
    stepPillDone: {
        backgroundColor: '#dcfce7',
        borderWidth: 1,
        borderColor: '#86efac',
    },
    stepPillTxt: {
        fontSize: 12,
        fontWeight: '700',
        color: COLORS.subtext,
    },
    stepPillTxtActive: {
        color: '#fff',
    },
    stepPillTxtDone: {
        color: COLORS.success,
        fontSize: 10,
    },

    stepCard: {
        ...UI.card,
        padding: 16,
    },
    stepCardHeader: { marginBottom: 14 },
    stepCardTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.text,
        marginBottom: 2,
    },
    stepCardDesc: {
        fontSize: 12,
        color: COLORS.subtext,
        marginBottom: 4,
    },
    stepCardCounter: {
        fontSize: 10,
        color: COLORS.muted,
        fontFamily: 'monospace',
    },

    imgBtns: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 8,
    },
    imgBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        backgroundColor: COLORS.grayBtn,
        borderColor: COLORS.grayBtnBorder,
    },
    imgBtnTxt: {
        fontSize: 14,
        fontWeight: '700',
        color: COLORS.text,
    },
    imgPreviewWrap: {
        alignItems: 'center',
        marginBottom: 8,
    },
    imgPreview: {
        width: 128,
        height: 128,
        borderRadius: 10,
        marginBottom: 10,
    },
    changeImgBtn: {
        backgroundColor: COLORS.grayBtn,
        borderRadius: 10,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: COLORS.grayBtnBorder,
    },
    changeImgTxt: {
        fontSize: 13,
        color: COLORS.grayText,
        fontWeight: '600',
    },

    scriptInput: {
        backgroundColor: COLORS.bg,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: 12,
        fontSize: 13,
        color: COLORS.text,
        minHeight: 80,
        textAlignVertical: 'top',
    },
    previewWrap: {
        alignItems: 'center',
        marginTop: 10,
    },
    previewLabel: {
        fontSize: 11,
        color: COLORS.muted,
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },

    stepNavRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 14,
    },
    stepNavBtn: {
        backgroundColor: COLORS.grayBtn,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: COLORS.grayBtnBorder,
    },
    stepNavBtnDim: { opacity: 0.35 },
    stepNavTxt: {
        fontSize: 14,
        color: COLORS.grayText,
        fontWeight: '600',
    },
    stepNavCount: {
        fontSize: 13,
        color: COLORS.muted,
        fontWeight: '500',
    },

    overviewCard: UI.card,
    overviewTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: COLORS.subtext,
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    overviewRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
    },
    overviewDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 10,
    },
    overviewLabel: {
        flex: 1,
        fontSize: 13,
        color: '#334155',
        fontWeight: '500',
    },
    overviewCounterHint: {
        fontSize: 10,
        color: COLORS.muted,
        fontFamily: 'monospace',
        marginRight: 8,
    },
    overviewStatus: {
        fontSize: 12,
        fontWeight: '600',
    },

    progressCard: UI.progressCard,
    progressPage: {
        fontSize: 13,
        color: '#1e40af',
        marginBottom: 10,
    },
    progTrack: {
        height: 8,
        backgroundColor: '#bfdbfe',
        borderRadius: 999,
        overflow: 'hidden',
        marginBottom: 6,
    },
    progFill: {
        height: '100%',
        backgroundColor: COLORS.primary,
        borderRadius: 999,
    },
    progTxt: {
        fontSize: 12,
        color: '#1e40af',
        textAlign: 'center',
        fontWeight: '500',
    },

    sendBtn: {
        ...UI.primaryBtn,
        marginBottom: 12,
    },
    sendBtnDim: { opacity: 0.45 },
    sendTxt: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },

    viewLogBtn: {
        backgroundColor: COLORS.bg,
        borderRadius: 12,
        padding: 14,
        alignItems: 'center',
        marginBottom: 14,
        borderWidth: 1,
        borderColor: COLORS.grayBtnBorder,
    },
    viewLogTxt: {
        fontSize: 14,
        color: '#334155',
        fontWeight: '600',
    },

    doneCard: UI.doneCard,
    doneTxt: {
        fontSize: 16,
        fontWeight: '700',
        color: '#15803d',
        marginBottom: 14,
        textAlign: 'center',
    },
    doneBtn: {
        backgroundColor: COLORS.primary,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
    },
    doneBtnTxt: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 14,
    },
    charCount: {
        fontSize: 11,
        color: COLORS.muted,
        textAlign: 'right',
        marginTop: 4,
        marginBottom: 2,
    },

    deviceBar: UI.deviceBar,
    deviceLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    connDot2: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    connText2: {
        fontSize: 13,
        color: COLORS.text,
        fontWeight: '600',
        flex: 1,
    },
    connStatus: {
        fontSize: 12,
        color: COLORS.success,
        fontWeight: '600',
    },
    reconnectBtn: {
        backgroundColor: COLORS.primary,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    reconnectTxt: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '700',
    },
    connId2: {
        fontSize: 10,
        color: COLORS.muted,
        marginTop: 1,
    },
});