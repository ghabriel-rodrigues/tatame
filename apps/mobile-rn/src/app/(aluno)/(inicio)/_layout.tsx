/** Per-tab nested Stack (rn-02 §2): per-tab history for detail views. */

export const unstable_settings = {
  // 'graduacao' sorts before 'index' — pin the home as the tab root.
  initialRouteName: 'index',
};

export { TabStack as default } from '../../../components/TabStack';
