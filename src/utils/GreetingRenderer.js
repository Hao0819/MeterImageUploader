// src/utils/GreetingRenderer.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GREETING_W, GREETING_H } from './ImageConverter';

export default function GreetingRenderer({ text, viewRef }) {
    const hasArabic = /[\u0600-\u06FF]/.test(text);

    const charCount = text.length;
    let fontSize = 16;
    if (charCount > 60) fontSize = 10;
    else if (charCount > 40) fontSize = 12;
    else if (charCount > 20) fontSize = 14;

    return (
        <View
            ref={viewRef}
            style={styles.canvas}
            collapsable={false}
        >
            <Text style={[
                styles.text,
                { fontSize, lineHeight: fontSize + 6 },
                hasArabic && styles.rtlText,
            ]}>
                {text}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    canvas: {
        width: GREETING_W,
        height: GREETING_H,
        backgroundColor: 'white',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
    },
    text: {
        color: 'black',
        textAlign: 'center',
    },
    rtlText: {
        writingDirection: 'rtl',
        textAlign: 'right',
    },
});