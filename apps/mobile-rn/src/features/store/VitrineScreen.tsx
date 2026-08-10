/**
 * Storefront vitrine (STO.10, aluno-16/professor-13): one shared feature
 * mounted in both the aluno and professor shells. Header "Loja <academia> ·
 * Produtos oficiais · retirada na recepção" with the Meus pedidos entry
 * (decision: the pedidos entry lives on the vitrine header — the perfil
 * rows stay pure navigation per the prototypes), search over name+tags
 * (server-side ?search=), a WORKING horizontally-scrollable category chip
 * carousel ("Tudo" + one chip per category) and the unclipped 2-column
 * product grid — the prototype's two known bugs (broken carousel, clipped
 * grid) are fixed, not reproduced. Honest empty state when nothing matches.
 */

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { keepPreviousData } from '@tanstack/react-query';
import { ChevronLeft, ReceiptText } from 'lucide-react-native';
import {
  Card,
  Chip,
  FormField,
  Text,
  fadeUp,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../api/query';
import { QueryState } from '../enrollment/ui';
import { useSession } from '../../session/session-store';
import {
  ALL_CHIP_LABEL,
  EMPTY_VITRINE,
  EMPTY_VITRINE_CAPTION,
  MY_ORDERS_TITLE,
  SEARCH_PLACEHOLDER,
  STORE_SUBTITLE,
  storeTitle,
} from './copy';
import { ProductGridCard } from './ui';
import type { ProductCard } from './types';

/** Pairs the grid items into 2-column rows (no measurement, no clipping). */
function toRows(products: ProductCard[]): Array<[ProductCard, ProductCard | null]> {
  const rows: Array<[ProductCard, ProductCard | null]> = [];
  for (let index = 0; index < products.length; index += 2) {
    rows.push([products[index]!, products[index + 1] ?? null]);
  }
  return rows;
}

export function VitrineScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const query: { search?: string; categoryId?: string } = {};
  if (search.trim()) query.search = search.trim();
  if (categoryId) query.categoryId = categoryId;

  const vitrineQuery = api.useQuery(
    'get',
    '/v1/store/products',
    { params: { query } },
    // Keep the previous page while a search/filter refetch is in flight —
    // the carousel and grid never flash away under the typing user.
    { placeholderData: keepPreviousData },
  );

  const products = vitrineQuery.data?.products ?? [];
  const categories = vitrineQuery.data?.categories ?? [];

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.space['5'], paddingBottom: 130 }}>
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space['3'] }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              onPress={() => router.back()}
              hitSlop={8}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: theme.color.border['1'],
                backgroundColor: theme.color.bg.surface,
              }}
            >
              <ChevronLeft size={18} color={theme.color.fg['2']} />
            </Pressable>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="subtitle" weight="bold" numberOfLines={1}>
                {storeTitle(session?.academy?.name)}
              </Text>
              <Text variant="caption" numberOfLines={1} style={{ fontSize: 11 }}>
                {STORE_SUBTITLE}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={MY_ORDERS_TITLE}
              onPress={() => router.push('/loja/pedidos')}
              hitSlop={8}
              testID="my-orders-entry"
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.color.brand.tint,
              }}
            >
              <ReceiptText size={16} color={theme.color.brand['1']} />
            </Pressable>
          </View>

          <FormField
            label=""
            value={search}
            onChangeText={setSearch}
            placeholder={SEARCH_PLACEHOLDER}
            testID="vitrine-search"
          />

          <QueryState loading={vitrineQuery.isPending} error={vitrineQuery.isError}>
            {/* Working chip carousel — horizontal scroll, never clipped
                (the aluno-16 prototype bug is fixed, not reproduced). */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              testID="category-chips"
              contentContainerStyle={{ gap: theme.space['2'], paddingVertical: 2 }}
            >
              <Chip
                label={ALL_CHIP_LABEL}
                size="md"
                tone="brand"
                selected={categoryId === null}
                onPress={() => setCategoryId(null)}
                testID="category-chip-all"
              />
              {categories.map((category) => (
                <Chip
                  key={category.id}
                  label={category.name}
                  size="md"
                  tone="brand"
                  selected={categoryId === category.id}
                  onPress={() =>
                    setCategoryId(categoryId === category.id ? null : category.id)
                  }
                  testID={`category-chip-${category.id}`}
                />
              ))}
            </ScrollView>

            {products.length === 0 ? (
              <Card testID="vitrine-empty">
                <View style={{ gap: 4 }}>
                  <Text variant="label">{EMPTY_VITRINE}</Text>
                  <Text variant="caption">{EMPTY_VITRINE_CAPTION}</Text>
                </View>
              </Card>
            ) : (
              <View style={{ gap: theme.space['3'] }} testID="product-grid">
                {toRows(products).map(([left, right]) => (
                  <View
                    key={left.id}
                    style={{ flexDirection: 'row', gap: theme.space['3'] }}
                  >
                    <ProductGridCard
                      product={left}
                      testID={`product-${left.id}`}
                      onPress={() => router.push(`/loja/produto/${left.id}`)}
                    />
                    {right ? (
                      <ProductGridCard
                        product={right}
                        testID={`product-${right.id}`}
                        onPress={() => router.push(`/loja/produto/${right.id}`)}
                      />
                    ) : (
                      <View style={{ flex: 1 }} />
                    )}
                  </View>
                ))}
              </View>
            )}
          </QueryState>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default VitrineScreen;
