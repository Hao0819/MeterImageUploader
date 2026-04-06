# ⚡ EBQ Meter BLE App

A React Native mobile app for sending profile images and greeting text to smart electricity meters via Bluetooth Low Energy (BLE).

---

## 📱 Features

- **BLE Connection** — Scan and connect to EBQ meters wirelessly
- **Profile Image Transfer** — Send a 128×128 RGB565 profile image to the meter
- **Greeting Screen** — Send custom greeting text rendered as a 1-bit monochrome bitmap (128×128 px) to the meter LCD
- **Multi-language Support** — English, Chinese (中文), Arabic (العربية), Thai (ภาษาไทย), and more
- **Live LCD Preview** — See exactly how your greeting will look on the meter screen before sending
- **Two-colour Progress Bar** — Track profile and greeting transfer progress separately
- **Packet Log Viewer** — Inspect every BLE packet sent during transfer

---

## 🗂 Screen Flow

```
Device Scanner
     ↓
Image Picker / Cropper
     ↓
Greeting Input
     ↓
CropSend (Preview & Transfer)
     ↓
Log Viewer
```

---

## 📐 Data Specifications

| Data | Format | Resolution | Size |
|------|--------|------------|------|
| Profile image | RGB565 | 128×128 px | 32,768 bytes |
| Greeting bitmap | 1-bit monochrome | 128×128 px | 2,048 bytes |

---

## ✍️ Greeting Text Limits

| Language | Character Limit |
|----------|----------------|
| English / Numbers / Symbols only | **60 characters** |
| Chinese, Arabic, Thai, or any non-English | **30 characters** |

The app automatically detects the language as you type and adjusts the limit in real time.

---

## 🔧 Tech Stack

- **React Native** (iOS & Android)
- **react-native-ble-plx** — BLE communication
- **react-native-view-shot** — Offscreen rendering for bitmap capture
- **jpeg-js** — JPEG decoding for image conversion
- **react-native-fs** — File system access
- **buffer** — Binary data handling

---

## 📦 Installation

```bash
# Install dependencies
npm install

# iOS
cd ios && pod install && cd ..
npx react-native run-ios

# Android
npx react-native run-android
```

---

## 🔑 Permissions Required

### Android
```xml
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

### iOS
Add to `Info.plist`:
```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>This app uses Bluetooth to communicate with EBQ meters.</string>
```

---

## 📁 Project Structure

```
src/
├── screens/
│   ├── GreetingInput.js     # Greeting text input with live LCD preview
│   ├── CropSend.jsx         # Image preview and BLE transfer
│   └── LogViewer.js         # BLE packet log inspector
├── utils/
│   ├── ble.js               # BLE connection and packet sending logic
│   ├── ImageConverter.js    # RGB565 and mono1 image conversion
│   └── GreetingRenderer.js  # Offscreen text renderer for bitmap capture
```

---

## 🚀 BLE Transfer Process

1. **Profile image** is read from file, converted to RGB565 format, and split into packets (counters `0x0000`–`0x00FF`)
2. **Greeting bitmap** is rendered offscreen, captured as JPEG, decoded to RGBA, then converted to 1-bit mono and packed (counters `0x0380`–`0x038F`)
3. Both are sent via `sendCombined()` with progress callbacks
4. The two-colour progress bar shows blue for profile packets and orange for greeting packets

---

## 📋 Notes

- Supports **Single phase** and **3-Phase** meter modes
- The greeting preview in both `GreetingInput` and `CropSend` shows a fixed 128×128 px LCD simulation
- Arabic text is automatically rendered right-to-left (RTL)
- JPEG compression threshold is set to `brightness < 127` to avoid grey-edge artifacts in mono conversion
