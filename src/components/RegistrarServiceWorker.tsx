'use client'

import { useEffect } from 'react'

// Registra el service worker que habilita instalar el KDS como app.
// Solo en produccion: en `next dev` los chunks de /_next/static cambian en cada
// recompilacion y cachearlos deja la pantalla pidiendo modulos que ya no existen
// (el mismo sintoma que compilar con el dev server prendido).
export const RegistrarServiceWorker = () => {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    // Sin contexto seguro (HTTP plano sin el flag de Chrome) register() rechaza.
    if (!window.isSecureContext) return

    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('No se pudo registrar el service worker:', error)
    })
  }, [])

  return null
}
