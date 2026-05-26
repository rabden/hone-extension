import React from 'react';
import { createRoot } from 'react-dom/client';
import Popup from './popup';
import '../index.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <Popup />
    </React.StrictMode>
  );
}
