import React from 'react';

// Versión mínima para debugging
const App: React.FC = () => {
  return (
    <div style={{ 
      padding: '20px', 
      backgroundColor: '#000', 
      color: '#fff', 
      minHeight: '100vh',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1>ArtisNova DSP - Debug Mode</h1>
      <p>Si ves este mensaje, la aplicación React está funcionando correctamente.</p>
      <p>El problema está en algún componente específico.</p>
      <div style={{ marginTop: '20px', padding: '10px', border: '1px solid #333' }}>
        <h2>Estado del Sistema:</h2>
        <ul>
          <li>✅ React cargado correctamente</li>
          <li>✅ Vite funcionando</li>
          <li>✅ TypeScript compilado</li>
          <li>❓ Investigando componentes problemáticos...</li>
        </ul>
      </div>
    </div>
  );
};

export default App;