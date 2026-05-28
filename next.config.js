/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow Next/Image to be added later without revisiting config when we render
  // user-uploaded receipt thumbnails from blob storage.
  images: {
    remotePatterns: [],
  },
};

module.exports = nextConfig;
