// src/screens/UpdateTypeSelect.jsx
import React from 'react';
import {
    View, Text, TouchableOpacity,
    StyleSheet, SafeAreaView,
} from 'react-native';

const OPTIONS = [
    {
        type: 'greeting',
        label: 'Update Greeting only',
        desc: 'Keep existing profile image, only update the greeting screen',
        emoji: '👋',
        cardBg: '#fff7ed',
        border: '#fed7aa',
        tagColor: '#c2410c',
    },
    {
        type: 'profile',
        label: 'Update Profile only',
        desc: 'Keep existing greeting, only update the profile picture',
        emoji: '🖼️',
        cardBg: '#eff6ff',
        border: '#bfdbfe',
        tagColor: '#2563eb',
    },
    {
        type: 'both',
        label: 'Update Greeting & Profile',
        desc: 'Update both the profile picture and greeting screen',
        emoji: '✨',
        cardBg: '#f0fdf4',
        border: '#86efac',
        tagColor: '#16a34a',
    },
];

export default function UpdateTypeSelect({ navigation, route }) {
    const { device, deviceName, phase } = route.params;

    const go = (updateType) => {
        if (updateType === 'greeting') {
            // Skip camera — go straight to greeting input
            navigation.navigate('GreetingInput', {
                device,
                deviceName,
                phase,
                imageUri: null,   // no new profile image
                updateType,
            });
        } else {
            // 'profile' or 'both' — need camera first
            navigation.navigate('Camera', { device, deviceName, phase, updateType });
        }
    };

    return (
        <SafeAreaView style={s.container}>
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
                    <Text style={s.backText}>‹ Back</Text>
                </TouchableOpacity>

                <View style={s.connBadge}>
                    <View style={s.connDot} />
                    <Text style={s.connText}>
                        {deviceName} · {phase === 'single' ? 'Single phase' : '3-Phase'}
                    </Text>
                </View>

                <Text style={s.title}>Select update type</Text>
                <Text style={s.subtitle}>Choose what you want to upload to the meter LCD</Text>
            </View>

            <View style={s.cards}>
                {OPTIONS.map(({ type, label, desc, emoji, cardBg, border, tagColor }) => (
                    <TouchableOpacity
                        key={type}
                        style={[s.card, { backgroundColor: cardBg, borderColor: border }]}
                        onPress={() => go(type)}
                        activeOpacity={0.8}
                    >
                        <View style={[s.iconBox, { backgroundColor: cardBg }]}>
                            <Text style={s.emoji}>{emoji}</Text>
                        </View>
                        <View style={s.cardBody}>
                            <Text style={[s.cardTitle, { color: tagColor }]}>{label}</Text>
                            <Text style={s.cardDesc}>{desc}</Text>
                        </View>
                        <Text style={[s.arrow, { color: tagColor }]}>›</Text>
                    </TouchableOpacity>
                ))}
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
        borderRadius: 18, padding: 18, borderWidth: 1,
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    iconBox: {
        width: 52, height: 52, borderRadius: 13,
        alignItems: 'center', justifyContent: 'center', marginRight: 14,
    },
    emoji: { fontSize: 26 },
    cardBody: { flex: 1 },
    cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 3 },
    cardDesc: { fontSize: 13, color: '#64748b' },
    arrow: { fontSize: 22, fontWeight: '700' },
});