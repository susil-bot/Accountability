import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

/** Lets people add the app to their home screen (required for push notifications on iPhone). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Accountability',
    short_name: 'Accountability',
    description: 'Daily commitments, honest check-ins and a mentor who follows up.',
    start_url: '/login',
    display: 'standalone',
    background_color: '#fafaf9',
    theme_color: '#0f5465',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
