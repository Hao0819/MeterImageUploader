import React, { useRef } from 'react';
import { View, Text, ScrollView, SafeAreaView, TouchableOpacity, StyleSheet } from 'react-native';

export default function LogViewer({ navigation, route }) {
    const { logs = [] } = route.params;
    const scrollRef = useRef(null);

    const profileLogs = logs.filter(l => l.includes('🖼️'));
    const greetingLogs = logs.filter(l => l.includes('👋'));

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
                    <Text style={s.statLabel}>🖼️ Profile</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                    <Text style={s.statNum}>{greetingLogs.length}</Text>
                    <Text style={s.statLabel}>👋 Greeting</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                    <Text style={s.statNum}>{logs.length}</Text>
                    <Text style={s.statLabel}>Total</Text>
                </View>
            </View>

            {/* Log lines */}
            <ScrollView ref={scrollRef} style={s.scroll} contentContainerStyle={{ padding: 12 }}>
                {logs.map((l, i) => {
                    const isGreeting = l.includes('👋');
                    const isProfile = l.includes('🖼️');
                    return (
                        <View key={i} style={[
                            s.row,
                            isGreeting && s.rowGreeting,
                            isProfile && s.rowProfile,
                        ]}>
                            <Text style={s.rowNum}>{String(i + 1).padStart(3, '0')}</Text>
                            <Text style={s.rowText}>{l}</Text>
                        </View>
                    );
                })}
            </ScrollView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        padding: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    },
    back: { color: '#16a34a', fontSize: 17, fontWeight: '600' },
    title: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
    count: { color: '#64748b', fontSize: 12 },
    statsBar: {
        flexDirection: 'row', backgroundColor: '#ffffff',
        paddingVertical: 12, paddingHorizontal: 20,
        borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    },
    statItem: { flex: 1, alignItems: 'center' },
    statNum: { color: '#0f172a', fontSize: 18, fontWeight: '700' },
    statLabel: { color: '#64748b', fontSize: 11, marginTop: 2 },
    statDivider: { width: 1, backgroundColor: '#e2e8f0', marginHorizontal: 8 },
    scroll: { flex: 1 },
    row: {
        flexDirection: 'row', alignItems: 'flex-start',
        paddingVertical: 4, paddingHorizontal: 8,
        borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    },
    rowProfile: { borderLeftWidth: 3, borderLeftColor: '#2196F3' },
    rowGreeting: { borderLeftWidth: 3, borderLeftColor: '#f97316' },
    rowNum: { color: '#94a3b8', fontSize: 10, fontFamily: 'monospace', width: 32, marginRight: 8, marginTop: 2 },
    rowText: { color: '#334155', fontSize: 11, fontFamily: 'monospace', flex: 1, lineHeight: 18 },
});