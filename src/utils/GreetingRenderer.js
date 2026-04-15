// // src/utils/GreetingRenderer.js
// import React from 'react';
// import { View, Text, StyleSheet } from 'react-native';
// import { GREETING_W, GREETING_H } from './ImageConverter';

// export default function GreetingRenderer({ text, viewRef }) {
//     const hasArabic = /[\u0600-\u06FF]/.test(text);
//     const hasChinese = /[\u4E00-\u9FFF]/.test(text);
//     const charCount = text.length;

//     let fontSize = 22;
//     if (hasChinese || hasArabic) {
//         if (charCount > 30) fontSize = 14;
//         else if (charCount > 20) fontSize = 16;
//         else if (charCount > 10) fontSize = 19;
//         else fontSize = 24;
//     } else {
//         if (charCount > 80) fontSize = 13;
//         else if (charCount > 60) fontSize = 15;
//         else if (charCount > 40) fontSize = 17;
//         else if (charCount > 20) fontSize = 20;
//         else fontSize = 24;
//     }
//     return (
//         <View
//             ref={viewRef}
//             style={styles.canvas}
//             collapsable={false}
//         >
//             <Text style={[
//                 styles.text,
//                 { fontSize, lineHeight: fontSize + 2 },
//                 hasArabic && styles.rtlText,
//             ]}>
//                 {text}
//             </Text>
//         </View>
//     );
// }

// const styles = StyleSheet.create({
//     canvas: {
//         width: GREETING_W,   // 128
//         height: GREETING_H,  // 128
//         backgroundColor: 'white',
//         alignItems: 'center',
//         justifyContent: 'flex-start',
//         padding: 4,
//     },
//     text: {
//         color: 'black',
//         textAlign: 'center',
//     },
//     rtlText: {
//         writingDirection: 'rtl',
//         textAlign: 'right',
//     },
// });
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GREETING_W, GREETING_H } from './ImageConverter';

export default function GreetingRenderer({ text, viewRef }) {
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    const hasChinese = /[\u4E00-\u9FFF]/.test(text);
    const n = text.length;

    // 128x128px 画布，每行能放多少字：
    // fontSize=14 → 每行约 8个中文字 → 50字需要7行 → 7*18=126px ✓
    // fontSize=12 → 阿拉伯文每行约 10字符宽 → 120字需要约8行 → 8*16=128px ✓
    const USABLE = GREETING_W - 6; // 122px

    let fontSize, lineHeight;

    if (hasArabic) {
        // 阿拉伯文保持原来逻辑不动
        if (n > 100) fontSize = 12;
        else if (n > 80) fontSize = 13;
        else if (n > 60) fontSize = 14;
        else if (n > 40) fontSize = 16;
        else if (n > 20) fontSize = 19;
        else if (n > 10) fontSize = 22;
        else fontSize = 26;
        lineHeight = Math.round(fontSize * 1.3);
    } else {
        // 中文和英文：动态计算，确保不溢出
        const charWidthRatio = hasChinese ? 1.0 : 0.52;
        const sizes = [24, 22, 20, 18, 16, 14, 13, 12, 11, 10];
        fontSize = 10; // fallback
        lineHeight = 13;

        for (const fs of sizes) {
            const lh = Math.round(fs * 1.3);
            const charsPerLine = Math.floor(USABLE / (fs * charWidthRatio));
            if (charsPerLine < 1) continue;
            const totalHeight = Math.ceil(n / charsPerLine) * lh;
            if (totalHeight <= USABLE) {
                fontSize = fs;
                lineHeight = lh;
                break;
            }
        }
    }


    return (
        <View
            ref={viewRef}
            style={styles.canvas}
            collapsable={false}
        >
            <Text style={[
                styles.text,
                { fontSize, lineHeight },
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
        justifyContent: 'flex-start',
        padding: 3,
        // 去掉 overflow: 'hidden' ← 这个会裁掉文字
    },
    text: {
        color: 'black',
        textAlign: 'center',
        // 去掉 flexShrink 和 flexWrap ← 这两个会压缩截断文字
    },
    rtlText: {
        writingDirection: 'rtl',
        textAlign: 'right',
    },
});