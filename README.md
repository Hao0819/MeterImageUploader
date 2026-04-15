# MeterImageUploader

A React Native app for preparing and uploading profile images and greeting screens to a BLE-enabled meter LCD device.

## Overview

MeterImageUploader lets a user connect to a BLE meter, choose an upload mode, prepare image and/or greeting content, preview the result, and send it to the device.

The app currently supports:

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

> Note: 3-phase is shown in the UI as coming soon.

---

## Main Flows

### 1. Phase selection
The user first selects the meter phase type.

- Single phase
- 3-phase (coming soon)

### 2. Mode selection
After phase selection, the user chooses one of these modes:

- **Mode 0 — Default Reset**
  Reset the meter to default settings.

- **Mode 1 — Normal Mode**
  Upload profile image and/or greeting screen.

- **Mode 2 — Extended Mode**
  Upload multiple pages:
  - P1 image page
  - P2 image page
  - S1 greeting page
  - S2 greeting page
  - S3 greeting page

### 3. Update type selection
For Normal Mode, the user can choose:

- **Update Greeting only**
- **Update Profile only**
- **Update Greeting & Profile**

### 4. Content preparation
Depending on the selected update type, the app will:

- Open the camera
- Allow gallery selection
- Crop the image to the required LCD size
- Let the user enter greeting text
- Render greeting text into a 1-bit LCD bitmap

### 5. Preview and send
Before transmission, the app shows a preview and then sends the data over BLE while displaying progress and logs.

---

## Screen Structure

Current main screens in the app include:

- `PhaseSelect.jsx`
- `ModeSelect.js`
- `UpdateTypeSelect.jsx`
- `CameraScreen.jsx`
- `GreetingInput.js`
- `CropSend.jsx`
- `Mode2Flow.js`

Supporting utility files include:

- `ble.js`
- `ImageConverter.js`
- `GreetingRenderer.js`
- `mode2Constants.js`

---

## Image and Greeting Format

### Profile image
- Size: **128 × 128**
- Format: **RGB565**
- Total bytes: **32768**

### Greeting screen
- Size: **128 × 128**
- Format: **1-bit monochrome**
- Total bytes: **2048**

Greeting text is rendered off-screen and converted into a bitmap before upload.

Supported text types in the current UI:

- English
- Chinese
- Arabic

The renderer applies different font-size logic depending on language and character count.

---

## BLE Protocol Summary

### Characteristics
- **CTRL characteristic**: `519ebbd3-78e1-4e86-90c1-d40616058d88`
- **DATA characteristic**: `8f3c2a71-6d94-4b8e-a1f7-3c5d9e24b6a8`

### Commands
The app uses dedicated command bytes for:

- Start
- Stop
- Mode 2
- Update profile only
- Update greeting only
- Reset to default

### Packet format
- Counter size: **2 bytes**
- Physical data chunk: **128 bytes**
- One logical packet: **256 bytes**
- Each logical packet is split into **2 BLE writes**

### Normal mode layout
- Profile packets start from counter `0`
- Greeting packets start from counter `896`

### Extended mode layout
Extended Mode uses these page groups:

- `P1`
- `P2`
- `S1`
- `S2`
- `S3`

---

## Features

- BLE scan and connect
- Device reconnect handling
- Disconnect handling
- Camera capture
- Gallery selection
- Image cropping
- Greeting text input
- Greeting preview
- Packet send progress
- Retry handling during BLE writes
- Transfer log viewer
- Cancel during transfer
- Send again / start over actions after completion

---

## Libraries Used

Main libraries used in the shared code include:

- `react-native-ble-plx`
- `react-native-vision-camera`
- `react-native-image-crop-picker`
- `react-native-view-shot`
- `react-native-fs`
- `@react-native-camera-roll/camera-roll`
- `jpeg-js`
- `buffer`

---

## Project Structure

```text
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
