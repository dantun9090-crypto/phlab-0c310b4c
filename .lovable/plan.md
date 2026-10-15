# Admin Templates section rebuild (admin panel only)

## Guardrails
- Only the admin "Theme Templates" tab changes, plus new admin-only parts. The shop's pages, prerendering, SEO, feeds and Merchant Center output stay exactly as they are.
- All current behaviour stays: the 30 built-in templates, the category filter, Preview, Apply (which keeps saving the active theme exactly as it does today) and the active badge.
- The Quick Themes tab stays as it is.
- Admin colours, fonts, corner rounding and spacing match the rest of the dashboard. Admin form fields keep the required style (border-2 slate-600, bg-slate-800, white text, min-h 48px, rounded-lg).

## What you will see
1. **Gallery toolbar**: search box, category chips with counts, a sort menu (Name / Newest / Last used) and a grid/list switch.
2. **New cards**: a large thumbnail preview, the template name, a category badge, a "Last edited" date and an Active badge. On desktop, Preview / Edit / Duplicate / Delete appear when you point at a card, and keyboard focus shows them too. On phones and tablets they sit in a "..." menu, and cards stack in one column.
3. **Full-screen preview**: a large mock-up of a page in that template, with its colours, fonts and card style. Its buttons are Apply, Edit, Duplicate and Close. Applying asks you to confirm, because visitors see the theme.
4. **Create template wizard** in 4 steps: Basics (name, category, description), then Colours, then Style (card style, header and hero layout, fonts), then Review with a live preview, then Save. "Edit" opens the same wizard with the template's details already filled in.
5. **Duplicate** makes an editable copy called "<name> (copy)".
6. **Delete** asks for confirmation. Only templates you made can be deleted. Built-in ones show "Built-in — duplicate to edit", and you can't delete the active template.
7. **Empty state**: an illustration and a "Create template" button, shown when search or filters match nothing or no custom templates exist yet.
8. **Loading placeholders**: grey card shapes while your custom templates load, with no spinners.
9. **Animations**: cards appear one after another, and the modal and filter changes slide in smoothly.

## Technical details
- Split `src/pages/Admin/tabs/ThemesTab.tsx` into `src/components/admin/templates/` with these parts: `TemplateGallery`, `TemplateCard`, `TemplateCardSkeleton`, `TemplatePreviewModal`, `TemplateWizard`, `TemplateEmptyState` and `useThemeTemplates`. Built from shadcn Dialog, AlertDialog, DropdownMenu, Input, Select, ToggleGroup, Badge and Skeleton, with framer-motion for the animations.
- **Custom template storage**: a new Firestore collection `themeTemplates/{id}`. It stores the same shape as `ThemeTemplate`, plus `isCustom`, `createdAt`, `updatedAt`, `createdBy` and `lastUsedAt`. Built-in templates still live in code. Their "last used" dates are stored in `settings/themeUsage`.
- **Firestore rules**: add `match /themeTemplates/{id} { allow read: if isAdmin(); allow write: if isAdmin(); }`, then deploy the rules.
- **Shop safety**: the shop never reads `themeTemplates`. To let a custom template be applied, `getTemplateById` gains an optional lookup, so the active theme can resolve a custom ID. If that ID is missing, it falls back to the default template, as it does now. I'll confirm the shop's prerendered output is unchanged.
- **Audit log**: every create, edit, duplicate, delete and apply goes to `/auditLogs` through the existing admin audit path. It records the admin, the action, the template ID and before/after values.
- **Checks**: build and typecheck, then Playwright screenshots of the admin tab on desktop and mobile. I'll show you these and wait for your approval before publishing or changing anything else.

## Additions you approved
1. **Code splitting**: the new template code (components, framer-motion, the wizard) is lazy-loaded from inside the admin Templates tab only. Before and after the change I'll build the app and compare the shop's JavaScript file sizes (entry, home, product and products pages). If the shop's files grow by even 1 byte, I'll fix that before showing you anything.
2. **Firestore rules**: the new `themeTemplates` block is only added inside the existing documents match. No existing rule is rewritten, reordered or changed. I'll show you the full `firestore.rules` diff and won't deploy until you say OK.
3. **Rollback**: before every Apply, the current active theme is saved to `settings/themeHistory` (the last 5 are kept). The Templates tab gets an "Undo last apply" button, which asks you to confirm, restores the previous theme, removes that snapshot and logs it in `/auditLogs`.
4. **Previews**: all thumbnails and the full-screen preview are built from small scaled mock components on the page itself. No iframes, no loading of live pages, and no change to CSP or frame-src.
5. **Custom templates can be applied**, using the same flow as built-in ones, including the confirm dialog and the snapshot.

## Delivery
- I'll send you Playwright screenshots on desktop and mobile, the bundle size comparison and the rules diff. I won't publish or deploy the rules until you give your OK.
