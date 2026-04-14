// src/screens/ModeSelect.js
import React, { useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    SafeAreaView, Alert, ActivityIndicator,
} from 'react-native';
import { Buffer } from 'buffer';

// ─── Mode 0 command ───────────────────────────────────────────────────────────
const CMD_MODE0_RESET = new Uint8Array([0xa6, 0x3c, 0xd1, 0x75]);
const CHAR_UUID_CTRL = '519ebbd3-78e1-4e86-90c1-d40616058d88';

function toBase64(bytes) {
    return Buffer.from(bytes).toString('base64');
}

async function findServiceForChar(device, charUuid) {
    const services = await device.services();
    for (const svc of services) {
        const chars = await device.characteristicsForService(svc.uuid);
        if (chars.find(c => c.uuid.toLowerCase() === charUuid.toLowerCase())) {
            return svc.uuid;
        }
    }
    throw new Error('CTRL characteristic not found');
}

// ─── Mode card definitions ────────────────────────────────────────────────────
const MODES = [
    {
        id: 0,
        icon: '↺',
        label: 'Default Reset',
        desc: 'Reset meter to factory default settings',
        color: '#f97316',
        bg: '#fff7ed',
        border: '#fed7aa',
        iconBg: '#ffedd5',
    },
    {
        id: 1,
        icon: '◎',
        label: 'Normal Mode',
        desc: 'Upload profile image & greeting screen',
        color: '#16a34a',
        bg: '#f0fdf4',
        border: '#86efac',
        iconBg: '#dcfce7',
        tags: ['Profile', 'Greeting'],
    },
    {
        id: 2,
        icon: '⊞',
        label: 'Extended Mode',
        desc: 'Multi-page upload: 2 image pages + 3 script pages',
        color: '#2563eb',
        bg: '#eff6ff',
        border: '#93c5fd',
        iconBg: '#dbeafe',
        tags: ['P1', 'P2', 'S1', 'S2', 'S3'],
    },
];

export default function ModeSelect({ navigation, route }) {
    const { device, deviceName, phase } = route.params;
    const [resetting, setResetting] = useState(false);
    const [doneVisible, setDoneVisible] = useState(false);

    const handleSelect = async (modeId) => {
        if (modeId === 0) {
            handleReset();
        } else if (modeId === 1) {
            navigation.navigate('UpdateTypeSelect', { device, deviceName, phase });
        } else if (modeId === 2) {
            navigation.navigate('Mode2Flow', { device, deviceName, phase });
        }
    };

    const handleReset = () => {
        Alert.alert(
            'Reset Meter',
            'This will reset the meter to default settings. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reset', style: 'destructive',
                    onPress: async () => {
                        setResetting(true);
                        try {
                            const serviceUuid = await findServiceForChar(device, CHAR_UUID_CTRL);
                            await device.writeCharacteristicWithoutResponseForService(
                                serviceUuid,
                                CHAR_UUID_CTRL,
                                toBase64(CMD_MODE0_RESET)
                            );
                            setDoneVisible(true);
                        } catch (err) {
                            Alert.alert('Error', `Reset failed: ${err.message}`);
                        } finally {
                            setResetting(false);
                        }
                    }
                },
            ]
        );
    };

    // ─── Done overlay ─────────────────────────────────────────────────────────
    if (doneVisible) {
        return (
            <SafeAreaView style={s.container}>
                <View style={s.doneWrap}>
                    <View style={s.doneCard}>
                        <View style={s.doneIconCircle}>
                            <Text style={s.doneIconTxt}>✓</Text>
                        </View>
                        <Text style={s.doneTitle}>Completed</Text>
                        <Text style={s.doneMsg}>Meter reset to default settings</Text>
                        <TouchableOpacity
                            style={s.donePrimaryBtn}
                            onPress={() => navigation.navigate('BleScanner')}
                        >
                            <Text style={s.doneBtnTxt}>Back to Scanner</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={s.doneSecondaryBtn}
                            onPress={() => setDoneVisible(false)}
                        >
                            <Text style={s.doneSecondaryTxt}>Select Another Mode</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={s.container}>
            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity
                    onPress={() => navigation.navigate('PhaseSelect', { device, deviceName })}
                    style={s.back}
                >
                    <Text style={s.backText}>‹ Back</Text>
                </TouchableOpacity>

                <View style={s.connBadge}>
                    <View style={s.connDot} />
                    <Text style={s.connText}>{deviceName}</Text>
                </View>

                <Text style={s.title}>Select mode</Text>
                <Text style={s.subtitle}>Choose an upload mode for the meter</Text>
            </View>

            {/* Mode cards */}
            <View style={s.cards}>
                {MODES.map((mode) => (
                    <TouchableOpacity
                        key={mode.id}
                        style={[s.card, { backgroundColor: mode.bg, borderColor: mode.border }]}
                        onPress={() => handleSelect(mode.id)}
                        disabled={resetting}
                        activeOpacity={0.8}
                    >
                        <View style={[s.iconWrap, { backgroundColor: mode.iconBg }]}>
                            <Text style={[s.iconTxt, { color: mode.color }]}>{mode.icon}</Text>
                        </View>

                        <View style={s.cardBody}>
                            <View style={[s.modePill, { backgroundColor: mode.color }]}>
                                <Text style={s.modePillTxt}>Mode {mode.id}</Text>
                            </View>
                            <Text style={[s.cardTitle, { color: mode.color }]}>{mode.label}</Text>
                            <Text style={s.cardDesc}>{mode.desc}</Text>

                            {mode.tags && (
                                <View style={s.chipRow}>
                                    {mode.tags.map(tag => (
                                        <View key={tag} style={[s.chip, { backgroundColor: mode.iconBg, borderColor: mode.border }]}>
                                            <Text style={[s.chipTxt, { color: mode.color }]}>{tag}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>

                        {resetting && mode.id === 0
                            ? <ActivityIndicator color={mode.color} size="small" />
                            : <Text style={[s.arrow, { color: mode.color }]}>›</Text>
                        }
                    </TouchableOpacity>
                ))}
            </View>

            {/* Phase indicator */}
            <View style={s.phaseBadge}>
                <Text style={s.phaseTxt}>
                    {phase === 'single' ? '1Φ  Single phase' : '3Φ  Three phase'}
                </Text>
            </View>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },

    header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 20 },
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

    cards: { paddingHorizontal: 20, gap: 12 },
    card: {
        flexDirection: 'row', alignItems: 'center',
        borderRadius: 18, padding: 16, borderWidth: 1,
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    iconWrap: {
        width: 52, height: 52, borderRadius: 13,
        alignItems: 'center', justifyContent: 'center', marginRight: 14,
    },
    iconTxt: { fontSize: 22, fontWeight: '700' },
    cardBody: { flex: 1 },
    modePill: {
        borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2,
        alignSelf: 'flex-start', marginBottom: 4,
    },
    modePillTxt: { fontSize: 10, color: '#fff', fontWeight: '700', letterSpacing: 0.4 },
    cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
    cardDesc: { fontSize: 12, color: '#64748b', lineHeight: 17 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
    chip: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
    chipTxt: { fontSize: 10, fontWeight: '700' },
    arrow: { fontSize: 22, fontWeight: '700', marginLeft: 4 },

    phaseBadge: {
        marginTop: 20, alignSelf: 'center',
        backgroundColor: '#f1f5f9', borderRadius: 999,
        paddingHorizontal: 16, paddingVertical: 7,
        borderWidth: 1, borderColor: '#e2e8f0',
    },
    phaseTxt: { fontSize: 12, color: '#475569', fontWeight: '600' },

    // Done screen
    doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    doneCard: {
        backgroundColor: '#fff', borderRadius: 24, padding: 32,
        alignItems: 'center', width: '100%',
        borderWidth: 1, borderColor: '#e2e8f0',
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 16,
        shadowOffset: { width: 0, height: 4 }, elevation: 3,
    },
    doneIconCircle: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: '#f0fdf4', borderWidth: 2, borderColor: '#86efac',
        alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    },
    doneIconTxt: { fontSize: 32, color: '#16a34a' },
    doneTitle: { fontSize: 24, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
    doneMsg: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 28, lineHeight: 20 },
    donePrimaryBtn: {
        backgroundColor: '#16a34a', borderRadius: 12,
        paddingHorizontal: 32, paddingVertical: 14, width: '100%',
        alignItems: 'center', marginBottom: 10,
    },
    doneBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
    doneSecondaryBtn: {
        backgroundColor: '#f1f5f9', borderRadius: 12,
        paddingHorizontal: 32, paddingVertical: 14, width: '100%',
        alignItems: 'center',
    },
    doneSecondaryTxt: { color: '#475569', fontWeight: '600', fontSize: 15 },
});