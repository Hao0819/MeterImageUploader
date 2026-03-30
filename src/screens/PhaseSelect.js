// src/screens/PhaseSelect.jsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Alert } from 'react-native';

export default function PhaseSelect({ navigation, route }) {
    const { device, deviceName } = route.params;

    // ✅ Go directly to Camera (Profile image), not ImageTypeSelect
    const go = (phase) => navigation.navigate('Camera', { device, deviceName, phase });

    return (
        <SafeAreaView style={s.container}>
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
                    <Text style={s.backText}>‹ Back</Text>
                </TouchableOpacity>
                <View style={s.connBadge}>
                    <View style={s.connDot} />
                    <Text style={s.connText}>{deviceName}</Text>
                </View>
                <Text style={s.title}>Select phase</Text>
                <Text style={s.subtitle}>Choose the meter type to upload profile &amp; greeting</Text>
            </View>

            <View style={s.cards}>
                {/* Single phase — active */}
                <TouchableOpacity
                    style={[s.card, s.cardActive]}
                    onPress={() => go('single')}
                    activeOpacity={0.8}
                >
                    <View style={[s.icon, s.iconGreen]}>
                        <Text style={s.iconNum}>1Φ</Text>
                    </View>
                    <View style={s.cardText}>
                        <Text style={s.cardTitle}>Single phase</Text>
                        <Text style={s.cardDesc}>Standard single-phase meter LCD</Text>
                    </View>
                    <Text style={s.arrow}>›</Text>
                </TouchableOpacity>

                {/* 3-Phase — coming soon */}
                <TouchableOpacity
                    style={[s.card, s.cardDim]}
                    onPress={() => Alert.alert('Coming soon', '3-Phase support is not available yet.')}
                    activeOpacity={0.7}
                >
                    <View style={[s.icon, s.iconGray]}>
                        <Text style={[s.iconNum, s.iconNumMuted]}>3Φ</Text>
                    </View>
                    <View style={s.cardText}>
                        <Text style={s.cardTitleMuted}>3-Phase</Text>
                        <Text style={s.cardDesc}>Coming soon</Text>
                    </View>
                    <View style={s.badge}>
                        <Text style={s.badgeText}>Soon</Text>
                    </View>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28 },
    back: { marginBottom: 12 },
    backText: { color: '#16a34a', fontSize: 17, fontWeight: '600' },
    connBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16,
        backgroundColor: '#f0fdf4', paddingHorizontal: 12, paddingVertical: 7,
        borderRadius: 20, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#bbf7d0',
    },
    connDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' },
    connText: { fontSize: 12, color: '#15803d', fontWeight: '600' },
    title: { fontSize: 28, fontWeight: '700', color: '#0f172a', letterSpacing: -0.3, marginBottom: 4 },
    subtitle: { fontSize: 13, color: '#64748b' },
    cards: { paddingHorizontal: 20, gap: 14 },
    card: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#ffffff', borderRadius: 18, padding: 18,
        borderWidth: 1, borderColor: '#e2e8f0',
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    cardActive: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
    cardDim: { opacity: 0.78 },
    icon: { width: 52, height: 52, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    iconGreen: { backgroundColor: '#dcfce7' },
    iconGray: { backgroundColor: '#f1f5f9' },
    iconNum: { fontSize: 18, fontWeight: '700', color: '#16a34a' },
    iconNumMuted: { color: '#64748b' },
    cardText: { flex: 1 },
    cardTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a', marginBottom: 3 },
    cardTitleMuted: { fontSize: 17, fontWeight: '700', color: '#64748b', marginBottom: 3 },
    cardDesc: { fontSize: 13, color: '#64748b' },
    arrow: { fontSize: 22, color: '#2563eb', fontWeight: '700' },
    badge: { backgroundColor: '#fff7ed', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: '#fed7aa' },
    badgeText: { fontSize: 11, color: '#c2410c', fontWeight: '700' },
});