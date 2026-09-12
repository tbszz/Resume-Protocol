# 工作区 assistant-ui 重构

范围：只修改工作区。LandingPage 函数、src/styles.css 原有样式及 index.html 保留原字节内容；新样式全部限定在 .aui-workspace 下。

采用官方 @assistant-ui/react 的 external-store runtime，应用继续持有服务端消息、会话、SSE、附件及业务结果。用 Thread / Message / Composer primitives 实际替换手写聊天流和输入框，不引入另一套后端或云存储。

视觉：Claude 风格的暖纸底、轻侧栏、居中阅读栏和圆角输入框。light #faf9f6 / #f0eee8 / #292722 / #b66d51；dark #262624 / #20201e / #30302e。标题沿用已有 Mackinac 与中文衬线回退，正文沿用 Inter 与系统中文字体。标识采用简洁花形，不冒用 Claude 产品名。

功能：保留项目与会话、认证、设置、原文和优化稿、PDF/DOCX下载、附件读取状态及求职业务卡。增加输入区停止生成、消息复制、回到底部和四个求职入口建议。建议仅填充输入，不提前执行业务。新聊天与已有聊天使用同一输入组件。

验证：静态哈希锁住首页；消息适配测试保留业务元数据和角色；真实浏览器验证收发、取消、上传、切换、预览、设置及移动端，检查控制台。截图来自实际React页面，不用独立mock HTML。全套npm test与build后交付。
