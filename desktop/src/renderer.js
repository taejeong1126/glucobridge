const byId = (id) => document.getElementById(id);

function showError(error) {
    byId('error').textContent = '오류: ' + error.message;
    byId('error').hidden = false;
}

async function showConfig() {
    const values = await window.care.getConfig();
    byId('session-value').value = values.CARESENS_SESSION_B64;
    byId('secret-value').value = values.CARESENS_ROUTE_SECRET;
    byId('login-screen').hidden = true;
    byId('config-screen').hidden = false;
    byId('error').hidden = true;
    byId('notice').textContent = '각 값을 복사해 Vercel에 등록하세요.';
}

async function copyValue(name, button, message) {
    button.disabled = true;
    try {
        await window.care.copyConfigValue(name);
        byId('notice').textContent = message;
    } catch (error) {
        showError(error);
    } finally {
        button.disabled = false;
    }
}

byId('login').onclick = async () => {
    const button = byId('login');
    button.disabled = true;
    try {
        await window.care.login();
    } catch (error) {
        showError(error);
    } finally {
        button.disabled = false;
    }
};

byId('copy-session').onclick = () => copyValue('CARESENS_SESSION_B64', byId('copy-session'), '세션 값을 복사했습니다.');
byId('copy-secret').onclick = () => copyValue('CARESENS_ROUTE_SECRET', byId('copy-secret'), '비밀키를 복사했습니다.');
window.care.onLoginResult((result) => {
    if (result.ok) showConfig().catch(showError);
    else showError(new Error(result.error));
});
