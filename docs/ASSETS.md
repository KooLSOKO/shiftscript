# Visual assets

The interface takes colour and art-direction inspiration from [earny.co.za](https://earny.co.za/): cobalt `#2458E8`, white surfaces and rounded, matte illustrated forms. Earny's logo, text, assets and layout were not copied into the project.

## Illustration

Saved project asset: `public/art/meeting-blue.webp`. Created with the built-in image-generation tool, then resized and encoded as WebP for the app. The original scene uses two corporate colleagues, a laptop, a checklist and three urgency cards. It appears in the overview and sidebar.

Final creative prompt/specification:

> Use case: stylized-concept. Asset type: ShiftScript meeting-workspace illustration. Create an original polished corporate illustration of two Black colleagues at a cobalt-blue meeting table, discussing a laptop and floating checklist. Rounded clay-like matte forms, cream and white details, soft shadows, cobalt blue #2458E8 and navy clothing, with small coral, amber and teal task cards. Friendly professional expressions, uncluttered pale ice-blue background, wide composition suited to an app hero. No words, logos, watermarks, robot motifs or AI sparkle symbols.

## Icons

`src/components/Icons.jsx` contains 46 original code-native SVG icons. Reusable standalone files are under `public/icons/`. Each uses a 24 × 24 viewBox, rounded lines and subtle blue fill, with `currentColor` for flexible theming. React icons are decorative; button/field labels provide their accessible names. Priority badges add text to colour.

`public/favicon.svg` is the ShiftScript vector brand mark. Icon paths and colours can be edited directly; no image service or external icon font is required at runtime.

## Report fonts

`public/fonts/DejaVuSans.ttf` and `DejaVuSans-Bold.ttf` are embedded in PDFs for accented names and readable wrapping. Their license/copyright is in `public/fonts/LICENSE.txt`. The UI uses its system font. PDF fonts/dependencies load only for exports.

## Motion

CSS supplies gentle entrance, hover, dialog, toast and microphone-wave effects. `prefers-reduced-motion: reduce` disables animated transitions. No animation library or external font dependency is required.


v2.1 adds the original `Video` icon in `src/components/Icons.jsx` and `public/icons/Video.svg`, using the same rounded outlines and ice-blue secondary fill. No Google logo is copied. New mobile screenshots document import, recap review, task cards and the task editor with fictional data.

## v2.3 branded scenes

New generated scene assets are in `public/art/`. Overview retains `meeting-blue.webp`; Meetings, Google Meet, Tasks/Board, Projects, Team and Profile each have contextual artwork. `social-sharing.png` is the public 1200 × 630 sharing card. Prompts and generation provenance are recorded in `ARTWORK-v2.3.json`. The images were generated using the built-in image tool and resized for deployment.


v3.0 adds original `Bell` and `History` SVGs using the same 24px rounded outlines and ice-blue secondary fill. Profile photos are user uploads, centre-cropped to 160×160 and compressed as WebP in the browser; SVG uploads are rejected. New screenshots show fictional profiles, saved agendas, task tools and activity.

## v3.0.1 public page assets

Public policy pages reuse the cobalt/ice/navy palette and the original MessageSquare, Users and CalendarDays icon exports. Standalone SVG exports now include the SVG XML namespace so they decode correctly as external images. `public/icons/Google.svg` depicts the Google identity brand mark for the sign-in button; it is separate from Earny’s custom icon system. No new raster artwork was required.

## Public landing page (v3.0.2)

Uses the existing Earny blue `#2458E8`, `meeting-blue.webp`, `google-meet.webp`, favicon and original standalone SVG icons. No new stock assets, external fonts or generated images were added. Flat coloured icon tiles distinguish features; coral and amber distinguish example priorities. The Kiya/Kopano example is fictional and explicitly labelled. `public/landing.css` adds one subtle entry animation and button feedback; reduced-motion preferences disable both.

## Earny clay homepage (v3.0.3)

The current Earny homepage and its established clay reference informed the layout and palette. The home uses local Manrope weights 400/700/800; the SIL Open Font License is at `public/fonts/Manrope-LICENSE.txt`. Existing character artwork is reused. `public/art/workspace-preview.png` comes from the actual automated fictional demo workspace, not an invented UI image.

Four original assets were created with the built-in image generation tool using `earny-art-reference.webp` as a material/lighting reference. The generated originals are in `public/art/clay/*.png`; alpha-preserving WebP deployment copies are in the same folder. Each icon is decorative alongside a text label. The PNGs retain their transparent backgrounds and are not sprite sheets.

Prompt shared by all four assets:

> Use case: stylized-concept. Asset type: a custom clay illustration icon for ShiftScript by Earny's website. The supplied image is a MATERIAL, LIGHTING AND PALETTE REFERENCE ONLY, not an edit target. Create one original new object composition. Style: handmade clay/plasticine 3D illustration, matte slightly tactile surface, friendly rounded forms, restrained soft studio light, cobalt blue #2458E8 with ivory white, a little soft powder blue and tiny warm yellow details. Slight three-quarter isometric view. Background: genuinely transparent alpha, no floor, no coloured backdrop, no checkerboard baked in, no strong drop shadow. Composition: centered single grouped symbol, fills about 75% of square canvas with generous unclipped padding. No words, no letters, no numerals, no logos, no watermark, no sparkles, no robot, no chrome, no glass, no UI panel. Match the reference's softly imperfect claycraft, not shiny generic 3D.

Subjects appended to that prompt:

- `meeting-notes`: A cobalt blue speech bubble gently leaning against three ivory paper notes held by a blue binder clip. Two softly sculpted cobalt lines on the front paper imply a transcript. One small warm yellow dot. Immediately reads as conversation becoming meeting notes.
- `reviewed-tasks`: An ivory clipboard with a chunky cobalt blue clip and blue rim, two raised cobalt check marks on the face and one empty blue outlined checkbox below. A small rounded blue pencil rests diagonally beside it with an ivory tip. Immediately reads as reviewed tasks.
- `shared-projects`: A cobalt blue open project folder holding ivory papers, with two small ivory-and-powder-blue person silhouette tokens in front. Person tokens have a round head and simple rounded shoulder shape, no facial detail. Immediately reads as shared projects and people.
- `reminders-sharing`: A small ivory desk calendar with cobalt blue frame and two rounded binder rings, a single large cobalt circle marking a date but no numerals. Beside it a cobalt-and-ivory envelope with a tiny warm yellow notification dot. Immediately reads as deadlines and email reminders.
