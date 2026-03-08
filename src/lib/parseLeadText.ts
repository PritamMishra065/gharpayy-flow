export interface ParsedLead {
  name: string;
  phone: string;
  email: string;
  budget: string;
  preferred_location: string;
  notes: string;
  confidence: {
    name: number;
    phone: number;
    email: number;
    budget: number;
    location: number;
  };
}

const PHONE_RE = /(?:\+?91[\s-]?)?([6-9]\d{4}[\s-]?\d{5})\b/;
const INTL_PHONE_RE = /\+\d{1,3}[\s-]?\d{6,14}/;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const BUDGET_RE = /(?:(?:budget|₹|rs\.?|inr)\s*[:=]?\s*)(\d[\d,.\s]*(?:-\s*\d[\d,.\s]*)?\s*(?:k|l|lakh|lakhs|lac|cr|crore|crores)?)\b|\b(\d[\d,.\s]*(?:-\s*\d[\d,.\s]*)?\s*(?:k|l|lakh|lakhs|lac|cr|crore|crores))\b/i;
const ROOM_RE = /\b(\d\s*bhk|studio\s*(?:apartment|flat)?|penthouse|villa|duplex|triplex|flat|apartment)\b/i;
const LOCATION_KEYWORDS_RE = /\b(?:in|at|near|area|location|locality|sector|phase)\s*[:=]?\s*([A-Z][a-zA-Z\s]{2,30}?)(?:\s*(?:,|$|\.|budget|looking|need|want|require|\d))/i;

export function parseLeadText(raw: string): ParsedLead {
  if (!raw || !raw.trim()) {
    return empty();
  }

  let text = raw.trim();
  const extracted: string[] = []; // track positions to remove

  // 1. Extract phone
  let phone = '';
  let phoneConf = 0;
  const phoneMatch = text.match(PHONE_RE);
  const intlMatch = text.match(INTL_PHONE_RE);
  if (phoneMatch) {
    phone = phoneMatch[0].replace(/[\s-]/g, '');
    phoneConf = 1.0;
    extracted.push(escapeRegex(phoneMatch[0]));
  } else if (intlMatch) {
    phone = intlMatch[0].replace(/[\s-]/g, '');
    phoneConf = 0.9;
    extracted.push(escapeRegex(intlMatch[0]));
  }

  // 2. Extract email
  let email = '';
  let emailConf = 0;
  const emailMatch = text.match(EMAIL_RE);
  if (emailMatch) {
    email = emailMatch[0];
    emailConf = 1.0;
    extracted.push(escapeRegex(emailMatch[0]));
  }

  // 3. Extract budget
  let budget = '';
  let budgetConf = 0;
  const budgetMatch = text.match(BUDGET_RE);
  if (budgetMatch) {
    budget = (budgetMatch[1] || budgetMatch[2] || '').trim();
    budgetConf = budgetMatch[1] ? 0.95 : 0.75; // higher if keyword present
    extracted.push(escapeRegex(budgetMatch[0]));
  }

  // 4. Extract room type (goes into notes)
  let roomType = '';
  const roomMatch = text.match(ROOM_RE);
  if (roomMatch) {
    roomType = roomMatch[0].trim();
    extracted.push(escapeRegex(roomMatch[0]));
  }

  // 5. Extract location
  let location = '';
  let locationConf = 0;
  const locMatch = text.match(LOCATION_KEYWORDS_RE);
  if (locMatch) {
    location = locMatch[1].trim();
    locationConf = 0.8;
    extracted.push(escapeRegex(locMatch[0]));
  }

  // 6. Remove extracted tokens to find name and notes
  let remaining = text;
  for (const token of extracted) {
    remaining = remaining.replace(new RegExp(token, 'i'), ' ');
  }

  // Clean up filler words
  remaining = remaining
    .replace(/\b(looking\s+for|wants?|needs?|requires?|interested\s+in|enquiry|inquiry)\b/gi, ' ')
    .replace(/\b(budget|₹|rs\.?|inr|source|from|via)\b/gi, ' ')
    .replace(/\b(in|at|near|area|location)\b/gi, ' ')
    .replace(/[,;:|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Try to extract name: first sequence of capitalized words or first 2-3 words
  let name = '';
  let nameConf = 0;
  const words = remaining.split(/\s+/).filter(w => w.length > 0);

  if (words.length > 0) {
    // Find consecutive capitalized words from the start
    const nameWords: string[] = [];
    for (const w of words) {
      if (/^[A-Z][a-zA-Z]*$/.test(w) && nameWords.length < 4) {
        nameWords.push(w);
      } else if (nameWords.length > 0) {
        break;
      } else {
        // First word not capitalized, try taking first 1-2 words as name anyway
        if (words.length <= 3) {
          nameWords.push(w);
        } else {
          break;
        }
      }
    }

    if (nameWords.length > 0) {
      name = nameWords.join(' ');
      nameConf = nameWords.every(w => /^[A-Z]/.test(w)) ? 0.85 : 0.5;
      // Remove name words from remaining
      for (const nw of nameWords) {
        remaining = remaining.replace(new RegExp(`\\b${escapeRegex(nw)}\\b`, 'i'), ' ').trim();
      }
    }
  }

  // If no location found via keywords, try to find it from remaining capitalized words
  if (!location && remaining.trim()) {
    const capWords = remaining.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*/);
    if (capWords && capWords[0] !== name) {
      location = capWords[0].trim();
      locationConf = 0.5;
      remaining = remaining.replace(capWords[0], ' ').trim();
    }
  }

  // Everything left becomes notes, combined with room type
  const notesParts: string[] = [];
  if (roomType) notesParts.push(roomType);
  const leftover = remaining.replace(/\s+/g, ' ').trim();
  if (leftover && leftover !== name) notesParts.push(leftover);
  const notes = notesParts.join(', ');

  return {
    name,
    phone,
    email,
    budget,
    preferred_location: location,
    notes,
    confidence: {
      name: name ? nameConf : 0,
      phone: phoneConf,
      email: emailConf,
      budget: budgetConf,
      location: locationConf,
    },
  };
}

function empty(): ParsedLead {
  return {
    name: '', phone: '', email: '', budget: '', preferred_location: '', notes: '',
    confidence: { name: 0, phone: 0, email: 0, budget: 0, location: 0 },
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
