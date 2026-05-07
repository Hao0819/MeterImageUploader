import React, { useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    SafeAreaView,
    TouchableOpacity,
    StyleSheet,
} from 'react-native';

export default function LogViewer({ navigation, route }) {
    const logs = route?.params?.logs || [];
    const scrollRef = useRef(null);

    const profileLogs = logs.filter(l => l.includes('Profile'));
    const greetingLogs = logs.filter(l => l.includes('Greeting'));



    const handlePrintToConsole = () => {
        console.log('========== MODE1 LOG START ==========');
        logs.forEach((line, i) => {
            console.log(`[${String(i + 1).padStart(3, '0')}] ${line}`);
        });
        console.log('========== MODE1 LOG END ==========');
        console.log(
            `Total: ${logs.length} lines, Profile: ${profileLogs.length}, Greeting: ${greetingLogs.length}`
        );
    };

    return (
        <SafeAreaView style={s.container}>
            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={s.back}>‹ Back</Text>
                </TouchableOpacity>
                <Text style={s.title}>Packet Log</Text>
                <Text style={s.count}>{logs.length} lines</Text>
            </View>

            {/* Stats bar */}
            <View style={s.statsBar}>
                <View style={s.statItem}>
                    <Text style={s.statNum}>{profileLogs.length}</Text>
                    <Text style={s.statLabel}>Profile</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                    <Text style={s.statNum}>{greetingLogs.length}</Text>
                    <Text style={s.statLabel}>Greeting</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                    <Text style={s.statNum}>{logs.length}</Text>
                    <Text style={s.statLabel}>Total</Text>
                </View>
            </View>

            {/* Action buttons */}
            <View style={s.actionRow}>
                <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: '#475569' }]}
                    onPress={handlePrintToConsole}
                >
                    <Text style={s.actionTxt}>🖥️ Print to Console</Text>
                </TouchableOpacity>
            </View>

            {/* Log lines */}
            <ScrollView
                ref={scrollRef}
                style={s.scroll}
                contentContainerStyle={{ padding: 12 }}
            >
                {logs.map((l, i) => {
                    const isGreeting = l.includes('Greeting');
                    const isProfile = l.includes('Profile');
                    const isCtrl = l.includes('CTRL');
                    const isError = l.includes('❌') || l.includes('Error');

                    return (
                        <View
                            key={i}
                            style={[
                                s.row,
                                isGreeting && s.rowGreeting,
                                isProfile && s.rowProfile,
                                isCtrl && s.rowCtrl,
                                isError && s.rowError,
                            ]}
                        >
                            <Text style={s.rowNum}>{String(i + 1).padStart(3, '0')}</Text>
                            <Text style={s.rowText}>{l}</Text>
                        </View>
                    );
                })}
            </ScrollView>

            {/* Footer */}
            <View style={s.footer}>
                <TouchableOpacity
                    style={s.footerBtn}
                    onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
                >
                    <Text style={s.footerTxt}>↑ Top</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={s.footerBtn}
                    onPress={() => scrollRef.current?.scrollToEnd({ animated: true })}
                >
                    <Text style={s.footerTxt}>↓ Bottom</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
        backgroundColor: '#fff',
    },
    back: { color: '#16a34a', fontSize: 17, fontWeight: '600' },
    title: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
    count: { color: '#64748b', fontSize: 12 },

    statsBar: {
        flexDirection: 'row',
        backgroundColor: '#ffffff',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
    },
    statItem: { flex: 1, alignItems: 'center' },
    statNum: { color: '#0f172a', fontSize: 18, fontWeight: '700' },
    statLabel: { color: '#64748b', fontSize: 11, marginTop: 2 },
    statDivider: { width: 1, backgroundColor: '#e2e8f0', marginHorizontal: 8 },

    actionRow: {
        flexDirection: 'row',
        gap: 10,
        padding: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
    },
    actionBtn: {
        flex: 1,
        backgroundColor: '#2563eb',
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
    },
    actionTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },

    scroll: { flex: 1 },

    row: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
        backgroundColor: '#fff',
    },
    rowProfile: {
        borderLeftWidth: 3,
        borderLeftColor: '#2196F3',
    },
    rowGreeting: {
        borderLeftWidth: 3,
        borderLeftColor: '#f97316',
    },
    rowCtrl: {
        borderLeftWidth: 3,
        borderLeftColor: '#8b5cf6',
        backgroundColor: '#faf5ff',
    },
    rowError: {
        borderLeftWidth: 3,
        borderLeftColor: '#dc2626',
        backgroundColor: '#fff1f1',
    },

    rowNum: {
        color: '#94a3b8',
        fontSize: 10,
        fontFamily: 'monospace',
        width: 32,
        marginRight: 8,
        marginTop: 2,
    },
    rowText: {
        color: '#334155',
        fontSize: 11,
        fontFamily: 'monospace',
        flex: 1,
        lineHeight: 18,
    },

    footer: {
        flexDirection: 'row',
        gap: 10,
        padding: 12,
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
        backgroundColor: '#fff',
    },
    footerBtn: {
        flex: 1,
        backgroundColor: '#f1f5f9',
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
    },
    footerTxt: { color: '#475569', fontWeight: '700', fontSize: 13 },
});