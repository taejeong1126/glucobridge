import { app, BrowserWindow, clipboard, ipcMain } from 'electron';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beginLogin, finishLogin, readSession, removeSavedSession } from './caresens-auth.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const redirectPrefix = 'm-csair.i-sens.com:';
let mainWindow;
let loginWindow;
let routeSecret;
let configValues;

function sendLoginResult(result) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('login-result', result);
}

app.whenReady().then(async () => {
    // Clean up a session file written by older versions; the current app keeps it in memory only.
    await removeSavedSession();
    mainWindow = new BrowserWindow({
        width: 410,
        height: 350,
        useContentSize: true,
        resizable: false,
        title: 'CareSens Connect',
        backgroundColor: '#f8fafc',
        webPreferences: { preload: join(dir, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false }
    });
    mainWindow.setMenuBarVisibility(false);
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
    await mainWindow.loadFile(join(dir, 'index.html'));
});

async function startLogin() {
    if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.focus();
        return;
    }

    const pending = await beginLogin();
    const window = new BrowserWindow({
        width: 500,
        height: 730,
        parent: mainWindow,
        title: 'CareSens 계정 로그인',
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'caresens-login' }
    });
    loginWindow = window;
    window.setMenuBarVisibility(false);
    let settled = false;

    function settle(result) {
        if (settled) return;
        settled = true;
        if (result.ok) configValues = undefined;
        if (!window.isDestroyed()) window.close();
        sendLoginResult(result);
    }

    window.on('closed', () => {
        if (loginWindow === window) loginWindow = undefined;
        settle({ ok: false, cancelled: true });
    });

    let handlingCallback = false;
    const handleCallback = async (url) => {
        if (handlingCallback || settled) return;
        handlingCallback = true;
        try {
            await finishLogin(url, pending);
            settle({ ok: true });
        } catch (error) {
            settle({ ok: false, error: error instanceof Error ? error.message : '로그인 실패' });
        }
    };

    for (const eventName of ['will-navigate', 'will-redirect']) {
        window.webContents.on(eventName, (event, url) => {
            if (url.startsWith(redirectPrefix)) {
                event.preventDefault();
                void handleCallback(url);
            }
        });
    }
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith(redirectPrefix)) void handleCallback(url);
        return { action: 'deny' };
    });

    try {
        await window.loadURL(pending.url);
    } catch (error) {
        settle({ ok: false, error: error instanceof Error ? error.message : '로그인 페이지를 열 수 없습니다.' });
    }
}

ipcMain.handle('login', startLogin);
ipcMain.handle('copy-config-value', (_event, name) => {
    if (name !== 'CARESENS_SESSION_B64' && name !== 'CARESENS_ROUTE_SECRET') throw new Error('잘못된 설정 항목입니다.');
    const session = readSession();
    if (!session?.tokens?.refresh_token) throw new Error('먼저 CareSens 로그인에 성공해야 합니다.');
    routeSecret ??= randomBytes(32).toString('hex');
    configValues ??= {
        CARESENS_SESSION_B64: Buffer.from(JSON.stringify(session), 'utf8').toString('base64'),
        CARESENS_ROUTE_SECRET: routeSecret
    };
    clipboard.writeText(configValues[name]);
});

app.on('window-all-closed', () => app.quit());
