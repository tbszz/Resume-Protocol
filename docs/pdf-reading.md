# PDF 内容读取

上传时逐页读取文字层。文字过少或乱码时渲染页面，再尝试本机 OCR 和多模态转录；不会用文件名或页码代替正文。

Windows 可使用系统 Windows.Media.Ocr。Linux 可安装 `tesseract-ocr` 和 `tesseract-ocr-chi-sim` 使用本机中文 OCR。其他系统请配置支持图片的自定义模型，或设置独立的 `RESUME_VISION_MODEL`、`RESUME_VISION_API_KEY`、`RESUME_VISION_BASE_URL` 和 `RESUME_VISION_PROTOCOL`（`openai` 或 `anthropic`）。未设置独立模型时沿用当前用户的模型。文字模型并不一定支持图片。

文件保留原件及识别方式、页数、完整/部分/失败状态。结构化简历字段未匹配不等于原文不可读；部分页面失败时不能声称全文审阅完成。识别出的指令文字仍是附件数据，不授予任何工具权限。

之前保存但未完整读取的 PDF，在用户要求查看或重新读取时，由 Brain 授权重新读取当前对象的最后一个附件。不会读取其他账户或先前求职者的附件，也不会覆盖上传后另行补充的正文。

验证：`npm test`、`npm run build`。多模态协议通过模拟响应测试；真实模型服务的可用性取决于部署配置。
