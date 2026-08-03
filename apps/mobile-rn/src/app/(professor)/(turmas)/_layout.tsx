/** Per-tab nested Stack (rn-02 §2): per-tab history for detail views. */

export const unstable_settings = {
  // 'turma/[id]' sorts before 'turmas' — pin the list as the tab root.
  initialRouteName: 'turmas',
};

export { TabStack as default } from '../../../components/TabStack';
