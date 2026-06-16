// Why: Single source of truth for thesis section structure — was duplicated in 3 files.

export const DEFAULT_SECTIONS = [
  { id: 'title',         label: 'Title Page' },
  { id: 'abstract',      label: 'Abstract' },
  { id: 'toc',           label: 'Table of Contents' },
  { id: 'introduction',  label: 'Introduction' },
  { id: 'literature',    label: 'Literature Review' },
  { id: 'methodology',   label: 'Methodology' },
  { id: 'results',       label: 'Results' },
  { id: 'discussion',    label: 'Discussion' },
  { id: 'conclusion',    label: 'Conclusion' },
  { id: 'references',    label: 'References' },
  { id: 'appendices',    label: 'Appendices' },
] as const;

export type SectionId = typeof DEFAULT_SECTIONS[number]['id'];
