// app.js
document.addEventListener('DOMContentLoaded', async () => {
    // =========================================
    // 1. 初始化 Supabase 客户端
    // =========================================
    let supabaseClient;
    try {
        const configRes = await fetch('/api/config');
        const config = await configRes.json();
        
        // 使用获取到的变量初始化
        supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    } catch (error) {
        console.error("无法获取 Supabase 配置，请检查后端服务:", error);
        return; // 如果获取失败，直接阻断后续执行
    }

    // =========================================
    // 2. 基础 DOM 节点获取
    // =========================================
    const userInput = document.getElementById('userInput');
    const charCountEl = document.getElementById('charCount'); // 新增字数统计节点
    const submitBtn = document.getElementById('submitBtn');
    const suggestionText = document.getElementById('suggestionText');
    const rationaleText = document.getElementById('rationaleText');
    const pasteBtn = document.getElementById('pasteBtn');
    const copyBtn = document.getElementById('copyBtn');
    const modelSelect = document.getElementById('modelSelect');
    const triggerLoginBtn = document.getElementById('triggerLoginBtn');

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

    // 全局凭证与额度状态
    let sessionToken = null;
    let maxChars = 300; // 默认游客额度

    // =========================================
    // 4. 字数引擎与输入拦截
    // =========================================
    
    // 更新字数与 UI 状态
    function updateCharCount() {
        const currentLen = userInput.value.length;
        charCountEl.textContent = `${currentLen}/${maxChars}`;
        
        if (currentLen >= maxChars) {
            charCountEl.classList.add('limit-reached');
        } else {
            charCountEl.classList.remove('limit-reached');
        }
    }

    // 监听键盘输入
    userInput.addEventListener('input', () => {
        if (userInput.value.length > maxChars) {
            userInput.value = userInput.value.substring(0, maxChars);
        }
        updateCharCount();
    });

    // 绑定粘贴事件（含截断逻辑）
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                const newText = userInput.value + text;
                userInput.value = newText.substring(0, maxChars);
                updateCharCount();
                userInput.focus();
            }
        } catch (err) {
            console.error('粘贴失败: ', err);
            alert('无法读取剪贴板，请检查浏览器权限。');
        }
    });

    // 初始化渲染一次字数
    updateCharCount();

    // =========================================
    // 5. Supabase 状态机驱动 (核心权限与额度控制)
    // =========================================
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) {
            // ----- 登录状态 -----
            sessionToken = session.access_token;
            maxChars = 500; // 提升输入额度
            logoutBtn.style.display = 'flex';
            hideAuthOverlay();
            
            // 释放所有模型选择权
            Array.from(modelSelect.options).forEach(opt => {
                opt.disabled = false;
                opt.textContent = opt.textContent.replace(' (需登录)', '');
            });

            if (triggerLoginBtn) triggerLoginBtn.style.display = 'none';
        } else {
            // ----- 未登录/登出/游客状态 -----
            sessionToken = null;
            maxChars = 300; // 降级额度
            logoutBtn.style.display = 'none';
            
            // 如果登出时文本已超限，强制截断
            if (userInput.value.length > maxChars) {
                userInput.value = userInput.value.substring(0, maxChars);
            }
            
            // 强制将模型回滚至默认
            modelSelect.value = 'glm';
            
            // 禁用高级模型
            Array.from(modelSelect.options).forEach(opt => {
                if (opt.value !== 'glm') {
                    opt.disabled = true;
                    if (!opt.textContent.includes('(需登录)')) {
                        opt.textContent += ' (需登录)';
                    }
                }
            });

            if (triggerLoginBtn) triggerLoginBtn.style.display = 'inline-block';
        }
        
        // 状态变更后刷新字数 UI
        updateCharCount();
    });

    // =========================================
    // 6. 身份验证事件绑定
    // =========================================
    
    if (triggerLoginBtn) {
        triggerLoginBtn.addEventListener('click', showAuthOverlay);
    }

    loginBtn.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        if (!email || !password) return showAuthError('请输入邮箱和密码');

        toggleAuthLoading(true);
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        
        if (error) showAuthError(error.message);
        toggleAuthLoading(false);
    });

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

    guestBtn.addEventListener('click', () => {
        hideAuthOverlay();
    });

    logoutBtn.addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        showAuthOverlay(); 
    });

    passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loginBtn.click();
    });

    // Auth UI 辅助
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
        void authOverlay.offsetWidth;
        authOverlay.classList.remove('hidden');
        emailInput.focus();
    }


    // =========================================
    // 7. 业务提交与结果处理
    // =========================================

    copyBtn.addEventListener('click', async () => {
        const textToCopy = suggestionText.textContent;
        if (!textToCopy || textToCopy === '等待输入内容...' || suggestionText.classList.contains('empty-state')) {
            return;
        }
        
        try {
            await navigator.clipboard.writeText(textToCopy);
            
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

    userInput.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            submitRequest();
        }
    });
    
    submitBtn.addEventListener('click', submitRequest);

    async function submitRequest() {
        const text = userInput.value.trim();
        if (!text) return;

        const contextType = document.getElementById('contextSelect').value;
        const outputLang = document.getElementById('outputLangSelect').value;
        const modelChoice = modelSelect.value; 

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
            const headers = { 'Content-Type': 'application/json' };
            if (sessionToken) {
                headers['Authorization'] = `Bearer ${sessionToken}`;
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

            // 后端拦截触发（含字数超限、权限不足等情况）
            if (response.status === 400 || response.status === 401) {
                const errData = await response.json();
                if (response.status === 401) showAuthOverlay();
                throw new Error(errData.error || '会话异常，请检查状态。');
            }

            if (!response.ok) throw new Error('网络请求失败');

            const data = await response.json();

            suggestionText.textContent = data.suggestion;
            
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
            submitBtn.disabled = false;
            submitBtn.classList.remove('loading');
            submitBtn.innerHTML = `重构 <span class="shortcut">(Cmd/Ctrl + Enter)</span>`;
        }
    }
});