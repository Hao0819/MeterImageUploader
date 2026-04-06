// src/utils/GreetingRenderer.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GREETING_W, GREETING_H } from './ImageConverter';

export default function GreetingRenderer({ text, viewRef }) {
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    const hasChinese = /[\u4E00-\u9FFF]/.test(text);
    const charCount = text.length;

    // 128x128 空间更大，字体调大
    let fontSize = 20;
    if (charCount > 80) fontSize = 11;
    else if (charCount > 60) fontSize = 13;
    else if (charCount > 40) fontSize = 15;
    else if (charCount > 20) fontSize = 17;

    // 中文/阿拉伯字符较宽，稍微缩小避免截断
    if (hasChinese || hasArabic) fontSize = Math.max(fontSize - 2, 11);

    return (
        <View
            ref={viewRef}
            style={styles.canvas}
            collapsable={false}
        >
            <Text style={[
                styles.text,
                { fontSize, lineHeight: fontSize + 8 },
                hasArabic && styles.rtlText,
            ]}>
                {text}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    canvas: {
        width: GREETING_W,   // 128
        height: GREETING_H,  // 128
        backgroundColor: 'white',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8,
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