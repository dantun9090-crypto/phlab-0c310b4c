import type { ThemeTemplate } from '@/themes/templates';

interface TemplateThumbProps {
  template: ThemeTemplate;
  size?: 'sm' | 'lg';
}

const RADIUS: Record<ThemeTemplate['skeleton']['cardStyle'], string> = {
  flat: '4px', outlined: '8px', elevated: '12px', glass: '14px', gradient: '18px',
};

/** Inline mock page rendered with the template's tokens — no iframes. */
export function TemplateThumb({ template, size = 'sm' }: TemplateThumbProps) {
  const c = template.colors;
  const r = RADIUS[template.skeleton.cardStyle];
  const lg = size === 'lg';
  return (
    <div
      className={`w-full overflow-hidden border ${lg ? 'rounded-2xl' : 'rounded-xl aspect-[16/10]'}`}
      style={{ backgroundColor: c.background, borderColor: c.border, fontFamily: template.typography.bodyFont }}
      aria-hidden="true"
    >
      <div className={`flex items-center justify-between ${lg ? 'px-6 py-4' : 'px-3 py-2'}`} style={{ backgroundColor: c.surface }}>
        <div className="flex items-center gap-2">
          <div className={lg ? 'w-7 h-7' : 'w-3 h-3'} style={{ backgroundColor: c.primary, borderRadius: r }} />
          {lg ? <span style={{ color: c.text.primary, fontFamily: template.typography.headingFont, fontWeight: 700 }}>PH Labs</span>
            : <div className="h-1.5 w-10 rounded-full" style={{ backgroundColor: c.text.primary }} />}
        </div>
        <div className={lg ? 'h-8 w-20' : 'h-3 w-8'} style={{ backgroundColor: c.primary, borderRadius: r }} />
      </div>
      <div className={`grid grid-cols-5 items-center ${lg ? 'gap-6 p-6' : 'gap-2 p-3'}`}>
        <div className="col-span-3 space-y-2">
          {lg ? (
            <>
              <h4 className="text-2xl font-bold" style={{ color: c.text.primary, fontFamily: template.typography.headingFont }}>Research-grade compounds</h4>
              <p className="text-sm" style={{ color: c.text.secondary }}>For Research Use Only. Not for Human Consumption.</p>
              <div className="flex gap-2 pt-2">
                <span className="px-4 py-2 text-sm font-semibold" style={{ backgroundColor: c.primary, color: c.background, borderRadius: r }}>Shop now</span>
                <span className="px-4 py-2 text-sm border" style={{ borderColor: c.border, color: c.text.primary, borderRadius: r }}>Lab reports</span>
              </div>
            </>
          ) : (
            <>
              <div className="h-2 w-4/5 rounded-full" style={{ backgroundColor: c.text.primary }} />
              <div className="h-1.5 w-full rounded-full opacity-60" style={{ backgroundColor: c.text.secondary }} />
              <div className="h-4 w-12 mt-2" style={{ backgroundColor: c.primary, borderRadius: r }} />
            </>
          )}
        </div>
        <div className="col-span-2 grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${lg ? 'h-20 p-2' : 'h-7'} border`} style={{ backgroundColor: c.surface, borderColor: c.border, borderRadius: r }}>
              {lg && <div className="h-2 w-2/3 rounded-full" style={{ backgroundColor: i % 2 ? c.accent : c.secondary }} />}
            </div>
          ))}
        </div>
      </div>
      <div className={`grid grid-cols-4 ${lg ? 'gap-4 px-6 pb-6' : 'gap-2 px-3 pb-3'}`}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`border ${lg ? 'p-3 space-y-2' : 'p-1.5 space-y-1'}`} style={{ backgroundColor: c.surface, borderColor: c.border, borderRadius: r }}>
            <div className={lg ? 'h-24' : 'h-8'} style={{ backgroundColor: c.background, borderRadius: r }} />
            <div className={`${lg ? 'h-2' : 'h-1'} w-3/4 rounded-full`} style={{ backgroundColor: c.text.primary }} />
            <div className={`${lg ? 'h-2' : 'h-1'} w-1/3 rounded-full`} style={{ backgroundColor: c.primary }} />
          </div>
        ))}
      </div>
    </div>
  );
}
