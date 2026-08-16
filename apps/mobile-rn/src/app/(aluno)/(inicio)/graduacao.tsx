/**
 * Aluno Graduação (GRD.16, aluno-09): fed by GET /v1/aluno/graduation —
 * purple hero card with the drawn current belt (BeltBar lg) and its
 * degrees, the progress bar toward the next milestone ("Próximo 3º grau ·
 * 26 de 40 aulas" — the academy's rule, never a hardcoded target) and the
 * "Histórico de evolução" timeline (belt/degree, date, awarding professor,
 * observação). Belt promotions carry the real "Ver certificado" (REP.12,
 * spec 013 — the Phase-5 placeholder paid): certificateAvailable entries
 * open the branded CertificateSheet with the OS share action; degree and
 * initial-belt entries keep no button.
 */

import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import {
  BeltBar,
  Card,
  ScreenHeader,
  TatameButton,
  Text,
  fadeUp,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../../api/query';
import { CertificateSheet } from '../../../features/graduation/CertificateSheet';
import {
  beltHeroTitle,
  monthYearPt,
  timelineEntryTitle,
} from '../../../features/graduation/format';
import type { GraduationEntry } from '../../../features/graduation/types';
import { QueryState } from '../../../features/enrollment/ui';

function TimelineEntry({
  entry,
  last,
  onOpenCertificate,
}: {
  entry: GraduationEntry;
  last: boolean;
  onOpenCertificate: (entry: GraduationEntry) => void;
}) {
  const theme = useTheme();
  const reversed = entry.reversed || entry.kind === 'revocation';
  return (
    <View style={{ flexDirection: 'row', gap: theme.space['3'] }}>
      {/* Marker column: dot + connector line. */}
      <View style={{ alignItems: 'center', width: 12 }}>
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            marginTop: 6,
            backgroundColor: reversed ? theme.color.border['2'] : theme.color.brand['2'],
          }}
        />
        {!last ? (
          <View style={{ flex: 1, width: 2, backgroundColor: theme.color.border['1'] }} />
        ) : null}
      </View>
      <Card
        padding={theme.space['4']}
        style={{ flex: 1, marginBottom: theme.space['3'], opacity: reversed ? 0.55 : 1 }}
        testID={`timeline-entry-${entry.id}`}
      >
        <View style={{ gap: 4 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: theme.space['2'],
            }}
          >
            <Text variant="label" weight="semibold" style={{ flexShrink: 1 }}>
              {timelineEntryTitle(entry)}
            </Text>
            <Text variant="caption" style={{ fontSize: 11 }}>
              {monthYearPt(entry.awardedAt)}
            </Text>
          </View>
          <Text variant="caption">Prof. {entry.awardedBy.fullName}</Text>
          {entry.notes ? (
            <Text variant="caption" style={{ fontStyle: 'italic' }}>
              “{entry.notes}”
            </Text>
          ) : null}
          {entry.certificateAvailable ? (
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              {/* REP.12: real — opens the branded certificate view. */}
              <TatameButton
                size="sm"
                variant="secondary"
                label="Ver certificado"
                onPress={() => onOpenCertificate(entry)}
                testID={`certificado-${entry.id}`}
              />
            </View>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

export default function AlunoGraduacaoScreen() {
  const theme = useTheme();
  const router = useRouter();
  const query = api.useQuery('get', '/v1/aluno/graduation');
  const data = query.data;
  const [certificateEntry, setCertificateEntry] = useState<GraduationEntry | null>(null);

  const fraction =
    data && data.progress.target > 0
      ? Math.min(1, data.progress.current / data.progress.target)
      : 0;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.space['5'], paddingBottom: 130 }}>
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <ScreenHeader title="Graduação" onBack={() => router.back()} />

          <QueryState loading={query.isPending} error={query.isError}>
            {data ? (
              <>
                <Card variant="hero" testID="graduation-hero">
                  <View style={{ gap: theme.space['3'] }}>
                    <View style={{ gap: 2 }}>
                      <Text
                        variant="caption"
                        weight="bold"
                        color="rgba(255,255,255,0.7)"
                        style={{ fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' }}
                      >
                        Faixa atual
                      </Text>
                      <Text variant="title" color={theme.color.fg.onColor}>
                        {beltHeroTitle(data.belt)}
                      </Text>
                    </View>
                    <BeltBar belt={data.belt} size="lg" testID="hero-belt" />
                    <View style={{ gap: 6 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Text variant="caption" color="rgba(255,255,255,0.8)">
                          {data.progress.label}
                        </Text>
                        <Text
                          variant="caption"
                          weight="bold"
                          color={theme.color.fg.onColor}
                        >
                          {data.progress.current} de {data.progress.target} aulas
                        </Text>
                      </View>
                      <View
                        testID="hero-progress-bar"
                        style={{
                          height: 6,
                          borderRadius: theme.radius.pill,
                          backgroundColor: 'rgba(255,255,255,0.25)',
                          overflow: 'hidden',
                        }}
                      >
                        <View
                          style={{
                            width: `${fraction * 100}%`,
                            height: '100%',
                            borderRadius: theme.radius.pill,
                            backgroundColor: theme.color.fg.onColor,
                          }}
                        />
                      </View>
                    </View>
                  </View>
                </Card>

                <Text variant="subtitle">Histórico de evolução</Text>
                {data.timeline.length === 0 ? (
                  <Card>
                    <Text variant="caption">
                      Sua jornada começa agora — as graduações aparecem aqui.
                    </Text>
                  </Card>
                ) : (
                  <View>
                    {data.timeline.map((entry, index) => (
                      <TimelineEntry
                        key={entry.id}
                        entry={entry}
                        last={index === data.timeline.length - 1}
                        onOpenCertificate={setCertificateEntry}
                      />
                    ))}
                  </View>
                )}
              </>
            ) : null}
          </QueryState>
        </Animated.View>
      </ScrollView>

      {/* REP.12: branded certificate view + OS share (spec 013). */}
      <CertificateSheet entry={certificateEntry} onClose={() => setCertificateEntry(null)} />
    </SafeAreaView>
  );
}
