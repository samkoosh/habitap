/* HabiTap photo picker, shared by the game (index.html) and the photo check page (photos.html).
   For a species whose Wikipedia lead image is a map, drawing or missing, species.json can say
     "pic": "auto"              → choose the best real photo from the article's images and the
                                  Commons category named after the scientific name, or
     "pic": "File:Name.jpg"     → use exactly that Commons file.
   "auto" keeps only freely licensed JPEG photos at least 600 px wide, and skips anything whose
   file name, Commons categories or description look like a map, diagram, drawing, skull or specimen.
   The puzzle server (api-worker/src/index.js) uses the same rules. */
(function () {
  const W = 'https://en.wikipedia.org/w/api.php', C = 'https://commons.wikimedia.org/w/api.php';
  const BAD_NAME = /\b(map|maps|range|distribution|locator|diagram|chart|graph|skull|skeleton|bones?|specimens?|holotype|museum|herbarium|preserved|taxiderm\w*|mounted|illustration|drawing|drawn|plate|painting|lithograph|engraving|watercolou?r|artwork|sketch|logo|stamp|coin|banknote|eggs?|cladogram|phylogen\w*|habitat|landscape)\b/i;
  const BAD_CATS = /\b(maps?|distribution|diagrams?|skulls?|skeletons?|specimens?|holotypes?|herbarium|taxidermy|illustrations?|drawings?|paintings?|lithographs?|engravings?|plates from|stamps|coins|eggs)\b/i;
  const BAD_DESC = /\b(range map|distribution map|skull|skeleton|museum specimen|holotype|illustration|drawing|painting|engraving|lithograph)\b/i;
  const q = (base, p) => fetch(base + '?' + new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...p })).then(r => r.json());
  const strip = h => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

  async function pick(title, sci, pinned) {
    let files = [];
    const inArticle = new Set();
    if (pinned && /^File:/.test(pinned)) files = [pinned];
    else {
      const a = await q(W, { action: 'query', prop: 'images', imlimit: '100', redirects: '1', titles: title });
      const pg = a.query && a.query.pages && a.query.pages[0];
      ((pg && pg.images) || []).forEach(x => { files.push(x.title); inArticle.add(x.title); });
      if (sci) {
        const c = await q(C, { action: 'query', list: 'categorymembers', cmtitle: 'Category:' + sci, cmtype: 'file', cmlimit: '100' }).catch(() => null);
        ((c && c.query && c.query.categorymembers) || []).forEach(x => { if (!files.includes(x.title)) files.push(x.title); });
      }
      files = files.filter(f => /\.jpe?g$/i.test(f) && !BAD_NAME.test(f.replace(/[_-]/g, ' '))).slice(0, 50);
    }
    if (!files.length) return null;
    const j = await q(C, { action: 'query', prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '900', titles: files.join('|') });
    const ok = [];
    for (const p of (j.query && j.query.pages) || []) {
      const ii = p.imageinfo && p.imageinfo[0]; if (!ii) continue;
      const m = ii.extmetadata || {}, lic = strip(m.LicenseShortName && m.LicenseShortName.value);
      if (!pinned) {
        if (!/(cc|public domain|pd)/i.test(lic) || /\b(nc|nd)\b/i.test(lic)) continue;
        if (BAD_CATS.test(strip(m.Categories && m.Categories.value)) || BAD_DESC.test(strip(m.ImageDescription && m.ImageDescription.value))) continue;
        if ((ii.width || 0) < 600) continue;
      }
      ok.push({ p, ii, m, lic, score: (inArticle.has(p.title) ? 2 : 0) + ((ii.width || 0) >= 1200 ? 1 : 0) });
    }
    if (!ok.length) return null;
    ok.sort((a, b) => b.score - a.score || files.indexOf(a.p.title) - files.indexOf(b.p.title));
    const { p, ii, m, lic } = ok[0];
    return {
      src: ii.thumburl || ii.url, file: p.title.replace(/^File:/, ''), page: ii.descriptionurl || ('https://commons.wikimedia.org/wiki/' + encodeURIComponent(p.title.replace(/ /g, '_'))),
      artist: strip(m.Artist && m.Artist.value).slice(0, 120), license: lic, licUrl: (m.LicenseUrl && m.LicenseUrl.value) || '', picked: pinned ? 'pinned' : 'auto',
    };
  }
  window.HTPick = { pick };
})();
