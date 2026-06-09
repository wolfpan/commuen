// app.js
document.addEventListener('DOMContentLoaded', () => {
    // =========================================
    // 1. 初始化 Supabase 客户端
    // =========================================
    // ⚠️ 请在此处填入你自己的 Supabase 项目 URL 和 Anon Key
    const SUPABASE_URL = 'https://ocanypotivoveuoezcax.supabase.co'; 
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jYW55cG90aXZvdmV1b2V6Y2F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5Njk1NDQsImV4cCI6MjA5NjU0NTU0NH0.Qygz7W4S0hgP4qvuApvj8oB7Q60GFY0f8GWXAedQtGE';
    
    // 由于我们在 index.html 引入了 CDN，所以全局有 supabase 对象
    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // =========================================
    // 2. 基础 DOM 节点获取
    // =========================================
    const userInput = document.getElementById('userInput');
    const submitBtn = document.getElementById('submitBtn');
    const suggestionText = document.getElementById('suggestionText');
    const rationaleText = document.getElementById('rationaleText');
    const pasteBtn = document.getElementById('pasteBtn');
    const copyBtn = document.getElementById('copyBtn');
    const modelSelect = document.getElementById('modelSelect');

    // =========================================
    // 3. Auth 弹窗节点获取
    // =========================================
    const authOverlay = document.getElementById('authOverlay');
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    const guestBtn = document.getElementById('guestBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const authError = document.getElementById('authError');

    // 全局凭证状态
    let sessionToken = null;

    // =========================================
    // 4. Supabase 状态机驱动 (核心权限控制)
    // =========================================
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) {
            // ----- 登录状态 -----
            sessionToken = session.access_token;
            logoutBtn.style.display = 'flex';
            hideAuthOverlay();
            
            // 释放所有模型选择权，并去除下拉框中的“(需登录)”字样
            Array.from(modelSelect.options).forEach(opt => {
                opt.disabled = false;
                opt.textContent = opt.textContent.replace(' (需登录)', '');
            });
        } else {
            // ----- 未登录/登出/游客状态 -----
            sessionToken = null;
            logoutBtn.style.display = 'none';
            
            // 强制将模型回滚至默认的 GLM 4
            modelSelect.value = 'glm';
            
            // 禁用高级模型，并补充“(需登录)”提示
            Array.from(modelSelect.options).forEach(opt => {
                if (opt.value !== 'glm') {
                    opt.disabled = true;
                    if (!opt.textContent.includes('(需登录)')) {
                        opt.textContent += ' (需登录)';
                    }
                }
            });
        }
    });

    // =========================================
    // 5. 身份验证事件绑定
    // =========================================
    
    // 登录
    loginBtn.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        if (!email || !password) return showAuthError('请输入邮箱和密码');

        toggleAuthLoading(true);
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        
        if (error) showAuthError(error.message);
        toggleAuthLoading(false);
    });

    // 注册
    signupBtn.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        if (!email || !password) return showAuthError('请输入邮箱和密码');

        toggleAuthLoading(true);
        const { error } = await supabaseClient.auth.signUp({ email, password });
        
        if (error) {
            showAuthError(error.message);
        } else {
            showAuthError('注册成功！请查收验证邮件（或直接点击登录）。');
        }
        toggleAuthLoading(false);
    });

    // 游客免登录进场
    guestBtn.addEventListener('click', () => {
        hideAuthOverlay();
    });

    // 登出
    logoutBtn.addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        showAuthOverlay();
    });

    // 密码框回车快捷登录
    passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loginBtn.click();
    });

    // Auth 相关的 UI 辅助函数
    function showAuthError(msg) {
        authError.textContent = msg;
        setTimeout(() => authError.textContent = '', 4000);
    }

    function toggleAuthLoading(isLoading) {
        loginBtn.disabled = isLoading;
        signupBtn.disabled = isLoading;
        emailInput.disabled = isLoading;
        passwordInput.disabled = isLoading;
        loginBtn.textContent = isLoading ? '验证中...' : '登录';
    }

    function hideAuthOverlay() {
        authOverlay.classList.add('hidden');
        setTimeout(() => {
            authOverlay.style.display = 'none';
            userInput.focus();
        }, 300);
    }

    function showAuthOverlay() {
        authOverlay.style.display = 'flex';
        // 触发重绘，确保过渡动画生效
        void authOverlay.offsetWidth;
        authOverlay.classList.remove('hidden');
        emailInput.focus();
    }


    // =========================================
    // 6. 核心业务逻辑 (粘贴、复制、提交重构)
    // =========================================

    // 绑定粘贴事件
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                userInput.value = text;
                userInput.focus();
            }
        } catch (err) {
            console.error('粘贴失败: ', err);
            alert('无法读取剪贴板，请检查浏览器权限。');
        }
    });

    // 绑定复制事件
    copyBtn.addEventListener('click', async () => {
        const textToCopy = suggestionText.textContent;
        if (!textToCopy || textToCopy === '等待输入内容...' || suggestionText.classList.contains('empty-state')) {
            return;
        }
        
        try {
            await navigator.clipboard.writeText(textToCopy);
            
            // 复制成功的视觉反馈 (呈现绿色高光及勾选图标)
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#27c93f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            copyBtn.style.borderColor = "rgba(39, 201, 63, 0.4)";
            
            setTimeout(() => {
                copyBtn.innerHTML = originalHTML;
                copyBtn.style.borderColor = "";
            }, 2000);
        } catch (err) {
            console.error('复制失败: ', err);
        }
    });

    // 绑定主请求事件
    userInput.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            submitRequest();
        }
    });
    
    submitBtn.addEventListener('click', submitRequest);

    // 发送重构请求
    async function submitRequest() {
        const text = userInput.value.trim();
        if (!text) return;

        const contextType = document.getElementById('contextSelect').value;
        const outputLang = document.getElementById('outputLangSelect').value;
        const modelChoice = modelSelect.value; 

        // 设置 Loading 状态
        submitBtn.disabled = true;
        submitBtn.classList.add('loading');
        submitBtn.innerHTML = `
            <div class="spinner"></div>
            重构中
        `;
        
        suggestionText.textContent = `引擎 (${modelChoice}) 正在分析语境...`;
        suggestionText.classList.remove('empty-state');
        rationaleText.textContent = '推演最佳重构策略中...';

        try {
            // 动态组装请求头
            const headers = { 'Content-Type': 'application/json' };
            if (sessionToken) {
                headers['Authorization'] = `Bearer ${sessionToken}`; // 附带身份凭证
            }

            const response = await fetch('/api/enhance', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ 
                    userText: text, 
                    contextType: contextType,
                    outputLang: outputLang,
                    modelChoice: modelChoice
                })
            });

            // 拦截后端返回的 401（可能是 JWT 过期，或游客恶意调用受限模型）
            if (response.status === 401) {
                showAuthOverlay();
                throw new Error('会话过期或需登录解锁该模型，请重新验证。');
            }

            if (!response.ok) throw new Error('网络请求失败');

            const data = await response.json();

            // 渲染结果
            suggestionText.textContent = data.suggestion;
            
            // 渲染智能路由徽章
            if (contextType === 'auto' && data.detectedContext) {
                rationaleText.innerHTML = `<span class="route-badge">智能路由: ${data.detectedContext}</span> ${data.rationale}`;
            } else {
                rationaleText.textContent = data.rationale;
            }
            
        } catch (error) {
            console.error(error);
            suggestionText.textContent = '重构失败。';
            rationaleText.textContent = `错误：${error.message}`;
        } finally {
            // 恢复按钮状态
            submitBtn.disabled = false;
            submitBtn.classList.remove('loading');
            submitBtn.innerHTML = `重构 <span class="shortcut">(Cmd/Ctrl + Enter)</span>`;
        }
    }
});