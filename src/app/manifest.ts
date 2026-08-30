import type { MetadataRoute } from 'next'

// Manifest de la PWA: lo unico que hace falta para que la tablet pueda instalar
// el KDS como app. Requiere contexto seguro (HTTPS o el flag de Chrome que ya
// documenta `en Raiz/Instrucciones.txt` para la camara del escaner).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Restotech KDS',
    short_name: 'KDS',
    description: 'Pantalla de cocina, despacho e inventario de Restotech',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#eef0f1',
    theme_color: '#626e78',
    lang: 'es',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ],
    // Atajo directo al inventario para las tablets que no son pantalla de cocina.
    shortcuts: [
      {
        name: 'Inventario',
        short_name: 'Inventario',
        url: '/inventario',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }]
      }
    ]
  }
}
