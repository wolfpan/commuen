const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

// 初始化 Supabase 客户端，用于后端验证 JWT 
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_ANON_KEY
);

// 模型统一网关配置字典
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
        url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        key: process.env.ALI_API_KEY,
        model: 'deepseek-v4-flash' 
    }
};

// 核心重构接口
app.post('/api/enhance', async (req, res) => {
    const { userText, contextType, outputLang, modelChoice = 'glm' } = req.body;

    // 1. 从请求头中提取 Bearer Token 并通过 Supabase 验证身份
    const authHeader = req.headers.authorization;
    let user = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(token);
            if (!error && supabaseUser) {
                user = supabaseUser;
            }
        } catch (err) {
            console.error('Supabase 身份验证发生错误:', err.message);
        }
    }

    // 2. 核心权限控制：非登录用户强行请求非默认模型时直接拦截
    if (!user && modelChoice !== 'glm') {
        return res.status(401).json({ error: "权限不足：该模型仅限注册登录用户使用。" });
    }

    if (!userText) {
        return res.status(400).json({ error: "文本不能为空" });
    }

    // 后端兜底收敛：确保即使前端被绕过，非登录用户的模型仍会降级为 glm
    const finalModel = user ? modelChoice : 'glm';
    const config = MODEL_CONFIGS[finalModel] || MODEL_CONFIGS['glm'];
    
    if (!config.key) {
        return res.status(500).json({ error: `后端缺失 ${finalModel} 的 API 密钥` });
    }

    const langMap = {
        'zh': '无论用户输入的是中文、英文还是混合语言，最终输出必须是纯正且符合专业语境的【中文】。',
        'en': '无论用户输入的是中文、英文还是混合语言，最终输出必须是母语级别的地道【英文】。'
    };
    const targetLang = langMap[outputLang] || langMap['zh'];

    // 定义不同场景的 AI Prompt 配置
    const contextConfigs = {
        'auto': {
            description: '自动路由（Auto-Detect）：请根据用户输入自动推断最适合的沟通场景（内部协作、商业/公关、或日常社交），并应用该场景的最佳实践。',
            rules: `1. 场景侦测（Context Sniffing）：先判断此段话最可能是对内（高效/边界）、对外（体贴/平视）、还是私人社交（情绪/自然）。
2. 动态加载核心规则：
   - 若判定为【内部协作】：使用“客观现状+同步进展”的柔性边界表达，拒绝弱势兜圈子（如 I think/maybe），使用职场原生语，聚焦明确诉求。
   - 若判定为【商业沟通】：坚决打破机械断句，使用破折号或轻量连词；将“方便时查看”等转化为无压迫感的异步关怀；提出合作时留有余地。
   - 若判定为【日常社交】：语气真诚自然，增加情绪共鸣，使用极简口语化表达，彻底消除机器味。
3. 结果提取：在输出的 JSON 中，必须将你侦测到的场景（如“商业沟通”、“内部协作”或“日常社交”）填入 \`detectedContext\` 字段。`,
            example: `User: "I think maybe this timeline is a little difficult for us because some dependencies are not clear yet."
Assistant: {
  "suggestion": "This timeline feels tight on our side — a few dependencies are still unresolved. Can we revisit the dates once those are firmed up?",
  "detectedContext": "内部协作",
  "rationale": "去除了不自信的修饰词，换用更地道的职场原生动词组合，既有边界感又具建设性。"
}`
        },
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
3. 极简口语化（Conversational Simplicity）：符合即时通讯的阅读习惯，避免使用复杂的书面词汇 and 冗长的复合句。`,
            example: `User: "Thank you for your help today. I am very grateful."
Assistant: {
  "suggestion": "Thanks a million for stepping in today — I really appreciate it!",
  "rationale": "用极具人情味的口语表达替换了生硬刻板的书面致谢，瞬间拉近了社交距离。"
}`
        }
    };

    const currentConfig = contextConfigs[contextType] || contextConfigs['auto'];
    const isAuto = (contextType === 'auto' || currentConfig === contextConfigs['auto']);

    const jsonFormatInstruction = isAuto 
        ? `{\n  "suggestion": "润色后的最终文案（⚠️ 必须严格使用【语言路径】要求的语言输出）",\n  "detectedContext": "你识别出的场景（如：商业沟通、内部协作、日常社交）",\n  "rationale": "用一句极简中文，点明该改写如何优化了句流或心理体验"\n}`
        : `{\n  "suggestion": "润色后的最终文案（⚠️ 必须严格使用【语言路径】要求的语言输出）",\n  "rationale": "用一句极简中文，点明该改写如何优化了句流或心理体验"\n}`;

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
5. 结构保留（Format Preservation）：⚠️ 强制要求！必须完整保留原文的信件结构，包括【称呼语（如：您好、Dear xx）】和【结尾落款/署名】。你的任务是优化正文的表达和句流，绝不可随意裁减用户的格式骨架。

【场景专属范例参考】
(注：以下范例仅供语感参考，最终输出的语言请严格遵循上方“语言路径”的要求)
${currentConfig.example}

强制返回 JSON 格式：
${jsonFormatInstruction}`;

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
        const cleanJsonText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
        const resultJson = JSON.parse(cleanJsonText);
        
        res.json(resultJson);
    } catch (error) {
        console.error(`[${config.model}] API 调用失败:`, error.response ? error.response.data : error.message);
        res.status(500).json({ error: `增强引擎 (${finalModel}) 响应异常，请重试。` });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`MVP 引擎已启动: http://localhost:${PORT}`);
});