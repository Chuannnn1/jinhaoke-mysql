import './globals.css'

export const metadata = {
  title: '金濠客食堂 — 線上點餐',
  description: '金濠客食堂 POS 系統',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-TW">
      <head>
        {/* Playfair Display — 品牌 Logo 用 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}