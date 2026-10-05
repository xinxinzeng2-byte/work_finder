import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { AboutModal } from '../src/components/AboutModal';
import { Sidebar } from '../src/components/Sidebar';

const noop = () => undefined;

const modalHtml = renderToStaticMarkup(<AboutModal open onClose={noop} />);
for (const text of ['关于本站', '目标群体与核心目标', '核心功能', '使用流程', '开源地址', 'github.com/xinxinzeng2-byte/work_finder']) {
  assert.ok(modalHtml.includes(text), `关于本站弹窗应展示：${text}`);
}
assert.ok(modalHtml.includes('target="_blank"'), 'GitHub 地址应在新标签页打开');
assert.ok(modalHtml.includes('rel="noopener noreferrer"'), 'GitHub 外链应设置安全属性');
assert.ok(!modalHtml.includes('赞赏'), '本期不应展示赞赏入口或内容');

const localSidebarHtml = renderToStaticMarkup(<Sidebar
  currentView="jobs"
  onViewChange={noop}
  onOpenSettings={noop}
  onOpenAbout={noop}
  onLogout={noop}
  showLogout={false}
  jobCount={0}
  resumeCount={0}
  hasApiKey={false}
/>);
assert.ok(localSidebarHtml.includes('关于本站'), '本地模式仍应展示关于本站入口');
assert.ok(!localSidebarHtml.includes('退出登录'), '不应再展示独立的退出登录入口');
assert.ok(!localSidebarHtml.includes('>退出<'), '本地模式不应展示退出操作');

console.log('client about modal and sidebar tests passed');
