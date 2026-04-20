// src/screens/CropSend.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, Image, TouchableOpacity,
    StyleSheet, SafeAreaView, ScrollView,
} from 'react-native';
import RNFS from 'react-native-fs';
import { Buffer } from 'buffer';
import { unstable_batchedUpdates } from 'react-native';
import {
    sendCombined,
    disconnectDevice,
    getManager,
    PROFILE_PACKETS,
    PROFILE_LOGIC_PACKETS,
    GREETING_PACKETS,
    GREETING_START_COUNTER,
    PROFILE_BYTES_TOTAL,
    GREETING_BYTES_TOTAL,
} from '../utils/ble';

import {
    convertProfileBuffer,
    hexPreview,
    PROFILE_W, PROFILE_H, PROFILE_RGB565_BYTES,
    GREETING_W, GREETING_H, GREETING_MONO_BYTES,
} from '../utils/ImageConverter';

const STATUS = {
    IDLE: 'idle',
    CONVERTING: 'converting',
    SENDING: 'sending',
    DONE: 'done',
    ERROR: 'error',
};

import { Clipboard } from 'react-native';

const ProgressBar = React.memo(({ sent, total, page, updateType }) => {
    const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
    return (
        <View style={s.progCard}>
            <Text style={s.progressPage}>
                Sending: <Text style={{ fontWeight: '700', color: '#2563eb' }}>{page}</Text>
            </Text>
            <View style={s.progTrack}>
                <View style={[s.progFill, { width: `${pct}%` }]} />
            </View>
            <Text style={s.progTxt}>
                {sent} / {total} packets{total > 0 ? ` (${pct}%)` : ''}
            </Text>
        </View>
    );
});

export default function CropSend({ navigation, route }) {
    const {
        device,
        deviceName,
        phase,
        imageUri,
        greetingText = '',
        greetingBytes: greetingBytesArray = [],
        updateType = 'both'
    } = route.params;

    const [status, setStatus] = useState(STATUS.IDLE);
    const [profileBytes, setProfileBytes] = useState(null);
    const [greetingBytes, setGreetingBytes] = useState(null);
    const [progress, setProgress] = useState({ sent: 0, total: 0 });
    const [log, setLog] = useState([]);
    const [hexText, setHexText] = useState('');
    const [isConnected, setIsConnected] = useState(true); // ← 加这行
    const cancelRef = useRef(false);
    const isConnectedRef = useRef(true);        // ← 加
    const [isReconnecting, setIsReconnecting] = useState(false); // ← 加
    const packetLogsRef = useRef([]);
    const logBufferRef = useRef([]);
    const logScrollRef = useRef(null);
    const profileBytesRef = useRef(null);   // ← 加
    const greetingBytesRef = useRef(null);  // ← 加
    const [hasLogs, setHasLogs] = useState(false);
    const addLog = useCallback((msg) => {
        logBufferRef.current.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    }, []);

    const flushLog = useCallback(() => {
        setLog([...logBufferRef.current]);
        setTimeout(() => logScrollRef.current?.scrollToEnd({ animated: false }), 50);
    }, []);

    const convert = useCallback(async () => {
        setStatus(STATUS.CONVERTING);
        try {
            // ── Profile ──────────────────────────────────────────
            if (updateType === 'greeting') {
                const p = new Uint8Array(PROFILE_RGB565_BYTES);
                profileBytesRef.current = p;  
                setProfileBytes(p);
                addLog(`ℹ️ Profile skipped (greeting-only) — zero-filled`);
            } else {
                addLog('Reading profile image…');
                const b64 = await RNFS.readFile(imageUri, 'base64');
                const buf = Buffer.from(b64, 'base64');
                addLog(`File size: ${buf.length} bytes`);
                const pBytes = await convertProfileBuffer(buf);
                profileBytesRef.current = pBytes;  
                setProfileBytes(pBytes);
                addLog(`✅ Profile converted: ${pBytes.length} bytes (${PROFILE_W}×${PROFILE_H} RGB565)`);
            }

            // ── Greeting ─────────────────────────────────────────
            if (updateType === 'profile') {
                const g = new Uint8Array(GREETING_MONO_BYTES);
                greetingBytesRef.current = g;       // ← 加
                setGreetingBytes(g);
                addLog(`ℹ️ Greeting skipped (profile-only) — zero-filled`);
            } else {
                const gBytes = new Uint8Array(greetingBytesArray);
                greetingBytesRef.current = gBytes;  // ← 加
                setGreetingBytes(gBytes);
                addLog(`✅ Greeting ready: ${gBytes.length} bytes (${GREETING_W}×${GREETING_H} mono1)`);
                const nonZero = gBytes.filter(b => b !== 0).length;
                addLog(`Non-zero bytes: ${nonZero} / ${gBytes.length}`);
            }

            addLog(`📐 Layout: Profile counter 000–255 | Greeting counter 896–911`);
            setStatus(STATUS.IDLE);
        } catch (err) {
            profileBytesRef.current = null;   
            greetingBytesRef.current = null;  
            addLog('ERROR: ' + err.message);
            setStatus(STATUS.ERROR);
        } finally {
            flushLog();
        }
    }, [imageUri, greetingBytesArray, updateType, addLog, flushLog]);
    useEffect(() => { convert(); }, [convert]);

    useEffect(() => {
        const mgr = getManager();
        const sub = mgr.onDeviceDisconnected(device.id, () => {
            setIsConnected(false);
            isConnectedRef.current = false; // ← 加
            addLog('⚠️ Device disconnected');
            flushLog();
        });
        return () => sub.remove();
    }, [device.id]);

    const send = useCallback(async () => {
        cancelRef.current = false;
        const pBytes = profileBytesRef.current;   // ← 从 ref 取
        const gBytes = greetingBytesRef.current;  // ← 从 ref 取

        if (!pBytes && !gBytes) return;

        logBufferRef.current = [];
        unstable_batchedUpdates(() => {
            setLog([]);
            setStatus(STATUS.SENDING);
            setHasLogs(false);
        });
        addLog('Sending START command…');
        flushLog();

        try {
            const packetLogs = [];

            const finalProfileBytes = updateType === 'greeting' ? null : pBytes;
            const finalGreetingBytes = updateType === 'profile' ? null : gBytes;

            await sendCombined(device, finalProfileBytes, finalGreetingBytes,
                (sent, total, counter, packet, errorMsg) => {
                    if (cancelRef.current) throw new Error('Cancelled by user');
                    const section = counter >= GREETING_START_COUNTER ? '👋' : '🖼️ ';

                    if (errorMsg) addLog(errorMsg);

                    if (!packet) return;

                    const hex = Array.from(packet.slice(0, 16))
                        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
                        .join(' ');
                    packetLogs.push(`${section} CTR:${counter.toString(16).toUpperCase().padStart(4, '0')} | ${hex}`);
                    packetLogsRef.current = packetLogs;

                    unstable_batchedUpdates(() => {
                        setProgress({ sent, total });
                        if (sent === 1) setHasLogs(true);
                    });

                    if (sent % 20 === 0 || sent === total) {
                        addLog(`${section} ${sent}/${total} packets sent...`);
                        flushLog(); // 只在这里 flush
                    }
                }, updateType
            );

            addLog('✅ Transfer complete!');
            setStatus(STATUS.DONE);

        } catch (err) {
            addLog('Send error: ' + err.message);
            setStatus(STATUS.ERROR);
        } finally {
            flushLog();
        }
    }, [device, updateType, addLog, flushLog]); // ← profileBytes/greetingBytes 从 deps 移除
    const disconnect = async () => {
        await disconnectDevice(device);
        navigation.popToTop();
    };

    const reconnect = async () => {
        setIsReconnecting(true);
        addLog('🔄 Connecting...');
        flushLog();
        try {
            const mgr = getManager();
            let reconnected = await mgr.connectToDevice(device.id, { timeout: 10000 });
            reconnected = await reconnected.discoverAllServicesAndCharacteristics();
            try {
                if (Platform.OS === 'android' && reconnected.requestMTU) {
                    await reconnected.requestMTU(247);
                }
            } catch (_) { }
            setIsConnected(true);
            isConnectedRef.current = true; // ← 同步 ref
            addLog('✅ Connected!');
            flushLog();
        } catch (err) {
            addLog('❌ Connect failed: ' + err.message);
            flushLog();
        } finally {
            setIsReconnecting(false);
        }
    };

    const handleResend = async () => {
        if (!isConnectedRef.current) {
            await reconnect();
            if (!isConnectedRef.current) return; // 重连失败就不跳
        }
        navigation.navigate('UpdateTypeSelect', { device, deviceName, phase });
    };

    const pct = progress.total > 0 ? Math.round((progress.sent / progress.total) * 100) : 0;
    const busy = status === STATUS.SENDING || status === STATUS.CONVERTING;
    const ready = profileBytes && greetingBytes;

    
    return (
        <SafeAreaView style={s.container}>
            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

                {/* Header */}
                <View style={s.header}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <TouchableOpacity onPress={() => navigation.goBack()} disabled={busy}>
                            <Text style={[s.back, busy && s.dimText]}>‹ Back</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => navigation.navigate('PhaseSelect', { device, deviceName })} disabled={busy}>
                            <Text style={{ fontSize: 22, opacity: busy ? 0.4 : 1 }}>🏠</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={s.deviceBar}>
                        <View style={s.deviceLeft}>
                            <View style={[s.connDot, { backgroundColor: isConnected ? '#22c55e' : '#ef4444' }]} />
                            <View style={{ flexShrink: 1 }}>
                                <Text style={s.connText} numberOfLines={1}>{deviceName}</Text>
                                {device?.id && (
                                    <Text style={s.connId} numberOfLines={1}>{device.id}</Text>
                                )}
                            </View>
                        </View>
                        {isConnected ? (
                            <TouchableOpacity onPress={disconnect} disabled={busy}>
                                <Text style={[s.discText, busy && s.dimText]}>Disconnect</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                onPress={reconnect}
                                disabled={isReconnecting || busy}
                                style={{ backgroundColor: '#16a34a', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, opacity: isReconnecting ? 0.5 : 1 }}
                            >
                                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                                    {isReconnecting ? 'Connecting...' : 'Connect'}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Preview card */}
                <View style={s.previewCard}>
                    <Text style={s.cardTitle}>Preview & send</Text>

                    {/* Profile image */}
                    {updateType !== 'greeting' && (
                        <View style={s.previewSection}>
                            <Text style={s.previewSectionLabel}>🖼️  Profile · {PROFILE_W}×{PROFILE_H} RGB565</Text>
                            <Image
                                source={{ uri: imageUri }}
                                style={s.profileImg}
                                resizeMode="cover"
                            />
                        </View>
                    )}

                    {/* Greeting text */}
                    {updateType !== 'profile' && (
                        <View style={s.previewSection}>
                            <Text style={s.previewSectionLabel}>👋 Greeting · {GREETING_W}×{GREETING_H} mono1</Text>
                            <View style={s.lcdPreview}>
                                <Text style={[
                                    s.lcdText,
                                    /[\u0600-\u06FF]/.test(greetingText) && {
                                        textAlign: 'right',
                                        writingDirection: 'rtl',
                                    }
                                ]}>{greetingText}</Text>
                            </View>
                        </View>
                    )}

                    {/* Info rows */}
                    <View style={s.infoGrid}>
                        <InfoRow k="Profile bytes" v={profileBytes ? profileBytes.length.toLocaleString() : '—'} />
                        <InfoRow k="Greeting bytes" v={greetingBytes ? greetingBytes.length.toLocaleString() : '—'} />
                        <InfoRow k="Total packets" v={String(
                            (updateType === 'greeting' ? 0 : PROFILE_PACKETS) +
                            (updateType === 'profile' ? 0 : GREETING_PACKETS)
                        )} />
                        <InfoRow k="Phase" v={phase === 'single' ? 'Single' : '3-Phase'} />
                    </View>

                    {/* Status badge */}
                    <View style={[
                        s.statusBadge,
                        status === STATUS.DONE && s.badgeDone,
                        status === STATUS.ERROR && s.badgeErr,
                        status === STATUS.SENDING && s.badgeSending,
                        status === STATUS.CONVERTING && s.badgeConverting,
                    ]}>
                        <Text style={s.statusText}>{status.toUpperCase()}</Text>
                    </View>
                </View>

                {/* Send button */}
                {status !== STATUS.DONE && (
                    <TouchableOpacity
                        style={[s.sendBtn, (busy || !ready) && s.btnDim]}
                        onPress={send}
                        disabled={busy || !ready}
                    >
                        <Text style={s.sendTxt}>
                            {status === STATUS.CONVERTING ? 'Converting…'
                                : status === STATUS.SENDING ? 'Sending…'
                                    : 'Send via BLE'}
                        </Text>
                    </TouchableOpacity>
                )}

                {/* ← 加这个 Cancel 按钮 */}
                {status === STATUS.SENDING && (
                    <TouchableOpacity
                        style={[s.sendBtn, { backgroundColor: '#dc2626', marginTop: -8 }]}
                        onPress={() => { cancelRef.current = true; }}
                    >
                        <Text style={s.sendTxt}>Cancel</Text>
                    </TouchableOpacity>
                )}

                {/* Progress bar (two-colour: blue=profile, orange=greeting) */}
                {(status === STATUS.SENDING || status === STATUS.DONE) && (
                    <ProgressBar
                        sent={progress.sent}
                        total={progress.total}
                        page={status === STATUS.SENDING
                            ? (updateType === 'greeting' ? 'Greeting' : updateType === 'profile' ? 'Profile' : progress.sent >= PROFILE_PACKETS ? 'Greeting' : 'Profile')
                            : ''}
                        updateType={updateType}
                    />
                )}

                {/* Done card */}
                {status === STATUS.DONE && (
                    <View style={s.doneCard}>
                        <Text style={s.doneTxt}>✅ Transfer complete!</Text>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            {/* Resend button */}
                            <TouchableOpacity onPress={handleResend} style={s.doneBtn}>
                                <Text style={s.doneBtnTxt}>🔄 Resend</Text>
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

                {/* View Log — always visible once packets are sent */}
                {hasLogs && (
                    <TouchableOpacity
                        onPress={() => navigation.navigate('LogViewer', { logs: packetLogsRef.current })}
                        style={[s.doneBtn, { backgroundColor: '#2196F3', marginBottom: 16, alignItems: 'center' }]}
                    >
                        <Text style={s.doneBtnTxt}>View Log ({packetLogsRef.current.length} packets)</Text>
                    </TouchableOpacity>
                )}

                {/* Log */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={s.logLabel}>Log ({log.length} lines)</Text>
                    {log.length > 0 && (
                        <TouchableOpacity
                            onPress={() => Clipboard.setString(log.join('\n'))}
                            style={{ backgroundColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 }}
                        >
                            <Text style={{ fontSize: 11, color: '#475569', fontWeight: '600' }}>Copy</Text>
                        </TouchableOpacity>
                    )}
                </View>
                <View style={s.logBox}>
                    <ScrollView
                        ref={logScrollRef}
                        style={{ maxHeight: 400 }}
                        nestedScrollEnabled
                        onContentSizeChange={() => logScrollRef.current?.scrollToEnd({ animated: false })}
                    >
                        {log.length === 0
                            ? <Text style={s.logEmpty}>Waiting…</Text>
                            : log.map((l, i) => <Text key={i} style={s.logLine}>{l}</Text>)
                        }
                    </ScrollView>
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
    container: { flex: 1, backgroundColor: '#f8fafc' },
    scroll: { padding: 20, paddingBottom: 48 },
    header: { marginBottom: 20 },
    back: { color: '#16a34a', fontSize: 17, marginBottom: 14, fontWeight: '600' },
    dimText: { opacity: 0.45 },
    deviceBar: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#ffffff', paddingHorizontal: 14, paddingVertical: 12,
        borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0',
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    deviceLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
    connDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e', marginRight: 8 },
    connText: { fontSize: 13, color: '#0f172a', fontWeight: '600', flexShrink: 1 },
    connId: { fontSize: 10, color: '#94a3b8', fontFamily: 'monospace', marginTop: 1, flexShrink: 1 },
    discText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },

    previewCard: {
        backgroundColor: '#ffffff', borderRadius: 18, padding: 16,
        borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16,
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    cardTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 14 },
    previewSection: { marginBottom: 14 },
    previewSectionLabel: { fontSize: 12, color: '#64748b', fontWeight: '600', marginBottom: 8 },
    profileImg: { width: 128 * 2, height: 128 * 2, borderRadius: 10, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#dbe3ee' },
    lcdPreview: {
        backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#cbd5e1',
        borderRadius: 8, width: 128, height: 128,
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    lcdText: { color: '#000000', fontSize: 13, textAlign: 'center', lineHeight: 20, fontFamily: 'monospace', letterSpacing: 0.3 },
    infoGrid: { gap: 4, marginTop: 8 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
    infoKey: { fontSize: 12, color: '#64748b' },
    infoVal: { fontSize: 12, color: '#0f172a', fontWeight: '600' },

    statusBadge: { marginTop: 10, alignSelf: 'flex-start', backgroundColor: '#e2e8f0', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
    badgeDone: { backgroundColor: '#dcfce7' },
    badgeErr: { backgroundColor: '#fee2e2' },
    badgeSending: { backgroundColor: '#dbeafe' },
    badgeConverting: { backgroundColor: '#fef3c7' },
    statusText: { fontSize: 11, color: '#334155', fontWeight: '700', letterSpacing: 0.2 },

    hexBox: { backgroundColor: '#ffffff', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' },
    hexLabel: { fontSize: 10, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 },
    hexVal: { fontSize: 11, color: '#15803d', fontFamily: 'monospace', lineHeight: 18 },

    sendBtn: { backgroundColor: '#16a34a', borderRadius: 14, padding: 18, alignItems: 'center', marginBottom: 16, elevation: 1 },
    sendTxt: { color: '#ffffff', fontSize: 17, fontWeight: '700' },
    btnDim: { opacity: 0.5 },

    progCard: {
        backgroundColor: '#eff6ff', borderRadius: 14, padding: 16,
        borderWidth: 1, borderColor: '#bfdbfe', marginBottom: 14,
    },
    progTrack: { height: 8, backgroundColor: '#bfdbfe', borderRadius: 999, overflow: 'hidden', marginBottom: 6 },
    progTxt: { fontSize: 12, color: '#1e40af', textAlign: 'center', fontWeight: '500' }, progressPage: { fontSize: 13, color: '#1e40af', marginBottom: 10 },
    progFill: { height: '100%', backgroundColor: '#2563eb', borderRadius: 999 },
    doneCard: { backgroundColor: '#f0fdf4', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#bbf7d0' },
    doneTxt: { fontSize: 18, fontWeight: '700', color: '#15803d', marginBottom: 14 },
    doneBtn: { backgroundColor: '#16a34a', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
    doneBtnTxt: { color: '#ffffff', fontWeight: '700', fontSize: 15 },

    logLabel: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
    logBox: { backgroundColor: '#ffffff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', minHeight: 80 },
    logLine: { fontSize: 11, color: '#475569', fontFamily: 'monospace', lineHeight: 18 },
    logEmpty: { fontSize: 12, color: '#94a3b8', fontStyle: 'italic' },
});