# Visual assets

The interface takes colour and art-direction inspiration from [earny.co.za](https://earny.co.za/): cobalt `#2458E8`, white surfaces and rounded, matte illustrated forms. Earny's logo, text, assets and layout were not copied into the project.

## Illustration

Saved project asset: `public/art/meeting-blue.webp`. Created with the built-in image-generation tool, then resized and encoded as WebP for the app. The original scene uses two corporate colleagues, a laptop, a checklist and three urgency cards. It appears in the overview and sidebar.

Final creative prompt/specification:

> Use case: stylized-concept. Asset type: ShiftScript meeting-workspace illustration. Create an original polished corporate illustration of two Black colleagues at a cobalt-blue meeting table, discussing a laptop and floating checklist. Rounded clay-like matte forms, cream and white details, soft shadows, cobalt blue #2458E8 and navy clothing, with small coral, amber and teal task cards. Friendly professional expressions, uncluttered pale ice-blue background, wide composition suited to an app hero. No words, logos, watermarks, robot motifs or AI sparkle symbols.

## Icons

`src/components/Icons.jsx` contains 27 original code-native SVG icons. Reusable standalone files are under `public/icons/`. Each uses a 24 × 24 viewBox, rounded lines and subtle blue fill, with `currentColor` for flexible theming. React icons are decorative; button/field labels provide their accessible names. Priority badges add text to colour.

`public/favicon.svg` is the ShiftScript vector brand mark. Icon paths and colours can be edited directly; no image service or external icon font is required at runtime.

## Motion

CSS supplies gentle entrance, hover, dialog, toast and microphone-wave effects. `prefers-reduced-motion: reduce` disables animated transitions. No animation library or external font dependency is required.
