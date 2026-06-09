const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

// 从环境变量读取，如果未设置则写死一个默认值 (公网上线建议仅通过 .env 配置)
const ACCESS_PIN = process.env.ACCESS_PIN || '8888';

// 模型统一网关配置字典 (使用各大平台的 OpenAI 兼容接口)
const MODEL_CONFIGS = {
    'glm': {
        url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        key: process.env.GLM_API_KEY,
        model: 'glm-4-flash-250414'
    },
    'qwen': {
        url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        key: process.env.ALI_API_KEY,
        model: 'qwen3.6-plus-2026-04-02' 
    },
    'deepseek': {
        url: 'https://api.deepseek.com/chat/completions',
        key: process.env.DEEPSEEK_API_KEY,
        model: 'deepseek-v4-flash' 
    }
};

// 独立的 PIN 校验接口
app.post('/api/verify', (req, res) => {
    const { pin } = req.body;
    if (pin === ACCESS_PIN) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'PIN 错误' });
    }
});

// 核心重构接口
app.post('/api/enhance', async (req, res) => {
    const { userText, contextType, outputLang, modelChoice = 'glm', pin } = req.body;

    // 核心拦截：PIN 鉴权
    if (pin !== ACCESS_PIN) {
        return res.status(401).json({ error: "鉴权失败：无效的访问密钥" });
    }

    if (!userText) {
        return res.status(400).json({ error: "文本不能为空" });
    }

    const config = MODEL_CONFIGS[modelChoice] || MODEL_CONFIGS['glm'];
    
    if (!config.key) {
        return res.status(500).json({ error: `后端缺失 ${modelChoice} 的 API 密钥` });
    }

    const langMap = {
        'zh': '无论用户输入的是中文、英文还是混合语言，最终输出必须是纯正且符合专业语境的【中文】。',
        'en': '无论用户输入的是中文、英文还是混合语言，最终输出必须是母语级别的地道【英文】。'
    };
    const targetLang = langMap[outputLang] || langMap['zh'];

    const contextConfigs = {
        'internal': {
            description: '内部协作（如Slack/Teams）：工具流沟通，聚焦高效率、建设性边界与对事不对人。',
            rules: `1. 建设性直率（Constructive Firmness）：拒绝弱势兜圈子（如 I think, maybe, worried），但也严禁走向极端——绝对禁止使用绝对化、对抗性或死板的词汇（如 unfeasible, impossible, cannot）。使用“客观现状+同步进展”的柔性边界表达（如 feels tight on our side）。
2. 地道职场原生语（Native Corporate Phrasing）：优先使用跨国大厂高频、自然的惯用语组合（如用 "revisit" 替代 "adjust/change"，用 "firmed up" 替代 "confirmed"）。
3. 明确诉求（Clear Ask）：将模糊的焦虑或担忧，转化为“［客观现状］+［明确的下一步行动建议］”。`,
            example: `User: "I think maybe this timeline is a little difficult for us because some dependencies are not clear yet."
Assistant: {
  "suggestion": "This timeline feels tight on our side — a few dependencies are still unresolved. Can we revisit the dates once those are firmed up?",
  "rationale": "去除了不自信的修饰词，避免了对抗性否定，换用更地道的职场原生动词组合，既有边界感又具建设性。"
}`
        },
        'business': {
            description: '商业/公关（如LinkedIn/Email）：聚焦平等的同行交流，以及异步沟通的体贴与高级感。',
            rules: `1. 句流呼吸感（Rhythm & Fluidity）：坚决打破教科书式的机械断句（拒绝连续三个单碎短句的堆砌）。使用破折号（—）、分词短语或轻量连词（so, given that）将语意自然串联，呈现高级、流畅的语流。
2. 异步低压体贴（Low-Pressure Courtesy）：若原意包含“方便时查看”，应转化为极其松弛、体贴的异步职场达人表达（如 "feel free to review when it works for you"）。绝对禁止使用强加反馈压力的职场黑话（如 "let me know if we're aligned" 或 "waiting for your alignment"）。
3. 平视感与探索性（Constructive Peer Tone）：提出合作时使用留有余地的句式（如 "I'd love to explore", "would you be open to"）。去掉中式英文的硬套（如 Attached is... please check...）和生硬推销感。`,
            example: `User: "Attached is the updated deck. Because of time difference we send now, please check when convenient."
Assistant: {
  "suggestion": "I've attached the updated deck — sending now given the time difference, so feel free to review when it works for you.",
  "rationale": "用破折号和因果连词将零碎短句无缝串联，并将‘方便时查看’转化为充满温度、毫无压迫感的异步关怀。"
}`
        },
        'social': {
            description: '日常社交（如WeChat/WhatsApp）：聚焦情绪价值、地道自然、注重建立联系（Rapport-building）。',
            rules: `1. 真实人感（Human Touch）：语气轻松、真诚、自然，像真实朋友之间的对话，彻底消除官方腔调、机器味或说教感。
2. 情绪共鸣（Emotional Resonance）：适当增加表达情绪的口语化词汇，拉近人际距离，避免冷冰冰的公事公办。
3. 极简口语化（Conversational Simplicity）：符合即时通讯的阅读习惯，避免使用复杂的书面词汇和冗长的复合句。`,
            example: `User: "Thank you for your help today. I am very grateful."
Assistant: {
  "suggestion": "Thanks a million for stepping in today — I really appreciate it!",
  "rationale": "用极具人情味的口语表达替换了生硬刻板的书面致谢，瞬间拉近了社交距离。"
}`
        }
    };

    const currentConfig = contextConfigs[contextType] || contextConfigs['business'];

    const systemPrompt = `你是一个精通跨文化职场心理学的顶级沟通教练。
    
【绝对核心指令】
你的唯一任务是【润色和重写】用户提供的原始文本。
⚠️ 致命错误警告：绝不能作为对话对象去“回答”文本里的问题！绝不能顺着用户的话茬接话！你必须保持“改写者”的客观身份，将用户的原话重构为更符合目标场景的表达！

当前任务参数：
- 场景设定：${currentConfig.description}
- 语言路径：🚨 ${targetLang}

严格执行以下场景专属约束：
${currentConfig.rules}
4. 绝对忠实（Anti-Hallucination）：严禁凭空捏造原文没有的时间（如 next week）、地点、业务细节或多余的具体行动指令。

【场景专属范例参考】
(注：以下范例仅供语感参考，最终输出的语言请严格遵循上方“语言路径”的要求)
${currentConfig.example}

强制返回 JSON 格式：
{
  "suggestion": "润色后的最终文案（⚠️ 必须严格使用【语言路径】要求的语言输出，无视范例中的语言差异）",
  "rationale": "用一句极简中文，点明该改写如何优化了句流或心理体验"
}`;

    const payload = {
        model: config.model,
        messages: [
            { role: "system", content: systemPrompt },
            { 
              role: "user", 
              content: `请严格按照系统设定的场景和规则，重写以下这段话：\n\n"""\n${userText}\n"""` 
            }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7 
    };

    try {
        const response = await axios.post(config.url, payload, {
            headers: {
                'Authorization': `Bearer ${config.key}`,
                'Content-Type': 'application/json'
            }
        });

        const resultText = response.data.choices[0].message.content;
        
        // 清理可能被包裹的 Markdown 标记
        const cleanJsonText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
        const resultJson = JSON.parse(cleanJsonText);
        
        res.json(resultJson);
    } catch (error) {
        console.error(`[${config.model}] API 调用失败:`, error.response ? error.response.data : error.message);
        res.status(500).json({ error: `增强引擎 (${modelChoice}) 响应异常，请重试。` });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`MVP 引擎已启动: http://localhost:${PORT}`);
});