# BATTO

Static site for BATTO, a gold chronograph with a midnight-blue dial. Plain HTML, CSS and JS, no build step.

- `index.html`, `styles.css`, `app.js`: the page and the scroll engine.
- `frames/`: hero scrub, 863 WebP frames (1600x900), from five Flow clips.
- `frames2/`: chapter 2 scrub, 641 WebP frames (1440x810): gears, reveal, night, box.
- `img/`: catalogue tiles BT-01 to BT-04.
- `tools/serve.js`: local preview on http://localhost:3030 (`node tools/serve.js`). Not deployed.

Deploy: any static host. On Vercel, import the repo with no framework preset; `vercel.json` caches frames for a year.

Sample values (timing sheet) and the booking form are demo content: the form doesn't send anything yet.
