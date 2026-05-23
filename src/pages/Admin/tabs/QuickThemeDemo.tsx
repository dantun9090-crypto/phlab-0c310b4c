import { Palette, Check, Sparkles } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { THEME_TEMPLATES } from '@/themes/templates';

const FEATURED_THEMES = [
  'navy-professional',
  'emerald-clinical',
  'slate-corporate',
  'midnight-modern',
  'pure-minimal',
  'electric-blue',
];

export default function QuickThemeDemo() {
  const { activeThemeId, applyTheme } = useTheme();
  const featured = THEME_TEMPLATES.filter(t => FEATURED_THEMES.includes(t.id));

  return (
    <div className="p-8 min-h-screen" style={{ backgroundColor: 'var(--theme-bg, #030812)' }}>
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
              <Palette className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#f0f6ff]">Quick Themes</h1>
              <p className="text-[#6b8fba] text-sm">Apply a theme instantly — changes take effect site-wide</p>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {featured.map((template) => {
            const isActive = activeThemeId === template.id;
            const c = template.colors;
            return (
              <div
                key={template.id}
                className="relative group rounded-2xl border-2 p-5 cursor-pointer transition-all"
                style={{
                  backgroundColor: c.surface,
                  borderColor: isActive ? c.primary : 'rgba(255,255,255,0.1)',
                  boxShadow: isActive ? `0 0 20px ${c.primary}40` : 'none',
                }}
                onClick={() => applyTheme(template.id, true)}
              >
                {/* Mini colour preview */}
                <div className="flex gap-2 mb-4">
                  {[c.primary, c.background, c.surface, c.accent].map((col, i) => (
                    <div key={i} className="w-9 h-9 rounded-lg" style={{ backgroundColor: col }} />
                  ))}
                </div>

                <h3 className="font-semibold text-base mb-0.5" style={{ color: c.text.primary }}>
                  {template.name}
                </h3>
                <p className="text-xs" style={{ color: c.text.secondary }}>
                  {template.description.split('—')[0].trim()}
                </p>

                {isActive ? (
                  <div className="flex items-center gap-1.5 mt-3">
                    <Check className="w-3.5 h-3.5" style={{ color: c.primary }} />
                    <span className="text-xs font-semibold" style={{ color: c.primary }}>
                      Active
                    </span>
                  </div>
                ) : (
                  <button
                    className="mt-3 w-full py-1.5 rounded-lg text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5"
                    style={{ backgroundColor: c.primary, color: '#fff' }}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Apply
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs text-[#3a5a82]">
          See all 30 templates in the <strong className="text-[#6b8fba]">Theme Templates</strong> tab above
        </p>
      </div>
    </div>
  );
}
