// Tiny Markdown subset for the user's own notes. Returns plain tokens; the renderer builds DOM with textContent,
// so note text is never parsed as HTML.
//   # / ## / ### title    - item / * item    1. item    **bold**  *italic*  `code`    blank line = new paragraph
function parseInline(line) {
  const out = [];
  for (const part of line.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/)) {
    if (!part) continue;
    if (/^\*\*[^*]+\*\*$/.test(part)) out.push({ t: 'b', v: part.slice(2, -2) });
    else if (/^`[^`]+`$/.test(part)) out.push({ t: 'code', v: part.slice(1, -1) });
    else if (/^\*[^*\s][^*]*\*$/.test(part)) out.push({ t: 'i', v: part.slice(1, -1) });
    else out.push({ t: 'text', v: part });
  }
  return out;
}

function parseNotes(text) {
  const blocks = [];
  let cur = null; // open paragraph or list
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { cur = null; continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      blocks.push({ type: 'h', level: m[1].length, inline: parseInline(m[2]) });
      cur = null;
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/)) || (m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      const type = /^\s*\d/.test(line) ? 'ol' : 'ul';
      if (!cur || cur.type !== type) blocks.push((cur = { type, items: [] }));
      cur.items.push(parseInline(m[1]));
    } else {
      if (!cur || cur.type !== 'p') blocks.push((cur = { type: 'p', lines: [] }));
      cur.lines.push(parseInline(line));
    }
  }
  return blocks;
}

if (typeof module !== 'undefined') module.exports = { parseNotes, parseInline };
