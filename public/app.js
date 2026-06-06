document.addEventListener('DOMContentLoaded', () => {
    const userInput = document.getElementById('userInput');
    const submitBtn = document.getElementById('submitBtn');
    const suggestionText = document.getElementById('suggestionText');
    const rationaleText = document.getElementById('rationaleText');

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
                    modelChoice: modelChoice
                })
            });

            if (!response.ok) throw new Error('网络请求失败');

            const data = await response.json();

            suggestionText.textContent = data.suggestion;
            rationaleText.textContent = data.rationale;
            
        } catch (error) {
            console.error(error);
            suggestionText.textContent = '重构失败。请检查后端日志或重试。';
            rationaleText.textContent = '错误：API 响应异常。';
        } finally {
            submitBtn.disabled = false;
            submitBtn.classList.remove('loading');
            submitBtn.innerHTML = `重构 <span class="shortcut">(Cmd/Ctrl + Enter)</span>`;
        }
    }
});