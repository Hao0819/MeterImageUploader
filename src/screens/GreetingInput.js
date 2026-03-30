// src/screens/GreetingInput.jsx
import React, { useState, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, SafeAreaView, KeyboardAvoidingView,
    Platform, ScrollView,
} from 'react-native';
import { convertGreetingText, generateCheckerboardGreeting, GREETING_W, GREETING_H, GREETING_MONO_BYTES } from '../utils/ImageConverter';
const MAX_CHARS = 120;

export default function GreetingInput({ navigation, route }) {
    // ✅ Now receives imageUri from CameraScreen
    const { device, deviceName, phase, imageUri } = route.params;

    const [text, setText] = useState('');
    const [error, setError] = useState('');
    const inputRef = useRef(null);

    const handleContinue = () => {
        const trimmed = text.trim();
        if (!trimmed) { setError('Please enter some greeting text.'); return; }
        setError('');

        try {
            const greetingBytes = convertGreetingText(trimmed);
            navigation.navigate('CropSend', {
                device,
                deviceName,
                phase,
                imageUri,
                greetingText: trimmed,
                greetingBytes: Array.from(greetingBytes),
            });
        } catch (err) {
            setError('Error: ' + err.message);  // ← 这样就能看到报错了
        }
    };

    const remaining = MAX_CHARS - text.length;

    return (
        <SafeAreaView style={s.container}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

                    {/* Header */}
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

                        <Text style={s.title}>Greeting screen</Text>
                        <Text style={s.subtitle}>
                            Text will be rendered as a 1-bit bitmap ({GREETING_W}×{GREETING_H} px) on the meter LCD.
                        </Text>
                    </View>

                    {/* Input card */}
                    <View style={s.inputCard}>
                        <Text style={s.inputLabel}>Greeting message</Text>
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={() => inputRef.current?.focus()}
                            style={[s.inputWrap, error ? s.inputWrapErr : null]}
                        >
                            <TextInput
                                ref={inputRef}
                                style={s.input}
                                value={text}
                                onChangeText={t => { setText(t); setError(''); }}
                                placeholder="e.g. Welcome! Have a great day."
                                placeholderTextColor="#94a3b8"
                                multiline
                                maxLength={MAX_CHARS}
                                autoFocus
                                returnKeyType="default"
                            />
                        </TouchableOpacity>
                        <View style={s.inputMeta}>
                            {error
                                ? <Text style={s.errorText}>{error}</Text>
                                : <Text style={s.hintText}>Text is auto-wrapped and centred on the LCD.</Text>
                            }
                            <Text style={[s.counter, remaining < 20 && s.counterWarn]}>{remaining}</Text>
                        </View>
                    </View>

                    {/* Info card */}
                    <View style={s.infoCard}>
                        <InfoRow label="Output format" value="1-bit monochrome" />
                        <InfoRow label="Resolution" value={`${GREETING_W}×${GREETING_H} px`} />
                        <InfoRow label="Data size" value={`${GREETING_MONO_BYTES} bytes`} />
                        <InfoRow label="Font" value="5×7 bitmap (ASCII)" />
                    </View>

                    {/* LCD preview */}
                    {text.trim().length > 0 && (
                        <View style={s.previewCard}>
                            <Text style={s.previewLabel}>LCD preview</Text>
                            <View style={s.lcdScreen}>
                                <Text style={s.lcdText} numberOfLines={6}>{text.trim()}</Text>
                            </View>
                        </View>
                    )}

                    {/* Continue */}
                    <TouchableOpacity
                        style={[s.btn, !text.trim() && s.btnDim]}
                        onPress={handleContinue}
                        disabled={!text.trim()}
                        activeOpacity={0.8}
                    >
                        <Text style={s.btnText}>Continue →</Text>
                    </TouchableOpacity>

                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

function InfoRow({ label, value }) {
    return (
        <View style={s.infoRow}>
            <Text style={s.infoKey}>{label}</Text>
            <Text style={s.infoVal}>{value}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    scroll: { padding: 20, paddingBottom: 48 },
    header: { marginBottom: 24 },
    back: { marginBottom: 12 },
    backText: { color: '#16a34a', fontSize: 17, fontWeight: '600' },
    connBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14,
        backgroundColor: '#f0fdf4', paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 20, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#bbf7d0',
    },
    connDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' },
    connText: { fontSize: 11, color: '#15803d', fontWeight: '600' },
    title: { fontSize: 26, fontWeight: '700', color: '#0f172a', marginBottom: 6 },
    subtitle: { fontSize: 13, color: '#64748b', lineHeight: 19 },
    inputCard: {
        backgroundColor: '#ffffff', borderRadius: 18, padding: 16, marginBottom: 16,
        borderWidth: 1, borderColor: '#e2e8f0',
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    inputLabel: { fontSize: 12, color: '#64748b', fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
    inputWrap: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, minHeight: 110, backgroundColor: '#f8fafc' },
    inputWrapErr: { borderColor: '#fca5a5' },
    input: { fontSize: 16, color: '#0f172a', lineHeight: 24, textAlignVertical: 'top' },
    inputMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
    hintText: { fontSize: 11, color: '#94a3b8', flex: 1 },
    errorText: { fontSize: 11, color: '#dc2626', flex: 1 },
    counter: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
    counterWarn: { color: '#f97316' },
    infoCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    infoKey: { fontSize: 12, color: '#64748b' },
    infoVal: { fontSize: 12, color: '#0f172a', fontWeight: '600' },
    previewCard: {
        backgroundColor: '#ffffff', borderRadius: 16, padding: 14, marginBottom: 16,
        borderWidth: 1, borderColor: '#e2e8f0',
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    previewLabel: { fontSize: 10, color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
    lcdScreen: { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 80 },
    lcdText: { color: '#000000', fontSize: 13, textAlign: 'center', lineHeight: 20, fontFamily: 'monospace', letterSpacing: 0.3 },
    btn: {
        backgroundColor: '#16a34a', borderRadius: 14, padding: 18, alignItems: 'center',
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    btnDim: { opacity: 0.45 },
    btnText: { color: '#ffffff', fontSize: 17, fontWeight: '700' },
});