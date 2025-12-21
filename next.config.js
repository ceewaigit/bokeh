/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  webpack: (config, { webpack }) => {
    // External dependencies that should not be bundled
    config.externals = [...(config.externals || []), 'electron'];
    
    // Ignore canvas module (not used)
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^canvas$/
      })
    );
    
    // Ignore critical dependency warnings from @ffmpeg/ffmpeg
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      /Critical dependency: the request of a dependency is an expression/,
    ];
    
    // Handle Node.js modules for Electron
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
      stream: false,
      buffer: false,
      util: false
    };
    
    return config;
  },
  transpilePackages: ['remotion', '@remotion/player']
}

module.exports = nextConfig