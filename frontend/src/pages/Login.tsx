import React, { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  AlertCircle, Loader2, Eye, EyeOff, Lock, Mail,
  UploadCloud, FileText, Download, RefreshCw, ShieldAlert, Sparkles
} from 'lucide-react';
import { api } from '../lib/api';
import { AuthLayout } from '../components/AuthLayout';

// Zod Schema matching backend expectations
const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFields = z.infer<typeof loginSchema>;

const STORAGE_KEY = 'docmind_guest_conversions';

const getGuestCount = (): number => {
  try { return parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10); } catch { return 0; }
};

const incrementGuestCount = () => {
  try { localStorage.setItem(STORAGE_KEY, String(getGuestCount() + 1)); } catch {}
};

type Tab = 'login' | 'converter';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('login');

  // Free Converter states
  const [file, setFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState('txt');
  const [isDragging, setIsDragging] = useState(false);
  const [convertResult, setConvertResult] = useState<{ downloadUrl: string; remainingAttempts: number } | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [guestCount] = useState(getGuestCount());
  const isLimitReached = guestCount >= 2;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFields>({
    resolver: zodResolver(loginSchema),
  });

  // Login api mutation
  const loginMutation = useMutation({
    mutationFn: async (fields: LoginFields) => {
      const res = await api.post('/v1/auth/login', fields);
      return res.data;
    },
    onSuccess: (data) => {
      const { accessToken, refreshToken } = data.data;
      localStorage.setItem('docmind_access_token', accessToken);
      localStorage.setItem('docmind_refresh_token', refreshToken);
      navigate('/dashboard');
    },
    onError: (err: any) => {
      const message = err.response?.data?.message || 'Login failed. Please check your credentials.';
      setCustomError(message);
    },
  });

  const onSubmit = (data: LoginFields) => {
    setCustomError(null);
    loginMutation.mutate(data);
  };

  // File drag & drop handlers
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  }, []);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  // Free Convert handler
  const handleConvert = async () => {
    if (!file || isLimitReached) return;
    setIsConverting(true);
    setConvertError(null);
    setConvertResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('targetFormat', targetFormat);

    try {
      const res = await api.post('/v1/public/convert', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });

      if (res.data.success) {
        incrementGuestCount();
        setConvertResult({
          downloadUrl: res.data.downloadUrl,
          remainingAttempts: res.data.remainingAttempts,
        });
      }
    } catch (err: any) {
      if (err.response?.data?.code === 'LIMIT_EXCEEDED') {
        setConvertError('limit_exceeded');
      } else {
        setConvertError(err.response?.data?.message || 'Conversion failed. Please try again.');
      }
    } finally {
      setIsConverting(false);
    }
  };

  const remainingFree = Math.max(0, 2 - guestCount);

  return (
    <AuthLayout title={activeTab === 'login' ? 'Sign In' : 'Free Converter'} subtitle="Access your document intelligence suite">

      {/* Tab Toggle */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-xl mb-6 -mt-2">
        <button
          onClick={() => setActiveTab('login')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'login'
              ? 'bg-brand-primary/20 text-white border border-brand-primary/30'
              : 'text-brand-textMuted hover:text-white'
          }`}
        >
          Sign In
        </button>
        <button
          onClick={() => setActiveTab('converter')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'converter'
              ? 'bg-brand-primary/20 text-white border border-brand-primary/30'
              : 'text-brand-textMuted hover:text-white'
          }`}
        >
          <Sparkles className="w-3 h-3" />
          Try Free
        </button>
      </div>

      {/* ── LOGIN FORM ── */}
      {activeTab === 'login' && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Error Alert Box */}
          {customError && (
            <div className="flex items-center gap-2.5 bg-brand-error/15 border border-brand-error/30 text-brand-error px-4 py-3 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{customError}</span>
            </div>
          )}

          {/* Email Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-brand-textMuted uppercase tracking-wider block">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-5 h-5 text-brand-textMuted" />
              <input
                type="email"
                placeholder="name@company.com"
                className="glass-input pl-10"
                {...register('email')}
              />
            </div>
            {errors.email && (
              <p className="text-xs text-brand-error mt-1">{errors.email.message}</p>
            )}
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-brand-textMuted uppercase tracking-wider block">
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-xs text-brand-primary hover:text-brand-secondary transition-colors"
              >
                Forgot Password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-5 h-5 text-brand-textMuted" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                className="glass-input pl-10 pr-10"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3.5 text-brand-textMuted hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-brand-error mt-1">{errors.password.message}</p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="glass-button-primary w-full flex items-center justify-center gap-2 mt-2"
          >
            {loginMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>

          {/* Bottom Redirect */}
          <div className="text-center text-sm text-brand-textMuted mt-4">
            Don't have an account?{' '}
            <Link
              to="/signup"
              className="text-brand-primary hover:text-brand-secondary font-medium transition-colors"
            >
              Create an Account
            </Link>
          </div>
        </form>
      )}

      {/* ── FREE CONVERTER PANEL ── */}
      {activeTab === 'converter' && (
        <div className="space-y-5">
          {/* Attempt counter badge */}
          <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border text-xs font-semibold ${
            isLimitReached
              ? 'bg-brand-error/10 border-brand-error/30 text-brand-error'
              : 'bg-brand-primary/10 border-brand-primary/20 text-brand-primary'
          }`}>
            <span>{isLimitReached ? '🔒 Free Limit Reached' : '🎁 Free Guest Converter'}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              isLimitReached ? 'bg-brand-error/20 text-brand-error' : 'bg-brand-primary/20 text-brand-primary'
            }`}>
              {remainingFree}/2 attempts left
            </span>
          </div>

          {isLimitReached ? (
            /* Limit Reached State */
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 mx-auto bg-brand-error/10 border border-brand-error/20 rounded-2xl flex items-center justify-center">
                <ShieldAlert className="w-7 h-7 text-brand-error" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Free Limit Reached</h3>
                <p className="text-xs text-brand-textMuted mt-1 leading-relaxed">
                  You've used both free conversions. Sign up (it's free!) to unlock unlimited documents, AI Q&A, entity extraction, and much more.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('login')}
                  className="flex-1 py-2 px-3 text-xs border border-white/10 rounded-lg text-brand-textMuted hover:text-white hover:bg-white/5 transition-all font-semibold"
                >
                  Sign In
                </button>
                <Link
                  to="/signup"
                  className="flex-1 py-2 px-3 text-xs text-center glass-button-primary font-semibold"
                >
                  Create Free Account
                </Link>
              </div>
            </div>
          ) : (
            /* Upload + Convert Widgets */
            <>
              {/* Drop zone */}
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => document.getElementById('guest-file-input')?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all select-none ${
                  isDragging
                    ? 'border-brand-primary bg-brand-primary/10 scale-[1.01]'
                    : file
                    ? 'border-brand-success/40 bg-brand-success/5'
                    : 'border-white/10 hover:border-brand-primary/40 hover:bg-white/[0.02]'
                }`}
              >
                <input
                  id="guest-file-input"
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
                  onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
                />
                {file ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="w-8 h-8 text-brand-success" />
                    <span className="text-xs font-semibold text-white truncate max-w-full px-2">{file.name}</span>
                    <span className="text-[10px] text-brand-textMuted">({(file.size / 1024).toFixed(1)} KB) — Click to change</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <UploadCloud className="w-8 h-8 text-brand-textMuted" />
                    <span className="text-xs font-semibold text-brand-textMuted">Drop file here or click to browse</span>
                    <span className="text-[10px] text-brand-border">PDF, DOCX, TXT, PNG, JPG</span>
                  </div>
                )}
              </div>

              {/* Target format selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted block">
                  Convert To
                </label>
                <select
                  value={targetFormat}
                  onChange={(e) => setTargetFormat(e.target.value)}
                  className="glass-input text-xs w-full"
                >
                  <option value="txt">Plain Text (.txt)</option>
                  <option value="pdf">PDF (.pdf)</option>
                  <option value="docx">Word Document (.docx)</option>
                  <option value="md">Markdown (.md)</option>
                  <option value="json">JSON (.json)</option>
                </select>
              </div>

              {/* Conversion error alert */}
              {convertError && convertError !== 'limit_exceeded' && (
                <div className="flex items-center gap-2 bg-brand-error/10 border border-brand-error/20 text-brand-error px-3 py-2 rounded-lg text-xs">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{convertError}</span>
                </div>
              )}

              {/* Result download button */}
              {convertResult && (
                <div className="bg-brand-success/10 border border-brand-success/20 rounded-xl p-4 text-center space-y-2.5 animate-in zoom-in-95 duration-200">
                  <span className="text-xs font-bold text-brand-success block">✅ Conversion Complete!</span>
                  <a
                    href={convertResult.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="glass-button-primary flex items-center justify-center gap-2 text-xs"
                  >
                    <Download className="w-4 h-4" />
                    Download Converted File
                  </a>
                  {convertResult.remainingAttempts > 0 ? (
                    <p className="text-[10px] text-brand-textMuted">{convertResult.remainingAttempts} free attempt(s) remaining</p>
                  ) : (
                    <div className="text-[10px] text-brand-textMuted space-y-1">
                      <p>This was your last free conversion.</p>
                      <Link to="/signup" className="text-brand-primary hover:underline font-semibold block">
                        Create a free account for unlimited access →
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {/* Convert button */}
              {!convertResult && (
                <button
                  onClick={handleConvert}
                  disabled={!file || isConverting}
                  className="glass-button-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {isConverting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Converting...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Convert Document</span>
                    </>
                  )}
                </button>
              )}
            </>
          )}

          {/* Sign up nudge */}
          {!isLimitReached && (
            <div className="text-center text-xs text-brand-textMuted pt-1">
              Want unlimited access?{' '}
              <Link to="/signup" className="text-brand-primary hover:text-brand-secondary font-semibold transition-colors">
                Sign up free
              </Link>
            </div>
          )}
        </div>
      )}
    </AuthLayout>
  );
};

export default Login;
