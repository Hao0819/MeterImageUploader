import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, Image, TouchableOpacity,
    StyleSheet, SafeAreaView, ScrollView,
} from 'react-native';
import RNFS from 'react-native-fs';
import { Buffer } from 'buffer';

import {
    sendImage,
    disconnectDevice,
    DATA_BYTES_PER_PACKET,
    TOTAL_PACKETS,
    TOTAL_TRANSFER_BYTES,
} from '../utils/ble';

import {
    convertImageBuffer,
    hexPreview,
    ASSET_W,
    ASSET_H,
} from '../utils/ImageConverter';

const STATUS = {
    IDLE: 'idle',
    CONVERTING: 'converting',
    SENDING: 'sending',
    DONE: 'done',
    ERROR: 'error',
};

export default function CropSend({ navigation, route }) {
    const { device, deviceName, phase, imageUri } = route.params;

    const [status, setStatus] = useState(STATUS.IDLE);
    const [imageBytes, setImageBytes] = useState(null);
    const [preview, setPreview] = useState('');
    const [progress, setProgress] = useState({ sent: 0, total: 0 });
    const [log, setLog] = useState([]);

    const addLog = msg => {
        setLog(p => [...p, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    const convert = useCallback(async () => {
        setStatus(STATUS.CONVERTING);
        addLog('Reading image file…');

        try {
            const b64 = await RNFS.readFile(imageUri, 'base64');
            const buf = Buffer.from(b64, 'base64');
            addLog(`File size: ${buf.length} bytes`);

            const bytes = await convertImageBuffer(buf);
            setImageBytes(bytes);
            setPreview(hexPreview(bytes, 20));

            addLog(`Converted raw RGB565: ${bytes.length} bytes`);
            addLog(`Protocol transfer size: ${TOTAL_TRANSFER_BYTES} bytes`);
            addLog(`Fixed packets: ${TOTAL_PACKETS} (each ${DATA_BYTES_PER_PACKET} data bytes)`);

            setStatus(STATUS.IDLE);
        } catch (err) {
            addLog('ERROR: ' + err.message);
            setStatus(STATUS.ERROR);
        }
    }, [imageUri]);

    useEffect(() => {
        convert();
    }, [convert]);

    const send = useCallback(async () => {
        if (!imageBytes) return;

        setStatus(STATUS.SENDING);
        setProgress({ sent: 0, total: 0 });
        addLog('Sending START command…');

        try {
            await sendImage(device, imageBytes, (sent, total) => {
                setProgress({ sent, total });
                if (sent === 1) addLog(`Sending ${total} packets…`);
            });

            addLog('Sending STOP command…');
            addLog('✓ Done!');
            setStatus(STATUS.DONE);
        } catch (err) {
            addLog('Send error: ' + err.message);
            setStatus(STATUS.ERROR);
        }
    }, [device, imageBytes]);

    const disconnect = async () => {
        await disconnectDevice(device);
        navigation.popToTop();
    };

    const pct = progress.total > 0
        ? Math.round((progress.sent / progress.total) * 100)
        : 0;

    const busy = status === STATUS.SENDING || status === STATUS.CONVERTING;

    return (
        <SafeAreaView style={s.container}>
            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
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

                <View style={s.previewCard}>
                    <Text style={s.cardTitle}>Preview & send</Text>

                    <View style={s.previewRow}>
                        <Image source={{ uri: imageUri }} style={s.previewImg} resizeMode="cover" />

                        <View style={s.infoCol}>
                            <InfoRow k="Size" v={`${ASSET_W}×${ASSET_H} px`} />
                            <InfoRow k="Format" v="RGB565" />
                            <InfoRow k="Raw bytes" v={imageBytes ? imageBytes.length.toLocaleString() : '—'} />
                            <InfoRow k="Transfer bytes" v={TOTAL_TRANSFER_BYTES.toLocaleString()} />
                            <InfoRow k="Packets" v={String(TOTAL_PACKETS)} />
                            <InfoRow k="Phase" v={phase === 'single' ? 'Single' : '3-Phase'} />

                            <View
                                style={[
                                    s.statusBadge,
                                    status === STATUS.DONE && s.badgeDone,
                                    status === STATUS.ERROR && s.badgeErr,
                                    status === STATUS.SENDING && s.badgeSending,
                                    status === STATUS.CONVERTING && s.badgeConverting,
                                ]}
                            >
                                <Text style={s.statusText}>{status.toUpperCase()}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {preview ? (
                    <View style={s.hexBox}>
                        <Text style={s.hexLabel}>Hex preview (first 20 bytes)</Text>
                        <Text style={s.hexVal}>{preview}</Text>
                    </View>
                ) : null}

                {status !== STATUS.DONE && (
                    <TouchableOpacity
                        style={[s.sendBtn, (busy || !imageBytes) && s.btnDim]}
                        onPress={send}
                        disabled={busy || !imageBytes}
                    >
                        <Text style={s.sendTxt}>
                            {status === STATUS.CONVERTING
                                ? 'Converting…'
                                : status === STATUS.SENDING
                                    ? 'Sending…'
                                    : 'Send via BLE'}
                        </Text>
                    </TouchableOpacity>
                )}

                {status === STATUS.SENDING && (
                    <View style={s.progCard}>
                        <View style={s.progTrack}>
                            <View style={[s.progFill, { width: `${pct}%` }]} />
                        </View>
                        <Text style={s.progTxt}>
                            {progress.sent} / {progress.total} packets ({pct}%)
                        </Text>
                    </View>
                )}

                {status === STATUS.DONE && (
                    <View style={s.doneCard}>
                        <Text style={s.doneTxt}>✓ Transfer complete!</Text>
                        <TouchableOpacity onPress={() => navigation.popToTop()} style={s.doneBtn}>
                            <Text style={s.doneBtnTxt}>Start over</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <Text style={s.logLabel}>Log</Text>
                <View style={s.logBox}>
                    {log.length === 0
                        ? <Text style={s.logEmpty}>Waiting…</Text>
                        : log.map((l, i) => <Text key={i} style={s.logLine}>{l}</Text>)}
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
    back: {
        color: '#16a34a',
        fontSize: 17,
        marginBottom: 14,
        fontWeight: '600',
    },
    dimText: { opacity: 0.45 },

    deviceBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#ffffff',
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
    },
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
        backgroundColor: '#22c55e',
        marginRight: 8,
    },
    connText: {
        fontSize: 13,
        color: '#0f172a',
        fontWeight: '600',
        flexShrink: 1,
    },
    discText: {
        fontSize: 12,
        color: '#dc2626',
        fontWeight: '600',
    },

    previewCard: {
        backgroundColor: '#ffffff',
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginBottom: 16,
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0f172a',
        marginBottom: 14,
    },
    previewRow: {
        flexDirection: 'row',
        gap: 16,
    },
    previewImg: {
        width: ASSET_W * 1.7,
        height: ASSET_H * 1.7,
        borderRadius: 12,
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#dbe3ee',
    },
    infoCol: {
        flex: 1,
        gap: 7,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 1,
    },
    infoKey: {
        fontSize: 12,
        color: '#64748b',
    },
    infoVal: {
        fontSize: 12,
        color: '#0f172a',
        fontWeight: '600',
    },

    statusBadge: {
        marginTop: 8,
        alignSelf: 'flex-start',
        backgroundColor: '#e2e8f0',
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 999,
    },
    badgeDone: { backgroundColor: '#dcfce7' },
    badgeErr: { backgroundColor: '#fee2e2' },
    badgeSending: { backgroundColor: '#dbeafe' },
    badgeConverting: { backgroundColor: '#fef3c7' },
    statusText: {
        fontSize: 11,
        color: '#334155',
        fontWeight: '700',
        letterSpacing: 0.2,
    },

    hexBox: {
        backgroundColor: '#ffffff',
        borderRadius: 14,
        padding: 14,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    hexLabel: {
        fontSize: 10,
        color: '#64748b',
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    hexVal: {
        fontSize: 11,
        color: '#15803d',
        fontFamily: 'monospace',
        lineHeight: 18,
    },

    sendBtn: {
        backgroundColor: '#16a34a',
        borderRadius: 14,
        padding: 18,
        alignItems: 'center',
        marginBottom: 16,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
    },
    sendTxt: {
        color: '#ffffff',
        fontSize: 17,
        fontWeight: '700',
    },
    btnDim: { opacity: 0.5 },

    progCard: {
        backgroundColor: '#ffffff',
        borderRadius: 14,
        padding: 14,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginBottom: 16,
    },
    progTrack: {
        height: 8,
        backgroundColor: '#e2e8f0',
        borderRadius: 999,
        overflow: 'hidden',
        marginBottom: 8,
    },
    progFill: {
        height: '100%',
        backgroundColor: '#22c55e',
        borderRadius: 999,
    },
    progTxt: {
        fontSize: 13,
        color: '#475569',
        textAlign: 'center',
        fontWeight: '500',
    },

    doneCard: {
        backgroundColor: '#f0fdf4',
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#bbf7d0',
    },
    doneTxt: {
        fontSize: 18,
        fontWeight: '700',
        color: '#15803d',
        marginBottom: 12,
    },
    doneBtn: {
        backgroundColor: '#ffffff',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#d1fae5',
    },
    doneBtnTxt: {
        color: '#15803d',
        fontWeight: '700',
    },

    logLabel: {
        fontSize: 11,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 8,
    },
    logBox: {
        backgroundColor: '#ffffff',
        borderRadius: 14,
        padding: 14,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        minHeight: 80,
    },
    logLine: {
        fontSize: 11,
        color: '#475569',
        fontFamily: 'monospace',
        lineHeight: 18,
    },
    logEmpty: {
        fontSize: 12,
        color: '#94a3b8',
        fontStyle: 'italic',
    },
});