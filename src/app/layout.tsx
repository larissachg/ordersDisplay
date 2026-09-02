import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { SideMenu } from '@/components/SideMenu'
import { RegistrarServiceWorker } from '@/components/RegistrarServiceWorker'

export const metadata: Metadata = {
  title: 'Restotech KDS',
  description: 'App para pedidos de restotech',
  // El manifest lo sirve src/app/manifest.ts.
  appleWebApp: { capable: true, title: 'KDS', statusBarStyle: 'default' },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png'
  }
}

export const viewport: Viewport = {
  themeColor: '#626e78',
  // La captura de inventario es a pantalla completa en tablet: sin zoom por
  // doble toque, que en un teclado numerico se dispara solo.
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang='es'>
      <body className={`antialiased`} suppressHydrationWarning>
        {children}
        <SideMenu />
        <RegistrarServiceWorker />
        <Toaster
          theme='light'
          toastOptions={{
            actionButtonStyle: { backgroundColor: '#fff', color: 'black' }
          }}
        />
      </body>
    </html>
  )
}
