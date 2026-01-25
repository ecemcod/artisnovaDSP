import React from 'react';

interface DebugComponentProps {
  message: string;
  data?: any;
}

export const DebugComponent: React.FC<DebugComponentProps> = ({ message, data }) => {
  console.log('DebugComponent:', message, data);
  
  return (
    <div className="p-8 bg-green-100 border border-green-300 rounded-lg">
      <h2 className="text-xl font-bold text-green-800 mb-4">Debug: {message}</h2>
      <div className="text-sm text-green-700">
        <p>✅ React está funcionando correctamente</p>
        <p>✅ Este componente se renderiza sin problemas</p>
        {data && (
          <pre className="mt-4 p-2 bg-green-50 rounded text-xs overflow-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
};