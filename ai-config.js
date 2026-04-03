// ai-config.js
// Gemini APIキー管理 (全アプリ共通)

const AI_CONFIG_KEY = 'gemini-api-config';

const AIConfig = {
  getApiKey() {
    try {
      const config = JSON.parse(localStorage.getItem(AI_CONFIG_KEY) || '{}');
      return config.apiKey || '';
    } catch {
      return '';
    }
  },

  setApiKey(apiKey) {
    const config = { apiKey, updatedAt: new Date().toISOString() };
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
  },

  hasApiKey() {
    return !!this.getApiKey();
  },

  async callGemini(prompt, options = {}) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('APIキーが設定されていません。設定画面からGemini APIキーを入力してください。');
    }

    const model = options.model || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 4096,
      }
    };

    if (options.jsonMode) {
      body.generationConfig.responseMimeType = 'application/json';
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API Error (${response.status}): ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return text;
    } catch (error) {
      if (error.message.includes('API Error')) throw error;
      throw new Error(`通信エラー: ${error.message}`);
    }
  },

  createApiKeyModal(onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'ai-config-overlay';
    overlay.innerHTML = `
      <div class="ai-config-modal">
        <h2>🔑 Gemini APIキー設定</h2>
        <p>Google AI StudioでAPIキーを取得して入力してください。</p>
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">
          → Google AI Studioでキーを取得
        </a>
        <input type="password" class="ai-config-input" placeholder="APIキーを入力..." 
               value="${this.getApiKey()}" />
        <div class="ai-config-actions">
          <button class="ai-config-cancel">キャンセル</button>
          <button class="ai-config-save">保存</button>
        </div>
      </div>
    `;

    const input = overlay.querySelector('.ai-config-input');
    overlay.querySelector('.ai-config-save').addEventListener('click', () => {
      const key = input.value.trim();
      if (key) {
        this.setApiKey(key);
        overlay.remove();
        if (onSave) onSave(key);
      }
    });

    overlay.querySelector('.ai-config-cancel').addEventListener('click', () => {
      overlay.remove();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
    input.focus();
  }
};
