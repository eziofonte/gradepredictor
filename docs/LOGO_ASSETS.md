# Logo assets

The supplied book/tree logo was edited using the built-in imagegen tool to remove its cream background. The transparent result was cropped, centered and resized for use as a site icon.

- `frontend/assets/logo.png`: 512 × 512 transparent website logo.
- `frontend/assets/logo.jpg`: 512 × 512 JPEG copy on white, using the requested filename. JPEG does not support transparency.
- `frontend/assets/favicon.png`: 64 × 64 transparent browser tab icon in `#ECE8DC`, matching the system's dark-theme text color (`--ink-light`), as requested by the user.

The PNG is used in the four existing navigation headers and the three existing footers. All six pages reference the favicon. The dark theme displays the mark in white for contrast; the light theme preserves its teal color. No additional logo placements were added.

## Favicon color update

The built-in imagegen tool was used for the recolor edit. Final color normalization uses RGB (236, 232, 220) and the original favicon's alpha mask so the silhouette, antialiasing and transparent background remain identical. All six favicon links have a new cache version.

Recolor prompt: Edit target: the attached transparent book/tree favicon. Recolor ONLY its visible mark to a uniform warm off-white, exact sRGB hex #ECE8DC (RGB 236, 232, 220), matching the website's text. Preserve precisely the existing silhouette, proportions, curves, stroke widths, central stem, framing, and transparent cutouts. Keep an actual fully transparent background and antialiased edges. No other changes, no redesign, no shadows or gradients. Output a square transparent favicon.

## Original Imagegen edit prompt

Use case: background-extraction. Input image: the user's supplied dark teal stylized open-book/tree logo is the edit target. Remove only the pale cream background, including all cream negative spaces inside the logo. Preserve exactly the original dark teal mark, geometric outlines, curves, proportions, symmetry, and long central stem. Make a crisp, flat, square website icon with the complete mark centered, cropped closely with even small transparent padding on all sides. Actual transparent alpha background. No redesign, no additional objects, no text, no shadows, no gradients. The mark must match the input logo.
