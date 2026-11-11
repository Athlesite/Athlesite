/*
 * Athlesite — what a published page may show today.
 *
 * A.publicView(profile, 'adult' | 'minor') returns a copy of the profile holding only the fields the
 * product's public read returns (`get_published_profile_by_slug` on main @ ef04553, 18 columns), plus the
 * page's design. Everything else falls back to its empty default, so the page renders exactly as an
 * anonymous visitor would see it. 'minor' applies the approved reduced projection on top: first name +
 * last initial, no city, no height or weight.
 *
 * A review tool and a reference for the port (design-reference/02-VISIBILITY-MATRIX.md): in the product
 * this projection happens on the server before anything renders, never in the browser.
 * Used by site.html?view=public | view=minor.
 */
(function () {
  const A = window.Athlesite;

  // The 18 public columns, as Studio field names (owner_user_id and is_published aren't page content;
  // hero_photo_path is the Studio's heroPhotoUrl).
  const PUBLIC_FIELDS = ['slug', 'firstName', 'lastName', 'sport', 'position', 'classYear', 'city', 'state',
    'heightIn', 'weightLb', 'bio', 'heroPhotoUrl', 'heroPhotoPositionX', 'heroPhotoPositionY', 'heroPhotoZoom'];

  function publicView(profile, mode = 'adult') {
    const src = A.normalizeProfile(profile), out = A.createEmptyProfile();
    for (const k of PUBLIC_FIELDS) out.data[k] = structuredClone(src.data[k]);
    // Highlight links are public as label + link only; video posters need their own Storage review.
    out.data.highlightLinks = src.data.highlightLinks.map((x) => ({ label: x.label, url: x.url }));
    // The design is a proposed public addition (an allow-listed presentation config), kept so the page
    // keeps its look.
    out.design = structuredClone(src.design);
    if (mode === 'minor') {
      const last = String(out.data.lastName || '').trim();
      out.data.lastName = last ? last[0].toUpperCase() + '.' : '';
      out.data.city = '';
      out.data.heightIn = null;
      out.data.weightLb = null;
    }
    return A.normalizeProfile(out);
  }

  A.publicView = publicView;
  A.PUBLIC_FIELDS = PUBLIC_FIELDS;
})();
