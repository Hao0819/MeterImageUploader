import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BleScanner from './src/screens/BleScanner';
import PhaseSelect from './src/screens/PhaseSelect';
import ImageTypeSelect from './src/screens/ImageTypeSelect';
import SourceSelect from './src/screens/SourceSelect';
import GreetingInput from './src/screens/GreetingInput';
import CameraScreen from './src/screens/CameraScreen';
import CropSend from './src/screens/CropSend';

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
        <Stack.Screen name="BleScanner" component={BleScanner} />
        <Stack.Screen name="PhaseSelect" component={PhaseSelect} />
        <Stack.Screen name="ImageTypeSelect" component={ImageTypeSelect} />
        <Stack.Screen name="SourceSelect" component={SourceSelect} />
        <Stack.Screen name="GreetingInput" component={GreetingInput} />
        <Stack.Screen name="Camera" component={CameraScreen} />
        <Stack.Screen name="CropSend" component={CropSend} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}