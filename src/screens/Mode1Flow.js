// src/screens/Mode1Flow.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    SafeAreaView, ScrollView, TextInput, Image, Alert, Platform,
} from 'react-native';
import RNFS from 'react-native-fs';
import ImageCropPicker from 'react-native-image-crop-picker';
import { captureRef } from 'react-native-view-shot';
import { Buffer } from 'buffer';
import { COLORS, UI } from '../theme/ui';
import {
    sendCombined,
    disconnectDevice,
    getManager,
    PROFILE_PACKETS,
    GREETING_PACKETS,
    sleep,
} from '../utils/ble';

import {
    convertProfileBuffer,
    PROFILE_W, PROFILE_H, PROFILE_RGB565_BYTES,
    GREETING_W, GREETING_H, GREETING_MONO_BYTES,
} from '../utils/ImageConverter';

import GreetingRenderer from '../utils/GreetingRenderer';

const STATUS = {
    IDLE: 'idle',
    CONVERTING: 'converting',
    SENDING: 'sending',
    DONE: 'done',
    ERROR: 'error',
};

const UPDATE_OPTIONS = [
    { type: 'greeting', label: 'Greeting only' },
    { type: 'profile', label: 'Profile only' },
    { type: 'both', label: 'Greeting & Profile' },
];

export default function Mode1Flow({ navigation, route }) {
    const { device, deviceName, phase } = route.params;
    const deviceId = device?.id || 'Unknown ID';
    const connectedDeviceRef = useRef(device);

    const [updateType, setUpdateType] = useState('both');
    const [imageUri, setImageUri] = useState(null);
    const [text, setText] = useState('');
    const [status, setStatus] = useState(STATUS.IDLE);
    const [progress, setProgress] = useState({ sent: 0, total: 0 });
    const [currentPage, setCurrentPage] = useState('');
    const [isConnected, setIsConnected] = useState(true);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [hasLogs, setHasLogs] = useState(false);

    const cancelRef = useRef(false);
    const isConnectedRef = useRef(true);
    const logBufferRef = useRef([]);
    const packetLogsRef = useRef([]);
    const greetingRef = useRef(null);

    const addLog = useCallback((msg) => {
        logBufferRef.current.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    }, []);

    useEffect(() => {
        const mgr = getManager();
        const sub = mgr.onDeviceDisconnected(device.id, () => {
            setIsConnected(false);
            isConnectedRef.current = false;
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

    const disconnect = async () => {
        try {
            await disconnectDevice(connectedDeviceRef.current || device);
            setIsConnected(false);
            isConnectedRef.current = false;
            addLog('⚠️ Device disconnected');
        } catch (err) {
            addLog('❌ Disconnect failed: ' + err.message);
        }
    };

    const reconnect = async () => {
        setIsReconnecting(true);
        addLog('Connecting...');
        try {
            try { await connectedDeviceRef.current?.cancelConnection(); } catch (_) { }
            await sleep(300);

            let reconnected = await getManager().connectToDevice(device.id, { timeout: 10000 });
            reconnected = await reconnected.discoverAllServicesAndCharacteristics();

            try {
                if (reconnected.requestMTU) await reconnected.requestMTU(247);
            } catch (_) { }

            connectedDeviceRef.current = reconnected;
            setIsConnected(true);
            isConnectedRef.current = true;
            addLog('Connected!');
        } catch (err) {
            addLog('Connect failed: ' + err.message);
        } finally {
            setIsReconnecting(false);
        }
    };

    const openGallery = async () => {
        try {
            const img = await ImageCropPicker.openPicker({
                width: PROFILE_W,
                height: PROFILE_H,
                cropping: true,
                cropperToolbarTitle: `Crop to ${PROFILE_W}×${PROFILE_H}`,
                cropperActiveWidgetColor: '#16a34a',
                cropperToolbarColor: '#ffffff',
                cropperStatusBarColor: '#f8fafc',
                cropperToolbarWidgetColor: '#0f172a',
                compressImageQuality: 1,
            });
            setImageUri(img.path);
        } catch (e) {
            if (e.code !== 'E_PICKER_CANCELLED') Alert.alert('Error', e.message);
        }
    };

    const openCamera = () => {
        navigation.navigate('Camera', {
            device,
            deviceName,
            phase,
            updateType,
            onImageCaptured: (uri) => setImageUri(uri),
        });
    };

    const validateBeforeSend = () => {
        if (updateType !== 'greeting' && !imageUri) {
            Alert.alert('Missing profile', 'Please select or capture a profile image.');
            return false;
        }
        if (updateType !== 'profile' && !text.trim()) {
            Alert.alert('Missing greeting', 'Please enter greeting text.');
            return false;
        }
        return true;
    };

    const buildGreetingBytes = async () => {
        const uri = await captureRef(greetingRef, {
            format: 'jpg',
            quality: 1.0,
            result: 'tmpfile',
            pixelRatio: 1,
            width: GREETING_W,
            height: GREETING_H,
        });

        const base64 = await RNFS.readFile(uri, 'base64');
        const binary = atob(base64);
        const buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            buffer[i] = binary.charCodeAt(i);
        }

        const jpeg = require('jpeg-js');
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
            console.log(`[Greeting] 缩放 ${srcW}×${srcH} → ${dstW}×${dstH}`);
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
            const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
            monoPixels[i] = brightness < 127 ? 1 : 0;
        }

        const packed = [];
        for (let y = 0; y < dstH; y++) {
            let cur = 0, bits = 0;
            for (let x = 0; x < dstW; x++) {
                cur = (cur << 1) | monoPixels[y * dstW + x];
                bits++;
                if (bits === 8) { packed.push(cur); cur = 0; bits = 0; }
            }
            if (bits > 0) { cur <<= (8 - bits); packed.push(cur); }
        }

        return new Uint8Array(packed);
    };

    const send = async () => {
        if (!validateBeforeSend()) return;

        const activeDevice = connectedDeviceRef.current || device;
        connectedDeviceRef.current = activeDevice;
        const currentId = activeDevice.id || device.id;

        try {
            const stillConnected = await getManager().isDeviceConnected(currentId);
            if (!stillConnected) {
                setIsConnected(false);
                isConnectedRef.current = false;
                Alert.alert('Disconnected', 'Device is not connected. Please reconnect.');
                return;
            }
        } catch (_) { }

        cancelRef.current = false;
        packetLogsRef.current = [];
        logBufferRef.current = [];
        setHasLogs(false);
        setProgress({ sent: 0, total: 0 });
        setCurrentPage('');
        setStatus(STATUS.CONVERTING);

        let heartbeatTimer = null;
        if (Platform.OS === 'ios') {
            heartbeatTimer = setInterval(async () => {
                try {
                    await getManager().isDeviceConnected(currentId);
                } catch (_) { }
            }, 1000);
        }

        try {
            let profileBytes = null;
            let greetingBytes = null;

            if (updateType === 'greeting') {
                profileBytes = new Uint8Array(PROFILE_RGB565_BYTES);
                addLog('Profile skipped');
            } else {
                addLog('Reading profile image…');
                const b64 = await RNFS.readFile(imageUri, 'base64');
                const buf = Buffer.from(b64, 'base64');
                profileBytes = await convertProfileBuffer(buf);
                addLog(`Profile converted: ${profileBytes.length} bytes`);
            }

            if (updateType === 'profile') {
                greetingBytes = new Uint8Array(GREETING_MONO_BYTES);
                addLog('Greeting skipped');
            } else {
                greetingBytes = await buildGreetingBytes();
                addLog(`Greeting converted: ${greetingBytes.length} bytes`);
            }

            setStatus(STATUS.SENDING);

            await sendCombined(
                activeDevice,
                updateType === 'greeting' ? null : profileBytes,
                updateType === 'profile' ? null : greetingBytes,
                (sent, total, counter, packet, errorMsg) => {
                    if (errorMsg) addLog(errorMsg);

                    if (packet && counter != null) {
                        const isGreeting = counter >= 896;
                        const section = isGreeting ? 'Greeting' : 'Profile';
                        setCurrentPage(section);

                        if (isGreeting) {
                            const greetingSent = sent - (updateType === 'both' ? PROFILE_PACKETS : 0);
                            setProgress({ sent: greetingSent, total: GREETING_PACKETS });
                        } else {
                            setProgress({ sent, total: PROFILE_PACKETS });
                        }

                        const hex = Array.from(packet.slice(0, 16))
                            .map(b => b.toString(16).padStart(2, '0').toUpperCase())
                            .join(' ');

                        packetLogsRef.current.push(
                            `${section} CTR:${counter.toString(16).toUpperCase().padStart(4, '0')} | ${hex}`
                        );
                    }

                    if (sent != null && total != null) {
                        if (sent === 1) setHasLogs(true);
                        if (sent % 20 === 0 || sent === total) {
                            addLog(`${sent}/${total} packets sent...`);
                        }
                    }
                },
                updateType,
                cancelRef
            );

            if (cancelRef.current) {
                addLog('Transfer cancelled');
                setStatus(STATUS.IDLE);
                return;
            }

            addLog('Transfer complete!');
            setStatus(STATUS.DONE);

        } catch (err) {
            if (cancelRef.current) {
                addLog('Transfer cancelled');
                setStatus(STATUS.IDLE);
            } else {
                addLog('Send error: ' + err.message);
                setStatus(STATUS.ERROR);
            }
        } finally {
            clearInterval(heartbeatTimer);
        }
    };

    const busy = status === STATUS.CONVERTING || status === STATUS.SENDING;
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    const hasChinese = /[\u4E00-\u9FFF]/.test(text);
    const effectiveMax = hasArabic ? 130 : hasChinese ? 50 : 135;
    const ready =
        (updateType === 'greeting' || !!imageUri) &&
        (updateType === 'profile' || !!text.trim());

    return (
        <SafeAreaView style={s.container}>
            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

                <View style={s.header}>
                    <View style={s.headerTop}>
                        <TouchableOpacity onPress={() => navigation.goBack()} disabled={busy}>
                            <Text style={[s.back, busy && s.dimText]}>‹ Back</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => navigation.navigate('PhaseSelect', { device, deviceName })}
                            disabled={busy}
                        >
                            <Text style={{ fontSize: 22, opacity: busy ? 0.4 : 1 }}>🏠</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={s.deviceBar}>
                        <View style={s.deviceLeft}>
                            <View style={[s.connDot, { backgroundColor: isConnected ? '#22c55e' : '#ef4444' }]} />
                            <View style={{ flex: 1, flexShrink: 1 }}>
                                <Text style={s.connText} numberOfLines={1}>{deviceName}</Text>
                                <Text style={s.connId} numberOfLines={1}>{deviceId}</Text>
                            </View>
                        </View>
                        {isConnected ? (
                            <Text style={s.connStatus}>Connected</Text>
                        ) : (
                            <TouchableOpacity
                                onPress={reconnect}
                                disabled={isReconnecting || busy}
                                style={[s.reconnectBtn, (isReconnecting || busy) && { opacity: 0.5 }]}
                            >
                                <Text style={s.reconnectTxt}>
                                    {isReconnecting ? 'Connecting...' : 'Reconnect'}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <Text style={s.title}>Normal Mode</Text>
                </View>

                <View style={s.card}>
                    <Text style={s.cardTitle}>Select update type</Text>
                    <View style={s.optionRow}>
                        {UPDATE_OPTIONS.map(opt => (
                            <TouchableOpacity
                                key={opt.type}
                                style={[
                                    s.optionBtn,
                                    updateType === opt.type && s.optionBtnActive,
                                ]}
                                onPress={() => setUpdateType(opt.type)}
                                disabled={busy}
                            >
                                <Text style={[
                                    s.optionTxt,
                                    updateType === opt.type && s.optionTxtActive,
                                ]}>
                                    {opt.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {updateType !== 'greeting' && (
                    <View style={s.card}>
                        <Text style={s.cardTitle}>Profile image</Text>
                        {imageUri ? (
                            <View style={{ alignItems: 'center' }}>
                                <Image source={{ uri: imageUri }} style={s.profileImg} resizeMode="cover" />
                                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                                    <TouchableOpacity
                                        style={[s.smallBtn, { flex: 1, alignItems: 'center' }]}
                                        onPress={openCamera}
                                        disabled={busy}
                                    >
                                        <Text style={s.smallBtnTxt}>Camera</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[s.smallBtn, { flex: 1, alignItems: 'center' }]}
                                        onPress={openGallery}
                                        disabled={busy}
                                    >
                                        <Text style={s.smallBtnTxt}>Gallery</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            <View style={s.imgBtns}>
                                <TouchableOpacity style={s.bigBtn} onPress={openCamera} disabled={busy}>
                                    <Text style={s.bigBtnTxt}>Camera</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={s.bigBtn} onPress={openGallery} disabled={busy}>
                                    <Text style={s.bigBtnTxt}>Gallery</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                )}

                {updateType !== 'profile' && (
                    <View style={s.card}>
                        <Text style={s.cardTitle}>Greeting text</Text>
                        <TextInput
                            style={s.input}
                            multiline
                            maxLength={effectiveMax}
                            value={text}
                            onChangeText={setText}
                            placeholder="e.g. Welcome! 欢迎 مرحبا"
                            placeholderTextColor="#94a3b8"
                            editable={!busy}
                        />
                        <Text style={s.charCount}>{text.length} / {effectiveMax}</Text>

                        {!!text.trim() && (
                            <View style={{ alignItems: 'center', marginTop: 12 }}>
                                <Text style={s.previewLabel}>Preview</Text>
                                <GreetingRenderer text={text.trim()} />
                            </View>
                        )}
                    </View>
                )}

                <View style={s.card}>
                    <Text style={s.cardTitle}>Send summary</Text>
                    <InfoRow
                        k="Profile packets"
                        v={updateType === 'greeting' ? '0' : String(PROFILE_PACKETS)}
                    />
                    <InfoRow
                        k="Greeting packets"
                        v={updateType === 'profile' ? '0' : String(GREETING_PACKETS)}
                    />
                    <InfoRow
                        k="Total packets"
                        v={String(
                            (updateType === 'greeting' ? 0 : PROFILE_PACKETS) +
                            (updateType === 'profile' ? 0 : GREETING_PACKETS)
                        )}
                    />
                </View>

                {status !== STATUS.DONE && (
                    <TouchableOpacity
                        style={[s.sendBtn, (!ready || busy) && s.btnDim]}
                        onPress={send}
                        disabled={!ready || busy}
                    >
                        <Text style={s.sendTxt}>
                            {status === STATUS.CONVERTING ? 'Converting…' :
                                status === STATUS.SENDING ? 'Sending…' :
                                    'Send via BLE'}
                        </Text>
                    </TouchableOpacity>
                )}

                {status === STATUS.SENDING && (
                    <TouchableOpacity
                        style={[s.sendBtn, { backgroundColor: '#dc2626', marginTop: -8 }]}
                        onPress={() => { cancelRef.current = true; }}
                    >
                        <Text style={s.sendTxt}>Cancel</Text>
                    </TouchableOpacity>
                )}

                {(status === STATUS.SENDING || status === STATUS.DONE) && (
                    <View style={s.progCard}>
                        <Text style={s.progressPage}>
                            Sending: <Text style={{ fontWeight: '700', color: '#2563eb' }}>{currentPage}</Text>
                        </Text>
                        <View style={s.progTrack}>
                            <View
                                style={[
                                    s.progFill,
                                    { width: progress.total ? `${Math.round(progress.sent / progress.total * 100)}%` : '0%' }
                                ]}
                            />
                        </View>
                        <Text style={s.progTxt}>
                            {progress.sent} / {progress.total} packets
                            {progress.total > 0 ? ` (${Math.round(progress.sent / progress.total * 100)}%)` : ''}
                        </Text>
                    </View>
                )}

                {status === STATUS.DONE && (
                    <View style={s.doneCard}>
                        <Text style={s.doneTxt}>Transfer complete!</Text>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity
                                onPress={() => {
                                    setStatus(STATUS.IDLE);
                                    setProgress({ sent: 0, total: 0 });
                                    setCurrentPage('');
                                    logBufferRef.current = [];
                                    packetLogsRef.current = [];
                                    setHasLogs(false);
                                }}
                                style={s.doneBtn}
                            >
                                <Text style={s.doneBtnTxt}>Send Again</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => navigation.popToTop()}
                                style={[s.doneBtn, { backgroundColor: '#64748b' }]}
                            >
                                <Text style={s.doneBtnTxt}>Start over</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {hasLogs && (
                    <TouchableOpacity
                        onPress={() => navigation.navigate('LogViewer', { logs: packetLogsRef.current })}
                        style={s.viewLogBtn}
                    >
                        <Text style={s.viewLogTxt}>View Log ({packetLogsRef.current.length} packets)</Text>
                    </TouchableOpacity>
                )}

                <View style={[s.offscreen, { width: GREETING_W, height: GREETING_H }]}>
                    <GreetingRenderer text={text.trim() || ' '} viewRef={greetingRef} />
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

function InfoRow({ k, v }) {
    return (
        <View style={s.infoRow}>
            <Text style={s.infoKey}>{k}</Text>
            <Text style={s.infoVal}>{v}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    container: UI.screen,
    scroll: UI.scroll,

    header: { marginBottom: 20 },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        paddingTop: 8,
        minHeight: 44,
    },
    back: {
        color: COLORS.primary,
        fontSize: 17,
        fontWeight: '600',
    },
    dimText: { opacity: 0.45 },

    deviceBar: UI.deviceBar,
    deviceLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 12,
    },
    connDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    connText: {
        fontSize: 13,
        color: COLORS.text,
        fontWeight: '600',
    },
    connId: {
        fontSize: 10,
        color: COLORS.muted,
        marginTop: 1,
    },
    discText: {
        fontSize: 12,
        color: COLORS.danger,
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

    title: {
        fontSize: 26,
        fontWeight: '700',
        color: COLORS.text,
        marginBottom: 2,
    },
    subtitle: {
        fontSize: 13,
        color: COLORS.subtext,
    },

    card: UI.card,
    cardTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.text,
        marginBottom: 12,
    },

    optionRow: { gap: 10 },
    optionBtn: {
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        backgroundColor: COLORS.bg,
    },
    optionBtnActive: {
        backgroundColor: COLORS.primarySoft,
        borderColor: COLORS.primaryBorder,
    },
    optionTxt: {
        color: '#334155',
        fontSize: 14,
        fontWeight: '600',
    },
    optionTxtActive: {
        color: '#1d4ed8',
    },

    imgBtns: {
        flexDirection: 'row',
        gap: 10,
    },
    bigBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        backgroundColor: COLORS.grayBtn,
        borderColor: COLORS.grayBtnBorder,
    },
    bigBtnTxt: {
        fontSize: 14,
        fontWeight: '700',
        color: COLORS.text,
    },

    profileImg: {
        width: 128,
        height: 128,
        borderRadius: 10,
        marginBottom: 10,
    },
    smallBtn: {
        backgroundColor: COLORS.grayBtn,
        borderRadius: 10,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: COLORS.grayBtnBorder,
    },
    smallBtnTxt: {
        fontSize: 13,
        color: COLORS.grayText,
        fontWeight: '600',
    },

    input: {
        backgroundColor: COLORS.bg,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: 12,
        fontSize: 14,
        color: COLORS.text,
        minHeight: 100,
        textAlignVertical: 'top',
    },
    charCount: {
        fontSize: 11,
        color: COLORS.muted,
        textAlign: 'right',
        marginTop: 4,
    },
    previewLabel: {
        fontSize: 11,
        color: COLORS.muted,
        marginBottom: 6,
        textTransform: 'uppercase',
    },

    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 4,
    },
    infoKey: {
        fontSize: 12,
        color: COLORS.subtext,
    },
    infoVal: {
        fontSize: 12,
        color: COLORS.text,
        fontWeight: '600',
    },

    sendBtn: {
        ...UI.primaryBtn,
        marginBottom: 16,
    },
    sendTxt: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
    },
    btnDim: { opacity: 0.5 },

    progCard: UI.progressCard,
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

    doneCard: UI.doneCard,
    doneTxt: {
        fontSize: 18,
        fontWeight: '700',
        color: '#15803d',
        marginBottom: 14,
    },
    doneBtn: {
        backgroundColor: COLORS.primary,
        paddingHorizontal: 28,
        paddingVertical: 12,
        borderRadius: 12,
    },
    doneBtnTxt: {
        color: '#ffffff',
        fontWeight: '700',
        fontSize: 15,
    },

    viewLogBtn: {
        backgroundColor: COLORS.bg,
        borderRadius: 12,
        padding: 14,
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.grayBtnBorder,
    },
    viewLogTxt: {
        fontSize: 14,
        color: '#334155',
        fontWeight: '600',
    },

    logLabel: {
        fontSize: 11,
        color: COLORS.subtext,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 8,
    },
    logBox: {
        ...UI.logBox,
        minHeight: 80,
    },
    logLine: {
        fontSize: 11,
        color: COLORS.grayText,
        fontFamily: 'monospace',
        lineHeight: 18,
    },
    logEmpty: {
        fontSize: 12,
        color: COLORS.muted,
        fontStyle: 'italic',
    },

    copyBtn: {
        backgroundColor: '#e2e8f0',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 8,
    },
    copyBtnTxt: {
        fontSize: 11,
        color: COLORS.grayText,
        fontWeight: '600',
    },

    offscreen: {
        position: 'absolute',
        top: -9999,
        left: -9999,
        opacity: 0,
    },
    connStatus: {
        fontSize: 12,
        color: COLORS.success,
        fontWeight: '600',
    },
});