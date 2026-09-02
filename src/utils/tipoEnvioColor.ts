// Color por tipo de envio, compartido entre la pantalla principal y las
// pantallas-estacion. Mapa fijo para los conocidos + hash estable a la paleta
// para el resto, mismo comportamiento que tenia Orders.tsx.
const colorPalette = [
  '#3B82F6',
  '#8B5CF6',
  '#6B7280',
  '#6366F1',
  '#EC4899',
  '#F97316',
  '#14B8A6',
  '#A855F7',
  '#F43F5E',
  '#22C55E',
  '#0EA5E9',
  '#DB2777',
  '#EC4899',
  '#F87171',
  '#34D399'
]

export function getColorForTipoEnvio(
  tipoEnvio: string | null,
  colorDefault: string
): string {
  if (!tipoEnvio || typeof tipoEnvio !== 'string') return colorDefault // Gris por defecto '#6B7280'

  const normalizedTipoEnvio = tipoEnvio.toLowerCase()
  const colorMap: Record<string, string> = {
    'pedidos ya': '#EF4444', // Rojo
    whatsapp: '#10B981', // Verde
    'whatsapp delivery': '#10B981', // Verde
    'whatsapp recoge': '#308569', // Verde oscuro
    restomenu: '#F59E0B', // Amarillo
    yango: '#C539F7' // Morado
  }

  // 🔸 Si empieza con "postres", aplica el color café
  if (normalizedTipoEnvio.startsWith('postres')) return '#5e471cff'

  if (colorMap[normalizedTipoEnvio]) return colorMap[normalizedTipoEnvio]

  let hash = 0
  for (let i = 0; i < normalizedTipoEnvio.length; i++) {
    hash = normalizedTipoEnvio.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash
  }

  const index = Math.abs(hash) % colorPalette.length
  return colorPalette[index] || colorDefault
}
