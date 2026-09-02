// Service worker minimo del KDS. Existe para dos cosas:
//  1. Chrome exige un SW con handler de fetch para ofrecer instalar la app.
//  2. Cachea el shell para que la pantalla abra rapido en wifi de local.
//
// Deliberadamente NO cachea /api/: los pedidos, los conteos y el stock salen
// siempre de la red. Un dato viejo de inventario es peor que un error.
const VERSION = 'kds-v1'
const CACHE_ESTATICOS = VERSION + '-estaticos'
const CACHE_PAGINAS = VERSION + '-paginas'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      // Borra las caches de versiones anteriores del SW.
      const nombres = await caches.keys()
      await Promise.all(
        nombres.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n))
      )
      await self.clients.claim()
    })()
  )
})

const esEstatico = (ruta) =>
  ruta.startsWith('/_next/static/') ||
  ruta.startsWith('/icons/') ||
  ruta.startsWith('/images/') ||
  ruta.startsWith('/sounds/')

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request
  if (peticion.method !== 'GET') return

  const url = new URL(peticion.url)
  if (url.origin !== self.location.origin) return
  // Datos: siempre red, nunca cache.
  if (url.pathname.startsWith('/api/')) return

  // Assets con hash en el nombre: cache primero, no cambian nunca.
  if (esEstatico(url.pathname)) {
    evento.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_ESTATICOS)
        const guardado = await cache.match(peticion)
        if (guardado) return guardado
        const respuesta = await fetch(peticion)
        if (respuesta.ok) cache.put(peticion, respuesta.clone())
        return respuesta
      })()
    )
    return
  }

  // Navegacion: red primero para no servir HTML viejo despues de un deploy;
  // la copia en cache solo entra si la red falla.
  if (peticion.mode === 'navigate') {
    evento.respondWith(
      (async () => {
        try {
          const respuesta = await fetch(peticion)
          if (respuesta.ok) {
            const cache = await caches.open(CACHE_PAGINAS)
            cache.put(peticion, respuesta.clone())
          }
          return respuesta
        } catch (error) {
          const cache = await caches.open(CACHE_PAGINAS)
          const guardado = await cache.match(peticion)
          if (guardado) return guardado
          const inicio = await cache.match('/')
          if (inicio) return inicio
          throw error
        }
      })()
    )
  }
})
