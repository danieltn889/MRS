import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, Eye, Save, Trash2, Plus, Minus, X, CheckCircle,
  AlertCircle, ChevronRight, ChevronLeft, Target, Sparkles,
  DollarSign, GraduationCap, Briefcase, Users, FileText,
  Search, Tag, ChevronDown, Check, Loader2, Edit2,
} from 'lucide-react';
import { createJob, getJob, updateJob, deleteJob, getSuggestions } from '../../services/jobAPI';
import { useAuth } from '../../context/AuthContext';
import type {
  JobFormData, Language, Skill, LocationObject,
  ValidationErrors, QualificationEntry,
} from '../types/jobTypes';
import {
  DEFAULT_FORM_DATA, STEPS, JOB_TYPE_LABELS,
  WORK_ARRANGEMENT_LABELS, EXPERIENCE_LEVEL_LABELS,
  DEPARTMENTS, DEGREE_TYPES, FIELDS_OF_STUDY,
  RESPONSIBILITIES_SUGGESTIONS, REQUIREMENTS_SUGGESTIONS,
  BENEFITS_SUGGESTIONS, SKILLS_SUGGESTIONS,
  EXPERIENCE_YEAR_OPTIONS, EXPERIENCE_TITLE_SUGGESTIONS, ExperienceRequirement,
} from '../types/jobTypes';

// ─── Design tokens ─────────────────────────────────────────────────────────
const C = {
  bg: '#f8fafc', surface: '#ffffff', border: '#e2e8f0',
  text: '#0f172a', textMuted: '#64748b', textLight: '#94a3b8',
  primary: '#2563eb', primaryDark: '#1d4ed8', primaryGhost: '#eff6ff',
  danger: '#ef4444', dangerGhost: '#fef2f2',
  success: '#22c55e', successGhost: '#f0fdf4',
  warning: '#f59e0b', warningGhost: '#fffbeb',
  purple: '#7c3aed', purpleGhost: '#f5f3ff',
  radius: 12, radiusSm: 8,
  shadow: '0 1px 3px rgba(0,0,0,.06)',
  shadowMd: '0 4px 16px rgba(0,0,0,.08)',
};

const font = "'DM Sans', 'Helvetica Neue', sans-serif";

const inputBase: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 14px',
  border: `1px solid ${C.border}`, borderRadius: C.radiusSm,
  fontSize: 14, color: C.text, background: '#fff',
  outline: 'none', transition: 'border .15s', fontFamily: 'inherit',
};

// ─── Button styles ──────────────────────────────────────────────────────────
const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '9px 20px', borderRadius: 10, border: 'none',
  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
  color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(37,99,235,.3)',
};
const ghostBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '9px 18px', borderRadius: 10,
  border: `1px solid ${C.border}`, background: '#fff',
  color: C.textMuted, fontWeight: 500, fontSize: 14, cursor: 'pointer',
};
const dangerGhostBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '9px 18px', borderRadius: 10,
  border: `1px solid ${C.danger}40`, background: C.dangerGhost,
  color: C.danger, fontWeight: 500, fontSize: 14, cursor: 'pointer',
};
const addBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 8, border: 'none',
  background: C.primaryGhost, color: C.primary,
  fontWeight: 600, fontSize: 13, cursor: 'pointer',
};

// ─── Micro-components ───────────────────────────────────────────────────────

const Label = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>
    {children}
    {required && <span style={{ color: C.danger, marginLeft: 3 }}>*</span>}
  </label>
);

const FieldError = ({ msg }: { msg?: string }) =>
  msg ? (
    <p style={{ color: C.danger, fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
      <AlertCircle size={11} /> {msg}
    </p>
  ) : null;

const Input = ({ value, onChange, placeholder, type = 'text', hasError, maxLength, min, max, disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; hasError?: boolean; maxLength?: number; min?: string; max?: string; disabled?: boolean;
}) => (
  <input type={type} value={value} onChange={e => onChange(e.target.value)}
    placeholder={placeholder} maxLength={maxLength} min={min} max={max} disabled={disabled}
    style={{ ...inputBase, border: `1px solid ${hasError ? C.danger : C.border}`, background: disabled ? '#f8fafc' : '#fff' }} />
);

const Textarea = ({ value, onChange, rows = 4, placeholder, hasError }: {
  value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; hasError?: boolean;
}) => (
  <textarea value={value} onChange={e => onChange(e.target.value)}
    rows={rows} placeholder={placeholder}
    style={{ ...inputBase, resize: 'vertical', lineHeight: 1.6, border: `1px solid ${hasError ? C.danger : C.border}` }} />
);

const Sel = ({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) => (
  <select value={value} onChange={e => onChange(e.target.value)}
    style={{ ...inputBase, cursor: 'pointer', appearance: 'auto' }}>{children}</select>
);

const Divider = () => <div style={{ height: 1, background: C.border, margin: '8px 0' }} />;

const SectionCard = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ background: '#f8fafc', border: `1px solid ${C.border}`, borderRadius: C.radius, padding: 20, marginBottom: 8, ...style }}>
    {children}
  </div>
);

const NoneIndicator = ({ label }: { label: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: C.successGhost, borderRadius: 8, color: C.success, fontSize: 13, fontWeight: 500 }}>
    <CheckCircle size={15} /> {label}
  </div>
);

// ─── EditableListItem ────────────────────────────────────────────────────────
const EditableListItem = ({ label, sub, onRemove, onEdit }: {
  label: string; sub?: string; onRemove: () => void; onEdit?: () => void;
}) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 8 }}>
    <div>
      <p style={{ fontSize: 14, fontWeight: 500, color: C.text, margin: 0 }}>{label}</p>
      {sub && <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>{sub}</p>}
    </div>
    <div style={{ display: 'flex', gap: 6 }}>
      {onEdit && (
        <button onClick={onEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.primary, display: 'flex', alignItems: 'center', padding: 4 }}>
          <Edit2 size={13} />
        </button>
      )}
      <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, display: 'flex', alignItems: 'center', padding: 4 }}>
        <Trash2 size={14} />
      </button>
    </div>
  </div>
);

const ListItem = EditableListItem;

// ─── ComboBox ───────────────────────────────────────────────────────────────
const ComboBox = ({ value, onChange, options, placeholder, hasError }: {
  value: string; onChange: (v: string) => void;
  options: string[]; placeholder?: string; hasError?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = options.filter(o => o.toLowerCase().includes(value.toLowerCase())).slice(0, 10);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          style={{ ...inputBase, border: `1px solid ${hasError ? C.danger : C.border}`, paddingRight: 36 }} />
        <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: C.textLight, pointerEvents: 'none' }} />
      </div>
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: `1px solid ${C.border}`, borderRadius: C.radiusSm, boxShadow: C.shadowMd, maxHeight: 220, overflowY: 'auto', marginTop: 4 }}>
          {filtered.map(opt => (
            <div key={opt} onMouseDown={() => { onChange(opt); setOpen(false); }}
              style={{ padding: '9px 14px', fontSize: 14, cursor: 'pointer', color: opt === value ? C.primary : C.text, background: opt === value ? C.primaryGhost : 'transparent', display: 'flex', alignItems: 'center', gap: 8 }}>
              {opt === value && <Check size={13} color={C.primary} />}
              {opt}
            </div>
          ))}
          {value.trim() && !options.includes(value.trim()) && (
            <div onMouseDown={() => setOpen(false)}
              style={{ padding: '9px 14px', fontSize: 13, color: C.primary, cursor: 'default', borderTop: `1px solid ${C.border}`, fontStyle: 'italic' }}>
              Using custom: "{value}"
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── AutoSuggestListField ───────────────────────────────────────────────────
const AutoSuggestListField = ({
  items, onAdd, onUpdate, onRemove,
  suggestions, placeholder,
}: {
  items: string[]; onAdd: (v: string) => void;
  onUpdate: (i: number, v: string) => void; onRemove: (i: number) => void;
  suggestions: string[]; placeholder: string;
}) => {
  const [input, setInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [dropRows, setDropRows] = useState<Array<{ text: string; ai: boolean }>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selIdx, setSelIdx] = useState(-1);
  const debRef = useRef<ReturnType<typeof setTimeout>>();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setIsOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleInput = (val: string) => {
    setInput(val); setSelIdx(-1);
    if (!val.trim()) { setIsOpen(false); setDropRows([]); return; }
    clearTimeout(debRef.current);
    setIsSearching(true); setIsOpen(true);
    debRef.current = setTimeout(() => {
      const db = suggestions
        .filter(s => s.toLowerCase().includes(val.toLowerCase()) && !items.includes(s))
        .slice(0, 5)
        .map(text => ({ text, ai: false }));
      const pool = suggestions.filter(s => !items.includes(s) && !db.find(d => d.text === s));
      const ai = pool.sort(() => Math.random() - 0.5).slice(0, 2).map(text => ({ text, ai: true }));
      setDropRows([...db, ...ai]);
      setIsSearching(false);
    }, 320);
  };

  const commit = (val: string) => {
    const t = val.trim(); if (!t || items.includes(t)) return;
    onAdd(t); setInput(''); setDropRows([]); setIsOpen(false); setSelIdx(-1);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(i => Math.min(i + 1, dropRows.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelIdx(i => Math.max(i - 1, -1)); return; }
    if (e.key === 'Escape') { setIsOpen(false); setSelIdx(-1); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(selIdx >= 0 && dropRows[selIdx] ? dropRows[selIdx].text : input);
    }
  };

  const hi = (text: string, q: string) => {
    if (!q.trim()) return <span>{text}</span>;
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i === -1) return <span>{text}</span>;
    return <span>{text.slice(0, i)}<mark style={{ background: '#fef08a', color: C.text, borderRadius: 2, padding: '0 1px' }}>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</span>;
  };

  const dbRows = dropRows.filter(r => !r.ai);
  const aiRows = dropRows.filter(r => r.ai);

  return (
    <div>
      {items.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: C.primaryGhost, border: `1px solid ${C.primary}20`, borderRadius: 8 }}>
                <span style={{ minWidth: 20, height: 20, borderRadius: '50%', background: C.primary, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                <input value={item} onChange={e => onUpdate(i, e.target.value)}
                  style={{ background: 'none', border: 'none', outline: 'none', fontSize: 13, color: C.text, flex: 1, fontFamily: 'inherit', padding: 0 }} />
              </div>
              <button onClick={() => onRemove(i)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 36, borderRadius: 8, border: 'none', background: `${C.danger}12`, color: C.danger, cursor: 'pointer', flexShrink: 0 }}>
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div ref={wrapRef} style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: isSearching ? C.primary : C.textLight, pointerEvents: 'none', transition: 'color .2s' }} />
            {isSearching && (
              <Loader2 size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: C.primary, animation: 'spin .6s linear infinite' }} />
            )}
            <input value={input} onChange={e => handleInput(e.target.value)}
              onFocus={() => { if (input.trim()) setIsOpen(true); }}
              onKeyDown={onKey}
              placeholder={placeholder}
              style={{ ...inputBase, paddingLeft: 34, paddingRight: isSearching ? 34 : 14, border: `1px solid ${isOpen ? C.primary : C.border}`, boxShadow: isOpen ? `0 0 0 3px ${C.primary}15` : 'none', transition: 'border-color .15s, box-shadow .15s' }} />
          </div>
          <button onClick={() => commit(input)} style={{ ...addBtnStyle, whiteSpace: 'nowrap', flexShrink: 0 }}>
            <Plus size={14} /> Add
          </button>
        </div>

        {isOpen && (
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 60, background: '#fff', border: `1px solid ${C.border}`, borderRadius: C.radius, boxShadow: C.shadowMd, overflow: 'hidden' }}>
            {isSearching ? (
              <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 8, color: C.textMuted, fontSize: 13 }}>
                <Loader2 size={14} style={{ color: C.primary, animation: 'spin .6s linear infinite' }} /> Searching…
              </div>
            ) : dropRows.length === 0 && input.trim() ? (
              <div style={{ padding: '11px 14px', fontSize: 13, color: C.textMuted }}>
                No matches — press <kbd style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '1px 6px', fontSize: 11 }}>Enter</kbd> to add "{input}" as custom
              </div>
            ) : (
              <>
                {dbRows.length > 0 && (
                  <>
                    <div style={{ padding: '5px 12px 3px', fontSize: 10, fontWeight: 700, color: C.textLight, letterSpacing: 0.9, textTransform: 'uppercase', background: C.bg }}>
                      Search results
                    </div>
                    {dbRows.map((row, idx) => (
                      <div key={row.text} onMouseDown={() => commit(row.text)}
                        style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', background: selIdx === idx ? C.primaryGhost : 'transparent', color: C.text, display: 'flex', alignItems: 'center', gap: 8, transition: 'background .1s' }}
                        onMouseOver={e => (e.currentTarget.style.background = C.primaryGhost)}
                        onMouseOut={e => (e.currentTarget.style.background = selIdx === idx ? C.primaryGhost : 'transparent')}>
                        <span style={{ fontSize: 12, color: C.textLight }}>↵</span>
                        {hi(row.text, input)}
                      </div>
                    ))}
                  </>
                )}
                {aiRows.length > 0 && (
                  <>
                    <div style={{ padding: '5px 12px 3px', fontSize: 10, fontWeight: 700, color: C.purple, letterSpacing: 0.9, textTransform: 'uppercase', background: `${C.purple}08`, display: 'flex', alignItems: 'center', gap: 4, borderTop: dbRows.length ? `1px solid ${C.border}` : 'none' }}>
                      <Sparkles size={10} /> AI Suggested
                    </div>
                    {aiRows.map((row, idx) => {
                      const absIdx = dbRows.length + idx;
                      return (
                        <div key={row.text} onMouseDown={() => commit(row.text)}
                          style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', background: selIdx === absIdx ? C.purpleGhost : 'transparent', color: C.text, display: 'flex', alignItems: 'center', gap: 8, transition: 'background .1s' }}
                          onMouseOver={e => (e.currentTarget.style.background = C.purpleGhost)}
                          onMouseOut={e => (e.currentTarget.style.background = selIdx === absIdx ? C.purpleGhost : 'transparent')}>
                          <Sparkles size={11} color={C.purple} />
                          {hi(row.text, input)}
                        </div>
                      );
                    })}
                  </>
                )}
                {input.trim() && !dropRows.find(r => r.text.toLowerCase() === input.trim().toLowerCase()) && (
                  <div style={{ padding: '8px 14px', fontSize: 12, color: C.textMuted, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={11} color={C.primary} />
                    Press <kbd style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '1px 5px', fontSize: 11, margin: '0 2px' }}>Enter</kbd> to add "<strong style={{ color: C.text }}>{input}</strong>" as custom
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Proficiency labels & picker ────────────────────────────────────────────
const PROF_LABELS = ['', 'Beginner', 'Basic', 'Intermediate', 'Advanced', 'Expert'];

const ProficiencyPicker = ({ value, onChange, color }: {
  value: number; onChange: (v: number) => void; color: string;
}) => (
  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
    {[1, 2, 3, 4, 5].map(n => (
      <button key={n} onClick={e => { e.stopPropagation(); onChange(n); }}
        title={PROF_LABELS[n]}
        style={{
          width: 16, height: 16, borderRadius: '50%', border: `2px solid ${n <= value ? color : `${color}40`}`,
          cursor: 'pointer', padding: 0, background: n <= value ? color : 'transparent',
          transition: 'all .15s',
        }} />
    ))}
    <span style={{ fontSize: 11, color, fontWeight: 500, marginLeft: 4 }}>{PROF_LABELS[value] || 'Intermediate'}</span>
  </div>
);

// ─── SkillInput ──────────────────────────────────────────────────────────────
const SkillInput = ({ skills, onAdd, onRemove, onUpdateProficiency, color, placeholder, suggestions = SKILLS_SUGGESTIONS }: {
  skills: Skill[];
  onAdd: (name: string) => void;
  onRemove: (i: number) => void;
  onUpdateProficiency?: (i: number, level: number) => void;
  color: string;
  placeholder: string;
  suggestions?: string[];
}) => {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [dropRows, setDropRows] = useState<Array<{ text: string; suggested: boolean }>>([]);
  const [selIdx, setSelIdx] = useState(-1);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const debRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleInput = (val: string) => {
    setInput(val); setSelIdx(-1);
    if (!val.trim()) { setOpen(false); setDropRows([]); return; }
    clearTimeout(debRef.current);
    setIsSearching(true); setOpen(true);
    debRef.current = setTimeout(() => {
      const matches = suggestions
        .filter(s => s.toLowerCase().includes(val.toLowerCase()) && !skills.find(sk => sk.name === s))
        .slice(0, 6)
        .map(text => ({ text, suggested: false }));
      const pool = suggestions.filter(s => !skills.find(sk => sk.name === s) && !matches.find(m => m.text === s));
      const suggested = pool.sort(() => Math.random() - 0.5).slice(0, 2).map(text => ({ text, suggested: true }));
      setDropRows([...matches, ...suggested]);
      setIsSearching(false);
    }, 250);
  };

  const add = (name: string) => {
    const t = name.trim();
    if (!t || skills.find(s => s.name === t)) return;
    onAdd(t); setInput(''); setDropRows([]); setOpen(false); setSelIdx(-1);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(i => Math.min(i + 1, dropRows.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelIdx(i => Math.max(i - 1, -1)); return; }
    if (e.key === 'Escape') { setOpen(false); setSelIdx(-1); return; }
    if (e.key === 'Enter') { e.preventDefault(); add(selIdx >= 0 && dropRows[selIdx] ? dropRows[selIdx].text : input); }
  };

  const hi = (text: string, q: string) => {
    if (!q.trim()) return <span>{text}</span>;
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i === -1) return <span>{text}</span>;
    return <span>{text.slice(0, i)}<mark style={{ background: '#fef08a', color: C.text, borderRadius: 2, padding: '0 1px' }}>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</span>;
  };

  const matchRows = dropRows.filter(r => !r.suggested);
  const suggestedRows = dropRows.filter(r => r.suggested);

  return (
    <div>
      {skills.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {skills.map((s, i) => (
            <div
              key={i}
              onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
              style={{
                display: 'inline-flex', flexDirection: 'column', gap: 6,
                padding: expandedIdx === i ? '10px 14px' : '6px 14px',
                borderRadius: expandedIdx === i ? 10 : 20,
                background: expandedIdx === i ? `${color}20` : `${color}15`,
                color,
                border: `1px solid ${expandedIdx === i ? color : `${color}30`}`,
                cursor: 'pointer',
                transition: 'all .15s',
                boxShadow: expandedIdx === i ? `0 0 0 3px ${color}18` : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</span>
                {expandedIdx !== i && s.proficiency_level !== undefined && s.proficiency_level > 0 && (
                  <span style={{ fontSize: 10, opacity: 0.65, fontWeight: 400 }}>
                    · {PROF_LABELS[s.proficiency_level] || 'Intermediate'}
                  </span>
                )}
                <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 2 }}>
                  {expandedIdx === i ? '▲' : '▼'}
                </span>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onRemove(i);
                    if (expandedIdx === i) setExpandedIdx(null);
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color, padding: 0, lineHeight: 1, fontSize: 16, opacity: 0.6, display: 'flex', alignItems: 'center', marginLeft: 2 }}
                >×</button>
              </div>
              {expandedIdx === i && onUpdateProficiency && (
                <div onClick={e => e.stopPropagation()} style={{ borderTop: `1px solid ${color}30`, paddingTop: 8 }}>
                  <p style={{ fontSize: 11, color, opacity: 0.7, marginBottom: 6, fontWeight: 500 }}>Proficiency level</p>
                  <ProficiencyPicker
                    value={s.proficiency_level || 3}
                    onChange={v => onUpdateProficiency(i, v)}
                    color={color}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {skills.length > 0 && (
        <p style={{ fontSize: 11, color: C.textLight, marginBottom: 8 }}>
          Click a skill to edit its proficiency level
        </p>
      )}

      <div ref={ref} style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: isSearching ? color : C.textLight, pointerEvents: 'none', transition: 'color .2s' }} />
            {isSearching && <Loader2 size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: C.primary, animation: 'spin .6s linear infinite' }} />}
            <input value={input}
              onChange={e => handleInput(e.target.value)}
              onFocus={() => { if (input.trim()) setOpen(true); }}
              onKeyDown={onKey}
              placeholder={placeholder}
              style={{ ...inputBase, paddingLeft: 34, border: `1px solid ${open ? color : C.border}`, boxShadow: open ? `0 0 0 3px ${color}18` : 'none', transition: 'border-color .15s, box-shadow .15s' }} />
          </div>
          <button onClick={() => add(input)} style={{ ...addBtnStyle, background: `${color}15`, color }}>
            <Plus size={14} /> Add
          </button>
        </div>

        {open && (
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 60, background: '#fff', border: `1px solid ${C.border}`, borderRadius: C.radius, boxShadow: C.shadowMd, overflow: 'hidden' }}>
            {isSearching ? (
              <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 8, color: C.textMuted, fontSize: 13 }}>
                <Loader2 size={14} style={{ color: C.primary, animation: 'spin .6s linear infinite' }} /> Searching…
              </div>
            ) : dropRows.length === 0 && input.trim() ? (
              <div style={{ padding: '11px 14px', fontSize: 13, color: C.textMuted }}>
                No matches — press <kbd style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '1px 6px', fontSize: 11 }}>Enter</kbd> to add "{input}"
              </div>
            ) : (
              <>
                {matchRows.length > 0 && (
                  <>
                    <div style={{ padding: '5px 12px 3px', fontSize: 10, fontWeight: 700, color: C.textLight, letterSpacing: 0.9, textTransform: 'uppercase', background: C.bg }}>Matches</div>
                    {matchRows.map((row, idx) => (
                      <div key={row.text} onMouseDown={() => add(row.text)}
                        style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', background: selIdx === idx ? `${color}12` : 'transparent', color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}
                        onMouseOver={e => (e.currentTarget.style.background = `${color}12`)}
                        onMouseOut={e => (e.currentTarget.style.background = selIdx === idx ? `${color}12` : 'transparent')}>
                        <Tag size={12} color={color} />
                        {hi(row.text, input)}
                      </div>
                    ))}
                  </>
                )}
                {suggestedRows.length > 0 && (
                  <>
                    <div style={{ padding: '5px 12px 3px', fontSize: 10, fontWeight: 700, color: C.purple, letterSpacing: 0.9, textTransform: 'uppercase', background: `${C.purple}08`, display: 'flex', alignItems: 'center', gap: 4, borderTop: matchRows.length ? `1px solid ${C.border}` : 'none' }}>
                      <Sparkles size={10} /> Suggested
                    </div>
                    {suggestedRows.map((row, idx) => {
                      const absIdx = matchRows.length + idx;
                      return (
                        <div key={row.text} onMouseDown={() => add(row.text)}
                          style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', background: selIdx === absIdx ? C.purpleGhost : 'transparent', color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}
                          onMouseOver={e => (e.currentTarget.style.background = C.purpleGhost)}
                          onMouseOut={e => (e.currentTarget.style.background = selIdx === absIdx ? C.purpleGhost : 'transparent')}>
                          <Sparkles size={11} color={C.purple} />
                          {hi(row.text, input)}
                        </div>
                      );
                    })}
                  </>
                )}
                {input.trim() && !dropRows.find(r => r.text.toLowerCase() === input.trim().toLowerCase()) && (
                  <div style={{ padding: '8px 14px', fontSize: 12, color: C.textMuted, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={11} color={color} />
                    Press <kbd style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '1px 5px', fontSize: 11, margin: '0 2px' }}>Enter</kbd> to add "<strong style={{ color: C.text }}>{input}</strong>"
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── YearPicker ─────────────────────────────────────────────────────────────
const YearPicker = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const [custom, setCustom] = useState(!EXPERIENCE_YEAR_OPTIONS.includes(value) && value !== '');

  return custom ? (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input type="number" value={value} onChange={e => onChange(e.target.value)}
        min="0" max="50" placeholder="e.g. 8"
        style={{ ...inputBase, width: 80, textAlign: 'center' }} />
      <button onClick={() => setCustom(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, fontSize: 12 }}>↩ List</button>
    </div>
  ) : (
    <select value={value} onChange={e => { if (e.target.value === '__custom__') setCustom(true); else onChange(e.target.value); }}
      style={{ ...inputBase, width: 'auto', minWidth: 100 }}>
      <option value="">Any</option>
      {EXPERIENCE_YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}{y === '20' ? '+' : ''} yr{y !== '1' ? 's' : ''}</option>)}
      <option value="__custom__">Custom…</option>
    </select>
  );
};

// ─── SalaryTypeSelector ─────────────────────────────────────────────────────
const SalaryTypeSelector = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const options = [
    { value: 'range', label: 'Range', icon: '↔' },
    { value: 'above', label: 'Above', icon: '↑' },
    { value: 'under', label: 'Under', icon: '↓' },
    { value: 'negotiable', label: 'Negotiable', icon: '~' },
  ];
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: `1.5px solid ${value === o.value ? C.primary : C.border}`, background: value === o.value ? C.primaryGhost : '#fff', color: value === o.value ? C.primary : C.textMuted, fontWeight: value === o.value ? 600 : 400, fontSize: 13, cursor: 'pointer', transition: 'all .15s' }}>
          <span style={{ display: 'block', fontSize: 16 }}>{o.icon}</span>
          {o.label}
        </button>
      ))}
    </div>
  );
};

// ─── TagSearchInput ─────────────────────────────────────────────────────────
const TagSearchInput = ({ tags, onAdd, onRemove, suggestions, placeholder, color = C.primary }: {
  tags: string[]; onAdd: (t: string) => void; onRemove: (t: string) => void;
  suggestions: string[]; placeholder: string; color?: string;
}) => {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [matches, setMatches] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const debRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleInput = (val: string) => {
    setInput(val);
    if (!val.trim()) { setOpen(false); setMatches([]); return; }
    clearTimeout(debRef.current);
    setIsSearching(true); setOpen(true);
    debRef.current = setTimeout(() => {
      setMatches(suggestions.filter(s => s.toLowerCase().includes(val.toLowerCase()) && !tags.includes(s)).slice(0, 8));
      setIsSearching(false);
    }, 200);
  };

  const add = (val: string) => {
    const t = val.trim();
    if (!t || tags.includes(t)) return;
    onAdd(t); setInput(''); setMatches([]); setOpen(false);
  };

  const quickAdd = suggestions.filter(s => !tags.includes(s)).slice(0, 6);

  return (
    <div>
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {tags.map(tag => (
            <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, background: `${color}12`, color, fontSize: 13, border: `1px solid ${color}25` }}>
              <GraduationCap size={11} /> {tag}
              <button onClick={() => onRemove(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color, padding: 0, lineHeight: 1, fontSize: 15 }}>×</button>
            </span>
          ))}
        </div>
      )}
      {tags.length === 0 && <p style={{ fontSize: 12, color: C.textLight, marginBottom: 8 }}>None added yet — search or pick below</p>}
      <div ref={ref} style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.textLight, pointerEvents: 'none' }} />
            {isSearching && <Loader2 size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: C.primary, animation: 'spin .6s linear infinite' }} />}
            <input value={input}
              onChange={e => handleInput(e.target.value)}
              onFocus={() => { if (input.trim()) setOpen(true); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(input); } if (e.key === 'Escape') setOpen(false); }}
              placeholder={placeholder}
              style={{ ...inputBase, paddingLeft: 34, border: `1px solid ${open ? color : C.border}`, boxShadow: open ? `0 0 0 3px ${color}18` : 'none', transition: 'border-color .15s, box-shadow .15s' }} />
          </div>
          <button onClick={() => add(input)} style={{ ...addBtnStyle, background: `${color}12`, color }}><Plus size={14} /></button>
        </div>
        {open && (
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60, background: '#fff', border: `1px solid ${C.border}`, borderRadius: C.radiusSm, boxShadow: C.shadowMd, overflow: 'hidden' }}>
            {isSearching ? (
              <div style={{ padding: '10px 14px', fontSize: 13, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={13} style={{ animation: 'spin .6s linear infinite', color: C.primary }} /> Searching…
              </div>
            ) : matches.length === 0 && input.trim() ? (
              <div style={{ padding: '10px 14px', fontSize: 13, color: C.textMuted }}>
                No matches — press <kbd style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, padding: '0 5px', fontSize: 11 }}>Enter</kbd> to add "{input}"
              </div>
            ) : (
              <>
                {matches.map(m => (
                  <div key={m} onMouseDown={() => add(m)}
                    style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                    onMouseOver={e => (e.currentTarget.style.background = `${color}10`)}
                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                    <GraduationCap size={12} color={color} /> {m}
                  </div>
                ))}
                {input.trim() && !matches.find(m => m.toLowerCase() === input.trim().toLowerCase()) && (
                  <div style={{ padding: '8px 14px', fontSize: 12, color: C.textMuted, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={11} color={color} /> Press <kbd style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 3, padding: '0 4px', fontSize: 11, margin: '0 2px' }}>Enter</kbd> to add "{input}"
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {quickAdd.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
          {quickAdd.map(s => (
            <button key={s} onClick={() => add(s)}
              style={{ padding: '2px 8px', borderRadius: 20, border: `1px dashed ${C.border}`, background: 'none', color: C.textMuted, fontSize: 11, cursor: 'pointer' }}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── AgeRequirementInput ─────────────────────────────────────────────────────
type AgeInputType = 'not_required' | 'above' | 'under' | 'range';

const AgeRequirementInput = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const parse = (v: string): { t: AgeInputType; a: string; b: string } => {
    if (!v || v === '' || /not/i.test(v)) return { t: 'not_required', a: '', b: '' };
    const clean = v.trim();
    if (clean.includes('-')) {
      const [lo, hi] = clean.split('-').map(s => s.replace(/\D/g, ''));
      return { t: 'range', a: lo || '', b: hi || '' };
    }
    if (clean.includes('+') || /^(above|over)/i.test(clean))
      return { t: 'above', a: clean.replace(/\D/g, ''), b: '' };
    if (/^(under|below)/i.test(clean))
      return { t: 'under', a: clean.replace(/\D/g, ''), b: '' };
    const num = clean.replace(/\D/g, '');
    return num ? { t: 'above', a: num, b: '' } : { t: 'not_required', a: '', b: '' };
  };

  const init = parse(value);
  const [type, setType] = useState<AgeInputType>(init.t);
  const [a, setA] = useState(init.a);
  const [b, setB] = useState(init.b);

  const emit = (t: AgeInputType, va: string, vb: string) => {
    if (t === 'not_required') onChange('Not required');
    else if (t === 'above' && va) onChange(`${va}+`);
    else if (t === 'under' && va) onChange(`Under ${va}`);
    else if (t === 'range' && va && vb) onChange(`${va}–${vb}`);
    else onChange('');
  };

  const typeOptions: { value: AgeInputType; label: string; icon: string }[] = [
    { value: 'not_required', label: 'Not required', icon: '—' },
    { value: 'above', label: 'Above / min', icon: '↑' },
    { value: 'under', label: 'Under / max', icon: '↓' },
    { value: 'range', label: 'Range', icon: '↔' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {typeOptions.map(o => (
          <button key={o.value} onClick={() => { setType(o.value); emit(o.value, a, b); }}
            style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: `1.5px solid ${type === o.value ? C.primary : C.border}`, background: type === o.value ? C.primaryGhost : '#fff', color: type === o.value ? C.primary : C.textMuted, fontWeight: type === o.value ? 600 : 400, fontSize: 12, cursor: 'pointer', transition: 'all .15s' }}>
            <span style={{ display: 'block', fontSize: 16, marginBottom: 2 }}>{o.icon}</span>
            {o.label}
          </button>
        ))}
      </div>
      {type === 'not_required' && (
        <div style={{ padding: '10px 14px', background: C.successGhost, borderRadius: 8, color: C.success, fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={14} /> No age requirement for this role
        </div>
      )}
      {type !== 'not_required' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {type === 'range' ? (
            <>
              <input type="number" value={a} onChange={e => { setA(e.target.value); emit('range', e.target.value, b); }}
                placeholder="Min (e.g. 25)" min="0" max="100"
                style={{ ...inputBase, width: 130, textAlign: 'center' }} />
              <span style={{ color: C.textMuted, fontWeight: 600, fontSize: 18 }}>–</span>
              <input type="number" value={b} onChange={e => { setB(e.target.value); emit('range', a, e.target.value); }}
                placeholder="Max (e.g. 40)" min="0" max="100"
                style={{ ...inputBase, width: 130, textAlign: 'center' }} />
            </>
          ) : (
            <input type="number" value={a} onChange={e => { setA(e.target.value); emit(type, e.target.value, b); }}
              placeholder={type === 'above' ? 'Min age (e.g. 18)' : 'Max age (e.g. 35)'}
              min="0" max="100"
              style={{ ...inputBase, width: 200 }} />
          )}
          {value && value !== '' && (
            <span style={{ fontSize: 13, color: C.success, fontWeight: 600, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
              <CheckCircle size={13} /> {value} years
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// ─── QualificationsSection ──────────────────────────────────────────────────
const QualificationsSection = ({ entries, onChange, degreeSuggestions = DEGREE_TYPES, fieldSuggestions = FIELDS_OF_STUDY }: {
  entries: QualificationEntry[];
  onChange: (entries: QualificationEntry[]) => void;
  degreeSuggestions?: string[];
  fieldSuggestions?: string[];
}) => {
  const addEntry = () => {
    const id = Date.now().toString();
    onChange([...entries, { id, degree: "Bachelor's Degree", fields: [] }]);
  };

  const removeEntry = (id: string) => onChange(entries.filter(e => e.id !== id));
  const updateDegree = (id: string, degree: string) => onChange(entries.map(e => e.id === id ? { ...e, degree } : e));
  const addField = (id: string, field: string) => {
    const t = field.trim(); if (!t) return;
    onChange(entries.map(e => e.id === id ? { ...e, fields: e.fields.includes(t) ? e.fields : [...e.fields, t] } : e));
  };
  const removeField = (id: string, field: string) =>
    onChange(entries.map(e => e.id === id ? { ...e, fields: e.fields.filter(f => f !== field) } : e));

  return (
    <div>
      {entries.map(entry => (
        <div key={entry.id} style={{ border: `1px solid ${C.border}`, borderRadius: C.radiusSm, padding: 16, marginBottom: 12, background: '#fff' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <Label>Degree Type</Label>
              <ComboBox value={entry.degree} onChange={v => updateDegree(entry.id, v)}
                options={degreeSuggestions} placeholder="e.g. Bachelor's Degree — type or select" />
            </div>
            <button onClick={() => removeEntry(entry.id)}
              style={{ marginTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 38, borderRadius: 8, border: 'none', background: `${C.danger}12`, color: C.danger, cursor: 'pointer', flexShrink: 0 }}>
              <Trash2 size={14} />
            </button>
          </div>
          <Label>Fields of Study</Label>
          <TagSearchInput
            tags={entry.fields}
            onAdd={field => addField(entry.id, field)}
            onRemove={field => removeField(entry.id, field)}
            suggestions={fieldSuggestions.filter(f => !entry.fields.includes(f))}
            placeholder="Search field (e.g. Computer Science)…"
            color={C.primary} />
        </div>
      ))}
      <button onClick={addEntry} style={{ ...addBtnStyle, marginTop: 4 }}>
        <GraduationCap size={14} /> Add Qualification
      </button>
    </div>
  );
};

// ─── Validation ─────────────────────────────────────────────────────────────
const validate = (data: JobFormData, step: number, isEditing = false): ValidationErrors => {
  const errors: ValidationErrors = {};
  if (step === 1) {
    if (!data.title.trim()) errors.title = 'Job title is required';
    else if (data.title.trim().length < 3) errors.title = 'Title must be at least 3 characters';
    else if (data.title.trim().length > 100) errors.title = 'Title must be 100 characters or less';
    if (!data.description.trim()) errors.description = 'Job description is required';
    else if (data.description.trim().length < 30) errors.description = 'Description must be at least 30 characters';
    const validLocs = data.locations.filter(l => l.trim());
    if (validLocs.length === 0) errors.locations = 'At least one location is required';
  }
  if (step === 2) {
    const st = data.salaryType;
    if (st === 'range') {
      if (data.salaryMin) {
        const min = parseFloat(data.salaryMin);
        if (isNaN(min)) errors.salaryMin = 'Enter a valid number';
        else if (min < 0) errors.salaryMin = 'Salary must be 0 or greater';
      }
      if (data.salaryMax) {
        const max = parseFloat(data.salaryMax);
        if (isNaN(max)) errors.salaryMax = 'Enter a valid number';
        else if (max < 0) errors.salaryMax = 'Salary must be 0 or greater';
      }
      if (data.salaryMin && data.salaryMax) {
        const min = parseFloat(data.salaryMin), max = parseFloat(data.salaryMax);
        if (!isNaN(min) && !isNaN(max) && min > max) errors.salaryMax = 'Max salary must be ≥ min salary';
      }
    } else if (st === 'above' || st === 'under') {
      if (!data.salaryMin.trim()) errors.salaryMin = 'Salary amount is required';
      else {
        const v = parseFloat(data.salaryMin);
        if (isNaN(v)) errors.salaryMin = 'Enter a valid amount';
        else if (v < 0) errors.salaryMin = 'Salary must be 0 or greater';
      }
    }
  }
  if (step === 3) {
    if (data.requiredSkills.length === 0) errors.requiredSkills = 'Add at least one required skill';
  }
  if (step === 5) {
    if (data.applicationLimit && (isNaN(parseInt(data.applicationLimit)) || parseInt(data.applicationLimit) < 1))
      errors.applicationLimit = 'Application limit must be a positive number';
    const today = new Date().toISOString().split('T')[0];
    if (!data.publishedAt) {
      errors.publishedAt = 'Publish date is required';
    } else if (!isEditing && data.publishedAt < today) {
      errors.publishedAt = 'Publish date cannot be in the past';
    }
    if (!data.expiresAt) {
      errors.expiresAt = 'Expiry date is required';
    } else if (!isEditing && data.expiresAt <= today) {
      errors.expiresAt = 'Expiry date must be in the future';
    } else if (data.publishedAt && data.expiresAt <= data.publishedAt) {
      errors.expiresAt = 'Expiry date must be after the publish date';
    }
    const emptyQuestion = data.screeningQuestions.some(q => !q.question.trim());
    if (emptyQuestion) errors.screeningQuestions = 'All screening questions must have text';
  }
  return errors;
};

const validateAll = (data: JobFormData, isEditing = false): ValidationErrors => ({
  ...validate(data, 1, isEditing),
  ...validate(data, 2, isEditing),
  ...validate(data, 3, isEditing),
  ...validate(data, 5, isEditing),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getCompanyId = (user: any): string | null => {
  let id = localStorage.getItem('companyId');
  if (!id) {
    try { const u = JSON.parse(localStorage.getItem('user') || '{}'); id = u?.companyId || u?.company?.id || null; } catch { }
  }
  if (!id && user) id = user?.companyId || user?.company?.id || null;
  if (!id) {
    try { const c = JSON.parse(localStorage.getItem('company') || '{}'); id = c?.id || null; } catch { }
  }
  if (id) localStorage.setItem('companyId', id);
  return id;
};

const parseJsonField = (v: any, fallback: any = null) => {
  if (typeof v !== 'string') return v ?? fallback;
  try { return JSON.parse(v); } catch { return fallback; }
};

const toArray = (value: any): any[] => {
  const parsed = parseJsonField(value, value);
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === 'object') return [parsed];
  return String(parsed).trim() ? [parsed] : [];
};

const cleanList = (values: any[] = []) =>
  [...new Set(values.map(v => String(v ?? '').trim()).filter(Boolean))];

const looksLikeCombinedQualification = (value: string) =>
  /\s+in\s+/i.test(value) || /\s+or\s+/i.test(value) || value.includes(';') || value.length > 60;

const normalizeDegreeSuggestions = (values: any[] = []) =>
  cleanList(values)
    .map(value => value.replace(/\s+in\s+.+$/i, '').trim())
    .filter(value => value && !looksLikeCombinedQualification(value));

const normalizeFieldSuggestions = (values: any[] = []) =>
  cleanList(values)
    .flatMap(value => value.split(/\s+or\s+|,|;/i).map((v: string) => v.trim()))
    .filter((value: string) => value && !/\bdegree\b/i.test(value));

const normalizeQualificationEntries = (raw: any, fallbackDegree?: string): QualificationEntry[] => {
  const entries = toArray(raw).map((entry: any, i: number) => {
    if (!entry || typeof entry !== 'object') return null;
    const degree = String(entry.degree || entry.minimum_degree || '').replace(/\s+in\s+.+$/i, '').trim();
    const fields = cleanList(toArray(entry.fields || entry.fields_of_study || entry.field_of_study));
    if (!degree && fields.length === 0) return null;
    return { id: entry.id ? String(entry.id) : String(Date.now() + i), degree: degree || "Bachelor's Degree", fields };
  }).filter(Boolean) as QualificationEntry[];
  if (entries.length > 0) return entries;
  const fields = cleanList(toArray(raw?.fields_of_study || raw?.field_of_study));
  const degree = String(fallbackDegree || raw?.minimum_degree || '').replace(/\s+in\s+.+$/i, '').trim();
  if (degree || fields.length > 0) {
    return [{ id: String(Date.now()), degree: degree || "Bachelor's Degree", fields }];
  }
  return [];
};

// ─── Sub-layout components ───────────────────────────────────────────────────
const FormSection = ({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
      {icon && <div style={{ width: 32, height: 32, borderRadius: 8, background: C.primaryGhost, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>}
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>{title}</h2>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>{children}</div>
  </div>
);

const FormRow = ({ children, cols = '1fr 1fr' }: { children: React.ReactNode; cols?: string }) => (
  <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 16 }}>{children}</div>
);

const FormField = ({ label, required, error, hint, children }: {
  label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode;
}) => (
  <div>
    <Label required={required}>{label}</Label>
    {children}
    {hint && !error && <p style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{hint}</p>}
    <FieldError msg={error} />
  </div>
);

const AddMoreBtn = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: C.primary, fontSize: 13, fontWeight: 500, padding: '4px 0' }}>
    <Plus size={13} /> {label}
  </button>
);

const previewLabel: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: C.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 };
const previewValue: React.CSSProperties = { fontSize: 14, color: C.text, fontWeight: 500 };

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const JobPostingScreen: React.FC<{ onBack: () => void; jobId?: string; isEditing?: boolean }> = ({
  onBack, jobId, isEditing = false,
}) => {
  const { user } = useAuth();

  const allowed = ['company_admin', 'recruiter'];
  if (!allowed.includes((user as any)?.userType?.toLowerCase() ?? '')) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, fontFamily: font }}>
        <div style={{ textAlign: 'center', maxWidth: 360, padding: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.dangerGhost, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <AlertCircle size={28} color={C.danger} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 8 }}>Access Denied</h2>
          <p style={{ color: C.textMuted, marginBottom: 24 }}>You don't have permission to manage job postings.</p>
          <button onClick={onBack} style={primaryBtnStyle}>Go Back</button>
        </div>
      </div>
    );
  }

  const [formData, setFormData] = useState<JobFormData>(DEFAULT_FORM_DATA);
  const [currentStep, setCurrentStep] = useState(1);
  const [isPreview, setIsPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(isEditing);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState(false);

  const [newLang, setNewLang] = useState({ name: '', proficiency: 'professional' as Language['proficiency'], is_required: false });
  const [editingLangIdx, setEditingLangIdx] = useState<number | null>(null);

  const [newExp, setNewExp] = useState<{ title: string; years: string; description: string }>({ title: '', years: '', description: '' });
  const [editingExpIdx, setEditingExpIdx] = useState<number | null>(null);

  const [newCert, setNewCert] = useState({ name: '', issuer: '' });
  const [editingCertIdx, setEditingCertIdx] = useState<number | null>(null);

  const [newDoc, setNewDoc] = useState({ name: '', is_required: true });
  const [editingDocIdx, setEditingDocIdx] = useState<number | null>(null);

  const [tagInput, setTagInput] = useState('');

  const [liveSkills, setLiveSkills] = useState<string[]>(SKILLS_SUGGESTIONS);
  const [liveResponsibilities, setLiveResponsibilities] = useState<string[]>(RESPONSIBILITIES_SUGGESTIONS);
  const [liveRequirements, setLiveRequirements] = useState<string[]>(REQUIREMENTS_SUGGESTIONS);
  const [liveBenefits, setLiveBenefits] = useState<string[]>(BENEFITS_SUGGESTIONS);
  const [liveDegreeTypes, setLiveDegreeTypes] = useState<string[]>(DEGREE_TYPES);
  const [liveFieldsOfStudy, setLiveFieldsOfStudy] = useState<string[]>(FIELDS_OF_STUDY);

  useEffect(() => {
    getSuggestions().then(data => {
      if (!data) return;
      const merge = (live: string[], fallback: string[]) => cleanList([...(live || []), ...fallback]);
      setLiveSkills(merge(data.skills, SKILLS_SUGGESTIONS));
      setLiveResponsibilities(merge(data.responsibilities, RESPONSIBILITIES_SUGGESTIONS));
      setLiveRequirements(merge(data.requirements, REQUIREMENTS_SUGGESTIONS));
      setLiveBenefits(merge(data.benefits, BENEFITS_SUGGESTIONS));
      setLiveDegreeTypes(normalizeDegreeSuggestions([...(data.degreeTypes || []), ...DEGREE_TYPES]));
      setLiveFieldsOfStudy(normalizeFieldSuggestions([...(data.fieldsOfStudy || []), ...FIELDS_OF_STUDY]));
    });
  }, []);

  useEffect(() => { if (isEditing && jobId) loadJob(); }, [isEditing, jobId]);

  const update = useCallback((field: keyof JobFormData, value: any) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      if (touched) setErrors(validate(next, currentStep, isEditing));
      return next;
    });
  }, [touched, currentStep, isEditing]);

  const updateArr = (field: keyof JobFormData, idx: number, value: any) =>
    setFormData(prev => ({ ...prev, [field]: (prev[field] as any[]).map((item, i) => i === idx ? value : item) }));

  const addArr = (field: keyof JobFormData, value: any = '') =>
    setFormData(prev => ({ ...prev, [field]: [...(prev[field] as any[]), value] }));

  const removeArr = (field: keyof JobFormData, idx: number) =>
    setFormData(prev => ({ ...prev, [field]: (prev[field] as any[]).filter((_, i) => i !== idx) }));

  const addSkill = (name: string, required: boolean) => {
    if (!name.trim()) return;
    const skill: Skill = { name: name.trim(), proficiency_level: 3 };
    const field = required ? 'requiredSkills' : 'preferredSkills';
    const existing = formData[field] as Skill[];
    if (!existing.find(s => s.name === name.trim())) update(field, [...existing, skill]);
  };

  const updateSkillProficiency = (idx: number, level: number, required: boolean) => {
    const field = required ? 'requiredSkills' : 'preferredSkills';
    const skills = [...(formData[field] as Skill[])];
    skills[idx] = { ...skills[idx], proficiency_level: level };
    update(field, skills);
  };

  // ── FREE NAVIGATION — validate for warnings only, never block ──────────────
  const goToStep = (step: number) => {
    setTouched(true);
    setErrors(validate(formData, currentStep, isEditing));
    setCurrentStep(step);
    // Scroll form content back to top
    window.scrollTo({ top: 120, behavior: 'smooth' });
  };

  const goNext = () => goToStep(Math.min(STEPS.length, currentStep + 1));
  const goPrev = () => goToStep(Math.max(1, currentStep - 1));

  // ─── loadJob ──────────────────────────────────────────────────────────────
  const loadJob = async () => {
    try {
      setPageLoading(true);
      const { data: job } = await getJob(jobId!);
      const edObj: any = parseJsonField(job.education_required ?? job.educationLevel, {});

      let qualificationEntries: QualificationEntry[] = [];
      if (edObj.qualification_entries && Array.isArray(edObj.qualification_entries) && edObj.qualification_entries.length > 0) {
        qualificationEntries = edObj.qualification_entries.map((entry: any, i: number) => ({
          id: entry.id ? String(entry.id) : String(Date.now() + i),
          degree: entry.degree || '',
          fields: entry.fields_of_study || entry.fields || [],
        }));
      } else if (edObj.minimum_degree && edObj.minimum_degree.trim()) {
        const degreeText = edObj.minimum_degree;
        if (degreeText.includes(' in ')) {
          const [degree, fieldsPart] = degreeText.split(' in ');
          const fields = fieldsPart.split(/\s+or\s+|,|;/).map((f: string) => f.trim());
          qualificationEntries = [{ id: String(Date.now()), degree: degree.trim(), fields }];
        } else {
          qualificationEntries = [{ id: String(Date.now()), degree: edObj.minimum_degree, fields: [] }];
        }
      }

      let experienceRequirements: ExperienceRequirement[] = [];
      const expFromEd = edObj.experience_requirements;
      const expFromTopSnake = job.experience_requirements;
      const expFromTopCamel = job.experienceRequirements;
      const expSource =
        Array.isArray(expFromEd) && expFromEd.length > 0 ? expFromEd
          : Array.isArray(expFromTopSnake) && expFromTopSnake.length > 0 ? expFromTopSnake
            : Array.isArray(expFromTopCamel) && expFromTopCamel.length > 0 ? expFromTopCamel
              : [];

      experienceRequirements = expSource
        .map((e: any, i: number) => ({
          id: e.id ? String(e.id) : `${Date.now()}-${i}`,
          title: e.title || e.field || '',
          years: String(e.years || e.min_years || ''),
          description: e.description || '',
        }))
        .filter((e: ExperienceRequirement) => Boolean(e.title));

      const locations: string[] = Array.isArray(job.locations)
        ? job.locations.map((l: any) => typeof l === 'string' ? l : l.is_remote ? 'Remote' : `${l.city || ''}, ${l.country || ''}`.trim().replace(/^,|,$/g, ''))
        : [''];

      const hasSalaryMin = job.salary_min != null;
      const hasSalaryMax = job.salary_max != null;
      let salaryType: 'range' | 'above' | 'under' | 'negotiable' = 'range';
      if (!hasSalaryMin && !hasSalaryMax) salaryType = 'negotiable';
      else if (hasSalaryMin && !hasSalaryMax) salaryType = 'above';
      else if (!hasSalaryMin && hasSalaryMax) salaryType = 'under';
      else salaryType = 'range';

      setFormData({
        title: job.title || '',
        department: job.department || '',
        jobType: job.job_type || 'full-time',
        workArrangement: job.work_arrangement || 'onsite',
        locations: locations.length ? locations : [''],
        description: job.description || '',
        responsibilities: toArray(job.responsibilities),
        requirements: Array.isArray(job.requirements) ? job.requirements : toArray(job.requirements?.required ?? job.requirements),
        qualifications: job.qualifications || edObj.minimum_degree || '',
        qualificationEntries,
        salaryType,
        salaryMin: job.salary_min ? String(job.salary_min) : '',
        salaryMax: job.salary_max ? String(job.salary_max) : '',
        salaryCurrency: job.salary_currency || 'Rwf',
        salaryPeriod: job.salary_period || 'month',
        salaryVisible: job.salary_visible !== false,
        benefits: toArray(job.benefits),
        requiredSkills: toArray(job.skills_required),
        preferredSkills: toArray(job.skills_preferred),
        experienceLevel: job.experience_level || 'mid',
        experienceRequirements,
        languages: toArray(edObj.languages ?? job.language_requirements).map((l: any, i: number) => ({
          id: l.id ? String(l.id) : String(Date.now() + i),
          name: typeof l === 'string' ? l : l.name || '',
          proficiency: (l.proficiency || 'professional') as Language['proficiency'],
          is_required: Boolean(l.is_required),
        })).filter((l): l is Language => Boolean(l.name)),
        certifications: toArray(edObj.certifications).map((c: any, i: number) => ({
          id: c.id ? String(c.id) : String(Date.now() + i),
          name: typeof c === 'string' ? c : c.name || '',
          issuer: typeof c === 'string' ? '' : c.issuer || '',
        })),
        requiredDocuments: toArray(job.documents).map((d: any, i: number) => ({
          id: d.id ? String(d.id) : String(Date.now() + i),
          name: typeof d === 'string' ? d : d.name || '',
          is_required: d.is_required !== false,
        })),
        ageRequirement: edObj.age_requirement || '',
        screeningQuestions: toArray(job.screening_questions),
        applicationInstructions: (() => {
          const r = job.application_instructions;
          if (!r) return '';
          if (typeof r === 'string') { try { return JSON.parse(r).instructions || r; } catch { return r; } }
          return r.instructions || '';
        })(),
        publishedAt: job.published_at ? new Date(job.published_at).toISOString().split('T')[0] : DEFAULT_FORM_DATA.publishedAt,
        expiresAt: job.expires_at ? new Date(job.expires_at).toISOString().split('T')[0] : DEFAULT_FORM_DATA.expiresAt,
        visibility: job.visibility || 'public',
        applicationLimit: job.application_limit?.toString() || '100000',
        tags: job.tags || [],
        noExperienceNeeded: edObj.no_experience_needed || false,
        noCertificationsNeeded: edObj.no_certifications_needed || false,
        noLanguagesNeeded: edObj.no_languages_needed || false,
        noDocumentsNeeded: edObj.no_documents_needed || false,
        aiMatchRequiredScore: job.ai_match_required_score ?? 70,
      });
    } catch (err) {
      console.error('Failed to load job:', err);
      alert('Failed to load job. Please try again.');
      onBack();
    } finally {
      setPageLoading(false);
    }
  };

  const handleSave = async (action: 'draft' | 'publish') => {
    setEditingExpIdx(null);
    setEditingLangIdx(null);
    setEditingCertIdx(null);
    setEditingDocIdx(null);

    let finalFormData = { ...formData };

    if (newExp.title.trim()) {
      finalFormData = {
        ...finalFormData,
        experienceRequirements: [
          ...finalFormData.experienceRequirements,
          { id: `${Date.now()}-auto`, title: newExp.title, years: newExp.years, description: newExp.description || '' },
        ],
        noExperienceNeeded: false,
      };
      setFormData(finalFormData);
      setNewExp({ title: '', years: '', description: '' });
    }

    if (newCert.name.trim()) {
      finalFormData = {
        ...finalFormData,
        certifications: [
          ...finalFormData.certifications,
          { id: `${Date.now()}-cert`, name: newCert.name, issuer: newCert.issuer || '' },
        ],
        noCertificationsNeeded: false,
      };
      setFormData(finalFormData);
      setNewCert({ name: '', issuer: '' });
    }

    if (newDoc.name.trim()) {
      finalFormData = {
        ...finalFormData,
        requiredDocuments: [
          ...finalFormData.requiredDocuments,
          { id: `${Date.now()}-doc`, name: newDoc.name, is_required: newDoc.is_required },
        ],
        noDocumentsNeeded: false,
      };
      setFormData(finalFormData);
      setNewDoc({ name: '', is_required: true });
    }

    if (newLang.name.trim()) {
      finalFormData = {
        ...finalFormData,
        languages: [
          ...finalFormData.languages,
          { id: `${Date.now()}-lang`, name: newLang.name, proficiency: newLang.proficiency, is_required: newLang.is_required },
        ],
        noLanguagesNeeded: false,
      };
      setFormData(finalFormData);
      setNewLang({ name: '', proficiency: 'professional', is_required: false });
    }

    setTouched(true);
    const allErrors = validateAll(finalFormData, isEditing);
    setErrors(allErrors);

    if (Object.keys(allErrors).length > 0) {
      const stepMap: any = {
        title: 1, description: 1, locations: 1,
        salaryMin: 2, salaryMax: 2, salaryCurrency: 2,
        requiredSkills: 3,
        screeningQuestions: 5, publishedAt: 5, expiresAt: 5, applicationLimit: 5,
      };
      const firstErrStep = Math.min(...(Object.keys(allErrors) as string[]).map(k => stepMap[k] || 1));
      setCurrentStep(firstErrStep);
      setIsPreview(false);
      return;
    }

    const companyId = getCompanyId(user);
    if (!companyId) {
      alert('Company info not found. Please log out and log in again.');
      return;
    }

    try {
      setLoading(true);

      const locations: LocationObject[] = [...new Set(finalFormData.locations.filter(l => l.trim()))]
        .map(l => {
          if (l.toLowerCase().includes('remote')) return { city: '', country: '', is_remote: true };
          const [city = '', country = 'Rwanda'] = l.split(',').map(p => p.trim());
          return { city, country, is_remote: false };
        });

      let qualificationEntries: Array<{ degree: string; fields_of_study: string[] }> = [];
      if (finalFormData.qualificationEntries && finalFormData.qualificationEntries.length > 0) {
        qualificationEntries = finalFormData.qualificationEntries.map(entry => ({
          degree: entry.degree,
          fields_of_study: entry.fields && entry.fields.length > 0 ? entry.fields : [],
        }));
      } else if (finalFormData.qualifications && finalFormData.qualifications.trim()) {
        qualificationEntries = [{ degree: finalFormData.qualifications, fields_of_study: [] }];
      }

      const experienceRequirements: Omit<ExperienceRequirement, 'id'>[] =
        !finalFormData.noExperienceNeeded && finalFormData.experienceRequirements.length > 0
          ? finalFormData.experienceRequirements.map(exp => ({
            title: exp.title,
            years: exp.years,
            description: exp.description || '',
          }))
          : [];

      const educationLevel = {
        minimum_degree: finalFormData.qualifications?.trim() || null,
        qualification_entries: qualificationEntries,
        certifications: finalFormData.certifications.map(c => c.name),
        languages: finalFormData.languages.map(l => ({
          name: l.name,
          proficiency: l.proficiency,
          is_required: l.is_required
        })),
        experience_requirements: experienceRequirements,
        age_requirement: finalFormData.ageRequirement,
        no_experience_needed: finalFormData.noExperienceNeeded,
        no_languages_needed: finalFormData.noLanguagesNeeded,
        no_certifications_needed: finalFormData.noCertificationsNeeded,
        no_documents_needed: finalFormData.noDocumentsNeeded,
      };

      const salaryPayload = (() => {
        if (finalFormData.salaryType === 'negotiable') return { salaryMin: null, salaryMax: null };
        if (finalFormData.salaryType === 'above') return { salaryMin: finalFormData.salaryMin ? parseFloat(finalFormData.salaryMin) : null, salaryMax: null };
        if (finalFormData.salaryType === 'under') return { salaryMin: null, salaryMax: finalFormData.salaryMin ? parseFloat(finalFormData.salaryMin) : null };
        return {
          salaryMin: finalFormData.salaryMin ? parseFloat(finalFormData.salaryMin) : null,
          salaryMax: finalFormData.salaryMax ? parseFloat(finalFormData.salaryMax) : null
        };
      })();

      const qualificationsText = finalFormData.qualifications?.trim() ||
        (finalFormData.qualificationEntries.length > 0
          ? finalFormData.qualificationEntries.map(e =>
            e.fields.length > 0
              ? `${e.degree} in ${e.fields.join(' or ')}`
              : e.degree
          ).join('; ')
          : null);

      const jobData = {
        title: finalFormData.title,
        department: finalFormData.department || null,
        jobType: finalFormData.jobType,
        workArrangement: finalFormData.workArrangement,
        locations,
        description: finalFormData.description,
        responsibilities: finalFormData.responsibilities.filter(r => r.trim()),
        requirements: finalFormData.requirements.filter(r => r.trim()),
        qualifications: qualificationsText,
        benefits: finalFormData.benefits.filter(b => b.trim()),
        tags: finalFormData.tags.filter(t => t.trim()),
        requiredSkills: finalFormData.requiredSkills.map(s => ({
          name: s.name,
          proficiency_level: s.proficiency_level || 3,
          is_required: true
        })),
        preferredSkills: finalFormData.preferredSkills.map(s => ({
          name: s.name,
          proficiency_level: s.proficiency_level || 3,
          is_required: false
        })),
        experienceLevel: finalFormData.experienceLevel,
        educationLevel,
        languageRequirements: finalFormData.languages.map(l => ({
          name: l.name,
          proficiency: l.proficiency,
          is_required: l.is_required
        })),
        experienceRequirements,
        ...salaryPayload,
        salaryCurrency: finalFormData.salaryCurrency,
        salaryPeriod: finalFormData.salaryPeriod,
        salaryVisible: finalFormData.salaryVisible,
        screeningQuestions: finalFormData.screeningQuestions,
        applicationInstructions: finalFormData.applicationInstructions || null,
        requiredDocuments: finalFormData.requiredDocuments.map(d => ({
          name: d.name,
          is_required: d.is_required
        })),
        applicationLimit: finalFormData.applicationLimit ? parseInt(finalFormData.applicationLimit) : null,
        visibility: finalFormData.visibility,
        status: action === 'publish' ? 'active' : 'draft',
        publishedAt: new Date(finalFormData.publishedAt).toISOString(),
        expiresAt: new Date(finalFormData.expiresAt).toISOString(),
        aiMatchRequiredScore: finalFormData.aiMatchRequiredScore || 70,
      };

      console.log('📤 Sending job data:', {
        certifications: jobData.educationLevel.certifications,
        requiredDocuments: jobData.requiredDocuments,
        languages: jobData.languageRequirements,
        qualifications: jobData.qualifications
      });

      if (isEditing && jobId) {
        await updateJob(jobId, jobData);
        alert('Job updated successfully!');
      } else {
        await createJob(jobData);
        alert('Job created successfully!');
      }
      onBack();
    } catch (err: any) {
      console.error('Save error:', err);
      alert(err?.response?.data?.message || 'Failed to save job. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setLoading(true);
      await deleteJob(jobId!);
      alert('Job deleted.');
      onBack();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to delete job.');
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  if (pageLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, fontFamily: font }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: `3px solid ${C.border}`, borderTopColor: C.primary, animation: 'spin .8s linear infinite', margin: '0 auto 12px' }} />
        <p style={{ color: C.textMuted, fontSize: 14 }}>Loading job…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: font }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Top bar (sticky) ── */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: '0 32px', height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100, boxShadow: C.shadow,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'none', cursor: 'pointer', fontSize: 13, color: C.textMuted }}>
            <ArrowLeft size={15} /> Back
          </button>
          <div style={{ width: 1, height: 20, background: C.border }} />
          <h1 style={{ fontSize: 17, fontWeight: 700, color: C.text }}>
            {isPreview ? 'Preview Job Posting' : isEditing ? 'Edit Job Posting' : 'New Job Posting'}
          </h1>
          {!isPreview && (
            <span style={{ fontSize: 12, color: C.textMuted, background: C.bg, padding: '3px 10px', borderRadius: 20, border: `1px solid ${C.border}` }}>
              Step {currentStep} of {STEPS.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {!isPreview ? (
            <>
              {isEditing && jobId && <button onClick={() => setShowDeleteConfirm(true)} style={dangerGhostBtnStyle}><Trash2 size={14} /> Delete</button>}
              <button onClick={() => setIsPreview(true)} style={ghostBtnStyle}><Eye size={14} /> Preview</button>
              <button onClick={() => handleSave('draft')} disabled={loading} style={ghostBtnStyle}><Save size={14} /> Save Draft</button>
              <button onClick={() => handleSave('publish')} disabled={loading} style={primaryBtnStyle}>
                {loading ? <Loader2 size={14} style={{ animation: 'spin .8s linear infinite' }} /> : null}
                {loading ? 'Saving…' : isEditing ? 'Update Job' : 'Publish Job'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setIsPreview(false)} style={ghostBtnStyle}><ChevronLeft size={14} /> Edit</button>
              <button onClick={() => handleSave('publish')} disabled={loading} style={primaryBtnStyle}>
                {loading ? 'Publishing…' : 'Publish Job'}
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 24px 120px 24px' }}>
        {!isPreview ? (
          <>
            {/* ── Step tabs — STICKY below top bar ── */}
            <div style={{
              position: 'sticky',
              top: 64,
              zIndex: 90,
              background: C.bg,
              paddingTop: 12,
              paddingBottom: 12,
              marginBottom: 4,
            }}>
              <div style={{
                display: 'flex', gap: 0,
                background: C.surface, borderRadius: C.radius,
                border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: C.shadow,
              }}>
                {STEPS.map((step, i) => {
                  const active = currentStep === step.id;
                  const done = currentStep > step.id;
                  const hasStepError = touched && Object.keys(errors).some(k => {
                    const stepMap: any = {
                      title: 1, description: 1, locations: 1,
                      salaryMin: 2, salaryMax: 2,
                      requiredSkills: 3,
                      screeningQuestions: 5, publishedAt: 5, expiresAt: 5, applicationLimit: 5,
                    };
                    return stepMap[k] === step.id;
                  });
                  return (
                    <button
                      key={step.id}
                      onClick={() => goToStep(step.id)}
                      style={{
                        flex: 1, padding: '13px 6px', border: 'none',
                        background: active ? C.primary : done ? C.primaryGhost : 'transparent',
                        color: active ? '#fff' : done ? C.primary : C.textMuted,
                        cursor: 'pointer',
                        fontSize: 12, fontWeight: 600,
                        borderRight: i < STEPS.length - 1 ? `1px solid ${C.border}` : 'none',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        transition: 'all .15s',
                        position: 'relative',
                      }}
                    >
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%', fontSize: 11,
                        background: active ? 'rgba(255,255,255,.25)' : done ? C.primary : C.border,
                        color: done || active ? '#fff' : C.textMuted,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
                      }}>
                        {done ? <Check size={12} /> : step.id}
                      </span>
                      {step.shortTitle}
                      {/* Red dot indicator if this step has errors */}
                      {hasStepError && !active && (
                        <span style={{
                          position: 'absolute', top: 6, right: 8,
                          width: 7, height: 7, borderRadius: '50%',
                          background: C.danger, border: '1.5px solid #fff',
                        }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Error warning banner */}
            {touched && hasErrors && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: C.dangerGhost, border: `1px solid ${C.danger}30`, borderRadius: 10, marginBottom: 16 }}>
                <AlertCircle size={16} color={C.danger} />
                <span style={{ fontSize: 13, color: C.danger, fontWeight: 500 }}>
                  Some fields need attention — you can still navigate freely, but fix them before publishing.
                </span>
              </div>
            )}

            {/* Form card — extra bottom padding so sticky nav doesn't overlap content */}
            <div style={{ background: C.surface, borderRadius: C.radius, border: `1px solid ${C.border}`, boxShadow: C.shadow, padding: 32, paddingBottom: 40 }}>

              {/* ── STEP 1 ── */}
              {currentStep === 1 && (
                <FormSection title="Job Information" icon={<Briefcase size={16} color={C.primary} />}>
                  <FormRow>
                    <FormField label="Job Title" required error={errors.title}>
                      <Input value={formData.title} onChange={v => update('title', v)}
                        placeholder="e.g. Senior Full Stack Developer" hasError={!!errors.title} />
                    </FormField>
                    <FormField label="Department" hint="Select from list or type a custom department">
                      <ComboBox value={formData.department} onChange={v => update('department', v)}
                        options={DEPARTMENTS} placeholder="e.g. Engineering" />
                    </FormField>
                  </FormRow>

                  <FormRow>
                    <FormField label="Job Type">
                      <Sel value={formData.jobType} onChange={v => update('jobType', v)}>
                        {Object.entries(JOB_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </Sel>
                    </FormField>
                    <FormField label="Work Arrangement">
                      <Sel value={formData.workArrangement} onChange={v => update('workArrangement', v)}>
                        {Object.entries(WORK_ARRANGEMENT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </Sel>
                    </FormField>
                  </FormRow>

                  <FormField label="Locations" required error={errors.locations} hint={`Add one or more locations. Type "Remote" for remote positions.`}>
                    {formData.locations.map((loc, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <input value={loc} onChange={e => updateArr('locations', i, e.target.value)}
                          placeholder={`e.g. "Kigali, Rwanda" or "Remote"`}
                          style={{ ...inputBase, flex: 1, border: `1px solid ${errors.locations ? C.danger : C.border}` }} />
                        {i > 0 && <button onClick={() => removeArr('locations', i)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 38, borderRadius: 8, border: 'none', background: `${C.danger}12`, color: C.danger, cursor: 'pointer' }}><Minus size={14} /></button>}
                      </div>
                    ))}
                    <AddMoreBtn onClick={() => addArr('locations')} label="Add Location" />
                  </FormField>

                  <FormField label="Job Description" required error={errors.description} hint="Min 30 characters. Describe the role, team, and impact.">
                    <Textarea value={formData.description} onChange={v => update('description', v)}
                      rows={5} placeholder="Describe the role, the team culture, and the impact this person will have…" hasError={!!errors.description} />
                    <p style={{ fontSize: 11, color: formData.description.length < 30 && touched ? C.danger : C.textLight, textAlign: 'right', marginTop: 3 }}>{formData.description.length} chars</p>
                  </FormField>

                  <FormField label="Key Responsibilities" hint="Type your own or use suggestions. Press Enter or click Add. Click any item to edit inline.">
                    <AutoSuggestListField
                      items={formData.responsibilities}
                      onAdd={v => update('responsibilities', [...formData.responsibilities, v])}
                      onUpdate={(i, v) => updateArr('responsibilities', i, v)}
                      onRemove={i => removeArr('responsibilities', i)}
                      suggestions={liveResponsibilities}
                      placeholder="e.g. Lead development of core features" />
                  </FormField>

                  <FormField label="General Requirements" hint="Skills, behaviours, or conditions required for the role. Click any item to edit inline.">
                    <AutoSuggestListField
                      items={formData.requirements}
                      onAdd={v => update('requirements', [...formData.requirements, v])}
                      onUpdate={(i, v) => updateArr('requirements', i, v)}
                      onRemove={i => removeArr('requirements', i)}
                      suggestions={liveRequirements}
                      placeholder="e.g. Strong communication skills" />
                  </FormField>

                  <FormField label="Qualifications (optional)" hint="Add one or more degree + field-of-study requirements.">
                    <QualificationsSection
                      entries={formData.qualificationEntries}
                      onChange={entries => update('qualificationEntries', entries)}
                      degreeSuggestions={liveDegreeTypes}
                      fieldSuggestions={liveFieldsOfStudy} />
                    {formData.qualificationEntries.length === 0 && (
                      <div style={{ marginTop: 12 }}>
                        <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>Or describe qualifications as free text:</p>
                        <Textarea value={formData.qualifications} onChange={v => update('qualifications', v)}
                          rows={2} placeholder="e.g. Bachelor's in Computer Science or related field" />
                      </div>
                    )}
                  </FormField>
                </FormSection>
              )}

              {/* ── STEP 2 ── */}
              {currentStep === 2 && (
                <FormSection title="Salary & Benefits" icon={<DollarSign size={16} color={C.primary} />}>
                  <FormField label="Salary Type">
                    <SalaryTypeSelector value={formData.salaryType} onChange={v => update('salaryType', v as any)} />
                  </FormField>

                  {formData.salaryType === 'negotiable' ? (
                    <div style={{ padding: '16px 20px', background: C.successGhost, borderRadius: C.radiusSm, color: C.success, fontSize: 14, fontWeight: 500 }}>
                      ✓ This job will show "Competitive / Negotiable" salary to candidates.
                    </div>
                  ) : formData.salaryType === 'range' ? (
                    <FormRow cols="1fr 1fr 110px">
                      <FormField label="Min Salary" error={errors.salaryMin}>
                        <Input type="number" value={formData.salaryMin} onChange={v => update('salaryMin', v)} placeholder="100,000" hasError={!!errors.salaryMin} />
                      </FormField>
                      <FormField label="Max Salary" error={errors.salaryMax}>
                        <Input type="number" value={formData.salaryMax} onChange={v => update('salaryMax', v)} placeholder="200,000" hasError={!!errors.salaryMax} />
                      </FormField>
                      <FormField label="Currency" error={errors.salaryCurrency}>
                        <Input value={formData.salaryCurrency} onChange={v => update('salaryCurrency', v)} placeholder="Rwf" maxLength={5} hasError={!!errors.salaryCurrency} />
                      </FormField>
                    </FormRow>
                  ) : (
                    <FormRow cols="1fr 110px">
                      <FormField label={formData.salaryType === 'above' ? 'Minimum Amount (above)' : 'Maximum Amount (under)'} required error={errors.salaryMin}>
                        <Input type="number" value={formData.salaryMin} onChange={v => update('salaryMin', v)}
                          placeholder={formData.salaryType === 'above' ? 'e.g. 500,000' : 'e.g. 1,000,000'} hasError={!!errors.salaryMin} />
                      </FormField>
                      <FormField label="Currency" error={errors.salaryCurrency}>
                        <Input value={formData.salaryCurrency} onChange={v => update('salaryCurrency', v)} placeholder="Rwf" maxLength={5} hasError={!!errors.salaryCurrency} />
                      </FormField>
                    </FormRow>
                  )}

                  {formData.salaryType !== 'negotiable' && (
                    <FormRow cols="1fr auto">
                      <FormField label="Pay Period">
                        <Sel value={formData.salaryPeriod} onChange={v => update('salaryPeriod', v as any)}>
                          <option value="hour">Per hour</option>
                          <option value="month">Per month</option>
                          <option value="year">Per year</option>
                        </Sel>
                      </FormField>
                      <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: C.text, whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={formData.salaryVisible}
                            onChange={e => update('salaryVisible', e.target.checked)}
                            style={{ width: 16, height: 16, accentColor: C.primary }} />
                          Show salary publicly
                        </label>
                      </div>
                    </FormRow>
                  )}

                  <Divider />

                  <FormField label="Benefits" hint="Type your own or use suggestions. Click any item to edit inline.">
                    <AutoSuggestListField
                      items={formData.benefits}
                      onAdd={v => update('benefits', [...formData.benefits, v])}
                      onUpdate={(i, v) => updateArr('benefits', i, v)}
                      onRemove={i => removeArr('benefits', i)}
                      suggestions={liveBenefits}
                      placeholder="e.g. Health insurance, Remote work…" />
                  </FormField>
                </FormSection>
              )}

              {/* ── STEP 3 ── */}
              {currentStep === 3 && (
                <FormSection title="Skills & Experience" icon={<Users size={16} color={C.primary} />}>
                  <FormField label="Experience Level">
                    <Sel value={formData.experienceLevel} onChange={v => update('experienceLevel', v)}>
                      {Object.entries(EXPERIENCE_LEVEL_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </Sel>
                  </FormField>

                  <SectionCard>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: C.text }}>Specific Experience Requirements</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: C.success }}>
                        <input type="checkbox" checked={formData.noExperienceNeeded}
                          onChange={e => setFormData(p => ({ ...p, noExperienceNeeded: e.target.checked, experienceRequirements: e.target.checked ? [] : p.experienceRequirements }))}
                          style={{ accentColor: C.success }} />
                        No experience needed
                      </label>
                    </div>
                    {formData.noExperienceNeeded ? <NoneIndicator label="No experience required for this role" /> : (
                      <>
                        {formData.experienceRequirements.map((exp, idx) => (
                          editingExpIdx === idx ? (
                            <div key={exp.id} style={{ border: `1px solid ${C.primary}40`, borderRadius: C.radiusSm, padding: 14, marginBottom: 8, background: C.primaryGhost }}>
                              <div style={{ marginBottom: 10 }}>
                                <Label>Area of Experience</Label>
                                <ComboBox value={exp.title}
                                  onChange={v => setFormData(p => ({ ...p, experienceRequirements: p.experienceRequirements.map((e, i) => i === idx ? { ...e, title: v } : e) }))}
                                  options={EXPERIENCE_TITLE_SUGGESTIONS} placeholder="e.g. Software Development…" />
                              </div>
                              <FormRow cols="1fr 1fr">
                                <div>
                                  <Label>Years Required</Label>
                                  <YearPicker value={exp.years}
                                    onChange={v => setFormData(p => ({ ...p, experienceRequirements: p.experienceRequirements.map((e, i) => i === idx ? { ...e, years: v } : e) }))} />
                                </div>
                                <div>
                                  <Label>Additional Note</Label>
                                  <input value={exp.description}
                                    onChange={e => setFormData(p => ({ ...p, experienceRequirements: p.experienceRequirements.map((x, i) => i === idx ? { ...x, description: e.target.value } : x) }))}
                                    placeholder="e.g. in a startup environment"
                                    style={{ ...inputBase }} />
                                </div>
                              </FormRow>
                              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                <button onClick={() => setEditingExpIdx(null)} style={primaryBtnStyle}><Check size={13} /> Done</button>
                                <button onClick={() => { setFormData(p => ({ ...p, experienceRequirements: p.experienceRequirements.filter((_, i) => i !== idx) })); setEditingExpIdx(null); }} style={dangerGhostBtnStyle}><Trash2 size={13} /> Remove</button>
                              </div>
                            </div>
                          ) : (
                            <EditableListItem key={exp.id} label={exp.title}
                              sub={exp.years ? `${exp.years} year${exp.years !== '1' ? 's' : ''} required${exp.description ? ` — ${exp.description}` : ''}` : 'Any duration'}
                              onRemove={() => setFormData(p => ({ ...p, experienceRequirements: p.experienceRequirements.filter(e => e.id !== exp.id) }))}
                              onEdit={() => setEditingExpIdx(idx)} />
                          )
                        ))}

                        {editingExpIdx === null && (
                          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: C.radiusSm, padding: 16, marginTop: 12 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: C.textMuted, marginBottom: 10 }}>Add Experience Requirement</p>
                            <div style={{ marginBottom: 10 }}>
                              <Label>Area of Experience</Label>
                              <ComboBox value={newExp.title} onChange={v => setNewExp(p => ({ ...p, title: v }))}
                                options={EXPERIENCE_TITLE_SUGGESTIONS} placeholder="e.g. Software Development, Project Management…" />
                            </div>
                            <FormRow cols="1fr 1fr">
                              <div>
                                <Label>Years Required</Label>
                                <YearPicker value={newExp.years} onChange={v => setNewExp(p => ({ ...p, years: v }))} />
                              </div>
                              <div>
                                <Label>Additional Note (optional)</Label>
                                <input value={newExp.description} onChange={e => setNewExp(p => ({ ...p, description: e.target.value }))}
                                  placeholder="e.g. in a startup environment"
                                  style={{ ...inputBase }} />
                              </div>
                            </FormRow>
                            <button onClick={() => {
                              if (!newExp.title.trim()) return alert('Please enter an area of experience.');
                              setFormData(p => ({ ...p, experienceRequirements: [...p.experienceRequirements, { id: Date.now().toString(), title: newExp.title, years: newExp.years, description: newExp.description }], noExperienceNeeded: false }));
                              setNewExp({ title: '', years: '', description: '' });
                            }} style={{ ...addBtnStyle, marginTop: 12 }}>
                              <Plus size={14} /> Add Experience
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </SectionCard>

                  <FormField label="Required Skills" required error={errors.requiredSkills} hint="Click a skill chip to edit its proficiency level.">
                    <SkillInput
                      skills={formData.requiredSkills}
                      onAdd={name => addSkill(name, true)}
                      onRemove={i => update('requiredSkills', formData.requiredSkills.filter((_, idx) => idx !== i))}
                      onUpdateProficiency={(i, level) => updateSkillProficiency(i, level, true)}
                      suggestions={liveSkills}
                      color={C.primary}
                      placeholder="Search skills (e.g. React, Python)…" />
                  </FormField>
                </FormSection>
              )}

              {/* ── STEP 4 ── */}
              {currentStep === 4 && (
                <FormSection title="Languages & Documents" icon={<FileText size={16} color={C.primary} />}>
                  <SectionCard>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>Language Requirements</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: C.success }}>
                        <input type="checkbox" checked={formData.noLanguagesNeeded}
                          onChange={e => setFormData(p => ({ ...p, noLanguagesNeeded: e.target.checked, languages: e.target.checked ? [] : p.languages }))}
                          style={{ accentColor: C.success }} />
                        No language requirements
                      </label>
                    </div>
                    {formData.noLanguagesNeeded ? <NoneIndicator label="No language requirements for this role" /> : (
                      <>
                        {formData.languages.map((l, idx) => (
                          editingLangIdx === idx ? (
                            <div key={l.id} style={{ border: `1px solid ${C.primary}40`, borderRadius: C.radiusSm, padding: 14, marginBottom: 8, background: C.primaryGhost }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end', marginBottom: 8 }}>
                                <div>
                                  <Label>Language</Label>
                                  <input value={l.name}
                                    onChange={e => setFormData(p => ({ ...p, languages: p.languages.map((x, i) => i === idx ? { ...x, name: e.target.value } : x) }))}
                                    placeholder="e.g. English" style={inputBase} />
                                </div>
                                <div>
                                  <Label>Proficiency</Label>
                                  <select value={l.proficiency}
                                    onChange={e => setFormData(p => ({ ...p, languages: p.languages.map((x, i) => i === idx ? { ...x, proficiency: e.target.value as any } : x) }))}
                                    style={inputBase}>
                                    <option value="basic">Basic</option>
                                    <option value="conversational">Conversational</option>
                                    <option value="professional">Professional</option>
                                    <option value="native">Native</option>
                                  </select>
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap', paddingBottom: 10 }}>
                                  <input type="checkbox" checked={l.is_required}
                                    onChange={e => setFormData(p => ({ ...p, languages: p.languages.map((x, i) => i === idx ? { ...x, is_required: e.target.checked } : x) }))}
                                    style={{ accentColor: C.primary }} /> Required
                                </label>
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => setEditingLangIdx(null)} style={primaryBtnStyle}><Check size={13} /> Done</button>
                                <button onClick={() => { setFormData(p => ({ ...p, languages: p.languages.filter((_, i) => i !== idx) })); setEditingLangIdx(null); }} style={dangerGhostBtnStyle}><Trash2 size={13} /> Remove</button>
                              </div>
                            </div>
                          ) : (
                            <EditableListItem key={l.id} label={l.name}
                              sub={`${l.proficiency} · ${l.is_required ? 'Required' : 'Preferred'}`}
                              onRemove={() => setFormData(p => ({ ...p, languages: p.languages.filter(x => x.id !== l.id) }))}
                              onEdit={() => setEditingLangIdx(idx)} />
                          )
                        ))}

                        {editingLangIdx === null && (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginTop: 12, alignItems: 'end' }}>
                              <div><input value={newLang.name} onChange={e => setNewLang(p => ({ ...p, name: e.target.value }))} placeholder="Language (e.g. English)" style={inputBase} /></div>
                              <select value={newLang.proficiency} onChange={e => setNewLang(p => ({ ...p, proficiency: e.target.value as any }))} style={inputBase}>
                                <option value="basic">Basic</option>
                                <option value="conversational">Conversational</option>
                                <option value="professional">Professional</option>
                                <option value="native">Native</option>
                              </select>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap' }}>
                                <input type="checkbox" checked={newLang.is_required} onChange={e => setNewLang(p => ({ ...p, is_required: e.target.checked }))} style={{ accentColor: C.primary }} /> Required
                              </label>
                            </div>
                            <button onClick={() => {
                              if (!newLang.name.trim()) return alert('Please enter a language name.');
                              setFormData(p => ({ ...p, languages: [...p.languages, { id: Date.now().toString(), ...newLang }], noLanguagesNeeded: false }));
                              setNewLang({ name: '', proficiency: 'professional', is_required: false });
                            }} style={{ ...addBtnStyle, marginTop: 10 }}><Plus size={14} /> Add Language</button>
                          </>
                        )}
                      </>
                    )}
                  </SectionCard>

                  <SectionCard>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>Certifications</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: C.success }}>
                        <input type="checkbox" checked={formData.noCertificationsNeeded}
                          onChange={e => setFormData(p => ({ ...p, noCertificationsNeeded: e.target.checked, certifications: e.target.checked ? [] : p.certifications }))}
                          style={{ accentColor: C.success }} />
                        None required
                      </label>
                    </div>
                    {formData.noCertificationsNeeded ? <NoneIndicator label="No certifications required" /> : (
                      <>
                        {formData.certifications.map((c, idx) => (
                          editingCertIdx === idx ? (
                            <div key={c.id} style={{ border: `1px solid ${C.primary}40`, borderRadius: C.radiusSm, padding: 14, marginBottom: 8, background: C.primaryGhost }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                <div>
                                  <Label>Certification Name</Label>
                                  <input value={c.name}
                                    onChange={e => setFormData(p => ({ ...p, certifications: p.certifications.map((x, i) => i === idx ? { ...x, name: e.target.value } : x) }))}
                                    placeholder="Certification name" style={inputBase} />
                                </div>
                                <div>
                                  <Label>Issuer (optional)</Label>
                                  <input value={c.issuer}
                                    onChange={e => setFormData(p => ({ ...p, certifications: p.certifications.map((x, i) => i === idx ? { ...x, issuer: e.target.value } : x) }))}
                                    placeholder="e.g. AWS, Google" style={inputBase} />
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => setEditingCertIdx(null)} style={primaryBtnStyle}><Check size={13} /> Done</button>
                                <button onClick={() => { setFormData(p => ({ ...p, certifications: p.certifications.filter((_, i) => i !== idx) })); setEditingCertIdx(null); }} style={dangerGhostBtnStyle}><Trash2 size={13} /> Remove</button>
                              </div>
                            </div>
                          ) : (
                            <EditableListItem key={c.id} label={c.name} sub={c.issuer}
                              onRemove={() => setFormData(p => ({ ...p, certifications: p.certifications.filter(x => x.id !== c.id) }))}
                              onEdit={() => setEditingCertIdx(idx)} />
                          )
                        ))}

                        {editingCertIdx === null && (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                              <input value={newCert.name} onChange={e => setNewCert(p => ({ ...p, name: e.target.value }))} placeholder="Certification name" style={inputBase} />
                              <input value={newCert.issuer} onChange={e => setNewCert(p => ({ ...p, issuer: e.target.value }))} placeholder="Issuer (optional)" style={inputBase} />
                            </div>
                            <button onClick={() => {
                              if (!newCert.name.trim()) return alert('Enter a certification name.');
                              setFormData(prev => ({
                                ...prev,
                                certifications: [...prev.certifications, { id: Date.now().toString(), name: newCert.name, issuer: newCert.issuer || '' }],
                                noCertificationsNeeded: false
                              }));
                              setNewCert({ name: '', issuer: '' });
                            }} style={{ ...addBtnStyle, marginTop: 10 }}>
                              <Plus size={14} /> Add Certification
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </SectionCard>

                  <SectionCard>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>Required Documents</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: C.success }}>
                        <input type="checkbox" checked={formData.noDocumentsNeeded}
                          onChange={e => setFormData(p => ({ ...p, noDocumentsNeeded: e.target.checked, requiredDocuments: e.target.checked ? [] : p.requiredDocuments }))}
                          style={{ accentColor: C.success }} />
                        No documents needed
                      </label>
                    </div>
                    {formData.noDocumentsNeeded ? <NoneIndicator label="No documents required" /> : (
                      <>
                        {formData.requiredDocuments.map((d, idx) => (
                          editingDocIdx === idx ? (
                            <div key={d.id} style={{ border: `1px solid ${C.primary}40`, borderRadius: C.radiusSm, padding: 14, marginBottom: 8, background: C.primaryGhost }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                                <div>
                                  <Label>Document Name</Label>
                                  <input value={d.name}
                                    onChange={e => setFormData(p => ({ ...p, requiredDocuments: p.requiredDocuments.map((x, i) => i === idx ? { ...x, name: e.target.value } : x) }))}
                                    placeholder="e.g. Resume, Cover Letter" style={inputBase} />
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap', paddingTop: 20 }}>
                                  <input type="checkbox" checked={d.is_required}
                                    onChange={e => setFormData(p => ({ ...p, requiredDocuments: p.requiredDocuments.map((x, i) => i === idx ? { ...x, is_required: e.target.checked } : x) }))}
                                    style={{ accentColor: C.primary }} /> Required
                                </label>
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => setEditingDocIdx(null)} style={primaryBtnStyle}><Check size={13} /> Done</button>
                                <button onClick={() => { setFormData(p => ({ ...p, requiredDocuments: p.requiredDocuments.filter((_, i) => i !== idx) })); setEditingDocIdx(null); }} style={dangerGhostBtnStyle}><Trash2 size={13} /> Remove</button>
                              </div>
                            </div>
                          ) : (
                            <EditableListItem key={d.id} label={d.name} sub={d.is_required ? 'Required' : 'Optional'}
                              onRemove={() => setFormData(p => ({ ...p, requiredDocuments: p.requiredDocuments.filter(x => x.id !== d.id) }))}
                              onEdit={() => setEditingDocIdx(idx)} />
                          )
                        ))}

                        {editingDocIdx === null && (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginTop: 12, alignItems: 'center' }}>
                              <input value={newDoc.name} onChange={e => setNewDoc(p => ({ ...p, name: e.target.value }))} placeholder="Document (e.g. Resume, Cover Letter, Portfolio)" style={inputBase} />
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap' }}>
                                <input type="checkbox" checked={newDoc.is_required} onChange={e => setNewDoc(p => ({ ...p, is_required: e.target.checked }))} style={{ accentColor: C.primary }} /> Required
                              </label>
                            </div>
                            <button onClick={() => {
                              if (!newDoc.name.trim()) return alert('Enter a document name.');
                              setFormData(prev => ({
                                ...prev,
                                requiredDocuments: [...prev.requiredDocuments, { id: Date.now().toString(), name: newDoc.name, is_required: newDoc.is_required }],
                                noDocumentsNeeded: false
                              }));
                              setNewDoc({ name: '', is_required: true });
                            }} style={{ ...addBtnStyle, marginTop: 10 }}>
                              <Plus size={14} /> Add Document
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </SectionCard>

                  <FormField label="Age Requirement (optional)" hint="Must comply with local labour laws.">
                    <AgeRequirementInput value={formData.ageRequirement} onChange={v => update('ageRequirement', v)} />
                  </FormField>
                </FormSection>
              )}

              {/* ── STEP 5 ── */}
              {currentStep === 5 && (
                <FormSection title="Screening Questions" icon={<FileText size={16} color={C.primary} />}>
                  {formData.screeningQuestions.map((q, i) => (
                    <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: C.radiusSm, padding: 18, marginBottom: 14, background: '#fafafa' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 22, height: 22, borderRadius: '50%', background: C.primary, color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.textMuted }}>Screening Question</span>
                        </div>
                        <button onClick={() => update('screeningQuestions', formData.screeningQuestions.filter((_, idx) => idx !== i))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, display: 'flex', alignItems: 'center' }}>
                          <X size={16} />
                        </button>
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <input value={q.question}
                          onChange={e => update('screeningQuestions', formData.screeningQuestions.map((x, idx) => idx === i ? { ...x, question: e.target.value } : x))}
                          placeholder="Enter your screening question…"
                          style={{ ...inputBase, marginBottom: 0 }} />
                        {touched && !q.question.trim() && <p style={{ fontSize: 12, color: C.danger, marginTop: 3 }}>Question text is required</p>}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center' }}>
                        <select value={q.type}
                          onChange={e => update('screeningQuestions', formData.screeningQuestions.map((x, idx) => idx === i ? { ...x, type: e.target.value as any, options: e.target.value === 'multiple_choice' ? (x.options || ['', '']) : x.options } : x))}
                          style={inputBase}>
                          <option value="text">Text Answer</option>
                          <option value="yes_no">Yes / No</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="multiple_choice">Multiple Choice</option>
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={q.required}
                            onChange={e => update('screeningQuestions', formData.screeningQuestions.map((x, idx) => idx === i ? { ...x, required: e.target.checked } : x))}
                            style={{ accentColor: C.primary }} /> Required
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.textMuted }}>
                          Weight:
                          <select value={q.scoring_weight ?? 1}
                            onChange={e => update('screeningQuestions', formData.screeningQuestions.map((x, idx) => idx === i ? { ...x, scoring_weight: parseInt(e.target.value) } : x))}
                            style={{ ...inputBase, width: 60, padding: '6px 8px', fontSize: 12 }}>
                            {[1, 2, 3, 4, 5].map(w => <option key={w} value={w}>{w}</option>)}
                          </select>
                        </div>
                      </div>

                      {q.type === 'multiple_choice' && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 8 }}>Answer Options:</p>
                          {(q.options || []).map((opt, oi) => (
                            <div key={oi} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                              <input value={opt}
                                onChange={e => {
                                  const newOpts = [...(q.options || [])];
                                  newOpts[oi] = e.target.value;
                                  update('screeningQuestions', formData.screeningQuestions.map((x, idx) => idx === i ? { ...x, options: newOpts } : x));
                                }}
                                placeholder={`Option ${oi + 1}`}
                                style={{ ...inputBase, flex: 1, padding: '7px 12px' }} />
                              {(q.options || []).length > 2 && (
                                <button onClick={() => {
                                  const newOpts = (q.options || []).filter((_, oIdx) => oIdx !== oi);
                                  update('screeningQuestions', formData.screeningQuestions.map((x, idx) => idx === i ? { ...x, options: newOpts } : x));
                                }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 34, borderRadius: 6, border: 'none', background: `${C.danger}12`, color: C.danger, cursor: 'pointer' }}>
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                          ))}
                          <button onClick={() => update('screeningQuestions', formData.screeningQuestions.map((x, idx) => idx === i ? { ...x, options: [...(x.options || []), ''] } : x))}
                            style={{ ...addBtnStyle, fontSize: 12, padding: '5px 10px' }}><Plus size={12} /> Add Option</button>
                        </div>
                      )}
                    </div>
                  ))}

                  <button onClick={() => update('screeningQuestions', [...formData.screeningQuestions, { question: '', type: 'text', required: true, scoring_weight: 1 }])}
                    style={{ ...addBtnStyle, marginBottom: 24 }}>
                    <Plus size={14} /> Add Question
                  </button>

                  <Divider />

                  <div style={{ background: C.primaryGhost, border: `1px solid ${C.primary}25`, borderRadius: C.radius, padding: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <FileText size={16} color={C.primary} />
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: C.primary, margin: 0 }}>Application Instructions</h3>
                    </div>
                    <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 10 }}>
                      Tell applicants how to apply, what to include, or any special requirements.
                    </p>
                    <Textarea value={formData.applicationInstructions}
                      onChange={v => update('applicationInstructions', v)} rows={4}
                      placeholder={`e.g.\n• Please include a cover letter explaining why you are a good fit.\n• Attach your portfolio or GitHub profile.\n• Applications without a CV will not be considered.\n• Deadline: [date]`} />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {['Include cover letter', 'Attach portfolio', 'Include GitHub link', 'Attach references', 'State salary expectation'].map(hint => (
                        <button key={hint} onClick={() => {
                          const current = formData.applicationInstructions;
                          update('applicationInstructions', current ? `${current}\n• ${hint}` : `• ${hint}`);
                        }} style={{ padding: '3px 10px', borderRadius: 20, border: `1px dashed ${C.primary}40`, background: 'none', color: C.primary, fontSize: 12, cursor: 'pointer' }}>
                          + {hint}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Divider />

                  <FormRow>
                    <FormField label="Publish Date" required error={errors.publishedAt}>
                      <Input type="date" value={formData.publishedAt} onChange={v => update('publishedAt', v)} hasError={!!errors.publishedAt} />
                    </FormField>
                    <FormField label="Expiry Date" required error={errors.expiresAt}>
                      <Input type="date" value={formData.expiresAt} onChange={v => update('expiresAt', v)} hasError={!!errors.expiresAt} />
                    </FormField>
                  </FormRow>
                  {errors.screeningQuestions && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: C.dangerGhost, border: `1px solid ${C.danger}30`, borderRadius: 8, marginTop: 4 }}>
                      <AlertCircle size={14} color={C.danger} />
                      <span style={{ fontSize: 13, color: C.danger }}>{errors.screeningQuestions}</span>
                    </div>
                  )}
                </FormSection>
              )}

              {/* ── STEP 6 ── */}
              {currentStep === 6 && (
                <FormSection title="Posting Settings" icon={<Target size={16} color={C.primary} />}>
                  <div style={{ background: 'linear-gradient(135deg, #667eea15, #764ba215)', border: `1px solid #667eea40`, borderRadius: C.radius, padding: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #667eea, #764ba2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Target size={20} color="#fff" />
                      </div>
                      <div>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>AI Match Requirements</h3>
                        <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>Minimum match score for candidate recommendations</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <input type="range" min="0" max="100" step="5" value={formData.aiMatchRequiredScore || 70}
                        onChange={e => update('aiMatchRequiredScore', parseInt(e.target.value))}
                        style={{ flex: 1, height: 6, borderRadius: 3, background: `linear-gradient(90deg, #667eea 0%, #667eea ${formData.aiMatchRequiredScore || 70}%, #e2e8f0 ${formData.aiMatchRequiredScore || 70}%, #e2e8f0 100%)`, WebkitAppearance: 'none' }} />
                      <div style={{ minWidth: 56, textAlign: 'center', padding: '5px 10px', background: 'linear-gradient(135deg, #667eea, #764ba2)', borderRadius: 20, color: '#fff', fontWeight: 700, fontSize: 14 }}>
                        {formData.aiMatchRequiredScore || 70}%
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: C.textMuted }}>More candidates</span>
                      <span style={{ fontSize: 11, color: C.textMuted }}>Better matches</span>
                    </div>
                  </div>

                  <FormField label="Visibility">
                    <Sel value={formData.visibility} onChange={v => update('visibility', v)}>
                      <option value="public">Public – Anyone can see</option>
                      <option value="internal">Internal – Company members only</option>
                      <option value="confidential">Confidential – Selected candidates</option>
                      <option value="unlisted">Unlisted – Direct link only</option>
                    </Sel>
                  </FormField>

                  <FormField label="Application Limit (optional)" error={errors.applicationLimit} hint="Leave blank to accept unlimited applications.">
                    <Input type="number" value={formData.applicationLimit} onChange={v => update('applicationLimit', v)} placeholder="10000" hasError={!!errors.applicationLimit} />
                  </FormField>

                  <FormField label="Tags">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                      {formData.tags.map((tag, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: `${C.textMuted}15`, color: C.textMuted, fontSize: 13 }}>
                          {tag}
                          <button onClick={() => update('tags', formData.tags.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 0, fontSize: 14 }}>×</button>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && tagInput.trim()) { update('tags', [...formData.tags, tagInput.trim()]); setTagInput(''); } }}
                        placeholder="Type a tag and press Enter…" style={{ ...inputBase, flex: 1 }} />
                      <button onClick={() => { if (tagInput.trim()) { update('tags', [...formData.tags, tagInput.trim()]); setTagInput(''); } }} style={addBtnStyle}>Add</button>
                    </div>
                  </FormField>

                  <div style={{ background: C.primaryGhost, border: `1px solid ${C.primary}25`, borderRadius: C.radiusSm, padding: 20, marginTop: 8 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.primary, marginBottom: 12, letterSpacing: 0.3, textTransform: 'uppercase' }}>Job Summary</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
                      {[
                        ['Title', formData.title || '—'],
                        ['Department', formData.department || '—'],
                        ['Type', JOB_TYPE_LABELS[formData.jobType]],
                        ['Location', formData.locations.filter(Boolean).join(', ') || '—'],
                        ['Arrangement', WORK_ARRANGEMENT_LABELS[formData.workArrangement]],
                        ['Salary', formData.salaryType === 'negotiable' ? 'Negotiable' : formData.salaryType === 'above' ? `Above ${formData.salaryMin} ${formData.salaryCurrency}` : formData.salaryType === 'under' ? `Under ${formData.salaryMin} ${formData.salaryCurrency}` : `${formData.salaryMin || '?'} – ${formData.salaryMax || '?'} ${formData.salaryCurrency}`],
                        ['Required Skills', `${formData.requiredSkills.length} skills`],
                        ['Screening Qs', `${formData.screeningQuestions.length} questions`],
                        ['AI Match Min', `${formData.aiMatchRequiredScore || 70}%`],
                        ['Publish', formData.publishedAt ? new Date(formData.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'],
                        ['Expires', formData.expiresAt ? new Date(formData.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'],
                      ].map(([k, v]) => (
                        <div key={k} style={{ fontSize: 13 }}>
                          <span style={{ color: C.textMuted }}>{k}: </span>
                          <span style={{ color: C.text, fontWeight: 500 }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </FormSection>
              )}

            </div>{/* end form card */}

            {/* ── Bottom navigation — STICKY at bottom of viewport ── */}
            <div style={{
              position: 'sticky',
              bottom: 0,
              zIndex: 95,
              background: C.surface,
              borderTop: `1px solid ${C.border}`,
              boxShadow: '0 -4px 20px rgba(0,0,0,.08)',
              padding: '14px 32px',
            }}>
              <div style={{
                maxWidth: 860,
                margin: '0 auto',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <button
                  onClick={goPrev}
                  disabled={currentStep === 1}
                  style={{ ...ghostBtnStyle, opacity: currentStep === 1 ? 0.4 : 1 }}
                >
                  <ChevronLeft size={16} /> Previous
                </button>

                {/* Step dots — quick visual indicator */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {STEPS.map(step => (
                    <button
                      key={step.id}
                      onClick={() => goToStep(step.id)}
                      title={step.shortTitle}
                      style={{
                        width: currentStep === step.id ? 24 : 8,
                        height: 8,
                        borderRadius: 4,
                        border: 'none',
                        background: currentStep === step.id
                          ? C.primary
                          : currentStep > step.id
                            ? `${C.primary}60`
                            : C.border,
                        cursor: 'pointer',
                        transition: 'all .2s',
                        padding: 0,
                      }}
                    />
                  ))}
                </div>

                {currentStep < STEPS.length ? (
                  <button onClick={goNext} style={primaryBtnStyle}>
                    Next <ChevronRight size={16} />
                  </button>
                ) : (
                  <button onClick={() => handleSave('publish')} disabled={loading} style={primaryBtnStyle}>
                    {loading ? <Loader2 size={14} style={{ animation: 'spin .8s linear infinite' }} /> : null}
                    {loading ? 'Publishing…' : isEditing ? 'Update Job' : 'Publish Job'}
                  </button>
                )}
              </div>
            </div>

          </>
        ) : (
          /* ── PREVIEW ── */
          <div style={{ background: C.surface, borderRadius: C.radius, border: `1px solid ${C.border}`, padding: 40 }}>
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 28, fontWeight: 700, color: C.text, marginBottom: 8 }}>{formData.title || 'Job Title'}</h2>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                {[formData.department, JOB_TYPE_LABELS[formData.jobType], WORK_ARRANGEMENT_LABELS[formData.workArrangement]].filter(Boolean).map(t => (
                  <span key={t} style={{ fontSize: 13, background: C.primaryGhost, color: C.primary, padding: '4px 12px', borderRadius: 20, fontWeight: 500 }}>{t}</span>
                ))}
                <span style={{ fontSize: 13, background: C.bg, color: C.textMuted, padding: '4px 12px', borderRadius: 20, fontWeight: 500, border: `1px solid ${C.border}` }}>
                  {EXPERIENCE_LEVEL_LABELS[formData.experienceLevel]}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 28, padding: '20px', background: C.bg, borderRadius: C.radiusSm }}>
              {[
                { label: 'Location', value: formData.locations.filter(Boolean).join(', ') || '—' },
                { label: 'Salary', value: formData.salaryType === 'negotiable' ? 'Negotiable' : formData.salaryType === 'above' ? `Above ${formData.salaryMin} ${formData.salaryCurrency}` : formData.salaryType === 'under' ? `Under ${formData.salaryMin} ${formData.salaryCurrency}` : (formData.salaryMin || formData.salaryMax) ? `${formData.salaryMin || '—'} – ${formData.salaryMax || '—'} ${formData.salaryCurrency}/${formData.salaryPeriod}` : '—' },
                { label: 'Visibility', value: formData.visibility.charAt(0).toUpperCase() + formData.visibility.slice(1) },
                { label: 'Publish', value: formData.publishedAt ? new Date(formData.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
                { label: 'Expires', value: formData.expiresAt ? new Date(formData.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p style={previewLabel}>{label}</p>
                  <p style={previewValue}>{value}</p>
                </div>
              ))}
            </div>

            <Divider />

            <div style={{ marginTop: 24 }}>
              <p style={{ ...previewLabel, marginBottom: 8 }}>Description</p>
              <p style={{ fontSize: 14, color: C.text, lineHeight: 1.75, whiteSpace: 'pre-line' }}>{formData.description}</p>
            </div>

            {formData.responsibilities.filter(Boolean).length > 0 && (
              <div style={{ marginTop: 24 }}>
                <p style={{ ...previewLabel, marginBottom: 8 }}>Key Responsibilities</p>
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  {formData.responsibilities.filter(Boolean).map((r, i) => <li key={i} style={{ fontSize: 14, color: C.text, lineHeight: 1.8 }}>{r}</li>)}
                </ul>
              </div>
            )}

            {formData.requirements.filter(Boolean).length > 0 && (
              <div style={{ marginTop: 24 }}>
                <p style={{ ...previewLabel, marginBottom: 8 }}>Requirements</p>
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  {formData.requirements.filter(Boolean).map((r, i) => <li key={i} style={{ fontSize: 14, color: C.text, lineHeight: 1.8 }}>{r}</li>)}
                </ul>
              </div>
            )}

            {(formData.qualificationEntries.length > 0 || formData.qualifications) && (
              <div style={{ marginTop: 24 }}>
                <p style={{ ...previewLabel, marginBottom: 8 }}>Qualifications</p>
                {formData.qualificationEntries.length > 0
                  ? formData.qualificationEntries.map(e => (
                    <div key={e.id} style={{ fontSize: 14, color: C.text, marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <GraduationCap size={14} color={C.primary} />
                        <strong>{e.degree}</strong>
                      </div>
                      {e.fields.length > 0 && (
                        <div style={{ marginLeft: 22, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {e.fields.map((field, idx) => (
                            <span key={idx} style={{ padding: '2px 10px', borderRadius: 16, background: C.primaryGhost, color: C.primary, fontSize: 12 }}>{field}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                  : <p style={{ fontSize: 14, color: C.text }}>{formData.qualifications}</p>}
              </div>
            )}

            {formData.experienceRequirements.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <p style={{ ...previewLabel, marginBottom: 8 }}>Experience Required</p>
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  {formData.experienceRequirements.map(exp => (
                    <li key={exp.id} style={{ fontSize: 14, color: C.text, lineHeight: 1.8 }}>
                      {exp.years ? `${exp.years} year${exp.years !== '1' ? 's' : ''} of ` : ''}<strong>{exp.title}</strong>
                      {exp.description ? ` (${exp.description})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(formData.requiredSkills.length > 0 || formData.preferredSkills.length > 0) && (
              <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {formData.requiredSkills.length > 0 && (
                  <div>
                    <p style={{ ...previewLabel, marginBottom: 8 }}>Required Skills</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {formData.requiredSkills.map((s, i) => (
                        <span key={i} style={{ padding: '4px 10px', borderRadius: 20, background: `${C.primary}15`, color: C.primary, fontSize: 13 }}>
                          {s.name}
                          {s.proficiency_level !== undefined && s.proficiency_level > 0 && (
                            <span style={{ opacity: 0.65, fontSize: 11 }}> · {PROF_LABELS[s.proficiency_level]}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {formData.preferredSkills.length > 0 && (
                  <div>
                    <p style={{ ...previewLabel, marginBottom: 8 }}>Preferred Skills</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {formData.preferredSkills.map((s, i) => (
                        <span key={i} style={{ padding: '4px 10px', borderRadius: 20, background: `${C.success}15`, color: C.success, fontSize: 13 }}>
                          {s.name}
                          {s.proficiency_level !== undefined && s.proficiency_level > 0 && (
                            <span style={{ opacity: 0.65, fontSize: 11 }}> · {PROF_LABELS[s.proficiency_level]}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {formData.benefits.filter(Boolean).length > 0 && (
              <div style={{ marginTop: 24 }}>
                <p style={{ ...previewLabel, marginBottom: 8 }}>Benefits</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {formData.benefits.filter(Boolean).map((b, i) => <span key={i} style={{ padding: '4px 12px', borderRadius: 20, background: C.warningGhost, color: C.warning, fontSize: 13 }}>{b}</span>)}
                </div>
              </div>
            )}

            {formData.languages.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <p style={{ ...previewLabel, marginBottom: 8 }}>Language Requirements</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {formData.languages.map((l, i) => <span key={i} style={{ padding: '4px 12px', borderRadius: 20, background: C.bg, color: C.text, fontSize: 13, border: `1px solid ${C.border}` }}>{l.name} — {l.proficiency}{l.is_required ? ' (required)' : ''}</span>)}
                </div>
              </div>
            )}

            {formData.certifications.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <p style={{ ...previewLabel, marginBottom: 8 }}>Certifications</p>
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  {formData.certifications.map((c, i) => <li key={i} style={{ fontSize: 14, color: C.text, lineHeight: 1.8 }}>{c.name}{c.issuer ? ` (${c.issuer})` : ''}</li>)}
                </ul>
              </div>
            )}

            {formData.requiredDocuments.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <p style={{ ...previewLabel, marginBottom: 8 }}>Required Documents</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {formData.requiredDocuments.map((d, i) => <span key={i} style={{ padding: '4px 12px', borderRadius: 20, background: C.bg, border: `1px solid ${C.border}`, color: C.text, fontSize: 13 }}>{d.name}{d.is_required ? '' : ' (optional)'}</span>)}
                </div>
              </div>
            )}

            {formData.screeningQuestions.filter(q => q.question.trim()).length > 0 && (
              <div style={{ marginTop: 24 }}>
                <p style={{ ...previewLabel, marginBottom: 8 }}>Screening Questions ({formData.screeningQuestions.length})</p>
                {formData.screeningQuestions.filter(q => q.question.trim()).map((q, i) => (
                  <div key={i} style={{ padding: '10px 14px', background: C.bg, borderRadius: C.radiusSm, marginBottom: 8, border: `1px solid ${C.border}` }}>
                    <p style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{i + 1}. {q.question}</p>
                    <p style={{ fontSize: 12, color: C.textMuted }}>{q.type.replace('_', ' ')} · {q.required ? 'Required' : 'Optional'}</p>
                    {q.type === 'multiple_choice' && q.options && q.options.filter(Boolean).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                        {q.options.filter(Boolean).map((o, oi) => <span key={oi} style={{ padding: '2px 8px', borderRadius: 4, background: '#fff', border: `1px solid ${C.border}`, fontSize: 12 }}>{o}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {formData.applicationInstructions && (
              <div style={{ marginTop: 24, padding: 20, background: C.primaryGhost, borderRadius: C.radiusSm, border: `1px solid ${C.primary}25` }}>
                <p style={{ ...previewLabel, color: C.primary, marginBottom: 8 }}>How to Apply</p>
                <p style={{ fontSize: 14, color: C.text, whiteSpace: 'pre-line', lineHeight: 1.75 }}>{formData.applicationInstructions}</p>
              </div>
            )}

            {formData.tags.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <p style={{ ...previewLabel, marginBottom: 8 }}>Tags</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {formData.tags.map((t, i) => <span key={i} style={{ padding: '3px 10px', borderRadius: 20, background: C.bg, border: `1px solid ${C.border}`, color: C.textMuted, fontSize: 12 }}>#{t}</span>)}
                </div>
              </div>
            )}

            <div style={{ marginTop: 32, padding: 16, background: C.bg, borderRadius: C.radiusSm }}>
              <p style={{ fontSize: 12, color: C.textMuted }}>
                <strong>Application window:</strong>{' '}
                {new Date(formData.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} –{' '}
                {new Date(formData.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                {formData.applicationLimit && ` · Max ${formData.applicationLimit} applications`}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Delete modal */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: C.surface, borderRadius: 16, padding: 32, maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.dangerGhost, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Trash2 size={20} color={C.danger} />
              </div>
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Delete Job Posting</p>
                <p style={{ fontSize: 13, color: C.textMuted }}>This action cannot be undone.</p>
              </div>
            </div>
            <p style={{ fontSize: 14, color: C.text, marginBottom: 24 }}>
              Are you sure you want to delete <strong>"{formData.title}"</strong>?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDeleteConfirm(false)} style={ghostBtnStyle}>Cancel</button>
              <button onClick={handleDelete} disabled={loading} style={{ ...primaryBtnStyle, background: C.danger }}>
                {loading ? 'Deleting…' : 'Delete Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobPostingScreen;