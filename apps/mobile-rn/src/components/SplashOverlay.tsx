/**
 * SplashOverlay (AUTH.17, aluno-01-splash): full-screen gradient
 * (160deg purple-800 -> purple-700 45% -> purple-500) with the glass belt
 * badge (84px squircle, white 14% wash + 35% border, 12px blur) and the
 * product wordmark. Rendered over the route tree while the cold-start
 * silent refresh runs (rn-04) and for the handoff's ~1.9s minimum.
 */

import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { BrandLogo, Text, fadeUp, pop, useTheme } from '@tatame/design-system/native';

export function SplashOverlay({ visible }: { visible: boolean }) {
  const theme = useTheme();
  if (!visible) return null;

  return (
    <View testID="splash-overlay" style={[StyleSheet.absoluteFill, { zIndex: 90 }]}>
      <LinearGradient
        colors={[theme.color.purple['800'], theme.color.purple['700'], theme.color.purple['500']]}
        locations={[0, 0.45, 1]}
        // 160deg-ish: top -> bottom with a slight rightward drift.
        start={{ x: 0, y: 0 }}
        end={{ x: 0.34, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <Animated.View entering={pop()}>
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.35)',
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BlurView
              intensity={30}
              tint="light"
              style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.14)' }]}
            />
            <BrandLogo size="lg" boxed={false} style={{ alignSelf: 'center' }} />
          </View>
        </Animated.View>
        <Animated.View entering={fadeUp().delay(150)} style={{ alignItems: 'center' }}>
          <Text
            weight="bold"
            color={theme.color.white}
            style={{ fontSize: 30, lineHeight: 38, letterSpacing: -0.6 }}
          >
            Tatame
          </Text>
          <Text color="rgba(255,255,255,0.75)" style={{ fontSize: 13, marginTop: 4 }}>
            Gestão para escolas de Jiu-Jitsu
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}
