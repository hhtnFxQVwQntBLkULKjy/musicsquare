document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const goRegisterBtn = document.getElementById('go-register');
    const goLoginBtn = document.getElementById('go-login');
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    
    // Toast Helper
    function showToast(msg, type = 'error') {
        const container = document.querySelector('.toast-container') || createToastContainer();
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
        toast.innerHTML = `<i class="fas ${icon}"></i> ${msg}`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function createToastContainer() {
        const div = document.createElement('div');
        div.className = 'toast-container';
        document.body.appendChild(div);
        return div;
    }

    // Success Modal Helper
    function showSuccessModal() {
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay show';
        overlay.innerHTML = `
            <div class="dialog-box" style="width:320px;text-align:center;padding:30px;">
                <div style="width:60px;height:60px;background:#e6fffa;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
                    <i class="fas fa-check" style="font-size:30px;color:#1ecf9f;"></i>
                </div>
                <h3 style="margin-bottom:10px;color:#333;">注册成功</h3>
                <p style="color:#666;font-size:14px;margin-bottom:24px;">欢迎加入云端音乐，请登录开启音乐之旅。</p>
                <button class="btn-primary" style="width:100%;height:40px;border-radius:20px;" id="success-login-btn">立即登录</button>
            </div>
        `;
        document.body.appendChild(overlay);
        document.getElementById('success-login-btn').onclick = () => {
            overlay.remove();
            goLoginBtn.click();
        };
    }

    // Check Remembered User
    const savedUser = localStorage.getItem('rememberedUser');
    if (savedUser) {
        document.getElementById('username').value = savedUser;
        document.getElementById('remember-me').checked = true;
    }

    // Check if already logged in
    if (AuthService.currentUser) {
        window.location.href = 'home.html';
        return;
    }

    // Toggle Forms
    goRegisterBtn.addEventListener('click', () => {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    });

    goLoginBtn.addEventListener('click', () => {
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';
    });

    // Login Logic
    loginBtn.addEventListener('click', async () => {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        const remember = document.getElementById('remember-me').checked;

        if (!username || !password) {
            showToast('请输入用户名和密码', 'error');
            return;
        }

        loginBtn.disabled = true;
        loginBtn.textContent = '登录中...';

        try {
            await AuthService.login(username, password);
            
            if (remember) {
                localStorage.setItem('rememberedUser', username);
            } else {
                localStorage.removeItem('rememberedUser');
            }
            
            // Show Large Success Toast
            const container = document.querySelector('.toast-container') || createToastContainer();
            const toast = document.createElement('div');
            toast.className = 'toast login-success';
            toast.innerHTML = `<i class="fas fa-check-circle" style="font-size:24px;"></i> 登录成功，即将跳转...`;
            container.appendChild(toast);
            
            setTimeout(() => window.location.href = 'home.html', 1500);
        } catch (e) {
            showToast(e.message || '登录失败，请检查用户名或密码', 'error');
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = '登录';
        }
    });

    // Register Logic
    registerBtn.addEventListener('click', async () => {
        const username = document.getElementById('reg-username').value.trim();
        const password = document.getElementById('reg-password').value.trim();
        const confirm = document.getElementById('reg-password-confirm').value.trim();

        if (!username || !password) {
            showToast('请填写所有字段', 'error');
            return;
        }

        if (password !== confirm) {
            showToast('两次输入的密码不一致', 'error');
            return;
        }

        registerBtn.disabled = true;
        registerBtn.textContent = '注册中...';

        try {
            await AuthService.register(username, password);
            
            // Auto-fill login form
            document.getElementById('username').value = username;
            document.getElementById('password').value = password;
            
            // Show Large Register Success Toast
            const container = document.querySelector('.toast-container') || createToastContainer();
            const toast = document.createElement('div');
            toast.className = 'toast register-success';
            toast.innerHTML = `<i class="fas fa-check-circle" style="font-size:24px;"></i> 注册成功，正在为您登录...`;
            container.appendChild(toast);
            
            // Switch to login view immediately
            goLoginBtn.click();
            
            // Auto click login after 1.5s
            setTimeout(() => {
                loginBtn.click();
            }, 1500);
            
        } catch (e) {
            let msg = e.message;
            if (msg.includes('exists') || msg.includes('Username already exists')) msg = '该账号已存在，请直接登录';
            else if (msg.includes('failed')) msg = '注册失败，请稍后重试';
            showToast(msg, 'error');
        } finally {
            registerBtn.disabled = false;
            registerBtn.textContent = '注册';
        }
    });
});
