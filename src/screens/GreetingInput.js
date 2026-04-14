// src/screens/GreetingInput.js
import React, { useState, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, SafeAreaView, KeyboardAvoidingView,
    Platform, ScrollView,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { GREETING_W, GREETING_H, GREETING_MONO_BYTES } from '../utils/ImageConverter';
import GreetingRenderer from '../utils/GreetingRenderer';

export default function GreetingInput({ navigation, route }) {
    const { device, deviceName, phase, imageUri, updateType } = route.params;

    const [text, setText] = useState('');
    const [error, setError] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const inputRef = useRef(null);
    const canvasRef = useRef(null);

    const handleContinue = async () => {
        const trimmed = text.trim();
        if (!trimmed) { setError('Please enter some greeting text.'); return; }

        if (trimmed.length > effectiveMax) {
            setError(`Too long. Max ${effectiveMax} characters for this language.`);
            return;
        }
        setError('');
        setIsProcessing(true);

        try {
            const uri = await captureRef(canvasRef, {
                format: 'jpg',
                quality: 1.0,
                width: GREETING_W,
                height: GREETING_H,
                result: 'tmpfile',
            });

            const RNFS = require('react-native-fs');
            const base64 = await RNFS.readFile(uri, 'base64');
            const binary = atob(base64);
            const buffer = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                buffer[i] = binary.charCodeAt(i);
            }

            const jpeg = require('jpeg-js');
            const decoded = jpeg.decode(buffer.buffer, { useTArray: true, formatAsRGBA: true });
            const rgba = decoded.data;
            const W = decoded.width;
            const H = decoded.height;

            console.log('rgba length:', rgba.length, 'expected:', GREETING_W * GREETING_H * 4);
            console.log('nonZero bytes:', Array.from(rgba).filter(b => b !== 0).length);
            console.log('first 16 bytes:', Array.from(rgba.slice(0, 16)).join(','));

            // 5. RGBA → 1-bit mono
            // ✅ 用更严格的阈值，避免 JPEG 压缩灰边影响
            const monoPixels = new Uint8Array(W * H);
            for (let i = 0; i < W * H; i++) {
                const r = rgba[i * 4];
                const g = rgba[i * 4 + 1];
                const b = rgba[i * 4 + 2];
                const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
                monoPixels[i] = brightness < 127 ? 1 : 0; 
            }

            // 6. 打包倒序
            const packed = [];
            for (let y = 0; y < H; y++) {
                let cur = 0, bits = 0;
                for (let x = 0; x < W; x++) {
                    cur = (cur << 1) | monoPixels[y * W + x];
                    bits++;
                    if (bits === 8) { packed.push(cur); cur = 0; bits = 0; }
                }
                if (bits > 0) { cur <<= (8 - bits); packed.push(cur); }
            }

            const greetingBytes = new Uint8Array(packed);

            navigation.navigate('CropSend', {
                device,
                deviceName,
                phase,
                imageUri,
                updateType,
                greetingText: trimmed,
                greetingBytes: Array.from(greetingBytes),
            });

        } catch (err) {
            setError('Error: ' + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const hasChinese = /[\u4E00-\u9FFF]/.test(text);
    const effectiveMax = hasChinese ? 50 : 135;
    const remaining = effectiveMax - text.length;
    return (
        <SafeAreaView style={s.container}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

                    {/* Header */}
                    <View style={s.header}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
                                <Text style={s.backText}>‹ Back</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => navigation.navigate('PhaseSelect', { device, deviceName })}>
                                <Text style={{ fontSize: 22 }}>🏠</Text>
                            </TouchableOpacity>
                        </View>
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
                                placeholder="e.g. Welcome! 欢迎 مرحبا"
                                placeholderTextColor="#94a3b8"
                                multiline
                                maxLength={effectiveMax}
                                autoFocus
                                returnKeyType="default"
                            />
                        </TouchableOpacity>
                        <View style={s.inputMeta}>
                            {error
                                ? <Text style={s.errorText}>{error}</Text>
                                : <Text style={s.hintText}>
                                    {hasChinese ? '⚠️ Chinese · max 50 chars' : '✓ max 135 chars'}
                                </Text>
                            }
                            <Text style={[s.counter, remaining < 5 && s.counterWarn]}>{remaining}</Text>
                        </View>
                    </View>

                    {/* LCD preview */}
                    {text.trim().length > 0 && (
                        <View style={s.previewCard}>
                            <Text style={s.previewLabel}>LCD preview</Text>
                            <View style={s.lcdScreen}>
                                <Text style={[
                                    s.lcdText,
                                    /[\u0600-\u06FF]/.test(text) && {
                                        textAlign: 'right',
                                        writingDirection: 'rtl',
                                    }
                                ]}>
                                    {text.trim()}
                                </Text>
                            </View>
                            <Text style={s.previewHint}>✓ Supports English · 中文 · العربية</Text>
                        </View>
                    )}

                    {/* 离屏渲染（用户看不到，用于截图转bitmap） */}
                    <View style={s.offscreen}>
                        <GreetingRenderer
                            text={text.trim() || ' '}
                            viewRef={canvasRef}
                        />
                    </View>

                    {/* Continue */}
                    <TouchableOpacity
                        style={[s.btn, (!text.trim() || isProcessing) && s.btnDim]}
                        onPress={handleContinue}
                        disabled={!text.trim() || isProcessing}
                        activeOpacity={0.8}
                    >
                        <Text style={s.btnText}>
                            {isProcessing ? 'Processing...' : 'Continue →'}
                        </Text>
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
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    inputLabel: {
        fontSize: 12, color: '#64748b', fontWeight: '600',
        marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5,
    },
    inputWrap: {
        borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12,
        padding: 14, minHeight: 110, backgroundColor: '#f8fafc',
    },
    inputWrapErr: { borderColor: '#fca5a5' },
    input: { fontSize: 16, color: '#0f172a', lineHeight: 24, textAlignVertical: 'top' },
    inputMeta: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', marginTop: 8,
    },
    hintText: { fontSize: 11, color: '#94a3b8', flex: 1 },
    errorText: { fontSize: 11, color: '#dc2626', flex: 1 },
    counter: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
    counterWarn: { color: '#f97316' },
    infoCard: {
        backgroundColor: '#ffffff', borderRadius: 16, padding: 14,
        marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0',
    },
    infoRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    },
    infoKey: { fontSize: 12, color: '#64748b' },
    infoVal: { fontSize: 12, color: '#0f172a', fontWeight: '600' },
    previewCard: {
        backgroundColor: '#ffffff', borderRadius: 16, padding: 14, marginBottom: 16,
        borderWidth: 1, borderColor: '#e2e8f0',
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    previewLabel: {
        fontSize: 10, color: '#64748b', fontWeight: '700',
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
    },
lcdScreen: {
    backgroundColor: '#ffffff', 
    borderWidth: 1.5, 
    borderColor: '#cbd5e1',
    borderRadius: 8, 
    width: 128,        // ✅ 固定宽度
    height: 128,       // ✅ 固定高度
    alignItems: 'center', 
    justifyContent: 'center',
    overflow: 'hidden', // ✅ 防止文字溢出
},
    lcdText: {
        color: '#000000', fontSize: 13, textAlign: 'center',
        lineHeight: 20, fontFamily: 'monospace', letterSpacing: 0.3,
    },
    previewHint: { fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 8 },
    offscreen: {
        position: 'absolute',
        top: -9999,
        left: -9999,
        opacity: 0,
    },
    btn: {
        backgroundColor: '#16a34a', borderRadius: 14, padding: 18, alignItems: 'center',
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    btnDim: { opacity: 0.45 },
    btnText: { color: '#ffffff', fontSize: 17, fontWeight: '700' },
});