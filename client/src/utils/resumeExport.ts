import type { ResumeItem } from './storage';

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const list = (items: string[]) => items.length
  ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
  : '';

export function resumeToHtml(item: ResumeItem): string {
  const { resume } = item;
  const info = [
    resume.basicInfo.phone,
    resume.basicInfo.email,
    resume.basicInfo.city,
    resume.basicInfo.education,
    resume.basicInfo.yearsOfExperience ? `${resume.basicInfo.yearsOfExperience} 年经验` : '',
  ].filter(Boolean).map(escapeHtml).join(' · ');

  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(item.name)}</title>
<style>
  :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#faf9f6;color:#2c2c2c;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;line-height:1.7}main{max-width:900px;margin:40px auto;padding:48px 56px;background:#fff;box-shadow:0 1px 8px rgba(44,44,44,.08)}h1,h2,h3{font-family:"Noto Serif SC","Songti SC",Georgia,serif}h1{margin:0;font-size:36px;line-height:1.25}h2{margin:32px 0 12px;padding-bottom:7px;border-bottom:1px solid #e8e4df;color:#c45a3c;font-size:20px}h3{margin:18px 0 2px;font-size:17px}.meta{margin-top:8px;color:#6b6b6b;font-size:14px}.tag{display:inline-block;margin:4px 6px 0 0;padding:3px 10px;border-radius:999px;background:#f9ede8;color:#c45a3c;font-size:13px}.experience{margin:0 0 18px}.experience p{margin:3px 0;color:#6b6b6b;font-size:14px}ul{margin:6px 0 0;padding-left:22px}li{margin:3px 0}.source{color:#999;font-size:12px}@media(max-width:640px){main{margin:0;padding:28px 22px;box-shadow:none}h1{font-size:30px}}
</style></head>
<body><main>
  <header><h1>${escapeHtml(resume.basicInfo.name || item.name)}</h1>${info ? `<div class="meta">${info}</div>` : ''}<div class="meta">${item.type === 'customized' ? '定制简历' : '原始简历'} · ${escapeHtml(item.fileName || 'AI 求职助手')}</div></header>
  <section><h2>核心能力</h2><div>${resume.skills.map((skill) => `<span class="tag">${escapeHtml(skill.name)} · ${escapeHtml(skill.level)}</span>`).join('')}</div></section>
  <section><h2>工作与项目经历</h2>${resume.experiences.map((experience) => `<article class="experience"><h3>${escapeHtml(experience.company)} · ${escapeHtml(experience.role)}</h3><p>${escapeHtml(experience.period)}</p>${list(experience.achievements)}</article>`).join('')}</section>
  ${resume.rawText ? `<section><h2>简历原文摘要</h2><p class="meta">${escapeHtml(resume.rawText).replace(/\n/g, '<br>')}</p></section>` : ''}
</main></body></html>`;
}

export function downloadResumeHtml(item: ResumeItem): void {
  const blob = new Blob([resumeToHtml(item)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${item.name || '简历'}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadResume(item: ResumeItem): Promise<void> {
  if (!item.sourceFileData) {
    if (item.type === 'original' && item.fileName) {
      window.alert(`这份历史简历没有保存原始文件，无法恢复为 ${item.fileName}。请重新导入后再下载原文件。`);
      return;
    }
    downloadResumeHtml(item);
    return;
  }

  const response = await fetch(item.sourceFileData);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = item.fileName || `${item.name}.bin`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
