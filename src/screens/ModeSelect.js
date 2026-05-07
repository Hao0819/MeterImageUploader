// src/screens/ModeSelect.js
import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { Buffer } from 'buffer';
import { COLORS, UI } from '../theme/ui';
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

// ─── Mode definitions ─────────────────────────────────────────────────────────
const MODES = [
    {
        id: 0,
        icon: '↺',
        label: 'Default Reset',
        desc: 'Reset meter to factory default settings',
        color: '#475569',
        soft: '#f8fafc',
        border: '#e2e8f0',
        iconBg: '#f1f5f9',
        arrow: '#64748b',
    },
    {
        id: 1,
        icon: '◎',
        label: 'Normal Mode',
        desc: 'Upload profile image & greeting screen',
        color: '#16a34a',
        soft: '#f0fdf4',
        border: '#bbf7d0',
        iconBg: '#dcfce7',
        arrow: '#16a34a',
        tags: ['Profile', 'Greeting'],
    },
    {
        id: 2,
        icon: '⊞',
        label: 'Extended Mode',
        desc: 'Multi-page upload',
        color: '#2563eb',
        soft: '#eff6ff',
        border: '#bfdbfe',
        iconBg: '#dbeafe',
        arrow: '#2563eb',
        tags: ['P1', 'P2', 'S1', 'S2', 'S3'],
    },
];

export default function ModeSelect({ navigation, route }) {
    const { device, deviceName, phase } = route.params;
    const deviceId = device?.id || 'Unknown ID';
    const isConnected = true;
    const [resetting, setResetting] = useState(false);
    const [doneVisible, setDoneVisible] = useState(false);



    const handleSelect = async (modeId) => {
        if (modeId === 0) {
            handleReset();
        } else if (modeId === 1) {
            navigation.navigate('Mode1Flow', { device, deviceName, phase });
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
                    text: 'Reset',
                    style: 'destructive',
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
                            Alert.alert('Error', err.message);
                        } finally {
                            setResetting(false);
                        }
                    },
                },
            ]
        );
    };

    return (
        <SafeAreaView style={s.container}>
            <View style={s.header}>
                <TouchableOpacity
                    onPress={() => navigation.navigate('PhaseSelect', { device, deviceName })}
                    style={s.back}
                >
                    <Text style={s.backText}>‹ Back</Text>
                </TouchableOpacity>

                {/* Device bar */}
                <View style={s.deviceBar}>
                    <View style={s.deviceLeft}>
                        <View
                            style={[
                                s.connDot,
                                { backgroundColor: isConnected ? '#22c55e' : '#ef4444' }
                            ]}
                        />
                        <View style={{ flex: 1 }}>
                            <Text style={s.connText} numberOfLines={1}>
                                {deviceName}
                            </Text>
                            <Text style={s.connId} numberOfLines={1}>
                                {deviceId}
                            </Text>
                        </View>
                    </View>

                    <Text
                        style={[
                            s.connStatus,
                            { color: isConnected ? COLORS.success : COLORS.danger }
                        ]}
                    >
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </Text>
                </View>

                <Text style={s.title}>Select mode</Text>
                <Text style={s.subtitle}>Choose an upload mode</Text>
            </View>

            {/* Mode cards */}
            <View style={s.cards}>
                {MODES.map((mode) => (
                    <TouchableOpacity
                        key={mode.id}
                        style={[
                            s.card,
                            { backgroundColor: mode.soft, borderColor: mode.border },
                        ]}
                        onPress={() => handleSelect(mode.id)}
                        disabled={resetting}
                        activeOpacity={0.8}
                    >
                        <View style={[s.iconWrap, { backgroundColor: mode.iconBg }]}>
                            <Text style={[s.iconTxt, { color: mode.color }]}>{mode.icon}</Text>
                        </View>

                        <View style={s.cardBody}>
                            <Text style={[s.cardTitle, { color: mode.color }]}>
                                {mode.label}
                            </Text>
                            <Text style={s.cardDesc}>{mode.desc}</Text>
                        </View>

                        {resetting && mode.id === 0
                            ? <ActivityIndicator color={mode.color} />
                            : <Text style={[s.arrow, { color: mode.arrow }]}>›</Text>
                        }
                    </TouchableOpacity>
                ))}
            </View>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container: UI.screen,

    header: {
        paddingHorizontal: 20,
        paddingTop: 28,
        paddingBottom: 20,
    },

    back: { marginBottom: 12 },

    backText: {
        color: COLORS.primary,
        fontSize: 17,
        fontWeight: '600',
    },

    deviceBar: UI.deviceBar,

    deviceLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },

    connDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },

    connText: {
        fontSize: 13,
        fontWeight: '600',
        color: COLORS.text,
    },

    connId: {
        fontSize: 10,
        color: COLORS.muted,
        marginTop: 1,
    },

    connStatus: {
        fontSize: 12,
        fontWeight: '600',
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

    cards: {
        paddingHorizontal: 20,
        gap: 12,
    },

    card: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        backgroundColor: COLORS.card,
    },

    iconWrap: {
        width: 52,
        height: 52,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },

    iconTxt: {
        fontSize: 22,
        fontWeight: '700',
    },

    cardBody: { flex: 1 },

    cardTitle: {
        fontSize: 16,
        fontWeight: '700',
    },

    cardDesc: {
        fontSize: 12,
        color: COLORS.subtext,
    },

    arrow: {
        fontSize: 22,
        fontWeight: '700',
    },
});