// src/screens/CameraScreen.jsx
import React, { useRef, useState, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    Alert, SafeAreaView, PermissionsAndroid, Platform,
    TouchableWithoutFeedback,  // ← 加这个
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import ImageCropPicker from 'react-native-image-crop-picker';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';

// Profile image is always 128×128 — no imageType param needed
const PROFILE_W = 128;
const PROFILE_H = 128;

// ─── Request permission to save to album ───────────────────
async function requestSavePermission() {
    if (Platform.OS !== 'android') return true;

    if (Platform.Version >= 33) {
        // Android 13+
        const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
        );
        return result === PermissionsAndroid.RESULTS.GRANTED;
    } else {
        // Android 12 以下
        const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
        );
        return result === PermissionsAndroid.RESULTS.GRANTED;
    }
}

export default function CameraScreen({ navigation, route }) {
    const { device: bleDevice, deviceName, phase } = route.params;

    const cam = useRef(null);
    const [cameraPosition, setCameraPosition] = useState('back');
    const device = useCameraDevice(cameraPosition);
    const { hasPermission, requestPermission } = useCameraPermission();
    const [busy, setBusy] = useState(false);
    const [focusPoint, setFocusPoint] = useState(null);  // ← 加这行
    useEffect(() => {
        if (!hasPermission) requestPermission();
    }, [hasPermission, requestPermission]);

    // After crop, go to GreetingInput (not CropSend directly)
    const afterCrop = (uri) => {
        navigation.navigate('GreetingInput', {
            device: bleDevice,
            deviceName,
            phase,
            imageUri: uri,
        });
    };

    const onTapFocus = async (e) => {
        const { locationX, locationY } = e.nativeEvent;
        setFocusPoint({ x: locationX, y: locationY });
        try {
            await cam.current.focus({ x: locationX, y: locationY });
        } catch (_) { }
        setTimeout(() => setFocusPoint(null), 1000);
    };

    const flipCamera = () => {
        setCameraPosition(p => p === 'back' ? 'front' : 'back');
    };
    
    const shoot = async () => {
        if (!cam.current || busy) return;
        setBusy(true);
        try {
            const photo = await cam.current.takePhoto({ flash: 'off' });
            const uri = photo.path.startsWith('/') ? `file://${photo.path}` : photo.path;

            // #1 — Save to album
            const ok = await requestSavePermission();
            if (ok) {
                await CameraRoll.save(uri, { type: 'photo', album: 'MeterApp' });
            }

            const cropped = await ImageCropPicker.openCropper({
                path: uri,
                width: PROFILE_W,
                height: PROFILE_H,
                cropperToolbarTitle: `Crop to ${PROFILE_W}×${PROFILE_H}`,
                cropperActiveWidgetColor: '#16a34a',
                cropperToolbarColor: '#ffffff',
                cropperStatusBarColor: '#f8fafc',
                cropperToolbarWidgetColor: '#0f172a',
                compressImageQuality: 1,
            });
            afterCrop(cropped.path);
        } catch (e) {
            if (e.code !== 'E_PICKER_CANCELLED') Alert.alert('Error', e.message);
        } finally {
            setBusy(false);
        }
    };

    const gallery = async () => {
        try {
            const img = await ImageCropPicker.openPicker({
                width: PROFILE_W,
                height: PROFILE_H,
                cropping: true,
                cropperToolbarTitle: `Crop to ${PROFILE_W}×${PROFILE_H}`,
                cropperActiveWidgetColor: '#16a34a',
                cropperToolbarColor: '#ffffff',
                cropperStatusBarColor: '#f8fafc',
                cropperToolbarWidgetColor: '#0f172a',
                compressImageQuality: 1,
            });
            afterCrop(img.path);
        } catch (e) {
            if (e.code !== 'E_PICKER_CANCELLED') Alert.alert('Error', e.message);
        }
    };

    if (!hasPermission) {
        return (
            <SafeAreaView style={styles.center}>
                <View style={styles.centerCard}>
                    <Text style={styles.permTitle}>Camera permission required</Text>
                    <Text style={styles.permText}>Allow camera access to capture the profile picture.</Text>
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
            <TouchableWithoutFeedback onPress={onTapFocus}>
                <View style={StyleSheet.absoluteFill}>
                    <Camera ref={cam} style={StyleSheet.absoluteFill} device={device} isActive photo />
                    {focusPoint && (
                        <View style={[styles.focusBox, { left: focusPoint.x - 30, top: focusPoint.y - 30 }]} />
                    )}
                </View>
            </TouchableWithoutFeedback>
            {/* Top bar */}
            <SafeAreaView style={styles.topBar}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.topBtn}>
                    <Text style={styles.topBtnTxt}>✕</Text>
                </TouchableOpacity>
                <View style={styles.topTitlePill}>
                    <Text style={styles.topTitle}>Profile · {PROFILE_W}×{PROFILE_H}</Text>
                </View>
                <View style={{ width: 44 }} />
            </SafeAreaView>

            {/* Bottom bar */}
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
                <TouchableOpacity style={styles.flipBtn} onPress={flipCamera}>
                    <Text style={styles.flipTxt}>⟳</Text>
                </TouchableOpacity>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000000' },
    center: { flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', padding: 24 },
    centerCard: {
        width: '100%', maxWidth: 420, backgroundColor: '#ffffff',
        borderRadius: 18, padding: 24, borderWidth: 1, borderColor: '#e2e8f0',
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2,
    },
    permTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 8, textAlign: 'center' },
    permText: { color: '#64748b', fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 18 },
    permBtn: { backgroundColor: '#16a34a', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, alignSelf: 'center' },
    permBtnText: { color: '#ffffff', fontWeight: '700' },
    topBar: {
        position: 'absolute', top: 0, left: 0, right: 0,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 12,
    },
    topBtn: {
        width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 1, borderColor: '#e2e8f0',
    },
    topBtnTxt: { color: '#0f172a', fontSize: 20, fontWeight: '600' },
    topTitlePill: {
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 1, borderColor: '#e2e8f0',
    },
    topTitle: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
    bottomBar: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 28, paddingBottom: 36, paddingTop: 12,
    },
    galleryBtn: {
        width: 72, height: 72, borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: '#e2e8f0',
    },
    galleryTxt: { color: '#0f172a', fontSize: 12, fontWeight: '700' },
    shutter: {
        width: 84, height: 84, borderRadius: 42, borderWidth: 4, borderColor: '#ffffff',
        alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)',
    },
    shutterBusy: { borderColor: '#22c55e' },
    shutterInner: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#ffffff' },
    shutterInnerBusy: { backgroundColor: '#dcfce7' },
    focusBox: {
        position: 'absolute',
        width: 60, height: 60,
        borderWidth: 2, borderColor: '#22c55e',
        borderRadius: 4,
    },
    flipBtn: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: '#e2e8f0',
    },
    flipTxt: { color: '#0f172a', fontSize: 28, fontWeight: '600' },
});