// src/utils/GreetingRenderer.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GREETING_W, GREETING_H } from './ImageConverter';

export default function GreetingRenderer({ text, viewRef }) {
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    const hasChinese = /[\u4E00-\u9FFF]/.test(text);
    const charCount = text.length;

    let fontSize = 22;
    if (hasChinese || hasArabic) {
        // 中文/阿拉伯文，最多40字
        if (charCount > 30) fontSize = 14;
        else if (charCount > 20) fontSize = 16;
        else if (charCount > 10) fontSize = 19;
        else fontSize = 24;
    } else {
        // 英文，最多100字
        if (charCount > 80) fontSize = 13;
        else if (charCount > 60) fontSize = 15;
        else if (charCount > 40) fontSize = 17;
        else if (charCount > 20) fontSize = 20;
        else fontSize = 24;
    }
    return (
        <View
            ref={viewRef}
            style={styles.canvas}
            collapsable={false}
        >
            <Text style={[
                styles.text,
                { fontSize, lineHeight: fontSize + 2 },
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
        justifyContent: 'flex-start',
        padding: 4,
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