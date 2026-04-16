# MeterImageUploader

A React Native app for preparing and uploading profile images and greeting screens to a BLE-enabled meter LCD device.

---

## Overview

MeterImageUploader lets a user connect to a BLE meter, choose an upload mode, prepare image and/or greeting content, preview the result, and send it to the device.

**Supported features:**

- Single-phase flow
- Meter reset
- Normal upload mode
- Extended multi-page upload mode
- Profile-only update
- Greeting-only update
- Profile + greeting update
- Camera and gallery image input
- Greeting text rendering to monochrome bitmap
- BLE packet logs, reconnect, and cancel support

> **Note:** 3-phase support is shown in the UI but is not yet available.

---

## Main Flows

### 1. Phase Selection

The user first selects the meter phase type:

- Single phase
- 3-phase *(coming soon)*

### 2. Mode Selection

After phase selection, the user chooses one of these modes:

| Mode | Name | Description |
|------|------|-------------|
| Mode 0 | Default Reset | Reset the meter to default settings |
| Mode 1 | Normal Mode | Upload profile image and/or greeting screen |
| Mode 2 | Extended Mode | Upload multiple pages: P1, P2, S1, S2, S3 |

### 3. Update Type Selection

For Normal Mode, the user can choose:

- Update Greeting only
- Update Profile only
- Update Greeting & Profile

### 4. Content Preparation

Depending on the selected update type, the app will:

- Open the camera or allow gallery selection
- Crop the image to the required LCD size
- Let the user enter greeting text
- Render greeting text into a 1-bit LCD bitmap

### 5. Preview and Send

Before transmission, the app shows a preview and then sends the data over BLE while displaying progress and logs.

---

## Screen Structure

### Screens

| File | Description |
|------|-------------|
| `PhaseSelect.jsx` | Phase type selection |
| `ModeSelect.js` | Upload mode selection |
| `UpdateTypeSelect.jsx` | Update type selection (Normal Mode) |
| `SourceSelect.jsx` | Image source selection (camera or gallery) |
| `CameraScreen.jsx` | Camera capture |
| `GreetingInput.js` | Greeting text entry |
| `CropSend.jsx` | Image crop, preview, and send |
| `Mode2Flow.js` | Extended mode multi-page flow |

### Utilities

| File | Description |
|------|-------------|
| `ble.js` | BLE connection and packet management |
| `ImageConverter.js` | RGB565 image conversion |
| `GreetingRenderer.js` | Greeting text to bitmap conversion |
| `mode2Constants.js` | Constants for extended mode pages |

---

## Image and Greeting Format

### Profile Image

| Property | Value |
|----------|-------|
| Size | 128 × 128 px |
| Format | RGB565 |
| Total bytes | 32,768 |

### Greeting Screen

| Property | Value |
|----------|-------|
| Size | 128 × 128 px |
| Format | 1-bit monochrome |
| Total bytes | 2,048 |

Greeting text is rendered off-screen and converted into a bitmap before upload.

**Supported text types:**

- English
- Chinese
- Arabic

The renderer applies different font-size logic depending on language and character count.

---

## BLE Protocol

### Characteristics

| Name | UUID |
|------|------|
| CTRL | `519ebbd3-78e1-4e86-90c1-d40616058d88` |
| DATA | `8f3c2a71-6d94-4b8e-a1f7-3c5d9e24b6a8` |

### Commands

The app uses dedicated command bytes for:

- Start / Stop
- Mode 2
- Update profile only
- Update greeting only
- Reset to default

### Packet Format

| Property | Value |
|----------|-------|
| Counter size | 2 bytes |
| Physical data chunk | 128 bytes |
| Logical packet size | 256 bytes |
| BLE writes per packet | 2 |

### Normal Mode Layout

- Profile packets start from counter `0`
- Greeting packets start from counter `896`

### Extended Mode Layout

Extended Mode uses these page groups: `P1`, `P2`, `S1`, `S2`, `S3`

---

## Installation

### 1. Install dependencies

```bash
npm install
```

### 2. Start Metro

```bash
npx react-native start
```

### 3. Run on device

```bash
# Android
npx react-native run-android

# iOS
npx react-native run-ios
```

---

## Permissions

### Android

This app may require the following permissions:

- Bluetooth Scan
- Bluetooth Connect
- Location
- Camera
- Media / photo access
- Storage access *(depending on Android version)*

### iOS

Ensure `Info.plist` includes usage descriptions for:

- Camera
- Photo library
- Bluetooth

---

## Typical User Flow

### Normal Mode

1. Scan and connect to meter
2. Select phase
3. Select **Normal Mode**
4. Choose update type
5. Capture or choose profile image *(if needed)*
6. Enter greeting text *(if needed)*
7. Preview content
8. Send via BLE
9. Review progress and logs

### Extended Mode

1. Scan and connect to meter
2. Select phase
3. Select **Extended Mode**
4. Fill all five pages:
   - P1 image
   - P2 image
   - S1 greeting
   - S2 greeting
   - S3 greeting
5. Preview each page
6. Send all pages via BLE
7. Review packet log after transfer

---

## Libraries Used

| Library | Purpose |
|---------|---------|
| `react-native-ble-plx` | BLE scan and communication |
| `react-native-vision-camera` | Camera capture |
| `react-native-image-crop-picker` | Gallery selection and cropping |
| `react-native-view-shot` | Off-screen greeting rendering |
| `react-native-fs` | File system access |
| `@react-native-camera-roll/camera-roll` | Camera roll access |
| `jpeg-js` | JPEG decoding |
| `buffer` | Binary data handling |

---

## Project Structure

```
src/
  screens/
    PhaseSelect.jsx
    ModeSelect.js
    UpdateTypeSelect.jsx
    SourceSelect.jsx
    CameraScreen.jsx
    GreetingInput.js
    CropSend.jsx
    Mode2Flow.js

  utils/
    ble.js
    ImageConverter.js
    GreetingRenderer.js
    mode2Constants.js

  components/
    PacketLogViewer.js
```

---

## Troubleshooting

### Device not found

- Make sure Bluetooth is enabled
- Confirm the device is powered on
- Check permission status
- Try rescanning

### Cannot connect

- Make sure the device is not connected elsewhere
- Move closer to the device
- Retry connection from the app

### Upload fails or loses data

- Keep the phone close to the hardware
- Avoid leaving the app during transfer
- Check packet logs and retry the transfer
- Confirm firmware matches the packet/counter format used by the app

### Greeting text looks wrong

- Check language-specific character limits
- Recheck Arabic / Chinese input length
- Confirm the preview looks correct before sending

---

## Current Status

| Feature | Status |
|---------|--------|
| Single-phase flow | ✅ Available |
| 3-phase support | 🚧 Coming soon |
| Normal mode | ✅ Available |
| Extended mode | ✅ Available |
| Greeting-only update | ✅ Available |
| Profile-only update | ✅ Available |

---

## Notes for Developers

- Greeting rendering is captured from a hidden off-screen view using `react-native-view-shot`
- Profile images are converted to RGB565 before sending
- Greeting images are converted to packed 1-bit monochrome bytes
- BLE writes use retry logic
- Transfer logs are stored and viewable after send
- Extended Mode uses page-based counters and a multi-step UI

---

## License

Internal / proprietary project unless stated otherwise.
