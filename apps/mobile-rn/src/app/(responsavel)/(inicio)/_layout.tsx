/** Per-tab nested Stack (rn-02 §2): per-tab history for detail views. */

export const unstable_settings = {
  // 'aluno/[id]' sorts before 'index' — pin the panel as the tab root.
  initialRouteName: 'index',
};

export { TabStack as default } from '../../../components/TabStack';
