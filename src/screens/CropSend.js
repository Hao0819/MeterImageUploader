// src/screens/CropSend.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, Image, TouchableOpacity,
    StyleSheet, SafeAreaView, ScrollView,
} from 'react-native';
import RNFS from 'react-native-fs';
import { Buffer } from 'buffer';

import {
    sendCombined,
    disconnectDevice,
    DATA_BYTES_PER_PACKET,
    TOTAL_PACKETS,
    GREETING_START_PACKET,
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

export default function CropSend({ navigation, route }) {
    const {
        device,
        deviceName,
        phase,
        imageUri,
        greetingText = '',
        greetingBytes: greetingBytesArray,
    } = route.params;

    const [status, setStatus] = useState(STATUS.IDLE);
    const [profileBytes, setProfileBytes] = useState(null);
    const [greetingBytes, setGreetingBytes] = useState(null);
    const [progress, setProgress] = useState({ sent: 0, total: 0 });
    const [log, setLog] = useState([]);
    const [hexText, setHexText] = useState('');

    const logBufferRef = useRef([]);
    const logScrollRef = useRef(null);

    const addLog = useCallback((msg) => {
        logBufferRef.current.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    }, []);

    const flushLog = useCallback(() => {
        setLog([...logBufferRef.current]);
        setTimeout(() => logScrollRef.current?.scrollToEnd({ animated: false }), 50);
    }, []);

    // ── Convert on mount ──────────────────────────────────────────
    const convert = useCallback(async () => {
        setStatus(STATUS.CONVERTING);
        try {
            // 1) Profile: read file → RGB565
            addLog('Reading profile image…');
            const b64 = await RNFS.readFile(imageUri, 'base64');
            const buf = Buffer.from(b64, 'base64');
            addLog(`File size: ${buf.length} bytes`);

            const pBytes = await convertProfileBuffer(buf);
            setProfileBytes(pBytes);
            addLog(`✅ Profile converted: ${pBytes.length} bytes (${PROFILE_W}×${PROFILE_H} RGB565)`);

            // 2) Greeting: already converted in GreetingInput
            const gBytes = new Uint8Array(greetingBytesArray);
            setGreetingBytes(gBytes);
            addLog(`greetingBytesArray type: ${typeof greetingBytesArray}, length: ${greetingBytesArray?.length}`);
            addLog(`gBytes first 4: ${gBytes[0]} ${gBytes[1]} ${gBytes[2]} ${gBytes[3]}`);
            addLog(`✅ Greeting ready: ${gBytes.length} bytes (${GREETING_W}×${GREETING_H} mono1)`);
            // 3) Hex preview of the combined 24KB buffer layout
            addLog(`📐 Layout: Profile pkt 000–${String(GREETING_START_PACKET - 1).padStart(3, '0')} | Greeting pkt ${String(GREETING_START_PACKET).padStart(3, '0')}–102`);
            setHexText(hexPreview(pBytes, DATA_BYTES_PER_PACKET));

            setStatus(STATUS.IDLE);
        } catch (err) {
            addLog('ERROR: ' + err.message);
            setStatus(STATUS.ERROR);
        } finally {
            flushLog();
        }
    }, [imageUri, greetingBytesArray, addLog, flushLog]);

    useEffect(() => { convert(); }, [convert]);

    // ── Send ──────────────────────────────────────────────────────
    const send = useCallback(async () => {
        if (!profileBytes || !greetingBytes) return;

        logBufferRef.current = [];
        setLog([]);
        setStatus(STATUS.SENDING);
        setProgress({ sent: 0, total: 0 });
        addLog('Sending START command…');
        flushLog();

        try {
            await sendCombined(device, profileBytes, greetingBytes, (sent, total, idx) => {
                setProgress({ sent, total });

                const lo = (idx & 0xff).toString(16).padStart(2, '0').toUpperCase();
                const hi = ((idx >> 8) & 0xff).toString(16).padStart(2, '0').toUpperCase();
                const section = idx < GREETING_START_PACKET ? '🖼️ ' : '👋';

                // Source bytes for preview: profile or greeting section of combined buffer
                let chunkPreview = '';
                if (idx < GREETING_START_PACKET) {
                    const start = idx * DATA_BYTES_PER_PACKET;
                    const chunk = profileBytes.slice(start, start + DATA_BYTES_PER_PACKET);
                    chunkPreview = Array.from(chunk.slice(0, 16))
                        .map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
                } else {
                    // ← 加上这段！
                    const greetingOffset = (idx - GREETING_START_PACKET) * DATA_BYTES_PER_PACKET;
                    const chunk = greetingBytes.slice(greetingOffset, greetingOffset + DATA_BYTES_PER_PACKET);
                    chunkPreview = Array.from(chunk.slice(0, 16))
                        .map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
                }

                addLog(`${section} #${String(idx).padStart(3, '0')} [${lo} ${hi}] ${sent}/${total} | ${chunkPreview}...`);
                if (sent % 10 === 0 || sent === total) flushLog();
            });

            addLog('Sending STOP command…');
            addLog('✅ Transfer complete!');
            setStatus(STATUS.DONE);
        } catch (err) {
            addLog('Send error: ' + err.message);
            setStatus(STATUS.ERROR);
        } finally {
            flushLog();
        }
    }, [device, profileBytes, greetingBytes, addLog, flushLog]);

    const disconnect = async () => {
        await disconnectDevice(device);
        navigation.popToTop();
    };

    const pct = progress.total > 0 ? Math.round((progress.sent / progress.total) * 100) : 0;
    const busy = status === STATUS.SENDING || status === STATUS.CONVERTING;
    const ready = profileBytes && greetingBytes;

    // Progress: blue = profile packets, orange = greeting packets
    const profilePct = Math.min(progress.sent, GREETING_START_PACKET) / TOTAL_PACKETS * 100;
    const greetingPct = Math.max(0, progress.sent - GREETING_START_PACKET) / TOTAL_PACKETS * 100;
    const greetingLeft = GREETING_START_PACKET / TOTAL_PACKETS * 100;

    return (
        <SafeAreaView style={s.container}>
            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

                {/* Header */}
                <View style={s.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} disabled={busy}>
                        <Text style={[s.back, busy && s.dimText]}>‹ Back</Text>
                    </TouchableOpacity>
                    <View style={s.deviceBar}>
                        <View style={s.deviceLeft}>
                            <View style={s.connDot} />
                            <Text style={s.connText} numberOfLines={1}>{deviceName}</Text>
                        </View>
                        <TouchableOpacity onPress={disconnect} disabled={busy}>
                            <Text style={[s.discText, busy && s.dimText]}>Disconnect</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Preview card */}
                <View style={s.previewCard}>
                    <Text style={s.cardTitle}>Preview & send</Text>

                    {/* Profile image */}
                    <View style={s.previewSection}>
                        <Text style={s.previewSectionLabel}>🖼️  Profile · {PROFILE_W}×{PROFILE_H} RGB565</Text>
                        <Image
                            source={{ uri: imageUri }}
                            style={s.profileImg}
                            resizeMode="cover"
                        />
                    </View>

                    {/* Greeting text */}
                    <View style={s.previewSection}>
                        <Text style={s.previewSectionLabel}>👋 Greeting · {GREETING_W}×{GREETING_H} mono1</Text>
                        <View style={s.lcdPreview}>
                            <Text style={s.lcdText} numberOfLines={5}>{greetingText}</Text>
                        </View>
                    </View>

                    {/* Info rows */}
                    <View style={s.infoGrid}>
                        <InfoRow k="Profile bytes" v={profileBytes ? profileBytes.length.toLocaleString() : '—'} />
                        <InfoRow k="Greeting bytes" v={greetingBytes ? greetingBytes.length.toLocaleString() : '—'} />
                        <InfoRow k="Total packets" v={String(TOTAL_PACKETS)} />
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

                {/* Hex preview */}
                {hexText ? (
                    <View style={s.hexBox}>
                        <Text style={s.hexLabel}>Profile hex preview (pkt 000–{String(GREETING_START_PACKET - 1).padStart(3, '0')})</Text>
                        <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                            <Text style={s.hexVal}>{hexText}</Text>
                        </ScrollView>
                    </View>
                ) : null}

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

                {/* Progress bar (two-colour: blue=profile, orange=greeting) */}
                {status === STATUS.SENDING && (
                    <View style={s.progCard}>
                        <View style={s.progTrack}>
                            <View style={[s.progFillProfile, { width: `${profilePct}%` }]} />
                            <View style={[s.progFillGreeting, { left: `${greetingLeft}%`, width: `${greetingPct}%` }]} />
                        </View>
                        <Text style={s.progTxt}>
                            {progress.sent} / {progress.total} packets ({pct}%)
                            {progress.sent >= GREETING_START_PACKET ? '  👋 Greeting' : '  🖼️ Profile'}
                        </Text>
                    </View>
                )}

                {/* Done card */}
                {status === STATUS.DONE && (
                    <View style={s.doneCard}>
                        <Text style={s.doneTxt}>✅ Transfer complete!</Text>
                        <TouchableOpacity
                            onPress={() => navigation.popToTop()}
                            style={s.doneBtn}
                        >
                            <Text style={s.doneBtnTxt}>Start over</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Log */}
                <Text style={s.logLabel}>Log ({log.length} lines)</Text>
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
    discText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },

    previewCard: {
        backgroundColor: '#ffffff', borderRadius: 18, padding: 16,
        borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16,
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    cardTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 14 },
    previewSection: { marginBottom: 14 },
    previewSectionLabel: { fontSize: 12, color: '#64748b', fontWeight: '600', marginBottom: 8 },
    profileImg: { width: 95 * 2, height: 110 * 2, borderRadius: 10, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#dbe3ee' },
    lcdPreview: {
        backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#cbd5e1',
        borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12,
        alignItems: 'center', justifyContent: 'center', minHeight: 70,
        width: 120 * 2,
    },
    lcdText: { color: '#000000', fontSize: 12, textAlign: 'center', lineHeight: 18, fontFamily: 'monospace' },

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

    progCard: { backgroundColor: '#ffffff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16 },
    progTrack: { height: 10, backgroundColor: '#e2e8f0', borderRadius: 999, overflow: 'hidden', marginBottom: 8, position: 'relative' },
    progFillProfile: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#2196F3', borderRadius: 999 },
    progFillGreeting: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#f97316', borderRadius: 999 },
    progTxt: { fontSize: 13, color: '#475569', textAlign: 'center', fontWeight: '500' },

    doneCard: { backgroundColor: '#f0fdf4', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#bbf7d0' },
    doneTxt: { fontSize: 18, fontWeight: '700', color: '#15803d', marginBottom: 14 },
    doneBtn: { backgroundColor: '#16a34a', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
    doneBtnTxt: { color: '#ffffff', fontWeight: '700', fontSize: 15 },

    logLabel: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
    logBox: { backgroundColor: '#ffffff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', minHeight: 80 },
    logLine: { fontSize: 11, color: '#475569', fontFamily: 'monospace', lineHeight: 18 },
    logEmpty: { fontSize: 12, color: '#94a3b8', fontStyle: 'italic' },
});