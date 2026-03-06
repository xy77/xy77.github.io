/**
 * 身份验证
 */

const AUTH_CONFIG = {
    token: "NzQxMjk2NTg=", 
    storageKey: 'auth_expiry_timestamp',
    daysToExpiry: 7
};


function _decode(str) {
    try {
        return atob(str);
    } catch (e) {
        return "";
    }
}

/**
 * 检查当前用户是否有权访问
 */
function checkAuth() {
    const expiry = localStorage.getItem(AUTH_CONFIG.storageKey);
    const now = new Date().getTime();
    
    // 获取当前文件名，兼容 file:// 协议下的复杂路径
    const path = window.location.pathname;
    const isAuthPage = path.indexOf('auth.html') !== -1;

    if (!expiry || now > parseInt(expiry)) {
        // 未授权或已过期 -> 且不在验证页时，跳转验证
        if (!isAuthPage) {
            window.location.replace('auth.html');
        }
    } else {
        // 已授权 -> 且在验证页时，跳回主页
        if (isAuthPage) {
            window.location.replace('index.html');
        }
    }
}

/**
 * 处理登录验证
 */
function handleLogin(inputPwd) {
    if (inputPwd === _decode(AUTH_CONFIG.token)) {
        const now = new Date().getTime();
        const expiryTime = now + (AUTH_CONFIG.daysToExpiry * 24 * 60 * 60 * 1000);
        
        try {
            localStorage.setItem(AUTH_CONFIG.storageKey, expiryTime.toString());
            return true;
        } catch (e) {
            console.error("LocalStorage 被浏览器禁用，请尝试在服务器环境下运行。");
            sessionStorage.setItem(AUTH_CONFIG.storageKey, expiryTime.toString());
            return true;
        }
    }
    return false;
}

// 立即执行初始化检查
(function() {
    // 增加一个简单的持久化 fallback
    if (!localStorage.getItem(AUTH_CONFIG.storageKey)) {
        const sessionExpiry = sessionStorage.getItem(AUTH_CONFIG.storageKey);
        if (sessionExpiry) localStorage.setItem(AUTH_CONFIG.storageKey, sessionExpiry);
    }
    checkAuth();
})();