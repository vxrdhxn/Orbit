import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';
import { provideVSCodeDesignSystem, vsCodeButton, vsCodeDropdown, vsCodeOption, vsCodeTextArea } from '@vscode/webview-ui-toolkit';

provideVSCodeDesignSystem().register(
    vsCodeButton(),
    vsCodeDropdown(),
    vsCodeOption(),
    vsCodeTextArea()
);

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
