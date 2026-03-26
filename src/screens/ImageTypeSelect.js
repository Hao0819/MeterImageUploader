// src/screens/ImageTypeSelect.jsx
import React from 'react';
import {
    View, Text, TouchableOpacity,
    StyleSheet, SafeAreaView,
} from 'react-native';
import { IMAGE_TYPE, ASSET_W, ASSET_H, LOGO_W, LOGO_H, GREETING_W, GREETING_H } from '../utils/ImageConverter';

const TYPES = [
    {
        type: IMAGE_TYPE.PROFILE,
        label: 'Profile picture',
        desc: `RGB565 colour · ${ASSET_W}×${ASSET_H} px`,
        tag: 'PFP',
        color: '#eff6ff',
        tagColor: '#2563eb',
        border: '#bfdbfe',
        card: '#f0f9ff',
    },
    {
        type: IMAGE_TYPE.LOGO,
        label: 'Company logo',
        desc: `RGB565 colour · ${LOGO_W}×${LOGO_H} px`,
        tag: 'LOGO',
        color: '#f0fdf4',
        tagColor: '#16a34a',
        border: '#bbf7d0',
        card: '#f0fdf4',
    },
    {
        type: IMAGE_TYPE.GREETING,
        label: 'Greeting screen',
        desc: `1-bit mono · ${GREETING_W}×${GREETING_H} px · text only`,
        tag: 'TXT',
        color: '#fff7ed',
        tagColor: '#c2410c',
        border: '#fed7aa',
        card: '#fff7ed',
    },
];

export default function ImageTypeSelect({ navigation, route }) {
    const { device, deviceName, phase } = route.params;

    const handleSelect = (imageType) => {
        if (imageType === IMAGE_TYPE.GREETING) {
            navigation.navigate('GreetingInput', { device, deviceName, phase });
        } else {
            navigation.navigate('SourceSelect', { device, deviceName, phase, imageType });
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

                <Text style={s.title}>Select image type</Text>
                <Text style={s.subtitle}>Choose what you want to upload to the meter LCD</Text>
            </View>

            <View style={s.cards}>
                {TYPES.map(({ type, label, desc, tag, color, tagColor, border, card }) => (
                    <TouchableOpacity
                        key={type}
                        style={[s.card, { backgroundColor: card, borderColor: border }]}
                        onPress={() => handleSelect(type)}
                        activeOpacity={0.8}
                    >
                        <View style={[s.iconBox, { backgroundColor: color }]}>
                            <Text style={[s.iconText, { color: tagColor }]}>{tag}</Text>
                        </View>

                        <View style={s.cardBody}>
                            <Text style={s.cardTitle}>{label}</Text>
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

    header: {
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 24,
    },
    back: { marginBottom: 12 },
    backText: { color: '#16a34a', fontSize: 17, fontWeight: '600' },

    connBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 14,
        backgroundColor: '#f0fdf4',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: '#bbf7d0',
    },
    connDot: {
        width: 7, height: 7,
        borderRadius: 4,
        backgroundColor: '#22c55e',
    },
    connText: { fontSize: 11, color: '#15803d', fontWeight: '600' },

    title: {
        fontSize: 26, fontWeight: '700',
        color: '#0f172a', letterSpacing: -0.3,
        marginBottom: 4,
    },
    subtitle: { fontSize: 13, color: '#64748b' },

    cards: { paddingHorizontal: 20, gap: 14 },

    card: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 18,
        padding: 18,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
    },

    iconBox: {
        width: 52, height: 52,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    iconText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },

    cardBody: { flex: 1 },
    cardTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a', marginBottom: 3 },
    cardDesc: { fontSize: 12, color: '#64748b', lineHeight: 17 },

    arrow: { fontSize: 22, fontWeight: '700' },
});