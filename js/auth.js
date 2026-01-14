document.addEventListener('DOMContentLoaded', () => {
    // Check if already logged in
    if (localStorage.getItem('currentUser')) {
        window.location.href = 'home.html';
        return;
    }

    // Auto-fill remembered username
    const savedUser = localStorage.getItem('rememberedUser');
    if (savedUser) {
        document.getElementById('login-username').value = savedUser;
        document.getElementById('remember-me').checked = true;
    }

    // Tab Switching
    const tabs = document.querySelectorAll('.tab');
    const forms = document.querySelectorAll('.auth-form');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const target = tab.dataset.tab;
            forms.forEach(f => {
                f.classList.remove('active');
                if (f.id === `${target}-form`) f.classList.add('active');
            });
        });
    });

    // Login Logic
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value.trim();
        const remember = document.getElementById('remember-me').checked;
        const errorMsg = document.getElementById('login-error');

        // Mock Validation
        if (username && password) {
            // Save current user
            const user = { username, avatar: `https://ui-avatars.com/api/?name=${username}&background=random` };
            localStorage.setItem('currentUser', JSON.stringify(user));
            
            // Remember Me
            if (remember) {
                localStorage.setItem('rememberedUser', username);
            } else {
                localStorage.removeItem('rememberedUser');
            }

            window.location.href = 'home.html';
        } else {
            errorMsg.style.display = 'block';
            errorMsg.textContent = '请输入用户名和密码';
        }
    });

    // Register Logic
    document.getElementById('register-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('reg-username').value.trim();
        const password = document.getElementById('reg-password').value.trim();
        const confirm = document.getElementById('reg-confirm').value.trim();
        
        if (password !== confirm) {
            alert('两次密码输入不一致');
            return;
        }

        // Mock Register
        alert('注册成功，请登录');
        tabs[0].click(); // Switch to login
    });
});
