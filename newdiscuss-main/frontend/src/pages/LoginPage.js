import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import TermsModal from '@/components/TermsModal';
import LoadingScreen from '@/components/LoadingScreen';
import AdminMessageBanner from '@/components/AdminMessageBanner';
import DiscussLogo from '@/components/DiscussLogo';
import { Eye, EyeOff, Loader2, XCircle, Shield, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaTarget, setCaptchaTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showForgotDisabled, setShowForgotDisabled] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => setPageLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  const generateCaptcha = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCaptchaTarget(result);
    setCaptchaInput('');
  };

  useEffect(() => {
    generateCaptcha();
  }, []);

  if (pageLoading) {
    return <LoadingScreen message="Loading login..." />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) return setError('Email is required');
    if (!password) return setError('Password is required');
    if (captchaInput !== captchaTarget) {
      generateCaptcha();
      return setError('Incorrect CAPTCHA entered');
    }
    setLoading(true);
    const r = await login(email, password);
    setLoading(false);
    if (r.success) navigate('/feed');
    else setError(r.error);
  };

  const handleGoogle = async () => {
    if (captchaInput !== captchaTarget) {
      setError('Please enter the correctly verified CAPTCHA also.');
      return;
    }
    setError('');
    setGoogleLoading(true);
    const r = await loginWithGoogle();
    setGoogleLoading(false);
    if (r.success) navigate('/feed');
    else if (r.error) setError(r.error);
  };

  const handleForgotPassword = () => {
    setShowForgotDisabled(true);
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 discuss:bg-[#121212] flex flex-col">
      <AdminMessageBanner />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="text-center mb-8">
            <Link to="/" data-testid="login-logo">
              <DiscussLogo size="lg" />
            </Link>
          </div>

          {/* Card */}
          <div className="bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] rounded-[12px] shadow-card p-6 md:p-8 border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333]">
            {error && (
              <div data-testid="login-error" className="bg-[#EF4444]/8 border border-[#EF4444]/15 rounded-[6px] p-3 text-[#EF4444] text-[13px] mb-4 flex items-start gap-2">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
              </div>
            )}

            {showForgotDisabled && (
              <div data-testid="forgot-disabled-message" className="bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded-[6px] p-3 text-[#92400E] dark:text-[#FCD34D] text-[13px] mb-4 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#F59E0B]" />
                <span>Admin has disabled this feature. Thank you.</span>
                <button onClick={() => setShowForgotDisabled(false)} className="ml-auto text-[#92400E] dark:text-[#FCD34D] hover:opacity-80">
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-[11px] font-bold uppercase tracking-[0.1em]">Email Address</label>
                <Input data-testid="login-email-input" type="email" value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="name@example.com"
                  className="mt-1.5 bg-neutral-50 dark:bg-neutral-900 discuss:bg-[#262626] border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:bg-white dark:focus:bg-neutral-800 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 rounded-[6px] h-11" />
              </div>
              <div>
                <div className="flex justify-between items-center">
                  <label className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-[11px] font-bold uppercase tracking-[0.1em]">Password</label>
                  <button 
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-[#2563EB] discuss:text-[#EF4444] text-[12px] font-medium hover:underline"
                    data-testid="login-forgot-password"
                  >
                    Forgot?
                  </button>
                </div>
                <div className="relative mt-1.5">
                  <Input data-testid="login-password-input" type={showPw ? 'text' : 'password'} value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                    placeholder="Enter password"
                    className="bg-neutral-50 dark:bg-neutral-900 discuss:bg-[#262626] border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:bg-white dark:focus:bg-neutral-800 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 rounded-[6px] h-11 pr-10" />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* CAPTCHA */}
              <div>
                <label className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-[11px] font-bold uppercase tracking-[0.1em]">Security CAPTCHA</label>
                <div className="flex items-center gap-3 mt-1.5 mb-2">
                  <div className="relative flex-1 max-w-[140px] bg-white dark:bg-[#1E293B] discuss:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] rounded-[6px] h-11 flex items-center justify-center overflow-hidden select-none">
                    <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjxwb2x5Z29uIGZpbGw9IiMwMDAiIGZpbGwtb3BhY2l0eT0iMC4xIiBwb2ludHM9IjQgMCAwIDQgMCAwIDQgNCIvPjwvc3ZnPg==')] pointer-events-none"></div>
                    <span className="font-mono text-lg font-extrabold tracking-[0.3em] text-neutral-900 dark:text-white discuss:text-[#F5F5F5]">{captchaTarget}</span>
                  </div>
                  <button
                    type="button"
                    onClick={generateCaptcha}
                    title="Refresh CAPTCHA"
                    className="p-2 text-neutral-400 hover:text-neutral-900 dark:hover:text-white discuss:hover:text-[#F5F5F5] transition-colors rounded-[6px] hover:bg-neutral-100 dark:hover:bg-neutral-800 discuss:hover:bg-[#333333]"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                </div>
                <div className="relative">
                  <Input data-testid="login-captcha-input" type="text" value={captchaInput} onChange={(e) => { setCaptchaInput(e.target.value); setError(''); }}
                    placeholder="Enter above characters"
                    className="bg-neutral-50 dark:bg-neutral-900 discuss:bg-[#262626] border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:bg-white dark:focus:bg-neutral-800 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 rounded-[6px] h-11 pr-10" />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none flex items-center">
                    {captchaInput.length > 0 && captchaInput === captchaTarget ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : captchaInput.length > 0 ? (
                      <XCircle className="w-5 h-5 text-red-500" />
                    ) : null}
                  </div>
                </div>
                {captchaInput.length > 0 && captchaInput !== captchaTarget && (
                   <span className="text-red-500 text-[11px] mt-1 flex items-center gap-1">
                     <XCircle className="w-3 h-3" />CAPTCHA does not match
                   </span>
                )}
              </div>

              <Button type="submit" data-testid="login-submit-btn" disabled={loading}
                className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] discuss:bg-[#EF4444] discuss:hover:bg-[#DC2626] text-white font-semibold rounded-[6px] py-3 h-12 text-[15px] shadow-button hover:shadow-button-hover transition-all">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Login'}
              </Button>
            </form>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-neutral-200 dark:border-neutral-700 discuss:border-[#333333]" /></div>
              <div className="relative flex justify-center text-[11px]"><span className="bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] px-3 text-neutral-400 uppercase tracking-wider">Or continue with</span></div>
            </div>

            <Button type="button" data-testid="login-google-btn" onClick={handleGoogle} disabled={googleLoading}
              className="w-full bg-neutral-50 dark:bg-neutral-900 discuss:bg-[#262626] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] hover:bg-neutral-100 dark:hover:bg-neutral-800 discuss:hover:bg-[#333333] rounded-[6px] py-2.5 h-11 font-medium flex items-center justify-center gap-2.5">
              {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><GoogleIcon /> Continue with Google</>}
            </Button>

            <p className="text-center text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-[13px] mt-5">
              New to discuss? <Link to="/register" data-testid="login-to-register-link" className="text-[#2563EB] discuss:text-[#EF4444] hover:underline font-semibold">Create account</Link>
            </p>
          </div>

          {/* Footer links */}
          <div className="text-center mt-6 flex items-center justify-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-neutral-400 text-[11px] font-semibold uppercase tracking-wider">Secure Authentication</span>
          </div>
          <div className="text-center mt-2 flex items-center justify-center">
            <button 
              onClick={() => setShowTerms(true)}
              className="text-neutral-400 text-[11px] hover:text-[#2563EB] discuss:hover:text-[#EF4444] hover:underline"
              data-testid="login-terms-link"
            >
              Terms and Conditions
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-4 text-center">
        <p className="text-neutral-400 text-[12px]">
          Developed by{' '}
          <span className="text-[#2563EB] discuss:text-[#EF4444] font-semibold">&lt;Mohammed Maaz A&gt;</span>
        </p>
      </footer>

      <TermsModal 
        open={showTerms} 
        onClose={() => setShowTerms(false)} 
        showAcceptButton={false}
      />
    </div>
  );
}
