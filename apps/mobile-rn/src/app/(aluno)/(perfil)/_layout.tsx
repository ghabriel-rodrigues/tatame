/** Per-tab nested Stack (rn-02 §2): per-tab history for detail views. */

export const unstable_settings = {
  // 'dados-pessoais' and 'loja' sort before 'perfil' — pin the tab root.
  initialRouteName: 'perfil',
};

export { TabStack as default } from '../../../components/TabStack';
