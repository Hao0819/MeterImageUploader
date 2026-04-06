// src/screens/BleScanner.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, TouchableOpacity, FlatList,
    StyleSheet, SafeAreaView, ActivityIndicator, Alert, Platform
} from 'react-native';
import { startScan, connectDevice, requestBlePermissions } from '../utils/ble';
import { BleManager } from 'react-native-ble-plx';

const bleManager = new BleManager();
const TARGET_NAME = 'EBQ Meter';
const CONNECT_TIMEOUT_MS = 10000; // 10 seconds
const SCAN_DURATION_MS = 12000;   // 12 seconds

export default function BleScanner({ navigation }) {
    const [devices, setDevices] = useState([]);
    const [scanning, setScanning] = useState(false);
    const [connecting, setConnecting] = useState(null);
    const [bleReady, setBleReady] = useState(false); 
    const stopScanRef = useRef(null);
    const scanTimerRef = useRef(null);

    // #1 — Monitor Bluetooth on/off status
    useEffect(() => {
        const subscription = bleManager.onStateChange((state) => {
            if (state === 'PoweredOn') {
                setBleReady(true);
            } else {
                setBleReady(false);
                // If Bluetooth is turned off, stop the ongoing scan.
                stopScanning();
            }
        }, true); // true = get the current state immediately

        return () => {
            subscription.remove();
            stopScanRef.current?.();
            if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
        };
    }, []);

    const stopScanning = useCallback(() => {
        stopScanRef.current?.();
        stopScanRef.current = null;
        if (scanTimerRef.current) {
            clearTimeout(scanTimerRef.current);
            scanTimerRef.current = null;
        }
        setScanning(false);
    }, []);

    const scan = useCallback(async () => {
        // #1 — Check if Bluetooth is enabled before scanning.
        if (!bleReady) {
            Alert.alert(
                'Bluetooth is Off',
                'Please turn on Bluetooth to scan for devices.',
                [{ text: 'OK' }]
            );
            return;
        }

        const ok = await requestBlePermissions();
        if (!ok) {
            Alert.alert('Permission Denied', 'Bluetooth permissions are required.');
            return;
        }

        stopScanRef.current?.();
        if (scanTimerRef.current) clearTimeout(scanTimerRef.current);

        setDevices([]);
        setScanning(true);

        const stop = startScan(
            device => {
                const name = device.name || device.localName || '';
                if (!name.includes(TARGET_NAME)) return;

                setDevices(prev =>
                    prev.find(d => d.id === device.id) ? prev : [...prev, device]
                );
            },
            err => { Alert.alert('Scan Error', err); stopScanning(); },
        );

        stopScanRef.current = stop;
        scanTimerRef.current = setTimeout(() => stopScanning(), SCAN_DURATION_MS);
    }, [bleReady, stopScanning]);

    // #2 — Connection timeout handling
    const connectWithTimeout = useCallback((deviceId) => {
        return Promise.race([
            connectDevice(deviceId),
            new Promise((_, reject) =>
                setTimeout(
                    () => reject(new Error('Connection timed out. Please try again.')),
                    CONNECT_TIMEOUT_MS
                )
            ),
        ]);
    }, []);

    const connect = useCallback(async (device) => {
        stopScanning();
        setConnecting(device.id);
        try {
            //#2 — Replace the original connectDevice with connectWithTimeout
            const connected = await connectWithTimeout(device.id);
            navigation.navigate('PhaseSelect', {
                device: connected,
                deviceName: device.name || device.localName || device.id,
            });
        } catch (err) {
            //#2 — Retry option provided if connection fails
            Alert.alert(
                'Connection Failed',
                err.message,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Retry', onPress: () => connect(device) },
                ]
            );
        } finally {
            setConnecting(null);
        }
    }, [navigation, stopScanning, connectWithTimeout]);

    const renderDevice = ({ item }) => {
        const isConnecting = connecting === item.id;
        return (
            <TouchableOpacity
                style={styles.deviceCard}
                onPress={() => connect(item)}
                disabled={!!connecting}
                activeOpacity={0.8}
            >
                <View style={styles.deviceLeft}>
                    <View style={styles.dot} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.deviceName}>{item.name || item.localName || 'Unnamed Device'}</Text>
                        <Text style={styles.deviceId}>{item.id}</Text>
                        {item.rssi !== undefined && (
                            <Text style={styles.deviceRssi}>RSSI {item.rssi} dBm</Text>
                        )}
                    </View>
                </View>
                {isConnecting
                    ? <ActivityIndicator color="#16a34a" />
                    : <Text style={styles.connectArrow}>Connect ›</Text>
                }
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Meter LCD</Text>
                <Text style={styles.subtitle}>Select your device</Text>
            </View>

            {/* #1 — Show warning banner when Bluetooth is off */}
            {!bleReady && (
                <View style={styles.bleBanner}>
                    <Text style={styles.bleBannerText}>⚠️ Bluetooth is off — please enable it to scan</Text>
                </View>
            )}

            <TouchableOpacity
                style={[styles.scanBtn, scanning && styles.scanBtnActive, !bleReady && styles.scanBtnDisabled]}
                onPress={scanning ? stopScanning : scan}
                disabled={!!connecting || !bleReady}
                activeOpacity={0.85}
            >
                {scanning && <ActivityIndicator color="#ffffff" style={{ marginRight: 8 }} />}
                <Text style={[styles.scanBtnText, scanning && styles.scanBtnTextActive]}>
                    {scanning ? 'Scanning… (tap to stop)' : 'Scan for devices'}
                </Text>
            </TouchableOpacity>

            {devices.length === 0 && !scanning && (
                <View style={styles.empty}>
                    <Text style={styles.emptyText}>No EBQ Meter found.</Text>
                    <Text style={styles.emptyHint}>Make sure Bluetooth is on and the EBQ Meter is nearby.</Text>
                </View>
            )}

            <FlatList
                data={devices}
                keyExtractor={d => d.id}
                renderItem={renderDevice}
                contentContainerStyle={styles.list}
                ItemSeparatorComponent={() => <View style={styles.sep} />}
            />

            <View style={styles.footer}>
                <Text style={styles.footerText}>
                    {devices.length} device{devices.length !== 1 ? 's' : ''} found
                </Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    header: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 20 },
    title: { fontSize: 32, fontWeight: '700', color: '#0f172a', letterSpacing: -0.5 },
    subtitle: { fontSize: 15, color: '#16a34a', marginTop: 4 },

    // #1 — Warning banner when Bluetooth is off
    bleBanner: {
        marginHorizontal: 20, marginBottom: 12, paddingVertical: 10, paddingHorizontal: 16,
        backgroundColor: '#fef3c7', borderRadius: 10, borderWidth: 1, borderColor: '#fcd34d',
    },
    bleBannerText: { fontSize: 13, color: '#92400e', textAlign: 'center', fontWeight: '500' },

    scanBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        marginHorizontal: 20, marginBottom: 16, paddingVertical: 14,
        backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#dbe3ee',
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
    },
    scanBtnActive: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
    scanBtnDisabled: { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0', opacity: 0.6 }, // ✅ #1 禁用样式
    scanBtnText: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
    scanBtnTextActive: { color: '#ffffff' },
    list: { paddingHorizontal: 20, paddingBottom: 20, flexGrow: 1 },
    deviceCard: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#ffffff', borderRadius: 16, padding: 16,
        borderWidth: 1, borderColor: '#e2e8f0',
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    deviceLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e' },
    deviceName: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
    deviceId: { fontSize: 11, color: '#64748b', marginTop: 2 },
    deviceRssi: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
    connectArrow: { fontSize: 14, color: '#2563eb', fontWeight: '600', marginLeft: 12 },
    sep: { height: 10 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    emptyText: { fontSize: 16, color: '#475569', textAlign: 'center', fontWeight: '500' },
    emptyHint: { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 8 },
    footer: { padding: 20, alignItems: 'center' },
    footerText: { fontSize: 12, color: '#94a3b8' },
});