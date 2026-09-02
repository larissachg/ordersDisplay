'use client'

import { redirect } from 'next/navigation'
import { useEffect, useState } from 'react'
import { OrdersPage } from './Orders'
import { EstacionView } from './EstacionView'
import { InventarioApp } from '../../inventario/(components)/InventarioApp'
import { EQUIPO_INVENTARIO } from '@/contants/inventario'

const PREFIJO_ESTACION = 'estacion:'

// Elige la vista segun el marcador guardado en /config: 'estacion:<id>' abre el
// visor de estacion, 'inventario' abre el modulo de conteo; cualquier otro valor
// conserva la pantalla de equipo de siempre.
export const PantallaPrincipal = () => {
  const [equipo, setEquipo] = useState<string | null>(null)

  useEffect(() => {
    setEquipo(localStorage.getItem('equipo') ?? '')
  }, [])

  if (equipo === null) return null

  if (equipo.length === 0) {
    redirect('/config')
  }

  if (equipo === EQUIPO_INVENTARIO) {
    return <InventarioApp />
  }

  if (equipo.startsWith(PREFIJO_ESTACION)) {
    const estacionId = parseInt(equipo.slice(PREFIJO_ESTACION.length), 10)
    if (Number.isFinite(estacionId) && estacionId > 0) {
      return <EstacionView estacionId={estacionId} />
    }
  }

  return <OrdersPage />
}
