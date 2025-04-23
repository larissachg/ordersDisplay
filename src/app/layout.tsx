import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { SideMenu } from '@/components/SideMenu'

export const metadata: Metadata = {
  title: 'Restotech KDS',
  description: 'App para pedidos de restotech'
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang='en'>
      <body className={`antialiased`} suppressHydrationWarning>
        {children}
        <SideMenu />
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
