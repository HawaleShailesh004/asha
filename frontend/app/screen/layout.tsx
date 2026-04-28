// This layout ensures the screen page has no nav header/footer
// It's a standalone mobile-first interface
export default function ScreenLayout({ children }: { children: React.ReactNode }) {
    return (
      <div style={{ background: '#f4f7f6', minHeight: '100vh' }}>
        {children}
      </div>
    )
  }