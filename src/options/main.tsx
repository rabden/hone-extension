import React from 'react';
import { createRoot } from 'react-dom/client';
import Options from './options';
import '../index.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <Options />
    </React.StrictMode>
  );
}
