// src/screens/PhaseSelect.jsx
// 改成
import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    Alert,
} from 'react-native';
import { COLORS, UI } from '../theme/ui';

export default function PhaseSelect({ navigation, route }) {
    const { device, deviceName } = route.params;
    const deviceId = device?.id || 'Unknown ID';
    const isConnected = true;


    const go = (phase) => navigation.navigate('ModeSelect', { device, deviceName, phase });

    return (
        <SafeAreaView style={s.container}>
            <View style={s.header}>
                <TouchableOpacity
                    onPress={() => navigation.navigate('BleScanner')}
                    style={s.back}
                >
                    <Text style={s.backText}>‹ Back</Text>
                </TouchableOpacity>

                <View style={s.deviceBar}>
                    <View style={s.deviceLeft}>
                        <View
                            style={[
                                s.connDot,
                                { backgroundColor: isConnected ? '#22c55e' : '#ef4444' },
                            ]}
                        />
                        <View style={{ flex: 1, flexShrink: 1 }}>
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
                            { color: isConnected ? COLORS.success : COLORS.danger },
                        ]}
                    >
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </Text>
                </View>

                <Text style={s.title}>Select phase</Text>
                <Text style={s.subtitle}>
                    Choose the meter type to upload profile & greeting
                </Text>
            </View>

            <View style={s.cards}>
                <TouchableOpacity
                    style={[s.card, s.cardActive]}
                    onPress={() => go('single')}
                    activeOpacity={0.8}
                >
                    <View style={[s.iconWrap, s.iconWrapActive]}>
                        <Text style={[s.iconText, s.iconTextActive]}>1Φ</Text>
                    </View>

                    <View style={s.cardBody}>
                        <Text style={s.cardTitle}>Single phase</Text>
                        <Text style={s.cardDesc}>Standard single-phase meter LCD</Text>
                    </View>

                    <Text style={s.arrow}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[s.card, s.cardDisabled]}
                    onPress={() => Alert.alert('Coming soon', '3-Phase support is not available yet.')}
                    activeOpacity={0.75}
                >
                    <View style={s.iconWrap}>
                        <Text style={s.iconTextMuted}>3Φ</Text>
                    </View>

                    <View style={s.cardBody}>
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
    container: UI.screen,

    header: {
        paddingHorizontal: 20,
        paddingTop: 28,
        paddingBottom: 20,
    },
    back: {
        marginBottom: 12,
    },
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
    connStatus: {
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 8,
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
        gap: 14,
    },

    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.card,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
    },

    cardActive: {
        borderColor: COLORS.primaryBorder,
        backgroundColor: COLORS.primarySoft,
    },

    cardDisabled: {
        opacity: 0.82,
    },

    iconWrap: {
        width: 52,
        height: 52,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
        backgroundColor: COLORS.grayBtn,
        borderWidth: 1,
        borderColor: COLORS.grayBtnBorder,
    },

    iconWrapActive: {
        backgroundColor: '#dbeafe',
        borderColor: '#bfdbfe',
    },

    iconText: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.text,
    },

    iconTextActive: {
        color: COLORS.primary,
    },

    iconTextMuted: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.subtext,
    },

    cardBody: {
        flex: 1,
    },

    cardTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.text,
        marginBottom: 3,
    },

    cardTitleMuted: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.subtext,
        marginBottom: 3,
    },

    cardDesc: {
        fontSize: 13,
        color: COLORS.subtext,
    },

    arrow: {
        fontSize: 22,
        color: COLORS.primary,
        fontWeight: '700',
        marginLeft: 8,
    },

    badge: {
        backgroundColor: '#fff7ed',
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: '#fed7aa',
        marginLeft: 8,
    },

    badgeText: {
        fontSize: 11,
        color: '#c2410c',
        fontWeight: '700',
    },
});