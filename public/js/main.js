import { applyTheme, registerThemeHandlers, registerRouter, init } from './router.js';
import { registerEventListeners } from './events.js';

applyTheme(localStorage.getItem('claude-view-theme') || 'system');
registerEventListeners();
registerThemeHandlers();
registerRouter();
init();
