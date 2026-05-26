import { createRoot } from 'react-dom/client';
import App from './app';
// @ts-ignore - Vite raw/inline import loader
import cssText from './content.css?inline';

function mount() {
  const EXISTING_ID = 'ai-assistant-root-container';
  if (document.getElementById(EXISTING_ID)) return;

  const container = document.createElement('div');
  container.id = EXISTING_ID;

  // Zero-size anchor at top-left — children use fixed positioning relative to viewport
  Object.assign(container.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    overflow: 'visible',
    zIndex: '2147483647',
    pointerEvents: 'none',
  });

  document.documentElement.appendChild(container);

  // Attach Shadow DOM for style isolation
  const shadowRoot = container.attachShadow({ mode: 'open' });

  // Inject scoped Tailwind CSS into shadow root
  const style = document.createElement('style');
  style.textContent = cssText;
  shadowRoot.appendChild(style);

  // React mount target — pointer events enabled so overlay is interactive
  const reactTarget = document.createElement('div');
  Object.assign(reactTarget.style, {
    pointerEvents: 'none',
    position: 'fixed',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    overflow: 'visible',
  });
  reactTarget.className = 'ai-assistant-shadow-root';
  shadowRoot.appendChild(reactTarget);

  // Portal container for floating elements (dropdowns, tooltips, etc.)
  // Used by Radix Portal/Dialog/Select if we add them later
  const portalContainer = document.createElement('div');
  portalContainer.className = 'ai-assistant-portal-root';
  shadowRoot.appendChild(portalContainer);

  const root = createRoot(reactTarget);
  root.render(<App portalContainer={portalContainer} />);
}

// Mount immediately or wait for body if document is still loading
if (document.body) {
  mount();
} else {
  document.addEventListener('DOMContentLoaded', mount);
}
