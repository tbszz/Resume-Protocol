import React, { useMemo } from 'react';
import {
  AssistantRuntimeProvider, useExternalStoreRuntime, ThreadPrimitive,
  MessagePrimitive, ComposerPrimitive, ActionBarPrimitive, useAui, useAuiState,
} from '@assistant-ui/react';
import { ArrowDown, ArrowUp, BriefcaseBusiness, Check, Copy, Download, FileText, MessageCircle, Paperclip, ScanText, Square, Sparkles } from 'lucide-react';
import { SafeMarkdown } from './SafeMarkdown.js';
import { MessageResult } from './ChatResultCards.jsx';
import { promptText, toAssistantMessage, visibleMessages } from '../workspaceRuntime.js';
import '../workspace.css';

const suggestions = [
  { icon: ScanText, label: '诊断简历', prompt: '请帮我诊断简历，先核对已有资料。' },
  { icon: BriefcaseBusiness, label: '寻找岗位', prompt: '我想找合适的岗位。' },
  { icon: FileText, label: '定制简历', prompt: '我想根据目标岗位定制简历。' },
  { icon: MessageCircle, label: '准备面试', prompt: '帮我准备目标岗位的面试。' },
];

export function WorkspaceChat({ conversation, documents, pending, busy, canCancel, onSend, onCancel, onAttach, onSelectJob, onOpenPreview, renderAttachment, scrubMessage, notice, onDismissNotice }) {
  const messages = useMemo(() => visibleMessages(conversation).map(scrubMessage), [conversation, scrubMessage]);
  const runtime = useExternalStoreRuntime({
    messages, convertMessage: toAssistantMessage,
    isRunning: Boolean(pending && canCancel),
    isSendDisabled: busy,
    onNew: async message => { await onSend(promptText(message)); },
    onCancel: async () => { await onCancel(); },
  });
  const empty = messages.length === 0;
  const latestResumeId = messages.findLast(message => message.kind === 'resume')?.id;
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="aui-thread" data-empty={empty}>
        <ThreadPrimitive.Viewport className="aui-viewport" autoScroll aria-label="对话内容">
          <div className="aui-messages" role="log" aria-live="polite" aria-relevant="additions">
            {empty ? <Welcome /> : null}
            <ThreadPrimitive.Messages>{({ message }) => {
              const careerMessage = message.metadata?.custom?.careerMessage;
              return <CareerMessage message={careerMessage} conversation={conversation} documents={documents} latestResumeId={latestResumeId} onSelectJob={onSelectJob} onOpenPreview={onOpenPreview} renderAttachment={renderAttachment} />;
            }}</ThreadPrimitive.Messages>
            {pending ? <div className="aui-status" role="status"><span className="aui-status-dot" aria-hidden="true" />{pending.label || '正在整理你的请求…'}</div> : null}
          </div>
          {!empty ? <ThreadPrimitive.ScrollToBottom className="aui-scroll-bottom" aria-label="回到最新消息"><ArrowDown size={17} /></ThreadPrimitive.ScrollToBottom> : null}
        </ThreadPrimitive.Viewport>
        <div className="aui-composer-dock">
          {empty ? <Suggestions disabled={busy} /> : null}
          {notice ? <div className="aui-notice" role="status"><span>{notice}</span><button type="button" onClick={onDismissNotice} aria-label="关闭提示">关闭</button></div> : null}
          {conversation?.context?.selectedJob ? <button type="button" className="aui-context-chip" onClick={onOpenPreview}><BriefcaseBusiness size={13} />当前目标 · {conversation.context.selectedJob.title}</button> : null}
          <CareerComposer busy={busy} canCancel={canCancel} onAttach={onAttach} />
          <p className="aui-composer-hint">建议以你的真实经历为依据，重要信息请与原文核对。</p>
        </div>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

function Welcome() {
  return <section className="aui-welcome">
    <Sparkles className="aui-emblem" size={38} strokeWidth={1.35} aria-hidden="true" />
    <p className="aui-eyebrow">你的求职工作区</p>
    <h1>下一步，我们一起准备。</h1>
    <p>从一份简历、一个心仪的岗位，或一个问题开始。</p>
  </section>;
}

function Suggestions({ disabled }) {
  const aui = useAui();
  return <div className="aui-suggestions" aria-label="求职对话建议">{suggestions.map(({ icon: Icon, label, prompt }) =>
    <button key={label} type="button" disabled={disabled} onClick={() => { aui.thread.composer().setText(prompt); document.querySelector('.aui-composer-input')?.focus(); }}><Icon size={15} strokeWidth={1.6} />{label}</button>
  )}</div>;
}

function CareerComposer({ busy, canCancel, onAttach }) {
  return <ComposerPrimitive.Root className="aui-composer">
    <ComposerPrimitive.Input className="aui-composer-input" placeholder="今天想推进哪一步？" aria-label="给 Resume Protocol 发消息" minRows={2} maxRows={7} submitMode="enter" addAttachmentOnPaste={false} cancelOnEscape={false} />
    <div className="aui-composer-toolbar">
      <div className="aui-composer-tools">
        <button type="button" className="aui-attach" onClick={onAttach} disabled={busy} aria-label="上传简历" title="上传简历 · PDF、DOCX、TXT、MD、JSON，最大 8MB"><Paperclip size={19} /></button>
        <span>简历与岗位助手</span>
      </div>
      {canCancel ? <ComposerPrimitive.Cancel className="aui-stop" aria-label="停止生成" title="停止生成"><Square size={15} fill="currentColor" /></ComposerPrimitive.Cancel>
        : <ComposerPrimitive.Send className="aui-send" aria-label="发送消息" title="发送消息"><ArrowUp size={19} /></ComposerPrimitive.Send>}
    </div>
  </ComposerPrimitive.Root>;
}

function CareerMessage({ message, conversation, documents, latestResumeId, onSelectJob, onOpenPreview, renderAttachment }) {
  const isCopied = useAuiState(s => s.message.isCopied);
  if (!message) return null;
  const assistant = message.role === 'assistant';
  const currentResume = message.id === latestResumeId && Boolean(conversation?.context?.variant || conversation?.context?.formalResume);
  return <MessagePrimitive.Root className={`aui-message ${assistant ? 'assistant' : 'user'}`} data-message-id={message.id}>
    <div className="aui-message-body">
      {message.kind !== 'attachment' ? <SafeMarkdown text={message.content} /> : null}
      {message.kind === 'attachment' ? renderAttachment(message, documents) : null}
      {message.kind === 'resume' && message.data?.variant ? <div className="aui-artifact">
        <FileText size={24} strokeWidth={1.4} /><div><strong>{message.data.variant.targetTitle || message.data.variant.title || '岗位版简历'}</strong><p>{currentResume ? '优化稿已准备好 · 可预览与下载' : '历史版本 · 当前优化稿请在资料面板查看'}</p></div>
        {currentResume ? <button type="button" onClick={onOpenPreview}>打开优化稿</button> : null}
        {currentResume ? <div className="aui-artifact-downloads"><a href={`/api/conversations/${encodeURIComponent(conversation.id)}/resume.pdf`}><Download size={13} />PDF</a><a href={`/api/conversations/${encodeURIComponent(conversation.id)}/resume.docx`}><Download size={13} />DOCX</a></div> : null}
      </div> : <MessageResult message={message} context={conversation?.context} onSelectJob={onSelectJob} />}
    </div>
    {assistant ? <ActionBarPrimitive.Root className="aui-message-actions" autohide="never">
      <ActionBarPrimitive.Copy aria-label={isCopied ? '已复制回复' : '复制回复'} title="复制回复">{isCopied ? <Check size={14} /> : <Copy size={14} />}</ActionBarPrimitive.Copy>
      {['diagnosis', 'resume', 'interview'].includes(message.kind) ? <button type="button" onClick={onOpenPreview}><FileText size={14} />查看资料</button> : null}
    </ActionBarPrimitive.Root> : null}
  </MessagePrimitive.Root>;
}
