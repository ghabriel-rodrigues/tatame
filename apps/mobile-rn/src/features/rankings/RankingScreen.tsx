/**
 * Shared full ranking screen (REP.11, spec 013 — aluno-06/07 and
 * professor-05/06 are the same screen with different titles): back header
 * with the dynamic subtitle ("<Mês> · <academia>" on Por aulas,
 * "Participações em eventos no semestre" on Por eventos), the Por aulas /
 * Por eventos segmented control, position circles (leader filled), the
 * "você" chip + outlined row for the requesting student (isMe — never set
 * for professors, who are not ranked), gradient bars scaled to the leader
 * and the per-segment selos footnote (static copy by recorded decision;
 * the professor-06 prototype copy bug — Constância text on the eventos
 * segment — is fixed here by adapting the footnote to the segment).
 */

import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Card,
  Chip,
  ScreenHeader,
  SegmentedControl,
  Text,
  fadeUp,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../api/query';
import { QueryState } from '../enrollment/ui';
import { useSession } from '../../session/session-store';
import { SEGMENT_AULAS, SEGMENT_EVENTOS, seloFootnote } from './copy';
import { barFraction, countLabel, rankingSubtitle } from './format';
import type { RankingBy, RankingRow } from './types';

function PositionCircle({ row }: { row: RankingRow }) {
  const theme = useTheme();
  // Prototype mapping: leader filled purple-700/white, top 3 tinted
  // purple-100/purple-800, the rest gray-100/fg-3.
  const leader = row.position === 1;
  const podium = row.position <= 3;
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: theme.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: leader
          ? theme.color.brand['1']
          : podium
            ? theme.color.purple['100']
            : theme.color.bg.sunken,
      }}
    >
      <Text
        variant="caption"
        weight="bold"
        style={{ fontSize: 12.5 }}
        color={
          leader
            ? theme.color.fg.onColor
            : podium
              ? theme.color.purple['800']
              : theme.color.fg['3']
        }
      >
        {row.position}
      </Text>
    </View>
  );
}

function RankingRowCard({
  row,
  by,
  leaderCount,
  layout,
  divider,
}: {
  row: RankingRow;
  by: RankingBy;
  leaderCount: number;
  layout: RankingLayout;
  divider: boolean;
}) {
  const theme = useTheme();
  const fraction = barFraction(row, leaderCount);
  // aluno-06/07: standalone outlined cards ("você" gets the brand border);
  // professor-05/06: divider rows inside one list container.
  const shell =
    layout === 'cards'
      ? {
          backgroundColor: theme.color.bg.surface,
          borderWidth: 1.5,
          borderColor: row.isMe ? theme.color.brand['2'] : theme.color.border['1'],
          borderRadius: 16,
          paddingVertical: 12,
          paddingHorizontal: 15,
        }
      : {
          paddingVertical: 13,
          paddingHorizontal: 16,
          borderBottomWidth: divider ? 1 : 0,
          borderBottomColor: theme.color.border['1'],
        };
  return (
    <View
      testID={`ranking-row-${row.position}`}
      style={{
        ...shell,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space['3'],
      }}
    >
      <PositionCircle row={row} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Text variant="label" weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
            {row.name}
          </Text>
          {row.isMe ? <Chip label="você" tone="brand" size="sm" testID="ranking-voce-chip" /> : null}
        </View>
        {/* Gradient bar scaled to the leader (client-derived width only). */}
        <View
          style={{
            height: 5,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.color.bg.sunken,
            marginTop: 6,
            overflow: 'hidden',
          }}
        >
          <LinearGradient
            colors={[theme.color.brand['2'], theme.color.brand.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ width: `${fraction * 100}%`, height: '100%', borderRadius: theme.radius.pill }}
          />
        </View>
      </View>
      <Text variant="caption" weight="bold" color={theme.color.fg['2']} style={{ fontSize: 12 }}>
        {countLabel(row.count, by)}
      </Text>
    </View>
  );
}

/** aluno-06/07 = outlined row cards; professor-05/06 = one list container. */
export type RankingLayout = 'cards' | 'list';

export interface RankingScreenProps {
  /** "Ranking do mês" (aluno) / "Ranking de presença" (professor). */
  title: string;
  layout?: RankingLayout;
}

export function RankingScreen({ title, layout = 'cards' }: RankingScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const [by, setBy] = useState<RankingBy>('lessons');

  const query = api.useQuery('get', '/v1/rankings', {
    params: { query: { by } },
  });
  const data = query.data;
  const rows = data?.top ?? [];
  const leaderCount = rows[0]?.count ?? 0;
  const footnote = seloFootnote(by);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.space['5'], paddingBottom: 130 }}>
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <ScreenHeader
            title={title}
            subtitle={
              data ? rankingSubtitle(by, data.window, session?.academy?.name ?? null) : undefined
            }
            onBack={() => router.back()}
          />

          <SegmentedControl
            ariaLabel="Tipo de ranking"
            testID="ranking-segments"
            options={[
              { value: 'lessons', label: SEGMENT_AULAS },
              { value: 'events', label: SEGMENT_EVENTOS },
            ]}
            value={by}
            onChange={(value) => setBy(value)}
          />

          <QueryState loading={query.isPending} error={query.isError}>
            <View style={{ gap: theme.space['2'] }}>
              {rows.length === 0 ? (
                <Card>
                  <Text variant="caption">
                    Ainda sem dados neste período — o ranking aparece com as primeiras{' '}
                    {by === 'lessons' ? 'presenças' : 'participações'}.
                  </Text>
                </Card>
              ) : layout === 'list' ? (
                // professor-05/06: one bordered container with divider rows.
                <Card padding={0}>
                  {rows.map((row, index) => (
                    <RankingRowCard
                      key={row.position}
                      row={row}
                      by={by}
                      leaderCount={leaderCount}
                      layout={layout}
                      divider={index < rows.length - 1}
                    />
                  ))}
                </Card>
              ) : (
                rows.map((row) => (
                  <RankingRowCard
                    key={row.position}
                    row={row}
                    by={by}
                    leaderCount={leaderCount}
                    layout={layout}
                    divider={false}
                  />
                ))
              )}

              {/* Selos footnote — static copy, adapted per segment. */}
              <View
                testID="ranking-footnote"
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 15,
                  borderRadius: 16,
                  backgroundColor: theme.color.brand.tint,
                  marginTop: theme.space['1'],
                }}
              >
                <Text variant="caption" style={{ lineHeight: 18 }}>
                  {footnote.lead}
                  <Text
                    variant="caption"
                    weight="bold"
                    color={theme.color.ink.pink}
                    style={{ lineHeight: 18 }}
                  >
                    {footnote.selo}
                  </Text>
                  {footnote.tail}
                </Text>
              </View>
            </View>
          </QueryState>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
