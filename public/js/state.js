let projectsData = [];
let sessionsData = [];
let currentProject = null;
let historyPage = 1;
let historySearch = '';

export function getProjectsData() { return projectsData; }
export function setProjectsData(data) { projectsData = data; }

export function getSessionsData() { return sessionsData; }
export function setSessionsData(data) { sessionsData = data; }
export function appendSessionsData(data) { sessionsData = sessionsData.concat(data); }

export function getCurrentProject() { return currentProject; }
export function setCurrentProject(p) { currentProject = p; }

export function getHistoryPage() { return historyPage; }
export function setHistoryPage(n) { historyPage = n; }

export function getHistorySearch() { return historySearch; }
export function setHistorySearch(s) { historySearch = s; }
