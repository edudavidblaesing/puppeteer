/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    API_URL: process.env.API_URL || 'https://pptr.davidblaesing.com',
    API_KEY: process.env.API_KEY || 'your-secure-api-key-here',
  },
};

module.exports = nextConfig;
