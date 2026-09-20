/**
 * PersonaTabs (rn-02 §3): expo-router `Tabs` with the DS GlassTabBar as the
 * custom `tabBar`. The center FAB is NOT a route — it fires the persona's
 * main action; while those sheets land in later slices, the FAB shows an
 * "em breve" toast placeholder (AUTH.20).
 *
 * The adapter types the react-navigation tabBar props structurally (state /
 * navigation subset) so the app does not depend on
 * `@react-navigation/bottom-tabs` directly — expo-router owns that version.
 */

import { useState, type ComponentType, type ReactNode } from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import {
  GlassTabBar,
  Toast,
  type GlassTabItem,
} from '@tatame/design-system/native';

export interface PersonaTabConfig {
  /** Route group name, e.g. "(inicio)". */
  name: string;
  title: string;
  icon: ComponentType<{ color?: string; size?: number }>;
}

export interface PersonaFabConfig {
  icon: ComponentType<{ color?: string; size?: number }>;
  /** Persona main action name — a11y label + placeholder toast copy. */
  label: string;
  /** Real action when the slice lands; falls back to the "em breve" toast. */
  onPress?: () => void;
}

/** Structural subset of react-navigation's BottomTabBarProps. */
interface TabBarAdapterProps {
  state: { index: number; routes: Array<{ key: string; name: string }> };
  navigation: {
    navigate: (name: string) => void;
    emit: (event: {
      type: string;
      target?: string;
      canPreventDefault?: boolean;
    }) => { defaultPrevented: boolean };
  };
  insets?: { bottom: number };
}

export interface PersonaTabsProps {
  tabs: PersonaTabConfig[];
  fab: PersonaFabConfig;
}

export function PersonaTabs({ tabs, fab }: PersonaTabsProps) {
  const [fabToast, setFabToast] = useState(false);
  const FabIcon = fab.icon;

  const renderTabBar = (props: TabBarAdapterProps): ReactNode => {
    const items: GlassTabItem[] = tabs.map((tab) => {
      const routeIndex = props.state.routes.findIndex(
        (route) => route.name === tab.name,
      );
      const route = props.state.routes[routeIndex];
      const active = props.state.index === routeIndex;
      const Icon = tab.icon;
      return {
        key: tab.name,
        label: tab.title,
        active,
        icon: ({ color, size }) => <Icon color={color} size={size} />,
        onPress: () => {
          const event = props.navigation.emit({
            type: 'tabPress',
            target: route?.key,
            canPreventDefault: true,
          });
          if (!active && !event.defaultPrevented)
            props.navigation.navigate(tab.name);
        },
      };
    });

    return (
      <GlassTabBar
        testID="glass-tab-bar"
        items={items}
        offsetBottom={Math.max(0, (props.insets?.bottom ?? 0) - 22)}
        fab={{
          accessibilityLabel: fab.label,
          icon: ({ color, size }) => <FabIcon color={color} size={size} />,
          onPress: fab.onPress ?? (() => setFabToast(true)),
        }}
      />
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tabBar={renderTabBar as any}
        screenOptions={{ headerShown: false }}
      >
        {tabs.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{ title: tab.title }}
          />
        ))}
      </Tabs>
      <Toast
        open={fabToast}
        onClose={() => setFabToast(false)}
        message={`Em breve: ${fab.label}`}
        offsetBottom={110}
      />
    </View>
  );
}
