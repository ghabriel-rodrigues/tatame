/**
 * DS showcase (DS.7 integration proof + visual review surface until the
 * dedicated showcase app lands with ds-08).
 *
 * Renders every P0 component in its variants/states so the DS native entry
 * can be reviewed against the handoff screenshots on-device.
 */

import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import {
  BrandLogo,
  Card,
  FormField,
  ScreenHeader,
  TatameButton,
  Text,
  Toast,
  fadeUp,
  pop,
  useTheme,
} from '@tatame/design-system/native';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space['3'] }}>
      <Text variant="overline">{title}</Text>
      {children}
    </View>
  );
}

export default function DsShowcase() {
  const theme = useTheme();
  const router = useRouter();
  const [toast, setToast] = useState(false);
  const [email, setEmail] = useState('');

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: theme.space['5'], gap: theme.space['6'], paddingBottom: 120 }}
      >
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['6'] }}>
          <ScreenHeader
            eyebrow="Design system"
            title="P0 showcase"
            subtitle="Seis componentes, tema Lumira"
            onBack={() => router.back()}
            trailing={<BrandLogo size="sm" />}
          />

          <Section title="Text">
            <Text variant="display">Display 25/700</Text>
            <Text variant="title">Title 20/700</Text>
            <Text variant="subtitle">Subtitle 16/600</Text>
            <Text variant="body">Body 14/400 — Quicksand em todos os pesos.</Text>
            <Text variant="label">Label 13/600</Text>
            <Text variant="caption">Caption 12/400</Text>
            <Text variant="overline">Overline caps</Text>
          </Section>

          <Section title="TatameButton">
            <TatameButton label="Primary" onPress={() => setToast(true)} />
            <TatameButton variant="secondary" label="Secondary" />
            <TatameButton variant="ghost" label="Ghost" />
            <TatameButton variant="danger" label="Danger" />
            <TatameButton label="Loading" loading />
            <TatameButton label="Disabled" disabled />
            <TatameButton fullWidth size="lg" label="Full width lg" />
          </Section>

          <Section title="FormField">
            <FormField label="Email" type="email" value={email} onChangeText={setEmail} placeholder="voce@exemplo.com" />
            <FormField label="Senha" type="password" placeholder="Senha" helperText="Mínimo 8 caracteres" />
            <FormField label="Com erro" error="Campo obrigatório" placeholder="..." />
            <FormField label="Desabilitado" disabled placeholder="..." />
          </Section>

          <Section title="Card">
            <Card>
              <Text variant="subtitle">surface</Text>
              <Text variant="body">Superfície padrão, shadow-sm.</Text>
            </Card>
            <Card variant="hero">
              <Text variant="overline" color={theme.color.pink['200']}>
                Hoje às 19:00
              </Text>
              <Text variant="title" color={theme.color.fg.onColor}>
                Open mat
              </Text>
              <Text variant="body" color={theme.color.purple['100']}>
                Gradiente brand-1 → brand-2, texto branco.
              </Text>
            </Card>
            <Card variant="tinted">
              <Text variant="body">tinted — wash brand-tint.</Text>
            </Card>
            {/* Glass needs content behind it: hero backdrop + overlapping glass. */}
            <Card variant="hero" padding={theme.space['4']}>
              <Card variant="glass">
                <Text variant="label">glass — blur + shine sobre o gradiente.</Text>
              </Card>
            </Card>
          </Section>

          <Section title="BrandLogo">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space['4'] }}>
              <BrandLogo size="sm" />
              <BrandLogo size="md" />
              <BrandLogo size="lg" />
              <BrandLogo size="lg" boxed={false} style={{ backgroundColor: theme.color.purple['700'], padding: 8, borderRadius: 8 }} />
            </View>
          </Section>

          <Section title="Motion">
            <Animated.View entering={pop()} style={{ alignSelf: 'flex-start' }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.color.success['500'],
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text variant="title" color={theme.color.fg.onColor}>
                  ✓
                </Text>
              </View>
            </Animated.View>
            <Text variant="caption">fadeUp na montagem da tela; pop no burst; press nos botões.</Text>
          </Section>
        </Animated.View>
      </ScrollView>
      <Toast open={toast} onClose={() => setToast(false)} message="Toast glass — some em ~2.6s" />
    </SafeAreaView>
  );
}
