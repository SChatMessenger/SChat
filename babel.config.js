module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'react-native-iconify/babel',
        {
          entry: 'App.tsx',
          icons: [
            'lucide:message-circle',
            'lucide:lightbulb',
            'lucide:users',
            'lucide:user',
            'lucide:circle-check',
            'lucide:circle',
            'lucide:refresh-cw',
            'lucide:chevron-right',
          ],
        },
      ],
    ],
  };
};
