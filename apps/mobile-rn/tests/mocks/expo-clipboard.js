/**
 * expo-clipboard mock (BIL.17): records copied strings so the Pix
 * copia-e-cola / boleto linha-digitável copy actions are assertable.
 */

let copied = [];

module.exports = {
  setStringAsync: jest.fn(async (value) => {
    copied.push(value);
    return true;
  }),
  getStringAsync: jest.fn(async () => copied[copied.length - 1] ?? ''),
  __copied: () => copied,
  __reset: () => {
    copied = [];
    module.exports.setStringAsync.mockClear();
  },
};
