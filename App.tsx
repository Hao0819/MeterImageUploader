/**
 * App.js
 *
 * Flow:
 *   BleScanner → PhaseSelect → ModeSelect → [Mode 0: reset done]
 *                                          → [Mode 1: UpdateTypeSelect → Camera/GreetingInput → CropSend]
 *                                          → [Mode 2: Mode2Flow (P1→P2→S1→S2→S3)]
 *
 * Params passed forward:
 *   PhaseSelect      receives: { device, deviceName }
 *   ModeSelect       receives: { device, deviceName, phase }
 *   UpdateTypeSelect receives: { device, deviceName, phase }
 *   CameraScreen     receives: { device, deviceName, phase, updateType }
 *   GreetingInput    receives: { device, deviceName, phase, imageUri, updateType }
 *   CropSend         receives: { device, deviceName, phase, imageUri, greetingText, greetingBytes, updateType }
 *   Mode2Flow        receives: { device, deviceName, phase }
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import BleScanner from './src/screens/BleScanner';
import PhaseSelect from './src/screens/PhaseSelect';
import ModeSelect from './src/screens/ModeSelect';
import CameraScreen from './src/screens/CameraScreen';
// import GreetingInput from './src/screens/GreetingInput';
// import CropSend from './src/screens/CropSend';
import LogViewer from './src/screens/LogViewer';
// import UpdateTypeSelect from './src/screens/UpdateTypeSelect';
import Mode2Flow from './src/screens/Mode2Flow';
import Mode1Flow from './src/screens/Mode1Flow';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: '#f8fafc' },
        }}
      >
        {/* Step 1 — Scan & connect */}
        <Stack.Screen name="BleScanner" component={BleScanner} />

        {/* Step 2 — Select phase (single / 3-phase) */}
        <Stack.Screen name="PhaseSelect" component={PhaseSelect} />

        {/* Step 3 — Select mode (0=Reset, 1=Normal, 2=Extended) */}
        <Stack.Screen name="ModeSelect" component={ModeSelect} />

        {/* Mode 1: Take photo or pick from gallery */}
        <Stack.Screen name="Camera" component={CameraScreen} />

        <Stack.Screen name="Mode1Flow" component={Mode1Flow} />

        {/* Mode 2: Multi-page upload (P1 → P2 → S1 → S2 → S3) */}
        <Stack.Screen name="Mode2Flow" component={Mode2Flow} />

        {/* Shared: Packet log viewer */}
        <Stack.Screen name="LogViewer" component={LogViewer} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}