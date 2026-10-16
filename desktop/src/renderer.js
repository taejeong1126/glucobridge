const byId = (id) => document.getElementById(id);

function showError(error) {
    byId('error').textContent = `오류: ${error.message}`;
    byId('error').hidden = false;
}

async function copyValue(name, button) {
    button.disabled = true;
    try {
        await window.care.copyConfigValue(name);
        byId('notice').textContent = `${name} 값이 클립보드에 복사되었습니다.`;
        byId('error').hidden = true;
    } catch (error) {
        showError(error);
    } finally {
        button.disabled = false;
    }
}

byId('login').onclick = async () => {
    byId('login').disabled = true;
    byId('error').hidden = true;
    try {
        await window.care.login();
    } catch (error) {
        byId('login').disabled = false;
        showError(error);
    }
};

byId('copy-session').onclick = () => copyValue('CARESENS_SESSION_B64', byId('copy-session'));
byId('copy-secret').onclick = () => copyValue('CARESENS_ROUTE_SECRET', byId('copy-secret'));

window.care.onLoginResult((result) => {
    byId('login').disabled = false;
    if (result.ok) {
        byId('login-screen').hidden = true;
        byId('config-screen').hidden = false;
        byId('error').hidden = true;
    } else if (!result.cancelled) {
        showError(new Error(result.error || '로그인에 실패했습니다.'));
    }
});
