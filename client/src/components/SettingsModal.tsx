import React, { useState } from 'react';
import { getApiKey, saveApiKey, exportData, clearAllData } from '../utils/storage';
import { useEffect } from 'react';
import { testApiKey } from '../services/api';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<Props> = ({ open, onClose }) => {
  const [apiKey, setApiKey] = useState(getApiKey() || '');

  useEffect(() => {
    if (open) setApiKey(getApiKey() || '');
  }, [open]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'none' | 'success' | 'fail'>('none');
  const [saved, setSaved] = useState(false);

  if (!open) return null;

  const handleSave = () => {
    saveApiKey(apiKey.trim());
    setSaved(true);
    setTestResult('none');
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    saveApiKey(apiKey.trim());
    setTesting(true);
    setTestResult('none');
    try {
      const valid = await testApiKey();
      setTestResult(valid ? 'success' : 'fail');
    } catch {
      setTestResult('fail');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-paper rounded-lg shadow-card max-w-md w-full p-8 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-serif font-semibold">设置</h2>
          <button onClick={onClose} className="text-ink-weak hover:text-ink transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* API Key */}
        <div className="mb-8">
          <label className="label">DeepSeek API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="input font-mono text-xs"
            placeholder="sk-xxxxxxxx..."
          />
          <p className="text-xs text-ink-weak mt-2 leading-relaxed">
            在 platform.deepseek.com 注册并创建 API Key，充几块钱即可使用。
          </p>

          <div className="flex gap-3 mt-4">
            <button onClick={handleTest} disabled={testing || !apiKey.trim()} className="btn-ghost text-sm">
              {testing ? '测试中...' : '测试连接'}
            </button>
            <button onClick={handleSave} className="btn-primary text-sm">
              {saved ? '已保存' : '保存'}
            </button>
          </div>

          {testResult === 'success' && (
            <p className="mt-3 text-xs text-moss">API Key 有效，连接成功</p>
          )}
          {testResult === 'fail' && (
            <p className="mt-3 text-xs text-terra">连接失败，请检查 Key 或账户余额</p>
          )}
        </div>

        <div className="border-t border-line pt-6">
          <h3 className="text-sm font-serif font-medium text-ink mb-3">数据管理</h3>
          <div className="flex gap-3">
            <button onClick={exportData} className="btn-ghost text-sm">
              导出备份
            </button>
            <button
              onClick={() => {
                if (confirm('确定要清除所有数据吗？此操作不可恢复（API Key 保留）')) {
                  clearAllData();
                  location.reload();
                }
              }}
              className="text-sm text-terra hover:text-terra-hover transition-colors px-4 h-10 inline-flex items-center"
            >
              清除数据
            </button>
          </div>
        </div>

        <div className="border-t border-line pt-6 mt-6">
          <p className="text-xs text-ink-weak leading-relaxed">
            简历、岗位和流程草稿会同步到 Neon 云端；DeepSeek API Key 仍仅保存在当前浏览器。
          </p>
        </div>
      </div>
    </div>
  );
};
