# 📟 MeterImageUploader

A React Native app for uploading **profile images** and **greeting screens** to an **EBQ Meter LCD device via BLE**.

---

## 🚀 Overview

MeterImageUploader allows users to:

* Scan and connect to EBQ Meter devices via BLE
* Select upload modes (Reset / Normal / Extended)
* Prepare image & greeting content
* Preview before sending
* Upload data with **real-time progress & logs**

📄 Based on: 

---

## ✨ Key Features

* 🔍 BLE scanning with device filtering (`EBQ Meter`)
* 🔗 Stable connection + reconnect support
* 🖼️ Camera & gallery image input
* ✍️ Greeting text → bitmap rendering
* 📊 Real-time progress tracking
* 📦 Packet-level logging (Mode 2)
* ❌ Cancel / retry support
* 📱 Clean UI system (cards, spacing, status indicators)

---

## ⚙️ Modes

### 🔁 Mode 0 — Default Reset

* Reset meter to factory settings

---

### 🟢 Mode 1 — Normal Mode

Upload:

* Profile image (RGB565)
* Greeting text (1-bit)

Options:

* Greeting only
* Profile only
* Both

📄 Flow: 

---

### 🔵 Mode 2 — Extended Mode

Multi-page upload:

```
P1 → P2 → S1 → S2 → S3
```

Hardware display order:

```
P1 → S1 → S2 → S3 → P2
```

Features:

* Step-by-step UI
* Page validation
* Retry mechanism
* Packet log analyzer

📄 Flow: 

---

## 📱 App Flow

```
BleScanner → PhaseSelect → ModeSelect → Mode1 / Mode2
```

📄

* Scanner: 
* Phase: 
* Mode: 

---

## 🖼️ Image & Greeting Format

### Profile Image

| Property   | Value        |
| ---------- | ------------ |
| Resolution | 128 × 128    |
| Format     | RGB565       |
| Size       | 32,768 bytes |

---

### Greeting Screen

| Property   | Value            |
| ---------- | ---------------- |
| Resolution | 128 × 128        |
| Format     | 1-bit monochrome |
| Size       | 2,048 bytes      |

Supports:

* English
* Chinese
* Arabic

📄 Converter: 

---

## 📡 BLE Protocol

### Characteristics

| Name | UUID                                   |
| ---- | -------------------------------------- |
| CTRL | `519ebbd3-78e1-4e86-90c1-d40616058d88` |
| DATA | `8f3c2a71-6d94-4b8e-a1f7-3c5d9e24b6a8` |

📄 Core: 

---

### Packet Structure

| Item           | Value        |
| -------------- | ------------ |
| Counter        | 2 bytes      |
| Chunk size     | 128 bytes    |
| Logical packet | 256 bytes    |
| BLE writes     | 2 per packet |

---

### Counter Layout

#### Normal Mode

* Profile: starts at `0`
* Greeting: starts at `896`

#### Extended Mode

* P1, P2, S1, S2, S3 (page-based counters)

---

## 📊 Logging System

### Mode 1

* Basic logs
* Copy / export support
  📄 

---

### Mode 2 (Advanced)

* Packet tracking
* Retry detection
* Counter validation
* Page statistics

📄 

---

## 📸 Camera & Input

* `react-native-vision-camera`
* `react-native-image-crop-picker`

Features:

* Crop to exact resolution
* Zoom / focus
* Save to gallery

📄 

---

## 🎨 UI System

Custom design system:

* Consistent spacing (SPACING)
* Radius system (RADIUS)
* Color tokens (COLORS)
* Card-based layout

---

## 🛠️ Installation

```bash
npm install
npx react-native start
```

### Run

```bash
# Android
npx react-native run-android

# iOS
npx react-native run-ios
```

---

## 🔐 Permissions

### Android

* Bluetooth Scan / Connect
* Location
* Camera
* Storage / Media

### iOS

* Bluetooth
* Camera
* Photo Library

---

## 🧭 Typical Flow

### Normal Mode

1. Scan device
2. Connect
3. Select Normal Mode
4. Choose update type
5. Prepare content
6. Preview
7. Send
8. View logs

---

### Extended Mode

1. Scan device
2. Connect
3. Select Extended Mode
4. Fill all pages (P1–S3)
5. Preview
6. Send
7. Analyze packet logs

---

## ⚠️ Known Limitations

* 3-phase support not implemented
* iOS BLE slower than Android
* BLE reliability depends on distance & environment

---

## 🧪 Troubleshooting

### Device not found

* Turn on Bluetooth
* Check permissions
* Ensure device name contains **EBQ Meter**

---

### Connection failed

* Retry
* Move closer
* Ensure no other device connected

---

### Upload issues

* Stay close to device
* Do not background app
* Check logs

---

### Greeting display issue

* Check preview before sending
* Respect character limits

---

## 🧱 Project Structure

```
src/
  screens/
  components/
  utils/
```

---

## 📌 Current Status

| Feature       | Status |
| ------------- | ------ |
| Normal Mode   | ✅      |
| Extended Mode | ✅      |
| Reset Mode    | ✅      |
| 3-Phase       | 🚧     |

---

## 👨‍💻 Notes

* Greeting rendered offscreen via `view-shot`
* RGB565 conversion for profile
* Mono bitmap for greeting
* BLE uses retry + packet system

---

## 📄 License

Internal / Proprietary
