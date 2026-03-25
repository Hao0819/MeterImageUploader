import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, SafeAreaView } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import ImageCropPicker from 'react-native-image-crop-picker';
import { ASSET_W, ASSET_H } from '../utils/ImageConverter';

const GUIDE_W = ASSET_W * 3;
const GUIDE_H = ASSET_H * 3;

export default function CameraScreen({ navigation, route }) {
    const { device: bleDevice, deviceName, phase } = route.params;
    const cam = useRef(null);
    const device = useCameraDevice('back');
    const { hasPermission, requestPermission } = useCameraPermission();
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!hasPermission) requestPermission();
    }, [hasPermission, requestPermission]);

    const shoot = async () => {
        if (!cam.current || busy) return;
        setBusy(true);
        try {
            const photo = await cam.current.takePhoto({ flash: 'off' });
            const uri = photo.path.startsWith('/') ? `file://${photo.path}` : photo.path;

            const cropped = await ImageCropPicker.openCropper({
                path: uri,
                width: ASSET_W,
                height: ASSET_H,
                cropperToolbarTitle: `Crop to ${ASSET_W}×${ASSET_H}`,
                cropperActiveWidgetColor: '#16a34a',
                cropperToolbarColor: '#ffffff',
                cropperStatusBarColor: '#f8fafc',
                cropperToolbarWidgetColor: '#0f172a',
                compressImageQuality: 1,
            });

            navigation.navigate('CropSend', {
                device: bleDevice,
                deviceName,
                phase,
                imageUri: cropped.path,
            });
        } catch (e) {
            if (e.code !== 'E_PICKER_CANCELLED') Alert.alert('Error', e.message);
        } finally {
            setBusy(false);
        }
    };

    const gallery = async () => {
        try {
            const img = await ImageCropPicker.openPicker({
                width: ASSET_W,
                height: ASSET_H,
                cropping: true,
                cropperToolbarTitle: `Crop to ${ASSET_W}×${ASSET_H}`,
                cropperActiveWidgetColor: '#16a34a',
                cropperToolbarColor: '#ffffff',
                cropperStatusBarColor: '#f8fafc',
                cropperToolbarWidgetColor: '#0f172a',
                compressImageQuality: 1,
            });

            navigation.navigate('CropSend', {
                device: bleDevice,
                deviceName,
                phase,
                imageUri: img.path,
            });
        } catch (e) {
            if (e.code !== 'E_PICKER_CANCELLED') Alert.alert('Error', e.message);
        }
    };

    if (!hasPermission) {
        return (
            <SafeAreaView style={styles.center}>
                <View style={styles.centerCard}>
                    <Text style={styles.permTitle}>Camera permission required</Text>
                    <Text style={styles.permText}>
                        Allow camera access to capture and crop an image for the meter LCD.
                    </Text>
                    <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
                        <Text style={styles.permBtnText}>Grant access</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    if (!device) {
        return (
            <SafeAreaView style={styles.center}>
                <View style={styles.centerCard}>
                    <Text style={styles.permTitle}>Loading camera…</Text>
                    <Text style={styles.permText}>Please wait while the back camera becomes ready.</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <View style={styles.container}>
            <Camera ref={cam} style={StyleSheet.absoluteFill} device={device} isActive photo />

            <SafeAreaView style={styles.topBar}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.topBtn}>
                    <Text style={styles.topBtnTxt}>✕</Text>
                </TouchableOpacity>

                <View style={styles.topTitlePill}>
                    <Text style={styles.topTitle}>{ASSET_W}×{ASSET_H}</Text>
                </View>

                <View style={{ width: 44 }} />
            </SafeAreaView>

            <View style={styles.overlayTop} />
            <View style={styles.overlayMid}>
                <View style={styles.overlaySide} />
                <View style={[styles.guide, { width: GUIDE_W, height: GUIDE_H }]}>
                    {[
                        { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
                        { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
                        { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
                        { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
                    ].map((cs, i) => (
                        <View key={i} style={[styles.corner, cs]} />
                    ))}
                </View>
                <View style={styles.overlaySide} />
            </View>
            <View style={styles.overlayBottom} />

            <SafeAreaView style={styles.bottomBar}>
                <TouchableOpacity style={styles.galleryBtn} onPress={gallery}>
                    <Text style={styles.galleryTxt}>Gallery</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.shutter, busy && styles.shutterBusy]}
                    onPress={shoot}
                    disabled={busy}
                >
                    <View style={[styles.shutterInner, busy && styles.shutterInnerBusy]} />
                </TouchableOpacity>

                <View style={{ width: 72 }} />
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },

    center: {
        flex: 1,
        backgroundColor: '#f8fafc',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    centerCard: {
        width: '100%',
        maxWidth: 420,
        backgroundColor: '#ffffff',
        borderRadius: 18,
        padding: 24,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
    },
    permTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#0f172a',
        marginBottom: 8,
        textAlign: 'center',
    },
    permText: {
        color: '#64748b',
        fontSize: 14,
        lineHeight: 21,
        textAlign: 'center',
        marginBottom: 18,
    },
    permBtn: {
        backgroundColor: '#16a34a',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
        alignSelf: 'center',
    },
    permBtnText: {
        color: '#ffffff',
        fontWeight: '700',
    },

    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    topBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.94)',
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    topBtnTxt: {
        color: '#0f172a',
        fontSize: 20,
        fontWeight: '600',
    },
    topTitlePill: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.94)',
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    topTitle: {
        color: '#0f172a',
        fontSize: 13,
        fontWeight: '700',
    },

    overlayTop: {
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.34)',
        width: '100%',
    },
    overlayMid: {
        flexDirection: 'row',
        height: GUIDE_H,
    },
    overlaySide: {
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.34)',
    },
    guide: {
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.65)',
    },
    corner: {
        position: 'absolute',
        width: 22,
        height: 22,
        borderColor: '#22c55e',
        borderWidth: 3,
    },
    overlayBottom: {
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.34)',
        width: '100%',
    },

    bottomBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 28,
        paddingBottom: 24,
        paddingTop: 12,
    },
    galleryBtn: {
        width: 72,
        height: 72,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.96)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    galleryTxt: {
        color: '#0f172a',
        fontSize: 12,
        fontWeight: '700',
    },
    shutter: {
        width: 84,
        height: 84,
        borderRadius: 42,
        borderWidth: 4,
        borderColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.18)',
    },
    shutterBusy: {
        borderColor: '#22c55e',
    },
    shutterInner: {
        width: 68,
        height: 68,
        borderRadius: 34,
        backgroundColor: '#ffffff',
    },
    shutterInnerBusy: {
        backgroundColor: '#dcfce7',
    },
});