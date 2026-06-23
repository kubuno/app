import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppWindow, ArrowLeft, ExternalLink, Check } from 'lucide-react'
import { Toggle, Button, Radio } from '@ui'
import { useModulePrefs } from './userPrefs'

// ── Per-user preferences (backend, cross-device via core users.preferences) ─────

interface AppPrefs {
  defaultDevice:  string   // 'desktop' | 'tablet' | 'mobile' — editor canvas frame
  defaultZoom:    string   // '0.75' | '1' | '1.25' — default canvas zoom
  showGrid:       boolean  // alignment grid background on the canvas
  outlineElems:   boolean  // highlight element outlines on hover/selection
  editorTheme:    string   // 'light' | 'dark' | 'system'
  autoSave:       boolean  // auto-save while editing
}

const DEFAULT_PREFS: AppPrefs = {
  defaultDevice: 'desktop', defaultZoom: '1', showGrid: false,
  outlineElems: true, editorTheme: 'light', autoSave: true,
}

// ── Mail-style layout helpers ───────────────────────────────────────────────────

function SettingsRow({ label, description, children }: {
  label: string; description?: string; children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-8 py-4 border-b border-[#e8eaed] last:border-0">
      <div className="w-60 flex-shrink-0">
        <p className="text-sm text-[#202124] font-normal">{label}</p>
        {description && <p className="text-xs text-text-tertiary mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function RadioGroup({ options, value, onChange }: {
  options: { value: string; label: string }[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      {options.map(opt => (
        <Radio key={opt.value} checked={value === opt.value} onChange={() => onChange(opt.value)} label={opt.label} />
      ))}
    </div>
  )
}

// ── Préférences tab (per-user) ──────────────────────────────────────────────────

function PreferencesTab() {
  const { t } = useTranslation('app')
  const { prefs: saved, update } = useModulePrefs<AppPrefs>('app', DEFAULT_PREFS)
  const [prefs, setPrefs] = useState<AppPrefs>(saved)
  const [savedFlag, setSavedFlag] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof AppPrefs>(key: K, value: AppPrefs[K]) =>
    setPrefs(p => ({ ...p, [key]: value }))

  const save = async () => {
    setBusy(true)
    try {
      await update(prefs)
      setSavedFlag(true)
      setTimeout(() => setSavedFlag(false), 2500)
    } finally { setBusy(false) }
  }

  return (
    <div>
      <SettingsRow
        label={t('app_pref_device', { defaultValue: 'Aperçu par défaut' })}
        description={t('app_pref_device_desc', { defaultValue: 'Cadre d\'aperçu utilisé à l\'ouverture du concepteur.' })}
      >
        <RadioGroup
          value={prefs.defaultDevice}
          onChange={v => set('defaultDevice', v)}
          options={[
            { value: 'desktop', label: t('app_pref_device_desktop', { defaultValue: 'Bureau (pleine largeur)' }) },
            { value: 'tablet',  label: t('app_pref_device_tablet',  { defaultValue: 'Tablette' }) },
            { value: 'mobile',  label: t('app_pref_device_mobile',  { defaultValue: 'Mobile (cadre téléphone)' }) },
          ]}
        />
      </SettingsRow>

      <SettingsRow
        label={t('app_pref_zoom', { defaultValue: 'Zoom par défaut' })}
        description={t('app_pref_zoom_desc', { defaultValue: 'Niveau de zoom du plan de travail à l\'ouverture.' })}
      >
        <RadioGroup
          value={prefs.defaultZoom}
          onChange={v => set('defaultZoom', v)}
          options={[
            { value: '0.75', label: '75 %' },
            { value: '1',    label: '100 %' },
            { value: '1.25', label: '125 %' },
          ]}
        />
      </SettingsRow>

      <SettingsRow
        label={t('app_pref_theme', { defaultValue: 'Thème de l\'éditeur' })}
        description={t('app_pref_theme_desc', { defaultValue: 'Apparence de l\'interface du concepteur.' })}
      >
        <RadioGroup
          value={prefs.editorTheme}
          onChange={v => set('editorTheme', v)}
          options={[
            { value: 'light',  label: t('app_pref_theme_light',  { defaultValue: 'Clair' }) },
            { value: 'dark',   label: t('app_pref_theme_dark',   { defaultValue: 'Sombre' }) },
            { value: 'system', label: t('app_pref_theme_system', { defaultValue: 'Système' }) },
          ]}
        />
      </SettingsRow>

      <SettingsRow
        label={t('app_pref_grid', { defaultValue: 'Grille d\'alignement' })}
        description={t('app_pref_grid_desc', { defaultValue: 'Afficher une grille de repère en arrière-plan du plan de travail.' })}
      >
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Toggle checked={prefs.showGrid} onChange={() => set('showGrid', !prefs.showGrid)} />
          <span className="text-sm text-text-primary">{t('app_pref_grid_on', { defaultValue: 'Afficher la grille' })}</span>
        </label>
      </SettingsRow>

      <SettingsRow
        label={t('app_pref_outline', { defaultValue: 'Contours des éléments' })}
        description={t('app_pref_outline_desc', { defaultValue: 'Mettre en surbrillance les éléments au survol et à la sélection.' })}
      >
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Toggle checked={prefs.outlineElems} onChange={() => set('outlineElems', !prefs.outlineElems)} />
          <span className="text-sm text-text-primary">{t('app_pref_outline_on', { defaultValue: 'Surligner les contours' })}</span>
        </label>
      </SettingsRow>

      <SettingsRow
        label={t('app_pref_autosave', { defaultValue: 'Sauvegarde automatique' })}
        description={t('app_pref_autosave_desc', { defaultValue: 'Enregistrer les modifications au fil de l\'édition.' })}
      >
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Toggle checked={prefs.autoSave} onChange={() => set('autoSave', !prefs.autoSave)} />
          <span className="text-sm text-text-primary">{t('app_pref_autosave_on', { defaultValue: 'Activer la sauvegarde automatique' })}</span>
        </label>
      </SettingsRow>

      <div className="pt-5 flex items-center gap-3">
        <Button onClick={save} loading={busy}>
          {savedFlag
            ? <><Check size={14} className="mr-1.5 inline" />{t('app_settings_saved', { defaultValue: 'Enregistré' })}</>
            : t('app_settings_save_changes', { defaultValue: 'Enregistrer les modifications' })}
        </Button>
        <Button variant="ghost" onClick={() => setPrefs(saved)}>
          {t('common_cancel', { defaultValue: 'Annuler' })}
        </Button>
      </div>
    </div>
  )
}

// ── À propos tab ────────────────────────────────────────────────────────────────

function AboutTab() {
  const { t } = useTranslation('app')
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-surface-1">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
          <AppWindow size={20} className="text-blue-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">Kubuno App</p>
          <p className="text-xs text-text-tertiary">v0.1.0 · {t('app_official_module', { defaultValue: 'Module officiel' })}</p>
        </div>
        <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Rust</span>
      </div>
      <div className="px-5 py-4">
        <a href="https://github.com/kubuno/app" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <ExternalLink size={13} /> github.com/kubuno/app
        </a>
      </div>
    </div>
  )
}

// ── Main page (mail-style breadcrumb + tab bar) ─────────────────────────────────

type Tab = 'preferences' | 'about'

export default function AppSettingsPage() {
  const { t } = useTranslation('app')
  const [tab, setTab] = useState<Tab>('preferences')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'preferences', label: t('app_tab_preferences', { defaultValue: 'Préférences' }) },
    { id: 'about',       label: t('app_tab_about', { defaultValue: 'À propos' }) },
  ]

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Breadcrumb header */}
      <div className="flex items-center gap-2 px-6 py-2.5 border-b border-[#e8eaed] flex-shrink-0" style={{ background: '#f8f9fa' }}>
        <Link to="/app" className="flex items-center gap-1.5 text-sm text-[#1a73e8] hover:underline">
          <ArrowLeft size={14} />
          App
        </Link>
        <span className="text-text-tertiary text-sm">/</span>
        <div className="flex items-center gap-1.5">
          <AppWindow size={15} className="text-text-secondary" />
          <span className="text-sm text-text-primary">{t('app_settings_title', { defaultValue: 'Réglages' })}</span>
        </div>
      </div>

      {/* Tab bar (Gmail-style) */}
      <div className="flex items-end border-b border-[#e8eaed] px-4 flex-shrink-0 overflow-x-auto" style={{ background: '#fff' }}>
        {tabs.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`px-4 py-3 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === tb.id ? 'border-[#1a73e8] text-[#1a73e8] font-medium' : 'border-transparent text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4]'}`}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-6">
          {tab === 'preferences' && <PreferencesTab />}
          {tab === 'about'       && <AboutTab />}
        </div>
      </div>
    </div>
  )
}
