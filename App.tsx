/**
 * App.js
 *
 * Flow:
 *   BleScanner → PhaseSelect → CameraScreen → GreetingInput → CropSend
 *
 * Params passed forward:
 *   PhaseSelect  receives: { device, deviceName }
 *   CameraScreen receives: { device, deviceName, phase }
 *   GreetingInput receives: { device, deviceName, phase, imageUri }
 *   CropSend      receives: { device, deviceName, phase, imageUri, greetingText, greetingBytes }
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BleScanner from './src/screens/BleScanner';
import PhaseSelect from './src/screens/PhaseSelect';
import CameraScreen from './src/screens/CameraScreen';
import GreetingInput from './src/screens/GreetingInput';
import CropSend from './src/screens/CropSend';
import LogViewer from './src/screens/LogViewer';
import UpdateTypeSelect from './src/screens/UpdateTypeSelect';
const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: '#0d0d0d' },
        }}
      >
        {/* Step 1 — Scan & connect */}
        <Stack.Screen name="BleScanner" component={BleScanner} />

        {/* Step 2 — Select phase (single / 3-phase) */}
        <Stack.Screen name="PhaseSelect" component={PhaseSelect} />

        {/* Step 3 — Take photo or pick from gallery (Profile 95×110) */}
        <Stack.Screen name="Camera" component={CameraScreen} />

        {/* Step 4 — Type greeting text */}
        <Stack.Screen name="GreetingInput" component={GreetingInput} />

        {/* Step 5 — Crop preview + send Profile+Greeting together */}
        <Stack.Screen name="CropSend" component={CropSend} />
        <Stack.Screen name="UpdateTypeSelect" component={UpdateTypeSelect} />
        <Stack.Screen name="LogViewer" component={LogViewer} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}