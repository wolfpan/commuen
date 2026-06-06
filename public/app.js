document.addEventListener('DOMContentLoaded', () => {
    // 基础节点获取
    const userInput = document.getElementById('userInput');
    const submitBtn = document.getElementById('submitBtn');
    const suggestionText = document.getElementById('suggestionText');
    const rationaleText = document.getElementById('rationaleText');

    // PIN 系统节点获取
    const pinOverlay = document.getElementById('pinOverlay');
    const pinInput = document.getElementById('pinInput');
    const pinError = document.getElementById('pinError');

    // 初始化全局状态
    let currentPin = localStorage.getItem('app_pin') || '';

    // 页面加载时自动验证本地 PIN
    if (currentPin) {
        verifyPin(currentPin, true);
    } else {
        pinInput.focus();
    }

    // 绑定 PIN 事件
    pinInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') verifyPin(pinInput.value.trim());
    });

    // 绑定主请求事件
    userInput.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            submitRequest();
        }
    });
    submitBtn.addEventListener('click', submitRequest);

    // 独立的 PIN 验证函数
    async function verifyPin(pin, isAuto = false) {
        if (!pin) return;
        
        // 验证中状态：锁定输入框，避免重复回车
        pinInput.disabled = true;
        const originalPlaceholder = pinInput.placeholder;
        pinInput.placeholder = "VERIFYING...";

        try {
            const res = await fetch('/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin })
            });
            
            if (res.ok) {
                currentPin = pin;
                localStorage.setItem('app_pin', pin);
                pinOverlay.classList.add('hidden');
                setTimeout(() => pinOverlay.style.display = 'none', 300);
                userInput.focus();
            } else {
                throw new Error('鉴权失败');
            }
        } catch (error) {
            if (!isAuto) {
                pinError.textContent = '无效的访问密钥';
                pinInput.value = '';
                setTimeout(() => pinError.textContent = '', 2000);
            } else {
                localStorage.removeItem('app_pin');
            }
        } finally {
            // 恢复初始状态
            pinInput.disabled = false;
            pinInput.placeholder = originalPlaceholder;
            // 如果还在验证页面，让焦点回到输入框
            if (pinOverlay.style.display !== 'none' && !pinOverlay.classList.contains('hidden')) {
                pinInput.focus();
            }
        }
    }

    async function submitRequest() {
        const text = userInput.value.trim();
        if (!text) return;

        const contextType = document.getElementById('contextSelect').value;
        const outputLang = document.getElementById('outputLangSelect').value;
        const modelChoice = document.getElementById('modelSelect').value; 

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
            const response = await fetch('/api/enhance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userText: text, 
                    contextType: contextType,
                    outputLang: outputLang,
                    modelChoice: modelChoice,
                    pin: currentPin // 附加上下文中的密钥
                })
            });

            // 拦截后端返回的 401，唤醒重登录机制
            if (response.status === 401) {
                localStorage.removeItem('app_pin');
                pinOverlay.style.display = 'flex';
                // 强制重绘后再移除 hidden
                void pinOverlay.offsetWidth;
                pinOverlay.classList.remove('hidden');
                throw new Error('会话过期或密钥已更改，请重新验证');
            }

            if (!response.ok) throw new Error('网络请求失败');

            const data = await response.json();

            suggestionText.textContent = data.suggestion;
            rationaleText.textContent = data.rationale;
            
        } catch (error) {
            console.error(error);
            suggestionText.textContent = '重构失败。';
            rationaleText.textContent = error.message.includes('会话') 
                ? '错误：鉴权失败。' 
                : '错误：API 响应异常。请检查后端日志或重试。';
        } finally {
            submitBtn.disabled = false;
            submitBtn.classList.remove('loading');
            submitBtn.innerHTML = `重构 <span class="shortcut">(Cmd/Ctrl + Enter)</span>`;
        }
    }
});