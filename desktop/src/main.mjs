import { app, BrowserWindow, clipboard, ipcMain } from 'electron';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beginLogin, finishLogin, readSession, removeSavedSession } from './caresens-auth.mjs';
const dir = dirname(fileURLToPath(import.meta.url));
const redirectPrefix = 'm-csair.i-sens.com:';
let mainWindow;
let loginWindow;
let pendingLogin;
let routeSecret = null;
let configValues = null;

app.whenReady().then(async () => {
    await removeSavedSession();
    mainWindow = new BrowserWindow({
        width: 380,
        height: 380,
        useContentSize: true,
        resizable: false,
        title: 'CareSens Connect',
        backgroundColor: '#f8fafc',
        webPreferences: { preload: join(dir, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false }
    });
    mainWindow.setMenuBarVisibility(false);
    await mainWindow.loadFile(join(dir, 'index.html'));
});

async function startLogin() {
    pendingLogin = await beginLogin();
    loginWindow?.close();
    loginWindow = new BrowserWindow({
        width: 500,
        height: 730,
        parent: mainWindow,
        title: 'CareSens 계정 로그인',
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'caresens-login' }
    });
    let handlingCallback = false;
    const handleCallback = async (url) => {
        if (handlingCallback) return;
        handlingCallback = true;
        try {
            await finishLogin(url, pendingLogin);
            pendingLogin = null;
            configValues = null;
            loginWindow?.close();
            loginWindow = null;
            mainWindow.webContents.send('login-result', { ok: true });
        } catch (error) {
            mainWindow.webContents.send('login-result', { ok: false, error: error.message });
            handlingCallback = false;
        }
    };

    for (const event of ['will-navigate', 'will-redirect']) {
        loginWindow.webContents.on(event, (e, url) => {
            if (url.startsWith(redirectPrefix)) {
                e.preventDefault();
                void handleCallback(url);
            }
        });
    }
    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith(redirectPrefix)) void handleCallback(url);
        return { action: 'deny' };
    });
    await loginWindow.loadURL(pendingLogin.url);
}

ipcMain.handle('login', startLogin);
ipcMain.handle('get-config', async () => {
    const session = readSession();
    if (!session?.tokens?.refresh_token) throw Error('먼저 CareSens 로그인에 성공해야 합니다.');
    if (!routeSecret) routeSecret = randomBytes(32).toString('hex');
    const encodedSession = Buffer.from(JSON.stringify(session), 'utf8').toString('base64');
    configValues = {
        CARESENS_SESSION_B64: encodedSession,
        CARESENS_ROUTE_SECRET: routeSecret
    };
    return configValues;
});
ipcMain.handle('copy-config-value', (_event, name) => {
    if (!configValues || !Object.hasOwn(configValues, name)) throw Error('먼저 로그인해 설정값을 확인하세요.');
    clipboard.writeText(configValues[name]);
});
app.on('window-all-closed', () => app.quit());
