import React, { useState } from 'react';
import {
  Zap, Menu, X, Brain, Shield, Target,
  Badge, Clock, Award, ChevronRight, Star, Users, TrendingUp,
  ArrowRight, Play, Check,
} from 'lucide-react';

interface LandingPageProps {
  onLogin: () => void;
}

export default function LandingPage({ onLogin }: LandingPageProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">

            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-200">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="font-extrabold text-xl bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent tracking-tight">
                SimuHire Rwanda
              </span>
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-8">
              {['Features', 'How It Works', 'For Companies', 'For Candidates'].map(label => (
                <a
                  key={label}
                  href={`#${label.toLowerCase().replace(/\s+/g, '-')}`}
                  className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
                >
                  {label}
                </a>
              ))}
            </div>

            {/* Desktop CTA */}
            <div className="hidden md:flex items-center gap-3">
              <button
                onClick={onLogin}
                className="px-4 py-2 text-sm font-semibold text-gray-700 hover:text-blue-600 transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={onLogin}
                className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-blue-200 transition-all"
              >
                Get Started →
              </button>
            </div>

            {/* Mobile burger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-3 shadow-lg">
            {['Features', 'How It Works', 'For Companies', 'For Candidates'].map(label => (
              <a key={label} href={`#${label.toLowerCase().replace(/\s+/g, '-')}`}
                className="block text-sm font-medium text-gray-600 hover:text-blue-600 py-1">
                {label}
              </a>
            ))}
            <div className="pt-3 space-y-2 border-t border-gray-100">
              <button onClick={onLogin} className="w-full py-2.5 text-sm font-semibold border border-gray-200 rounded-xl hover:bg-gray-50">Sign In</button>
              <button onClick={onLogin} className="w-full py-2.5 text-sm font-semibold bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl">Get Started Free</button>
            </div>
          </div>
        )}
      </nav>

      <main>

        {/* ── Hero ── */}
        <section className="relative pt-28 pb-20 md:pt-36 md:pb-28 overflow-hidden">
          {/* Background blobs */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-100 rounded-full blur-3xl opacity-60" />
            <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-100 rounded-full blur-3xl opacity-50" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-blue-50 to-purple-50 rounded-full blur-3xl opacity-40" />
          </div>

          <div className="w-full px-4 sm:px-6 lg:px-8 text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-50 border border-blue-100 rounded-full text-sm font-semibold text-blue-700 mb-6">
              <Zap className="w-4 h-4" />
              AI + Blockchain Powered Recruitment
            </div>

            <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 leading-tight mb-6 tracking-tight">
              Hire Smarter in<br />
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Rwanda's Digital Economy
              </span>
            </h1>

            <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
              Virtual work simulations powered by AI behavioral analytics and blockchain verification find the perfect cultural and technical fit for your organisation.
            </p>

            <div className="flex flex-col sm:flex-row justify-center gap-4 mb-10">
              {/* Company CTA */}
              <button
                onClick={onLogin}
                className="group flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-2xl text-lg hover:shadow-2xl hover:shadow-blue-200 transition-all hover:-translate-y-0.5"
              >
                <Users className="w-5 h-5" />
                Companies — Start Free Trial
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              {/* Candidate CTA */}
              <button
                onClick={onLogin}
                className="group flex items-center justify-center gap-2 px-8 py-4 bg-white border-2 border-gray-200 text-gray-700 font-bold rounded-2xl text-lg hover:border-purple-300 hover:text-purple-600 transition-all"
              >
                <Play className="w-5 h-5" />
                Candidates — Get Started Free
              </button>
            </div>

            <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-500">
              {['No credit card required', '14-day free trial', 'For Rwandan companies'].map(t => (
                <span key={t} className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-green-500" /> {t}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Stats ── */}
        <section className="py-14 bg-gray-900">
          <div className="w-full px-4">
            <div className="max-w-5xl mx-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-gray-700">
                {[
                  { value: '68%',  label: 'Fewer Mis-hires',        icon: TrendingUp },
                  { value: '40%',  label: 'Faster Time-to-Hire',    icon: Clock },
                  { value: '100%', label: 'Verifiable Credentials', icon: Shield },
                  { value: '15+',  label: 'Rwandan Companies',      icon: Users },
                ].map(({ value, label, icon: Icon }) => (
                  <div key={label} className="flex flex-col items-center py-8 px-4 text-center">
                    <Icon className="w-6 h-6 text-blue-400 mb-3" />
                    <div className="text-4xl font-extrabold text-white mb-1">{value}</div>
                    <div className="text-sm text-gray-400 font-medium">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="py-24 bg-white">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-16">
                <p className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-3">Platform Features</p>
                <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4 tracking-tight">
                  Revolutionising Recruitment<br />in Rwanda
                </h2>
                <p className="text-xl text-gray-500 max-w-2xl mx-auto">
                  Combining cutting-edge AI with blockchain technology for transparent, predictive hiring assessments.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-8">
                {[
                  {
                    icon: Brain, gradient: 'from-blue-500 to-blue-700', glow: 'shadow-blue-200',
                    title: 'AI Behavioral Analytics',
                    desc: 'NLP-powered communication analysis, punctuality tracking, and adaptability scoring tailored to Rwandan workplace norms.',
                    tags: ['NLP Analysis', 'Soft Skills', 'Adaptability'],
                  },
                  {
                    icon: Shield, gradient: 'from-purple-500 to-purple-700', glow: 'shadow-purple-200',
                    title: 'Blockchain Verification',
                    desc: 'Tamper-proof assessment records and verifiable credentials. 100% transparent and immutable hiring decisions.',
                    tags: ['Tamper-Proof', 'Immutable', 'Transparent'],
                  },
                  {
                    icon: Target, gradient: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-200',
                    title: 'Real Work Simulations',
                    desc: 'Interactive tasks that mirror actual job responsibilities. Assess real skills, not just resumes.',
                    tags: ['Real Tasks', 'Skill-Based', 'Job-Ready'],
                  },
                ].map(({ icon: Icon, gradient, glow, title, desc, tags }) => (
                  <div key={title} className="group relative bg-white rounded-3xl p-8 border border-gray-100 hover:border-blue-100 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
                    <div className={`w-14 h-14 bg-gradient-to-br ${gradient} rounded-2xl flex items-center justify-center mb-6 shadow-lg ${glow} group-hover:scale-110 transition-transform`}>
                      <Icon className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-3">{title}</h3>
                    <p className="text-gray-500 leading-relaxed mb-5">{desc}</p>
                    <div className="flex flex-wrap gap-2">
                      {tags.map(tag => (
                        <span key={tag} className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold">{tag}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── How It Works ── */}
        <section id="how-it-works" className="py-24 bg-gradient-to-b from-gray-50 to-white">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-16">
                <p className="text-sm font-bold text-purple-600 uppercase tracking-widest mb-3">Simple Process</p>
                <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4 tracking-tight">How SimuHire Works</h2>
                <p className="text-xl text-gray-500 max-w-xl mx-auto">
                  A simple, transparent process for better hiring outcomes.
                </p>
              </div>

              <div className="relative">
                {/* Connector line */}
                <div className="hidden md:block absolute top-10 left-1/2 -translate-x-1/2 w-3/4 h-0.5 bg-gradient-to-r from-blue-200 via-purple-200 to-blue-200" />

                <div className="grid md:grid-cols-4 gap-8">
                  {[
                    { step: '01', title: 'Post a Job',                  desc: 'Define role requirements and cultural parameters',            color: 'blue'   },
                    { step: '02', title: 'Candidate Simulates',          desc: 'Complete realistic work tasks in a virtual environment',     color: 'purple' },
                    { step: '03', title: 'AI Analysis',                  desc: 'Behavioral scoring and blockchain recording of results',     color: 'indigo' },
                    { step: '04', title: 'Data-Driven Hire',             desc: 'Make confident decisions with verified, immutable insights', color: 'violet' },
                  ].map(({ step, title, desc, color }) => (
                    <div key={step} className="relative flex flex-col items-center text-center">
                      <div className={`relative z-10 w-20 h-20 rounded-2xl bg-gradient-to-br from-${color}-500 to-${color}-700 flex items-center justify-center shadow-xl mb-5`}>
                        <span className="text-2xl font-extrabold text-white">{step}</span>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                      <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── For Companies ── */}
        <section id="for-companies" className="py-24 bg-gray-900 overflow-hidden relative">
          <div className="absolute inset-0 -z-0">
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-900/40 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-900/40 rounded-full blur-3xl" />
          </div>
          <div className="relative w-full px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
              <div className="grid md:grid-cols-2 gap-16 items-center">
                <div>
                  <p className="text-sm font-bold text-blue-400 uppercase tracking-widest mb-4">For Employers</p>
                  <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-5 leading-tight tracking-tight">
                    Hire with Confidence,<br />Not Guesswork
                  </h2>
                  <p className="text-lg text-gray-400 mb-8 leading-relaxed">
                    Reduce hiring costs by 40% and improve retention with our AI-powered assessment platform built for Rwandan companies.
                  </p>
                  <ul className="space-y-4 mb-10">
                    {[
                      'Customisable cultural fit parameters for your organisation',
                      'Blockchain-verified candidate assessments',
                      'Analytics dashboard with predictive insights',
                      "Support for Rwanda's NICI III digital economy goals",
                    ].map(item => (
                      <li key={item} className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="w-3 h-3 text-green-400" />
                        </div>
                        <span className="text-gray-300 text-sm leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={onLogin}
                    className="group flex items-center gap-2 px-7 py-3.5 bg-white text-gray-900 font-bold rounded-2xl hover:shadow-xl hover:bg-blue-50 transition-all"
                  >
                    Schedule a Demo
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>

                {/* Stats card */}
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { value: '68%', label: 'Fewer Mis-hires',     sub: 'Vs traditional CV screening',  bg: 'from-blue-600 to-blue-800'    },
                    { value: '40%', label: 'Time-to-Hire Saved',  sub: 'Average across all sectors',    bg: 'from-purple-600 to-purple-800' },
                    { value: '3×',  label: 'Better Retention',    sub: 'Year-1 employee retention',     bg: 'from-indigo-600 to-indigo-800' },
                    { value: '15+', label: 'Companies Trust Us',  sub: 'Across Rwanda',                 bg: 'from-violet-600 to-violet-800' },
                  ].map(({ value, label, sub, bg }) => (
                    <div key={label} className={`bg-gradient-to-br ${bg} rounded-2xl p-6 text-white`}>
                      <div className="text-4xl font-extrabold mb-1">{value}</div>
                      <div className="text-sm font-semibold mb-0.5">{label}</div>
                      <div className="text-xs text-white/60">{sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── For Candidates ── */}
        <section id="for-candidates" className="py-24 bg-white">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
              <div className="grid md:grid-cols-2 gap-16 items-center">
                {/* Simulation card */}
                <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-3xl p-8 border border-blue-100 shadow-xl shadow-blue-50">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                        <Badge className="w-5 h-5 text-blue-600" />
                      </div>
                      <span className="text-sm font-bold text-gray-700">Featured Simulation</span>
                    </div>
                    <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-100 px-2.5 py-1 rounded-full">
                      <Star className="w-3 h-3" /> Popular
                    </span>
                  </div>
                  <h3 className="text-2xl font-extrabold text-gray-900 mb-2">Software Developer</h3>
                  <p className="text-gray-500 mb-6">Complete real development tasks and showcase your skills to top employers.</p>
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Clock className="w-4 h-4 text-blue-500" />
                      <span>Duration: <strong>2 hours</strong></span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Award className="w-4 h-4 text-purple-500" />
                      <span>Blockchain-verified certificate on completion</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Users className="w-4 h-4 text-green-500" />
                      <span><strong>120+</strong> candidates completed this month</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {['JavaScript', 'React', 'Node.js', 'SQL'].map(tag => (
                      <span key={tag} className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold">{tag}</span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-bold text-purple-600 uppercase tracking-widest mb-4">For Job Seekers</p>
                  <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-5 leading-tight tracking-tight">
                    Stand Out Beyond<br />Your Resume
                  </h2>
                  <p className="text-xl text-gray-500 mb-8 leading-relaxed">
                    Showcase your real abilities. Get verified credentials that top Rwandan employers trust.
                  </p>
                  <ul className="space-y-4 mb-10">
                    {[
                      'Demonstrate technical and soft skills in real scenarios',
                      'Blockchain-verified performance records',
                      'Stand out to top Rwandan tech companies',
                      'Free access to all simulations',
                    ].map(item => (
                      <li key={item} className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-green-100 border border-green-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="w-3 h-3 text-green-600" />
                        </div>
                        <span className="text-gray-600 text-sm leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={onLogin}
                    className="group flex items-center gap-2 px-7 py-3.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-2xl hover:shadow-xl hover:shadow-blue-200 hover:-translate-y-0.5 transition-all"
                  >
                    Create Free Candidate Account
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="py-24 relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700">
          <div className="absolute inset-0 -z-0">
            <div className="absolute top-0 left-1/4 w-72 h-72 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-60 h-60 bg-white/5 rounded-full blur-3xl" />
          </div>
          <div className="relative max-w-4xl mx-auto text-center px-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 border border-white/20 rounded-full text-sm font-semibold text-white mb-6">
              <Zap className="w-4 h-4" /> Join 15+ companies already hiring smarter
            </div>
            <h2 className="text-4xl md:text-6xl font-extrabold text-white mb-5 tracking-tight leading-tight">
              Ready to Transform<br />Your Hiring?
            </h2>
            <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto leading-relaxed">
              Join the future of recruitment in Rwanda. Start your 14-day free trial today — no credit card required.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <button
                onClick={onLogin}
                className="group flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-700 font-bold rounded-2xl text-lg hover:shadow-2xl hover:-translate-y-0.5 transition-all"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={onLogin}
                className="px-8 py-4 border-2 border-white/40 text-white font-bold rounded-2xl text-lg hover:bg-white/10 hover:border-white transition-all"
              >
                Contact Sales
              </button>
            </div>
          </div>
        </section>

      </main>

      {/* ── Footer ── */}
      <footer className="bg-gray-950 text-gray-400">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-16">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-4 gap-10 mb-12">
              <div>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                    <Zap className="w-5 h-5 text-white" />
                  </div>
                  <span className="font-extrabold text-white text-lg">SimuHire Rwanda</span>
                </div>
                <p className="text-sm leading-relaxed text-gray-500">
                  AI + Blockchain powered recruitment simulations for Rwanda's digital economy.
                </p>
              </div>
              {[
                {
                  title: 'Product',
                  links: ['Features', 'How It Works', 'Pricing', 'FAQ'],
                  hrefs: ['#features', '#how-it-works', '#', '#'],
                },
                {
                  title: 'Company',
                  links: ['About Us', 'Blog', 'Careers', 'Contact'],
                  hrefs: ['#', '#', '#', '#'],
                },
                {
                  title: 'Legal',
                  links: ['Privacy Policy', 'Terms of Service', 'GDPR Compliance'],
                  hrefs: ['#', '#', '#'],
                },
              ].map(({ title, links, hrefs }) => (
                <div key={title}>
                  <h4 className="text-white font-bold mb-5">{title}</h4>
                  <ul className="space-y-3">
                    {links.map((link, i) => (
                      <li key={link}>
                        <a href={hrefs[i]} className="text-sm text-gray-500 hover:text-white transition-colors">
                          {link}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-600">
              <p>© 2026 SimuHire Rwanda. Supporting Rwanda's Vision 2050 and NICI III.</p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-green-600 font-medium">All systems operational</span>
              </div>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}