module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // zustand's ESM build (picked by Metro for web through the "import" export condition)
          // reads `import.meta.env`, which crashes the classic-script web bundle with
          // "Cannot use 'import.meta' outside a module" (blank screen). Polyfill it.
          unstable_transformImportMeta: true,
        },
      ],
    ],
  };
};
