import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

// We do NOT call provideVSCodeDesignSystem().register() here because
// importing from '@vscode/webview-ui-toolkit/react' in other components
// already registers them, and doing it twice throws a fatal DOMException!

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
