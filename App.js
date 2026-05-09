import { h, render } from 'https://esm.sh/preact';
import { html } from './utils/core.js';
import { App } from './components/Communications.js';

render(html`<${App} />`, document.getElementById('app'));
