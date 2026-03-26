// src/screens/SourceSelect.jsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Alert } from 'react-native';
import ImageCropPicker from 'react-native-image-crop-picker';
import { getDimensions, IMAGE_TYPE } from '../utils/ImageConverter';

export default function SourceSelect({ navigation, route }) {
    const { device, deviceName, phase, imageType } = route.params;
    const { w, h } = getDimensions(imageType);

    const typeLabel = {
        [IMAGE_TYPE.PROFILE]: 'Profile picture',
        [IMAGE_TYPE.LOGO]: 'Company logo',
    }[imageType] || 'Image';

    const openGallery = async () => {
        try {
            const img = await ImageCropPicker.openPicker({
                width: w,
                height: h,
                cropping: true,
                cropperToolbarTitle: `Crop to ${w}×${h}`,
                cropperActiveWidgetColor: '#16a34a',
                cropperToolbarColor: '#ffffff',
                cropperStatusBarColor: '#f8fafc',
                cropperToolbarWidgetColor: '#0f172a',
                compressImageQuality: 1,
            });
            navigation.navigate('CropSend', {
                device, deviceName, phase, imageType,
                imageUri: img.path,
            });
        } catch (e) {
            if (e.code !== 'E_PICKER_CANCELLED') Alert.alert('Error', e.message);
        }
    };

    const openCamera = () =>
        navigation.navigate('Camera', { device, deviceName, phase, imageType });

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

                <Text style={s.title}>Choose source</Text>
                <Text style={s.subtitle}>{typeLabel} · {w}×{h} px</Text>
            </View>

            <View style={s.cards}>
                <TouchableOpacity style={[s.bigCard, s.cardBlue]} onPress={openCamera} activeOpacity={0.8}>
                    <View style={[s.bigIcon, s.iconBlue]}>
                        <Text style={[s.bigIconText, s.iconBlueText]}>CAM</Text>
                    </View>
                    <Text style={s.bigTitle}>Camera</Text>
                    <Text style={s.bigDesc}>Take a photo, then crop to {w}×{h} px</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[s.bigCard, s.cardGreen]} onPress={openGallery} activeOpacity={0.8}>
                    <View style={[s.bigIcon, s.iconGreen]}>
                        <Text style={[s.bigIconText, s.iconGreenText]}>GAL</Text>
                    </View>
                    <Text style={s.bigTitle}>Gallery</Text>
                    <Text style={s.bigDesc}>Pick an existing photo and crop to {w}×{h} px</Text>
                </TouchableOpacity>
            </View>

            <Text style={s.hint}>
                Output: {w}×{h} px · RGB565 · {w * h * 2} bytes
            </Text>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24 },
    back: { marginBottom: 12 },
    backText: { color: '#16a34a', fontSize: 17, fontWeight: '600' },
    connBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12,
        backgroundColor: '#f0fdf4', paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 20, alignSelf: 'flex-start',
        borderWidth: 1, borderColor: '#bbf7d0',
    },
    connDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' },
    connText: { fontSize: 11, color: '#15803d', fontWeight: '600' },
    title: { fontSize: 26, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
    subtitle: { fontSize: 13, color: '#64748b' },
    cards: { flex: 1, paddingHorizontal: 20, gap: 14 },
    bigCard: {
        flex: 1, backgroundColor: '#ffffff', borderRadius: 22,
        padding: 24, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1,
        shadowColor: '#000', shadowOpacity: 0.04,
        shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    cardBlue: { borderColor: '#bfdbfe' },
    cardGreen: { borderColor: '#bbf7d0' },
    bigIcon: {
        width: 68, height: 68, borderRadius: 18,
        alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    },
    iconBlue: { backgroundColor: '#eff6ff' },
    iconGreen: { backgroundColor: '#f0fdf4' },
    bigIconText: { fontSize: 14, fontWeight: '800', letterSpacing: 1 },
    iconBlueText: { color: '#2563eb' },
    iconGreenText: { color: '#16a34a' },
    bigTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 6 },
    bigDesc: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 19 },
    hint: { textAlign: 'center', padding: 20, fontSize: 12, color: '#94a3b8' },
});