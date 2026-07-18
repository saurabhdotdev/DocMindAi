import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Loader2, CheckCircle2, User, Mail, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { AuthLayout } from '../components/AuthLayout';

// Zod Schema matches backend validation requirements exactly
const signupSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[a-z]/, 'Must contain one lowercase letter')
    .regex(/[A-Z]/, 'Must contain one uppercase letter')
    .regex(/[0-9]/, 'Must contain one number')
    .regex(/[^a-zA-Z0-9]/, 'Must contain one special character'),
});

type SignupFields = z.infer<typeof signupSchema>;

export const Signup: React.FC = () => {
  const [customError, setCustomError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [verifyTokenLink, setVerifyTokenLink] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFields>({
    resolver: zodResolver(signupSchema),
  });

  const signupMutation = useMutation({
    mutationFn: async (fields: SignupFields) => {
      const res = await api.post('/v1/auth/signup', fields);
      return res.data;
    },
    onSuccess: (data) => {
      setIsSuccess(true);
      // For development speed and testing, backend returns verificationToken
      const token = data.data?.verificationToken;
      if (token) {
        setVerifyTokenLink(`http://localhost:5000/api/v1/auth/verify-email?token=${token}`);
      }
    },
    onError: (err: any) => {
      const message = err.response?.data?.message || 'Registration failed. Try again.';
      setCustomError(message);
    },
  });

  const onSubmit = (data: SignupFields) => {
    setCustomError(null);
    signupMutation.mutate(data);
  };

  if (isSuccess) {
    return (
      <AuthLayout title="Registration Successful" subtitle="One last step to initialize your profile">
        <div className="text-center py-4 space-y-4">
          <div className="flex justify-center">
            <CheckCircle2 className="w-16 h-16 text-brand-success animate-bounce" />
          </div>
          <p className="text-sm text-brand-text">
            We have sent a verification link to your email. Please verify to activate your profile.
          </p>

          {verifyTokenLink && (
            <div className="bg-brand-primary/10 border border-brand-primary/20 p-4 rounded-lg text-left text-xs mt-4">
              <span className="font-semibold text-brand-primary block mb-1">Development Mode Quick Link:</span>
              <a 
                href={verifyTokenLink} 
                target="_blank" 
                rel="noreferrer" 
                className="text-brand-text hover:underline break-all block"
              >
                {verifyTokenLink}
              </a>
            </div>
          )}

          <div className="pt-4">
            <Link to="/login" className="glass-button-primary block text-center">
              Go to Sign In
            </Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create Account" subtitle="Get started with DocMind AI today">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        
        {customError && (
          <div className="flex items-center gap-2.5 bg-brand-error/15 border border-brand-error/30 text-brand-error px-4 py-3 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{customError}</span>
          </div>
        )}

        {/* First & Last Name row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-brand-textMuted uppercase block">
              First Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 w-4 h-4 text-brand-textMuted" />
              <input
                type="text"
                placeholder="John"
                className="glass-input pl-9 text-sm"
                {...register('firstName')}
              />
            </div>
            {errors.firstName && (
              <p className="text-[10px] text-brand-error">{errors.firstName.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-brand-textMuted uppercase block">
              Last Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 w-4 h-4 text-brand-textMuted" />
              <input
                type="text"
                placeholder="Doe"
                className="glass-input pl-9 text-sm"
                {...register('lastName')}
              />
            </div>
            {errors.lastName && (
              <p className="text-[10px] text-brand-error">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        {/* Email Address */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-brand-textMuted uppercase block">
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-2.5 w-4 h-4 text-brand-textMuted" />
            <input
              type="email"
              placeholder="name@company.com"
              className="glass-input pl-9 text-sm"
              {...register('email')}
            />
          </div>
          {errors.email && (
            <p className="text-[10px] text-brand-error">{errors.email.message}</p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-brand-textMuted uppercase block">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 w-4 h-4 text-brand-textMuted" />
            <input
              type="password"
              placeholder="••••••••"
              className="glass-input pl-9 text-sm"
              {...register('password')}
            />
          </div>
          {errors.password && (
            <p className="text-[10px] text-brand-error mt-1 leading-snug">{errors.password.message}</p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={signupMutation.isPending}
          className="glass-button-primary w-full flex items-center justify-center gap-2 mt-2"
        >
          {signupMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Registering...</span>
            </>
          ) : (
            <span>Create Account</span>
          )}
        </button>

        {/* Redirect */}
        <div className="text-center text-sm text-brand-textMuted mt-4">
          Already have an account?{' '}
          <Link
            to="/login"
            className="text-brand-primary hover:text-brand-secondary font-medium transition-colors"
          >
            Sign In
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
};
export default Signup;
