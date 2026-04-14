// src/components/PacketLogViewer.js

import React, { useRef } from 'react';
import {
    Modal, SafeAreaView, View, Text,
    TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import {
    PAGE_COUNTER_RANGES,
    IMAGE_LOGIC_PKTS,
    SCRIPT_LOGIC_PKTS,
    P2_COUNTER_START,
    getPageForCounter,
} from '../utils/mode2Constants';

export default function PacketLogViewer({ visible, onClose, packetLogs, sendStats }) {
    const scrollRef = useRef(null);

    const p1Logs = packetLogs.filter(l => l.pageId === 'p1');
    const p2Logs = packetLogs.filter(l => l.pageId === 'p2');
    const s1Logs = packetLogs.filter(l => l.pageId === 's1');
    const s2Logs = packetLogs.filter(l => l.pageId === 's2');
    const s3Logs = packetLogs.filter(l => l.pageId === 's3');

    const p2Warnings = p2Logs.filter(l => l.retries > 0 || !l.ok);
    const p2CounterIssues = p2Logs.filter(
        l => l.counter < P2_COUNTER_START || l.counter > P2_COUNTER_START + IMAGE_LOGIC_PKTS * 2 - 1
    );

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

                {/* Header */}
                <View style={lv.header}>
                    <TouchableOpacity onPress={onClose} style={lv.closeBtn}>
                        <Text style={lv.closeTxt}>✕ Close</Text>
                    </TouchableOpacity>
                    <Text style={lv.headerTitle}>Packet Log</Text>
                    <Text style={lv.headerCount}>{packetLogs.length} pkts</Text>
                </View>

                {/* Summary bar */}
                {sendStats && (
                    <View style={lv.summaryBar}>
                        <Text style={lv.summaryTxt}>
                            Total sent: <Text style={{ fontWeight: '700' }}>{sendStats.totalSent}</Text>
                            {'  '}Lost:{' '}
                            <Text style={[{ fontWeight: '700' }, sendStats.totalLost > 0 && { color: '#dc2626' }]}>
                                {sendStats.totalLost}
                            </Text>
                            {'  '}Retries: <Text style={{ fontWeight: '700' }}>{sendStats.totalRetries}</Text>
                        </Text>
                    </View>
                )}

                {/* Per-page stat cards */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={lv.statsScroll}
                    contentContainerStyle={lv.statsRow}
                >
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

                {/* P2 warning banner */}
                {(p2Warnings.length > 0 || p2CounterIssues.length > 0) && (
                    <View style={lv.warnBanner}>
                        <Text style={lv.warnTitle}>⚠️ P2 Issues Detected</Text>
                        {p2Warnings.length > 0 && (
                            <Text style={lv.warnLine}>• {p2Warnings.length} packets had retries or failures</Text>
                        )}
                        {p2CounterIssues.length > 0 && (
                            <Text style={lv.warnLine}>
                                • {p2CounterIssues.length} packets outside expected counter range (256–511)
                            </Text>
                        )}
                        <Text style={lv.warnNote}>P2 expected counters: 0x0100 – 0x01FF</Text>
                    </View>
                )}

                {/* Legend */}
                <View style={lv.legendRow}>
                    {Object.values(PAGE_COUNTER_RANGES).map(r => (
                        <View key={r.label} style={lv.legendItem}>
                            <View style={[lv.legendDot, { backgroundColor: r.color }]} />
                            <Text style={lv.legendTxt}>{r.label}</Text>
                        </View>
                    ))}
                </View>

                {/* Log list */}
                <ScrollView ref={scrollRef} style={lv.logScroll} contentContainerStyle={{ padding: 10 }}>
                    {packetLogs.length === 0 ? (
                        <Text style={lv.emptyTxt}>No packets logged yet.</Text>
                    ) : (
                        packetLogs.map((entry, i) => {
                            const pageRange = getPageForCounter(entry.counter);
                            const borderColor = pageRange?.color ?? '#e2e8f0';
                            const hasIssue = !entry.ok || entry.retries > 0;
                            return (
                                <View
                                    key={i}
                                    style={[
                                        lv.logRow,
                                        { borderLeftColor: borderColor },
                                        hasIssue && lv.logRowWarn,
                                    ]}
                                >
                                    <Text style={lv.logNum}>{String(i + 1).padStart(4, '0')}</Text>
                                    <View style={lv.logBody}>
                                        <Text style={lv.logMeta}>
                                            <Text style={[lv.logPage, { color: borderColor }]}>
                                                {entry.pageId?.toUpperCase() ?? '??'}
                                            </Text>
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

                {/* Footer buttons */}
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