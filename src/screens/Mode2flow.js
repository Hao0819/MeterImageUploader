// src/screens/Mode2Flow.js
//
// Extended Mode (Mode 2) multi-step upload flow:
//   App input order:  P1 → P2 → S1 → S2 → S3
//   HW display order: P1 → S1 → S2 → S3 → P2

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    SafeAreaView, ScrollView, TextInput, Alert, Image,
} from 'react-native';
import RNFS from 'react-native-fs';
import ImageCropPicker from 'react-native-image-crop-picker';
import { captureRef } from 'react-native-view-shot';
import { Buffer } from 'buffer';

// BLE utils (all from ble.js)
import {
    CHAR_UUID_CTRL,
    CHAR_UUID_DATA,
    CMD_STOP,
    toBase64,
    sleep,
    findServiceUuidByCharacteristic,
    buildPacket,
    writeWithRetry,
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
import { rgbaToRgb565, PROFILE_W, PROFILE_H, GREETING_W, GREETING_H } from '../utils/ImageConverter';
import GreetingRenderer from '../utils/GreetingRenderer';

// Components
import PacketLogViewer from '../components/PacketLogViewer';

const jpeg = require('jpeg-js');

// ─── Image converter helpers ──────────────────────────────────────────────────
async function uriToRgb565(uri) {
    const b64 = await RNFS.readFile(uri, 'base64');
    const buf = Buffer.from(b64, 'base64');
    const decoded = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
    if (decoded.width !== PROFILE_W || decoded.height !== PROFILE_H) {
        throw new Error(`Image must be ${PROFILE_W}×${PROFILE_H}. Got ${decoded.width}×${decoded.height}`);
    }
    return rgbaToRgb565(decoded.data);
}

async function convertGreetingToBytesFromRef(viewRef, debugId) {
    const uri = await captureRef(viewRef, {
        format: 'jpg',
        quality: 1.0,
        width: GREETING_W,
        height: GREETING_H,
        result: 'tmpfile',
    });
    console.log(`[${debugId}] captured uri: ${uri}`);

    const base64 = await RNFS.readFile(uri, 'base64');
    const binary = atob(base64);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);

    const decoded = jpeg.decode(buffer.buffer, { useTArray: true, formatAsRGBA: true });
    const rgba = decoded.data;
    const W = decoded.width;
    const H = decoded.height;

    // RGBA → 1-bit mono
    const monoPixels = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
        const r = rgba[i * 4];
        const g = rgba[i * 4 + 1];
        const b = rgba[i * 4 + 2];
        monoPixels[i] = (0.299 * r + 0.587 * g + 0.114 * b) < 127 ? 1 : 0;
    }

    // Pack bits
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
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Mode2Flow({ navigation, route }) {
    const { device, deviceName, phase } = route.params;
    const [isConnected, setIsConnected] = useState(true);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [sendStats, setSendStats] = useState({ totalSent: 0, totalLost: 0, totalRetries: 0 });
    const [currentStep, setCurrentStep] = useState(0);
    const [sending, setSending] = useState(false);
    const [done, setDone] = useState(false);
    const [progress, setProgress] = useState({ sent: 0, total: 0, page: '' });
    const [log, setLog] = useState([]);
    const [showLogViewer, setShowLogViewer] = useState(false);
    const [packetLogSnapshot, setPacketLogSnapshot] = useState([]);

    const packetLogsRef = useRef([]);
    const sendStatsRef = useRef({ totalSent: 0, totalLost: 0, totalRetries: 0 });
    const logBufRef = useRef([]);
    const logScrollRef = useRef(null);
    const cancelRef = useRef(false);

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
        setLog([...logBufRef.current]);
        setTimeout(() => logScrollRef.current?.scrollToEnd({ animated: false }), 30);
    }, []);

    useEffect(() => {
        const sub = device.onDisconnected(() => {
            setIsConnected(false);
            addLog('⚠️ Device disconnected');
        });
        return () => sub.remove();
    }, []);

    const reconnect = async () => {
        setIsReconnecting(true);
        addLog('🔄 Connecting...');
        try {
            let reconnected = await device.connect({ timeout: 10000 });
            reconnected = await reconnected.discoverAllServicesAndCharacteristics();
            setIsConnected(true);
            addLog('✅ Connected!');
        } catch (err) {
            addLog('❌ Connect failed: ' + err.message);
        } finally {
            setIsReconnecting(false);
        }
    };

    // ─── Image picker ──────────────────────────────────────────────────────────
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

        cancelRef.current = false;
        logBufRef.current = [];
        packetLogsRef.current = [];
        sendStatsRef.current = { totalSent: 0, totalLost: 0, totalRetries: 0 };
        setLog([]);
        setPacketLogSnapshot([]);
        setSending(true);
        setDone(false);

        try {
            // Pre-convert all greeting pages
            addLog('📸 Pre-converting greeting pages...');
            const greetingBytesMap = {};
            await sleep(100);
            for (const gStep of STEPS.filter(st => st.type === 'greeting')) {
                const ref = greetingRefs[gStep.id];
                if (!ref?.current) throw new Error(`${gStep.id} offscreen view is null`);
                addLog(`  Converting ${gStep.id}...`);
                greetingBytesMap[gStep.id] = await convertGreetingToBytesFromRef(ref.current, gStep.id);
                addLog(`  ${gStep.id} done: ${greetingBytesMap[gStep.id].length} bytes`);
            }
            addLog('✅ All greetings pre-converted');

            const ctrlSvc = await findServiceUuidByCharacteristic(device, CHAR_UUID_CTRL);
            const dataSvc = await findServiceUuidByCharacteristic(device, CHAR_UUID_DATA);

            // Send Mode 2 start command
            addLog('📤 Sending Mode 2 command...');
            await device.writeCharacteristicWithoutResponseForService(
                ctrlSvc, CHAR_UUID_CTRL, toBase64(CMD_MODE2)
            );
            await sleep(200);

            // Subscribe to CTRL notifications
            const ctrlSub = device.monitorCharacteristicForService(
                ctrlSvc, CHAR_UUID_CTRL,
                (err, char) => {
                    if (err || !char) return;
                    const bytes = Buffer.from(char.value, 'base64');
                    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
                    addLog(`🔔 CTRL: ${hex}`);
                }
            );

            let totalLost = 0;
            let totalRetries = 0;

            // Send each page: P1 → P2 → S1 → S2 → S3
            for (const step of STEPS) {
                if (cancelRef.current) break;

                addLog(`\n📄 Sending ${step.title} (counter start: ${step.counter})...`);

                let pageBytes;
                if (step.type === 'image') {
                    addLog(`  Converting image to RGB565...`);
                    pageBytes = await uriToRgb565(pages[step.id].uri);
                    addLog(`  Converted: ${pageBytes.length} bytes`);
                    if (step.id === 'p2') {
                        const previewHex = Array.from(pageBytes.slice(0, 8))
                            .map(b => b.toString(16).padStart(2, '00').toUpperCase()).join(' ');
                        addLog(`  [P2 DEBUG] First 8 bytes: ${previewHex}`);
                    }
                } else {
                    pageBytes = greetingBytesMap[step.id];
                    if (!pageBytes) throw new Error(`${step.id} bytes not found in cache`);
                    const nonZero = pageBytes.filter(b => b !== 0).length;
                    addLog(`  ${step.id}: ${pageBytes.length} bytes, non-zero: ${nonZero}`);
                }

                const totalPkts = step.logicPkts * 2;

                for (let j = 0; j < step.logicPkts; j++) {
                    if (cancelRef.current) break;

                    const baseCounter = step.counter + j * 2;
                    const logicData = pageBytes.slice(j * LOGIC_PKT_SIZE, (j + 1) * LOGIC_PKT_SIZE);

                    // First half packet
                    const pkt1 = buildPacket(baseCounter, logicData.slice(0, CHUNK_SIZE));
                    const { ok: ok1, attempts: att1 } = await writeWithRetry(
                        device, dataSvc, CHAR_UUID_DATA, pkt1, undefined, addLog
                    );
                    if (!ok1) totalLost++;
                    if (att1 > 1) totalRetries += (att1 - 1);
                    packetLogsRef.current.push({
                        pageId: step.id, counter: baseCounter,
                        hex: Array.from(pkt1.slice(0, 16)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
                        ok: ok1, retries: att1 - 1,
                    });
                    setProgress({ sent: j * 2 + 1, total: totalPkts, page: step.label });

                    // Second half packet
                    const pkt2 = buildPacket(baseCounter + 1, logicData.slice(CHUNK_SIZE));
                    const { ok: ok2, attempts: att2 } = await writeWithRetry(
                        device, dataSvc, CHAR_UUID_DATA, pkt2, undefined, addLog
                    );
                    if (!ok2) totalLost++;
                    if (att2 > 1) totalRetries += (att2 - 1);
                    packetLogsRef.current.push({
                        pageId: step.id, counter: baseCounter + 1,
                        hex: Array.from(pkt2.slice(0, 16)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
                        ok: ok2, retries: att2 - 1,
                    });
                    setProgress({ sent: j * 2 + 2, total: totalPkts, page: step.label });

                    if ((j + 1) % 20 === 0 || j + 1 === step.logicPkts) {
                        addLog(`  ${step.label}: ${j + 1}/${step.logicPkts} logic packets`);
                    }
                }

                await sleep(20);
                addLog(`✅ ${step.title} done`);
            }

            // Send STOP
            addLog(`\n📤 Sending STOP...`);
            await device.writeCharacteristicWithoutResponseForService(
                ctrlSvc, CHAR_UUID_CTRL, toBase64(CMD_STOP)
            );
            await sleep(STOP_WAIT_MS);
            ctrlSub.remove();

            sendStatsRef.current = {
                totalSent: packetLogsRef.current.length,
                totalLost,
                totalRetries,
            };
            addLog(`\n✅ All pages sent. Lost: ${totalLost}, Retries: ${totalRetries}`);
            setSendStats(sendStatsRef.current);
            setPacketLogSnapshot([...packetLogsRef.current]);
            setDone(true);

        } catch (err) {
            addLog(`❌ Error: ${err.message}`);
            Alert.alert('Send Error', err.message);
            setPacketLogSnapshot([...packetLogsRef.current]);
            setSendStats(sendStatsRef.current);
        } finally {
            setSending(false);
        }
    };

    const step = STEPS[currentStep];
    const canSend = STEPS.every(st =>
        st.type === 'image' ? !!pages[st.id].uri : !!pages[st.id].text.trim()
    );

    // ─── Done screen ───────────────────────────────────────────────────────────
    {/* Done card — 跟 CropSend 一样 */ }
    {
        done && (
            <View style={s.doneCard}>
                <Text style={s.doneTxt}>
                    ✅ Transfer complete!
                    {sendStats.totalLost > 0 && `  ⚠️ ${sendStats.totalLost} lost`}
                    {sendStats.totalRetries > 0 && `  🔁 ${sendStats.totalRetries} retries`}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                        style={s.doneBtn}
                        onPress={() => {
                            setDone(false);
                            setCurrentStep(0);
                            setPages({ p1: { uri: null }, p2: { uri: null }, s1: { text: '' }, s2: { text: '' }, s3: { text: '' } });
                            logBufRef.current = [];
                            setLog([]);
                            packetLogsRef.current = [];
                            setPacketLogSnapshot([]);
                        }}
                    >
                        <Text style={s.doneBtnTxt}>🔄 Send Again</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[s.doneBtn, { backgroundColor: '#64748b' }]}
                        onPress={() => navigation.navigate('BleScanner')}
                    >
                        <Text style={s.doneBtnTxt}>Back to Scanner</Text>
                    </TouchableOpacity>
                </View>
            </View>
        )
    }

    // ─── Main UI ───────────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={s.container}>
            <PacketLogViewer
                visible={showLogViewer}
                onClose={() => setShowLogViewer(false)}
                packetLogs={packetLogSnapshot}
                sendStats={sendStats}
            />

            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

                {/* Header */}
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
                            <View style={[s.connDot2, { backgroundColor: isConnected ? '#22c55e' : '#ef4444' }]} />
                            <Text style={s.connText2} numberOfLines={1}>{deviceName}</Text>
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
                                style={[s.stepPill, active && s.stepPillActive, filled && !active && s.stepPillDone]}
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
                                    <Image source={{ uri: pages[step.id].uri }} style={s.imgPreview} resizeMode="cover" />
                                    <TouchableOpacity style={s.changeImgBtn} onPress={() => pickImage(step.id)} disabled={sending}>
                                        <Text style={s.changeImgTxt}>Change image</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <View style={s.imgBtns}>
                                    <TouchableOpacity style={[s.imgBtn, s.imgBtnBlue]} onPress={() => openCamera(step.id)} disabled={sending}>
                                        <Text style={s.imgBtnTxt}>📷  Camera</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[s.imgBtn, s.imgBtnGreen]} onPress={() => pickImage(step.id)} disabled={sending}>
                                        <Text style={s.imgBtnTxt}>🖼️  Gallery</Text>
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
                                    onChangeText={txt => setPages(prev => ({ ...prev, [step.id]: { text: txt } }))}
                                    editable={!sending}
                                />
                                <Text style={[s.charCount, charCount >= MAX_CHARS && { color: '#dc2626' }]}>
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
                                    ? `${Math.round(progress.sent / progress.total * 100)}%` : '0%',
                            }]} />
                        </View>
                        <Text style={s.progTxt}>
                            {progress.sent} / {progress.total} packets
                            {progress.total > 0 ? ` (${Math.round(progress.sent / progress.total * 100)}%)` : ''}
                        </Text>
                    </View>
                )}

                {/* Cancel button */}
                {sending && (
                    <TouchableOpacity
                        style={[s.sendBtn, { backgroundColor: '#dc2626', marginTop: -8 }]}
                        onPress={() => { cancelRef.current = true; }}
                    >
                        <Text style={s.sendTxt}>Cancel</Text>
                    </TouchableOpacity>
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

                {/* Done card */}
                {done && (
                    <View style={s.doneCard}>
                        <Text style={s.doneTxt}>
                            ✅ Transfer complete!
                            {sendStats.totalLost > 0 ? `  ⚠️ ${sendStats.totalLost} lost` : ''}
                            {sendStats.totalRetries > 0 ? `  🔁 ${sendStats.totalRetries} retries` : ''}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                            <TouchableOpacity
                                style={s.doneBtn}
                                onPress={() => {
                                    setDone(false);
                                    setCurrentStep(0);
                                    setPages({ p1: { uri: null }, p2: { uri: null }, s1: { text: '' }, s2: { text: '' }, s3: { text: '' } });
                                    logBufRef.current = [];
                                    setLog([]);
                                    packetLogsRef.current = [];
                                    setPacketLogSnapshot([]);
                                }}
                            >
                                <Text style={s.doneBtnTxt}>🔄 Send Again</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[s.doneBtn, { backgroundColor: '#64748b' }]}
                                onPress={() => navigation.navigate('PhaseSelect', { device, deviceName })}
                            >
                                <Text style={s.doneBtnTxt}>🏠 Home</Text>
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
                    <TouchableOpacity style={s.viewLogBtn} onPress={() => setShowLogViewer(true)}>
                        <Text style={s.viewLogTxt}>📋  View Packet Log ({packetLogSnapshot.length} packets)</Text>
                    </TouchableOpacity>
                )}

                {/* Log */}
                {log.length > 0 && (
                    <View style={s.logBox}>
                        <Text style={s.logLabel}>Log ({log.length} lines)</Text>
                        <ScrollView ref={logScrollRef} style={{ maxHeight: 300 }} nestedScrollEnabled>
                            {log.map((line, i) => <Text key={i} style={s.logLine}>{line}</Text>)}
                        </ScrollView>
                    </View>
                )}

                {/* Hidden offscreen GreetingRenderer views for captureRef */}
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
    container: { flex: 1, backgroundColor: '#f8fafc' },
    scroll: { padding: 20, paddingBottom: 48 },
    hiddenCanvas: { position: 'absolute', top: -9999, left: -9999, opacity: 0, flexDirection: 'column' },
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
    stepPill: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#e2e8f0', alignItems: 'center' },
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
    imgBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
    imgBtnBlue: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
    imgBtnGreen: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
    imgBtnTxt: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
    imgPreviewWrap: { alignItems: 'center', marginBottom: 8 },
    imgPreview: { width: 128, height: 128, borderRadius: 10, marginBottom: 10 },
    changeImgBtn: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
    changeImgTxt: { fontSize: 13, color: '#475569', fontWeight: '600' },

    scriptInput: {
        backgroundColor: '#f8fafc', borderRadius: 12,
        borderWidth: 1, borderColor: '#e2e8f0',
        padding: 12, fontSize: 13, color: '#0f172a',
        minHeight: 80, textAlignVertical: 'top',
    },
    previewWrap: { alignItems: 'center', marginTop: 10 },
    previewLabel: { fontSize: 11, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },

    stepNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
    stepNavBtn: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
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
    progTrack: { height: 8, backgroundColor: '#bfdbfe', borderRadius: 999, overflow: 'hidden', marginBottom: 6 },
    progFill: { height: '100%', backgroundColor: '#2563eb', borderRadius: 999 },
    progTxt: { fontSize: 12, color: '#1e40af', textAlign: 'center', fontWeight: '500' },
    cancelBtn: { marginTop: 10, backgroundColor: '#dc2626', borderRadius: 10, padding: 10, alignItems: 'center' },
    cancelTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },

    sendBtn: { backgroundColor: '#2563eb', borderRadius: 14, padding: 18, alignItems: 'center', marginBottom: 12 },
    sendBtnDim: { opacity: 0.45 },
    sendTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },

    viewLogBtn: {
        backgroundColor: '#f8fafc', borderRadius: 12, padding: 14,
        alignItems: 'center', marginBottom: 14,
        borderWidth: 1.5, borderColor: '#cbd5e1',
    },
    viewLogTxt: { fontSize: 14, color: '#334155', fontWeight: '600' },

    logBox: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
    logLabel: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
    logLine: { fontSize: 11, color: '#475569', fontFamily: 'monospace', lineHeight: 18 },

    // Done screen

    doneCard: { backgroundColor: '#f0fdf4', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#bbf7d0' },
    doneTxt: { fontSize: 16, fontWeight: '700', color: '#15803d', marginBottom: 14, textAlign: 'center' },
    doneBtn: { backgroundColor: '#16a34a', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
    doneBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
    charCount: { fontSize: 11, color: '#94a3b8', textAlign: 'right', marginTop: 4, marginBottom: 2 },

    deviceBar: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 10,
        borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12,
    },
    deviceLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    connDot2: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    connText2: { fontSize: 13, color: '#0f172a', fontWeight: '600', flex: 1 },
    connStatus: { fontSize: 12, color: '#16a34a', fontWeight: '600' },
    reconnectBtn: { backgroundColor: '#16a34a', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    reconnectTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
    cancelBtn: { marginTop: 10, backgroundColor: '#dc2626', borderRadius: 10, padding: 10, alignItems: 'center' },
    cancelTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
});