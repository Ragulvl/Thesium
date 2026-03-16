import { useState } from 'react';
import { BookOpen, Mail, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { useGoogleAuth } from '../contexts/GoogleAuthContext';
import { useToast } from '../contexts/ToastContext';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const navigate = useNavigate();
  const { login } = useGoogleAuth();
  const { error, success } = useToast();

  const handleGoogleSuccess = (credentialResponse: CredentialResponse) => {
    if (credentialResponse.credential) {
      login(credentialResponse.credential);
      success("Successfully signed in with Google!", "Authentication");
      navigate('/dashboard');
    }
  };

  const handleGoogleError = () => {
    error("Google Sign-In failed or was cancelled.", "Authentication Error");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Left panel - Brand & Testimonial (Hidden on mobile) */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-card border-r border-border p-12 relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none opacity-50" />
        
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <BookOpen size={16} className="text-primary-foreground" />
          </div>
          <span className="text-xl font-bold tracking-tight">Thesium</span>
        </div>

        <div className="relative z-10 max-w-md">
          <blockquote className="space-y-6">
            <p className="text-2xl font-semibold leading-snug tracking-tight text-foreground">
              "Thesium cut our research team's drafting time by 80%. The multi-agent council feels like having a dedicated panel of post-docs reviewing your work in real-time."
            </p>
            <footer>
              <div className="font-bold text-foreground tracking-tight">Dr. Elena Rodriguez</div>
              <div className="text-sm font-medium text-muted-foreground">Director of Research, Stanford AI Lab</div>
            </footer>
          </blockquote>
        </div>
      </div>

      {/* Right panel - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 relative">
        <div className="w-full max-w-sm space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Mobile Logo */}
          <div className="flex lg:hidden items-center justify-center gap-3 mb-8">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
              <BookOpen size={16} className="text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">Thesium</span>
          </div>

          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight mb-2">
              {isLogin ? 'Welcome back' : 'Create an account'}
            </h1>
            <p className="text-sm font-medium text-muted-foreground">
              {isLogin 
                ? 'Enter your credentials to access your workspace' 
                : 'Enter your email below to create your account'}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex justify-center w-full">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                useOneTap
                theme="filled_blue"
                shape="rectangular"
                text={isLogin ? "signin_with" : "signup_with"}
                width="100%"
              />
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 font-bold tracking-widest text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider" htmlFor="email">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input 
                  id="email" 
                  type="email" 
                  autoComplete="email"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow shadow-sm"
                  placeholder="name@example.com" 
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-foreground uppercase tracking-wider" htmlFor="password">Password</label>
                {isLogin && (
                  <button type="button" className="text-xs font-semibold text-primary hover:underline">
                    Forgot password?
                  </button>
                )}
              </div>
              <input 
                id="password" 
                type="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                required
                className="w-full px-4 py-2.5 bg-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow shadow-sm"
              />
            </div>

            <Button type="submit" variant="primary" className="w-full font-semibold py-3">
              {isLogin ? 'Sign In' : 'Create Account'}
              <ArrowRight size={16} className="ml-2" />
            </Button>
          </form>

          <p className="text-center text-sm font-medium text-muted-foreground">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button 
              type="button" 
              onClick={() => setIsLogin(!isLogin)} 
              className="text-primary font-bold hover:underline"
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
