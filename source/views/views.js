var DeepSeekAPI = {
    _apiKey: "",
    _messages: [],

    setApiKey: function(key) {
        this._apiKey = key;
        try { localStorage.setItem("deepseek_api_key", key); } catch(e) {}
    },

    getApiKey: function() {
        if (this._apiKey) return this._apiKey;
        try { this._apiKey = localStorage.getItem("deepseek_api_key") || ""; } catch(e) {}
        return this._apiKey;
    },

    setMessages: function(msgs) { this._messages = msgs; },
    getMessages: function() { return this._messages; },
    clearMessages: function() { this._messages = []; },

    sendMessage: function(content, onUpdate, onDone, onError) {
        var self = this;
        if (!self._apiKey) { onError("请先设置 API 密钥"); return null; }

        self._messages.push({ role: "user", content: content });

        var urls = [
            "http://localhost:18082/deepseek/chat",
            "https://api.deepseek.com/v1/chat/completions"
        ];
        var urlIdx = 0;

        function doSend() {
            if (urlIdx >= urls.length) { onError("所有连接方式均失败"); return; }
            var url = urls[urlIdx];
            var xhr = new XMLHttpRequest();
            xhr.open("POST", url, true);
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.setRequestHeader("Authorization", "Bearer " + self._apiKey);
            xhr.setRequestHeader("Accept", "text/event-stream");

            var lastIdx = 0, fullResp = "", finished = false, timedOut = false;
            var timer = setTimeout(function() { timedOut = true; try { xhr.abort(); } catch(e) {} }, 30000);

            function tryNext(errMsg) {
                clearTimeout(timer);
                urlIdx++;
                if (urlIdx < urls.length) { doSend(); }
                else { onError(errMsg || "所有连接方式均失败"); }
            }

            xhr.onreadystatechange = function() {
                if (timedOut) return;

                var text = xhr.responseText || "";
                var newText = text.substring(lastIdx);
                lastIdx = text.length;

                if (xhr.readyState === 4) {
                    clearTimeout(timer);
                    if (xhr.status === 0 || (xhr.status >= 200 && !text)) {
                        tryNext("无法连接到 " + url);
                        return;
                    }
                    if (xhr.status !== 200) {
                        var errMsg = "请求失败 (" + xhr.status + ")";
                        try { var j = JSON.parse(text); if (j.error && j.error.message) errMsg = j.error.message; } catch(e) {}
                        onError(errMsg);
                        return;
                    }
                }

                if (!newText && xhr.readyState !== 4) return;

                var lines = newText.split("\n");
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i].trim();
                    if (line.indexOf("data: ") === 0) {
                        var jsonStr = line.substring(6);
                        if (jsonStr === "[DONE]") { finished = true; continue; }
                        try {
                            var j = JSON.parse(jsonStr);
                            var delta = j.choices && j.choices[0] && j.choices[0].delta;
                            if (delta && delta.content) fullResp += delta.content;
                            if (j.choices && j.choices[0] && j.choices[0].finish_reason === "stop") finished = true;
                        } catch(e) {}
                    }
                }

                if (fullResp) onUpdate(fullResp);

                if (xhr.readyState === 4) {
                    if (!finished && !fullResp && text) {
                        try {
                            var j = JSON.parse(text);
                            if (j.error && j.error.message) { onError(j.error.message); return; }
                            var msg = j.choices && j.choices[0] && j.choices[0].message;
                            if (msg && msg.content) { fullResp = msg.content; finished = true; }
                        } catch(e) {
                            onError("响应解析失败: " + text.slice(0, 100));
                            return;
                        }
                    }
                    if (!finished && fullResp) finished = true;
                    if (finished && fullResp) {
                        self._messages.push({ role: "assistant", content: fullResp });
                        onDone(fullResp);
                    } else if (!finished) {
                        tryNext("服务器返回了空响应");
                    }
                }
            };

            xhr.onerror = function() {
                clearTimeout(timer);
                tryNext("网络错误");
            };

            xhr.send(JSON.stringify({
                model: "deepseek-chat",
                messages: self._messages,
                stream: true
            }));

            self._currentXhr = xhr;
        }

        doSend();

        return {
            abort: function() { try { if (self._currentXhr) self._currentXhr.abort(); } catch(e) {} }
        };
    }
};

enyo.kind({
    name: "myapp.MainView",
    kind: "FittableRows",
    fit: true,
    classes: "chat-theme theme-brown",
    components: [
        // ===== 顶部工具栏 =====
        {name: "topBar", kind: "onyx.Toolbar", classes: "chat-toolbar", components: [
            {content: "DeepSeek Chat", style: "font-size: 18px; font-weight: bold; display: inline-block; vertical-align: middle;"},
            {kind: "onyx.Button", content: "设置", ontap: "showSettings", style: "float: right; min-width: 50px; margin: 0; font-size: 14px;"}
        ]},
        // ===== 中间：侧边栏 + 聊天区 =====
        {kind: "FittableColumns", fit: true, components: [
            // ---- 左侧：历史对话 ----
            {name: "sidePanel", classes: "side-panel", style: "width: 220px;", components: [
                {classes: "side-header", components: [
                    {kind: "onyx.Button", content: "新对话", ontap: "newChat", classes: "side-new-btn", style: "min-width: 60px; padding: 4px 10px; font-size: 13px; float: right; margin: 6px 6px 0 0;"}
                ]},
                {kind: "enyo.Scroller", fit: true, classes: "side-scroller", components: [
                    {name: "sideList", classes: "side-list", allowHtml: true, content: '<div class="side-empty">暂无对话</div>'}
                ]}
            ]},
            // ---- 右侧：聊天主区域 ----
            {kind: "FittableRows", fit: true, components: [
                {kind: "enyo.Scroller", fit: true, classes: "chat-scroller", components: [
                    {name: "chatArea", classes: "chat-area", allowHtml: true, content: '<div class="chat-welcome">输入消息开始与 DeepSeek 对话</div>'}
                ]},
                {name: "bottomBar", kind: "onyx.Toolbar", classes: "chat-input-bar", components: [
                    {name: "msgInput", kind: "onyx.Input", style: "width: 80%; height: 36px; font-size: 14px; border-radius: 18px; padding: 0 14px;", placeholder: "输入消息...", onkeyup: "handleInputKeyup"},
                    {kind: "onyx.Button", content: "发送", ontap: "sendMessage", classes: "chat-send-btn", style: "margin-left: 6px;"}
                ]}
            ]}
        ]},
        // ===== 设置弹窗 =====
        {name: "settingsPopup", kind: "onyx.Popup", modal: true, centered: true, floating: true, autoDismiss: false, scrim: true, style: "width: 420px; background: #fff; padding: 0; border-radius: 12px; max-height: 90%; overflow-y: auto;", components: [
            {content: "设  置", style: "font-size: 20px; font-weight: bold; padding: 16px 20px 0; text-align: center; color: #333;"},
            {style: "padding: 12px 20px 6px; border-bottom: 1px solid #e0ddd8;", components: [
                {content: "▎API 设置", style: "font-size: 15px; font-weight: bold; color: #555; margin-bottom: 10px;"},
                {content: "DeepSeek API 密钥", style: "font-size: 13px; color: #777; margin-bottom: 4px;"},
                {name: "apiKeyInput", kind: "onyx.Input", style: "width: 100%; height: 36px; font-size: 14px; padding: 0 10px; box-sizing: border-box;", placeholder: "sk-..."},
                {content: "获取密钥: platform.deepseek.com", style: "font-size: 11px; color: #aaa; margin-top: 4px; margin-bottom: 10px;"},
                {name: "settingsStatus", content: "", style: "font-size: 12px; color: #888; margin: 2px 0; text-align: center; min-height: 18px;"},
                {style: "text-align: center; margin-bottom: 4px;", components: [
                    {kind: "onyx.Button", content: "保存", ontap: "saveSettings", classes: "chat-send-btn", style: "margin: 4px; padding: 6px 24px;"},
                    {kind: "onyx.Button", content: "取消", ontap: "closeSettings", style: "margin: 4px; padding: 6px 24px;"}
                ]}
            ]},
            {style: "padding: 12px 20px 18px;", components: [
                {content: "▎主题设置", style: "font-size: 15px; font-weight: bold; color: #555; margin-bottom: 10px;"},
                {style: "text-align: center;", components: [
                    {name: "themeBrownBtn", kind: "onyx.Button", content: "棕色皮革", ontap: "selectThemeBrown", classes: "theme-btn-brown", style: "margin: 4px; min-width: 100px; padding: 8px 16px;"},
                    {name: "themeBlueBtn", kind: "onyx.Button", content: "蓝色丹宁", ontap: "selectThemeBlue", classes: "theme-btn-blue", style: "margin: 4px; min-width: 100px; padding: 8px 16px;"}
                ]},
                {name: "themeStatus", content: "", style: "font-size: 12px; color: #888; margin-top: 8px; text-align: center; min-height: 16px;"}
            ]}
        ]}
    ],
    _currentRequest: null,
    _thinking: false,
    _currentTheme: "brown",
    _conversations: [],
    _currentConvId: null,

    create: function() {
        this.inherited(arguments);
        var saved = localStorage.getItem("deepseek_theme") || "brown";
        this._applyTheme(saved);
        this._loadConversations();
        this._renderSidebar();
        var savedKey = DeepSeekAPI.getApiKey();
        if (savedKey) {
            this.$.apiKeyInput.setValue(savedKey);
        } else {
            var self = this;
            setTimeout(function() { self.showSettings(); }, 300);
        }
    },

    // ===== 对话存储 =====
    _loadConversations: function() {
        try { this._conversations = JSON.parse(localStorage.getItem("deepseek_conversations")) || []; } catch(e) { this._conversations = []; }
    },

    _saveConversations: function() {
        try { localStorage.setItem("deepseek_conversations", JSON.stringify(this._conversations.slice(0, 50))); } catch(e) {}
    },

    _genId: function() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    },

    _saveCurrentConv: function() {
        var msgs = DeepSeekAPI.getMessages();
        if (msgs.length === 0) return;
        if (!this._currentConvId) {
            this._currentConvId = this._genId();
            this._conversations.unshift({ id: this._currentConvId, title: msgs[0].content.slice(0, 40), messages: [], updatedAt: Date.now() });
        }
        for (var i = 0; i < this._conversations.length; i++) {
            if (this._conversations[i].id === this._currentConvId) {
                this._conversations[i].messages = JSON.parse(JSON.stringify(msgs));
                if (msgs.length > 0) this._conversations[i].title = msgs[0].content.slice(0, 40);
                this._conversations[i].updatedAt = Date.now();
                break;
            }
        }
        this._saveConversations();
        this._renderSidebar();
    },

    // ===== 侧边栏 =====
    _renderSidebar: function() {
        if (this._conversations.length === 0) {
            this.$.sideList.setContent('<div class="side-empty">暂无对话</div>');
            return;
        }
        var h = '';
        for (var i = 0; i < this._conversations.length; i++) {
            var c = this._conversations[i];
            var active = c.id === this._currentConvId ? ' side-item-active' : '';
            var label = c.title || '新对话';
            h += '<div class="side-item' + active + '" onclick="app.view._clickSideItem(\'' + c.id + '\')">';
            h += '<div class="side-item-title">' + this._escapeHtml(label) + '</div>';
            h += '</div>';
        }
        this.$.sideList.setContent(h);
    },

    _clickSideItem: function(cid) {
        if (cid === this._currentConvId) return;
        this._saveCurrentConv();
        this._loadConvById(cid);
    },

    _loadConvById: function(cid) {
        for (var i = 0; i < this._conversations.length; i++) {
            if (this._conversations[i].id === cid) {
                var conv = this._conversations[i];
                this._currentConvId = cid;
                DeepSeekAPI.setMessages(JSON.parse(JSON.stringify(conv.messages)));
                this._renderConvMessages();
                this._renderSidebar();
                return;
            }
        }
    },

    _renderConvMessages: function() {
        var msgs = DeepSeekAPI.getMessages();
        if (msgs.length === 0) {
            this.$.chatArea.setContent('<div class="chat-welcome">输入消息开始与 DeepSeek 对话</div>');
            return;
        }
        var h = '';
        for (var i = 0; i < msgs.length; i++) {
            var m = msgs[i];
            var isUser = m.role === "user";
            var cls = isUser ? "msg-user-bubble" : "msg-ai-bubble";
            var rowCls = isUser ? "msg-user" : "msg-assistant";
            var text = this._renderMarkdown(m.content || "");
            h += '<div class="msg-row ' + rowCls + '"><div class="msg-bubble ' + cls + '">' + text + '</div></div>';
        }
        this.$.chatArea.setContent(h);
        this._scrollToBottom();
    },

    // ===== 主题 =====
    _applyTheme: function(theme) {
        this._currentTheme = theme;
        localStorage.setItem("deepseek_theme", theme);
        if (theme === "blue") {
            this.removeClass("theme-brown");
            this.addClass("theme-blue");
        } else {
            this.removeClass("theme-blue");
            this.addClass("theme-brown");
        }
    },

    selectThemeBrown: function() {
        this._applyTheme("brown");
        this.$.themeStatus.setContent("已切换为棕色皮革主题");
        var self = this;
        setTimeout(function() { self.$.themeStatus.setContent(""); }, 1500);
    },

    selectThemeBlue: function() {
        this._applyTheme("blue");
        this.$.themeStatus.setContent("已切换为蓝色丹宁主题");
        var self = this;
        setTimeout(function() { self.$.themeStatus.setContent(""); }, 1500);
    },

    // ===== 设置 =====
    showSettings: function() {
        this.$.apiKeyInput.setValue(DeepSeekAPI.getApiKey());
        this.$.settingsStatus.setContent(DeepSeekAPI.getApiKey() ? "已保存密钥（可修改）" : "请输入密钥");
        this.$.themeStatus.setContent("");
        this.$.settingsPopup.show();
    },

    closeSettings: function() { this.$.settingsPopup.hide(); },

    saveSettings: function() {
        var key = this.$.apiKeyInput.getValue().trim();
        if (!key) { this.$.settingsStatus.setContent("请输入 API 密钥"); return; }
        DeepSeekAPI.setApiKey(key);
        this.$.settingsStatus.setContent("已保存");
        var self = this;
        setTimeout(function() { self.$.settingsPopup.hide(); }, 800);
    },

    // ===== 新对话 =====
    newChat: function() {
        if (this._thinking) return;
        this._saveCurrentConv();
        if (this._currentRequest) { this._currentRequest.abort(); this._currentRequest = null; }
        DeepSeekAPI.clearMessages();
        this._thinking = false;
        this._currentConvId = null;
        this.$.chatArea.setContent('<div class="chat-welcome">输入消息开始与 DeepSeek 对话</div>');
        this.$.msgInput.setValue("");
        this._renderSidebar();
    },

    // ===== 发送消息 =====
    handleInputKeyup: function(inSender, inEvent) {
        if (inEvent.which === 13 || inEvent.keyCode === 13) this.sendMessage();
    },

    sendMessage: function() {
        var msg = this.$.msgInput.getValue().trim();
        if (!msg) return;

        var key = DeepSeekAPI.getApiKey();
        if (!key) { this.showSettings(); return; }
        if (this._thinking) return;

        this._thinking = true;
        this.$.msgInput.setValue("");

        var chatContent = this.$.chatArea.getContent();
        if (chatContent.indexOf('chat-welcome') >= 0) chatContent = "";

        var userBubble = '<div class="msg-row msg-user"><div class="msg-bubble msg-user-bubble">' + this._renderMarkdown(msg) + '</div></div>';
        var thinkingBubble = '<div class="msg-row msg-assistant"><div class="msg-bubble msg-ai-bubble"><span class="thinking-dots">思考中...</span></div></div>';
        this.$.chatArea.setContent(chatContent + userBubble + thinkingBubble);
        this._scrollToBottom();

        var self = this;

        self._currentRequest = DeepSeekAPI.sendMessage(msg,
            function(response) {
                var rendered = self._renderMarkdown(response);
                var bubbles = self.$.chatArea.getContent();
                var idx = bubbles.lastIndexOf('<div class="msg-row msg-assistant">');
                bubbles = idx >= 0 ? bubbles.substring(0, idx) : "";
                self.$.chatArea.setContent(bubbles + '<div class="msg-row msg-assistant"><div class="msg-bubble msg-ai-bubble">' + rendered + '</div></div>');
                self._scrollToBottom();
            },
            function(response) {
                self._thinking = false;
                self._currentRequest = null;
                self._saveCurrentConv();
            },
            function(error) {
                self._thinking = false;
                self._currentRequest = null;
                var escaped = self._escapeHtml(error);
                var bubbles = self.$.chatArea.getContent();
                var idx = bubbles.lastIndexOf('<div class="msg-row msg-assistant">');
                bubbles = idx >= 0 ? bubbles.substring(0, idx) : "";
                self.$.chatArea.setContent(bubbles + '<div class="msg-row msg-assistant"><div class="msg-bubble msg-ai-bubble" style="color:#e74c3c;">错误: ' + escaped + '</div></div>');
                self._scrollToBottom();
            }
        );
    },

    _scrollToBottom: function() {
        var scroller = this.$.chatArea.parent;
        if (scroller && scroller.hasNode()) {
            setTimeout(function() { scroller.hasNode().scrollTop = scroller.hasNode().scrollHeight; }, 50);
        }
    },

    _escapeHtml: function(text) {
        var div = document.createElement("div");
        div.appendChild(document.createTextNode(text));
        return div.innerHTML;
    },

    _renderMarkdown: function(text) {
        var h = this._escapeHtml(text);
        h = h.replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        h = h.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
        h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
        h = h.replace(/\*\*(\S.*?\S)\*\*/g, '<b>$1</b>');
        h = h.replace(/\*(\S.*?\S)\*/g, '<i>$1</i>');
        h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
        h = h.replace(/^- (.+)$/gm, '<li>$1</li>');
        h = h.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
        h = h.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
        h = h.replace(/(<li>.*<\/li>\n?)+/g, function(m) { return m.indexOf('<ul>') >= 0 ? m : '<ol>' + m + '</ol>'; });
        h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
        h = h.replace(/\n\n+/g, '</p><p>');
        h = h.replace(/\n/g, '<br>');
        h = '<p>' + h + '</p>';
        h = h.replace(/<p><\/p>/g, '');
        h = h.replace(/<p><br><\/p>/g, '');
        h = h.replace(/<p><\/p>/g, '');
        return h;
    }
});
