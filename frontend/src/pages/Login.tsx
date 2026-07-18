import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Loader2, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { api } from '../lib/api';
import { AuthLayout } from '../components/AuthLayout';

// Zod Schema matching backend expectations
const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFields = z.infer<typeof loginSchema>;

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

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

  return (
    <AuthLayout title="Sign In" subtitle="Access your document intelligence suite">
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
    </AuthLayout>
  );
};
export default Login;
