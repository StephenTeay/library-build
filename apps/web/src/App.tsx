import React from 'react';

export default function App() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ borderBottom: '2px solid #0f766e', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <h1 style={{ color: '#0f766e', margin: 0 }}>Federal School of Statistics, Ibadan</h1>
        <p style={{ color: '#64748b', margin: '0.5rem 0 0' }}>Zero-Cost E-Learning Portal & Digital Library</p>
      </header>
      <main>
        <section style={{ background: '#f1f5f9', padding: '1.5rem', borderRadius: '8px' }}>
          <h2>System Status: Scaffold Initialized</h2>
          <p>PWA Shell and API Gateway proxy configured.</p>
        </section>
      </main>
    </div>
  );
}

