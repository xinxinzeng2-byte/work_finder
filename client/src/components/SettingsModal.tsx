import React, { useState } from 'react';
import { getApiKey, hasApiKey, isCloudApiKeyMode, saveApiKey, saveApiKeyToCloud, exportData, clearAllData } from '../utils/storage';
import { useEffect } from 'react';
import { testApiKey } from '../services/api';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<Props> = ({ open, onClose }) => {
  const [apiKey, setApiKey] = useState(getApiKey() || '');

  useEffect(() => {
    if (open) {
      setApiKey(getApiKey() || '');
      setError('');
      setTestResult('none');
    }
  }, [open]);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<'none' | 'success' | 'fail'>('none');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const persistApiKey = async () => {
    const value = apiKey.trim();
    if (!value) return;
    // 云端保存失败时保留本地临时副本，保存成功后会删除浏览器明文。
    saveApiKey(value);
    if (isCloudApiKeyMode && localStorage.getItem('auth_token')) await saveApiKeyToCloud(value);
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await persistApiKey();
      setSaved(true);
      setTestResult('none');
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API Key 保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true); setError('');
    setTestResult('none');
    try {
      await persistApiKey();
      const valid = await testApiKey();
      setTestResult(valid ? 'success' : 'fail');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API Key 保存失败，请重试');
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
          {isCloudApiKeyMode && hasApiKey() && !apiKey && <p className="mt-2 text-xs text-moss">当前账号已配置 API Key；如需更换，请直接输入新的 Key 并保存。</p>}

          <div className="flex gap-3 mt-4">
            <button onClick={handleTest} disabled={testing || !apiKey.trim()} className="btn-ghost text-sm">
              {testing ? '测试中...' : '测试连接'}
            </button>
            <button onClick={() => void handleSave()} disabled={saving || !apiKey.trim()} className="btn-primary text-sm">
              {saving ? '保存中...' : saved ? '已保存' : '保存'}
            </button>
          </div>

          {testResult === 'success' && (
            <p className="mt-3 text-xs text-moss">API Key 有效，连接成功</p>
          )}
          {testResult === 'fail' && (
            <p className="mt-3 text-xs text-terra">连接失败，请检查 Key 或账户余额</p>
          )}
          {error && <p className="mt-3 text-xs text-terra">{error}</p>}
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
            {isCloudApiKeyMode ? 'DeepSeek API Key 会加密保存到当前账号的云端，数据库和浏览器都不保存明文。' : '当前为本地预览模式，DeepSeek API Key 仅保存在当前浏览器，可随时在这里修改。'}
          </p>
        </div>
      </div>
    </div>
  );
};
