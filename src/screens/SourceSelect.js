// src/screens/SourceSelect.jsx
import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    Alert,
} from 'react-native';
import ImageCropPicker from 'react-native-image-crop-picker';
import { getDimensions, IMAGE_TYPE } from '../utils/ImageConverter';
import { COLORS, UI } from '../theme/ui';

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
                cropperActiveWidgetColor: COLORS.primary,
                cropperToolbarColor: '#ffffff',
                cropperStatusBarColor: COLORS.bg,
                cropperToolbarWidgetColor: COLORS.text,
                compressImageQuality: 1,
            });

            navigation.navigate('CropSend', {
                device,
                deviceName,
                phase,
                imageType,
                imageUri: img.path,
            });
        } catch (e) {
            if (e.code !== 'E_PICKER_CANCELLED') {
                Alert.alert('Error', e.message);
            }
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

                <View style={s.deviceBar}>
                    <View style={s.deviceLeft}>
                        <View style={s.connDot} />
                        <View style={{ flexShrink: 1 }}>
                            <Text style={s.connText} numberOfLines={1}>{deviceName}</Text>
                            <Text style={s.connId}>
                                {phase === 'single' ? 'Single phase' : '3-Phase'}
                            </Text>
                        </View>
                    </View>
                    <Text style={s.connStatus}>Connected</Text>
                </View>

                <Text style={s.title}>Choose source</Text>
                <Text style={s.subtitle}>{typeLabel} · {w}×{h} px</Text>
            </View>

            <View style={s.cards}>
                <TouchableOpacity
                    style={s.bigCard}
                    onPress={openCamera}
                    activeOpacity={0.8}
                >
                    <View style={s.bigIcon}>
                        <Text style={s.bigIconText}>CAM</Text>
                    </View>
                    <Text style={s.bigTitle}>Camera</Text>
                    <Text style={s.bigDesc}>
                        Take a photo, then crop to {w}×{h} px
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={s.bigCard}
                    onPress={openGallery}
                    activeOpacity={0.8}
                >
                    <View style={s.bigIcon}>
                        <Text style={s.bigIconText}>GAL</Text>
                    </View>
                    <Text style={s.bigTitle}>Gallery</Text>
                    <Text style={s.bigDesc}>
                        Pick an existing photo and crop to {w}×{h} px
                    </Text>
                </TouchableOpacity>
            </View>

            <Text style={s.hint}>
                Output: {w}×{h} px · RGB565 · {w * h * 2} bytes
            </Text>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container: UI.screen,

    header: {
        paddingHorizontal: 20,
        paddingTop: 20,
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
        backgroundColor: '#22c55e',
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
        color: COLORS.success,
        fontWeight: '600',
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
        flex: 1,
        paddingHorizontal: 20,
        gap: 14,
    },
    bigCard: {
        ...UI.card,
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    bigIcon: {
        width: 68,
        height: 68,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
        backgroundColor: '#dbeafe',
        borderWidth: 1,
        borderColor: COLORS.primaryBorder,
    },
    bigIconText: {
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 1,
        color: COLORS.primary,
    },
    bigTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.text,
        marginBottom: 6,
    },
    bigDesc: {
        fontSize: 13,
        color: COLORS.subtext,
        textAlign: 'center',
        lineHeight: 19,
    },

    hint: {
        textAlign: 'center',
        padding: 20,
        fontSize: 12,
        color: COLORS.muted,
    },
});