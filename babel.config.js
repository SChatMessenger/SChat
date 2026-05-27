module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'react-native-iconify/babel',
        {
          entry: 'src/App.tsx',
          icons: [
            'streamline-sharp:chat-two-bubbles-oval',
            'streamline-sharp:story-post',
            'lucide:users',
            'lucide:user',
            'lucide:circle-check',
            'lucide:circle',
            'lucide:refresh-cw',
            'lucide:log-out',
            'lucide:chevron-right',
            'lucide:search',
            'lucide:more-vertical',
          ],
        },
      ],
    ],
  };
};
