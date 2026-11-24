import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { StyleSheet, useColorScheme, View } from 'react-native';

import { AboutScreen } from '../screens/AboutScreen';
import { HomeScreen } from '../screens/HomeScreen';

export type RootTabParamList = {
  Detector: undefined;
  Sobre: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

function DetectorTabIcon({ color }: { color: string }) {
  return (
    <View style={[styles.docIcon, { borderColor: color }]}>
      <View style={[styles.docLine, { backgroundColor: color }]} />
      <View style={[styles.docLineShort, { backgroundColor: color }]} />
    </View>
  );
}

function AboutTabIcon({ color }: { color: string }) {
  return (
    <View style={[styles.infoCircle, { borderColor: color }]}>
      <View style={[styles.infoDot, { backgroundColor: color }]} />
      <View style={[styles.infoStem, { backgroundColor: color }]} />
    </View>
  );
}

function renderDetectorIcon({ color }: { color: string }) {
  return <DetectorTabIcon color={color} />;
}

function renderAboutIcon({ color }: { color: string }) {
  return <AboutTabIcon color={color} />;
}

export function RootNavigator() {
  const isDark = useColorScheme() === 'dark';

  const palette = isDark
    ? {
        bg: '#0B1120',
        card: '#111827',
        border: '#1F2937',
        text: '#F8FAFC',
        muted: '#94A3B8',
        primary: '#60A5FA',
      }
    : {
        bg: '#F8FAFC',
        card: '#FFFFFF',
        border: '#E2E8F0',
        text: '#0F172A',
        muted: '#64748B',
        primary: '#1D4ED8',
      };

  const navTheme = isDark
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          background: palette.bg,
          card: palette.card,
          text: palette.text,
          border: palette.border,
          primary: palette.primary,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: palette.bg,
          card: palette.card,
          text: palette.text,
          border: palette.border,
          primary: palette.primary,
        },
      };

  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        screenOptions={{
          headerShown: true,
          headerStyle: {
            backgroundColor: palette.card,
          },
          headerTintColor: palette.text,
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: 18,
          },
          headerShadowVisible: true,
          tabBarStyle: {
            backgroundColor: palette.card,
            borderTopColor: palette.border,
          },
          tabBarActiveTintColor: palette.primary,
          tabBarInactiveTintColor: palette.muted,
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
          },
        }}
      >
        <Tab.Screen
          name="Detector"
          component={HomeScreen}
          options={{
            title: 'Detector de Nitidez',
            tabBarLabel: 'Detector',
            tabBarIcon: renderDetectorIcon,
          }}
        />
        <Tab.Screen
          name="Sobre"
          component={AboutScreen}
          options={{
            title: 'Sobre o Pacote',
            tabBarLabel: 'Sobre',
            tabBarIcon: renderAboutIcon,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  docIcon: {
    width: 17,
    height: 20,
    borderWidth: 1.8,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  docLine: {
    width: 9,
    height: 1.8,
    borderRadius: 1,
  },
  docLineShort: {
    width: 6,
    height: 1.8,
    borderRadius: 1,
    alignSelf: 'flex-start',
    marginLeft: 2,
  },
  infoCircle: {
    width: 19,
    height: 19,
    borderWidth: 1.8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  infoDot: {
    width: 2.2,
    height: 2.2,
    borderRadius: 2,
  },
  infoStem: {
    width: 2,
    height: 6,
    borderRadius: 1,
  },
});
